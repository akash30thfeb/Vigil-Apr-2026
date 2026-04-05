import { schedules, task, queue } from "@trigger.dev/sdk";

const reminderQueue = queue({ name: "reminder-alerts", concurrencyLimit: 1 });
import { supabaseAdmin } from "../lib/supabase";
import { sendSlackReminder } from "../lib/slack";

// ============================================================
// Nightly scan — runs every hour, picks up reminders due within 1h
// ============================================================

export const reminderScan = schedules.task({
  id: "reminder-scan",
  cron: process.env.REMINDER_SCAN_CRON ?? "0 * * * *",
  run: async () => {
    const now = new Date();

    // Find scheduled reminders whose fire_at is at or past the current time
    const { data: dueReminders, error } = await supabaseAdmin
      .from("reminders")
      .select(`
        id, type, message, fire_at, item_id,
        items!inner (id, name, department, key_date, org_id)
      `)
      .eq("status", "scheduled")
      .lte("fire_at", now.toISOString())
      .order("fire_at", { ascending: true });

    if (error) {
      console.error("Failed to query due reminders:", error);
      return { scanned: 0, fired: 0, error: error.message };
    }

    if (!dueReminders?.length) {
      return { scanned: 0, fired: 0 };
    }

    // Trigger each reminder individually
    let fired = 0;
    for (const reminder of dueReminders) {
      await sendReminder.trigger({ reminderId: reminder.id });
      fired++;
    }

    return { scanned: dueReminders.length, fired };
  },
});

// ============================================================
// Individual reminder — sends Slack message + logs notification
// ============================================================

export const sendReminder = task({
  id: "send-reminder",
  queue: reminderQueue,
  retry: { maxAttempts: 3 },
  run: async (payload: { reminderId: string }) => {
    const { reminderId } = payload;

    // Fetch the reminder + its item
    const { data: reminder, error } = await supabaseAdmin
      .from("reminders")
      .select(`
        id, type, message, fire_at, item_id, org_id, status,
        items!inner (id, name, department, key_date, assigned_to_name)
      `)
      .eq("id", reminderId)
      .single();

    if (error || !reminder) {
      console.error("Reminder not found:", reminderId, error);
      return { success: false, error: "not_found" };
    }

    // Skip if already sent
    if (reminder.status === "sent") {
      return { success: true, skipped: true };
    }

    const item = reminder.items as unknown as {
      id: string;
      name: string;
      department: string;
      key_date: string | null;
      assigned_to_name: string | null;
    };

    // Calculate days remaining
    let daysRemaining: number | null = null;
    if (item.key_date) {
      daysRemaining = Math.floor(
        (new Date(item.key_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
    }

    // Send Slack notification (to the responsible person / manager)
    const sent = await sendSlackReminder({
      itemName: item.name,
      reminderMessage: reminder.message,
      department: item.department,
      keyDate: item.key_date,
      daysRemaining,
      responsiblePerson: item.assigned_to_name,
    });

    if (!sent) {
      return { success: false, error: "slack_failed" };
    }

    // Dual alert: for employee exits, also notify HR
    if (item.department === "hr") {
      const { data: emp } = await supabaseAdmin
        .from("employees")
        .select("employment_status, manager_name")
        .eq("item_id", item.id)
        .single();

      if (emp && (emp.employment_status === "notice_period" || emp.employment_status === "exited")) {
        await sendSlackReminder({
          itemName: item.name,
          reminderMessage: `[HR Copy] ${reminder.message}`,
          department: item.department,
          keyDate: item.key_date,
          daysRemaining,
          responsiblePerson: "HR Team",
        });
      }
    }

    // Mark reminder as sent
    await supabaseAdmin
      .from("reminders")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", reminderId);

    // Log to notifications table
    await supabaseAdmin.from("notifications").insert({
      org_id: reminder.org_id,
      item_id: reminder.item_id,
      reminder_id: reminderId,
      channel: "slack",
      message: reminder.message,
      body: reminder.message,
      sent_at: new Date().toISOString(),
    });

    return { success: true, reminderId, itemName: item.name };
  },
});
