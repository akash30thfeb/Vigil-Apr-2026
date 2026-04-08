-- Add recurrence column for recurring reminders (daily, weekly, monthly)
-- NULL = one-shot (default, existing behavior)
ALTER TABLE reminders
ADD COLUMN recurrence text DEFAULT NULL
CHECK (recurrence IS NULL OR recurrence IN ('daily', 'weekly', 'monthly'));
