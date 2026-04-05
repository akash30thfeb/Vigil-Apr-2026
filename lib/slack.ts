// Slack incoming webhook — sends Block Kit messages to the configured channel

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL ?? "";

function formatDateIST(date: string | null): string | null {
  if (!date) return null;
  return new Date(date).toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

type ReminderContext = {
  itemName: string;
  reminderMessage: string;
  department: string;
  keyDate: string | null;
  daysRemaining: number | null;
  responsiblePerson?: string | null;
};

function urgencyEmoji(days: number | null): string {
  if (days === null) return "\u{1f514}"; // bell
  if (days < 0) return "\u{1f6a8}";     // rotating light — overdue
  if (days <= 7) return "\u{1f534}";     // red circle
  if (days <= 30) return "\u{1f7e0}";    // orange circle
  return "\u{1f7e2}";                    // green circle
}

function formatDays(days: number | null): string {
  if (days === null) return "No date set";
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `${days}d remaining`;
}

export async function sendSlackReminder(ctx: ReminderContext) {
  if (!SLACK_WEBHOOK_URL) {
    console.warn("SLACK_WEBHOOK_URL not configured — skipping notification");
    return false;
  }

  const emoji = urgencyEmoji(ctx.daysRemaining);
  const urgency = formatDays(ctx.daysRemaining);

  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `${emoji} Vigil Reminder`,
        emoji: true,
      },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Item:*\n${ctx.itemName}` },
        { type: "mrkdwn", text: `*Department:*\n${ctx.department.toUpperCase()}` },
        ...(ctx.responsiblePerson
          ? [{ type: "mrkdwn" as const, text: `*Owner:*\n${ctx.responsiblePerson}` }]
          : []),
      ],
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${ctx.reminderMessage}*`,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: ctx.keyDate
            ? `${urgency} | Key date: ${formatDateIST(ctx.keyDate)}`
            : urgency,
        },
      ],
    },
    { type: "divider" },
  ];

  const res = await fetch(SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blocks }),
  });

  if (!res.ok) {
    console.error("Slack webhook failed:", res.status, await res.text());
    return false;
  }

  return true;
}
