// Trigger.dev integration — Day 2
// This file will contain job definitions for:
// - reminder.send: fires an email via Resend when reminder.fire_at is reached
// - reminders.nightly: scans reminders table, schedules any due within 24h
// - digest.weekly: Monday morning org-wide summary email

export const TRIGGER_API_URL = process.env.TRIGGER_API_URL ?? "";
export const TRIGGER_SECRET_KEY = process.env.TRIGGER_SECRET_KEY ?? "";

// Placeholder: trigger a reminder job
export async function scheduleReminder(reminderId: string) {
  if (!TRIGGER_API_URL || !TRIGGER_SECRET_KEY) {
    console.warn("Trigger.dev not configured — skipping reminder scheduling");
    return;
  }
  // Day 2: implement Trigger.dev job dispatch here
}
