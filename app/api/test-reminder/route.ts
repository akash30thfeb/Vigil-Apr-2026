import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sendSlackReminder } from "@/lib/slack";

// Manual test endpoint — fire a specific reminder or the next due one
// Usage: POST /api/test-reminder { "reminder_id": "..." } or POST /api/test-reminder (fires next due)
// This bypasses Trigger.dev so we can test Slack delivery directly

// GET support so you can test from the browser
export async function GET(req: NextRequest) {
  return handleTestReminder(req);
}

export async function POST(req: NextRequest) {
  return handleTestReminder(req);
}

async function handleTestReminder(req: NextRequest) {
  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const reminderId = body.reminder_id ?? req.nextUrl.searchParams.get("id");

    // Step 1: Get the reminder
    let reminderQuery = supabaseAdmin
      .from("reminders")
      .select("id, type, message, fire_at, item_id, org_id, status");

    if (reminderId) {
      reminderQuery = reminderQuery.eq("id", reminderId);
    } else {
      reminderQuery = reminderQuery
        .eq("status", "scheduled")
        .order("fire_at", { ascending: true })
        .limit(1);
    }

    const { data: reminders, error: rError } = await reminderQuery;

    if (rError || !reminders?.length) {
      return NextResponse.json(
        { error: reminderId ? "Reminder not found" : "No scheduled reminders found" },
        { status: 404 }
      );
    }

    const reminder = reminders[0];

    // Step 2: Get the associated item
    const { data: item, error: iError } = await supabaseAdmin
      .from("items")
      .select("id, name, department, key_date")
      .eq("id", reminder.item_id)
      .single();

    if (iError || !item) {
      return NextResponse.json({ error: "Item not found for reminder" }, { status: 404 });
    }

    // Step 3: Calculate days remaining
    let daysRemaining: number | null = null;
    if (item.key_date) {
      daysRemaining = Math.floor(
        (new Date(item.key_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
    }

    // Step 4: Send Slack notification
    const sent = await sendSlackReminder({
      itemName: item.name,
      reminderMessage: reminder.message,
      department: item.department,
      keyDate: item.key_date,
      daysRemaining,
    });

    if (!sent) {
      return NextResponse.json({ error: "Slack delivery failed" }, { status: 502 });
    }

    // Step 5: Mark as sent + log notification
    await supabaseAdmin
      .from("reminders")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", reminder.id);

    await supabaseAdmin.from("notifications").insert({
      org_id: reminder.org_id,
      item_id: reminder.item_id,
      reminder_id: reminder.id,
      channel: "slack",
      message: reminder.message,
      body: reminder.message,
      sent_at: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      reminder_id: reminder.id,
      item_name: item.name,
      message: reminder.message,
    });
  } catch (error) {
    console.error("/api/test-reminder error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
