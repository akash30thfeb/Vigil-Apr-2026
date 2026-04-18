import { NextRequest, NextResponse } from "next/server";
import { WebClient } from "@slack/web-api";
import { waitUntil } from "@vercel/functions";
import { verifySlackRequest } from "@/lib/slack-verify";
import { processChat } from "@/lib/chat-engine";
import { supabaseAdmin } from "@/lib/supabase";
import type { Message } from "@/lib/chat-engine";

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

const SLACK_VIGIL_ORG_ID = process.env.SLACK_VIGIL_ORG_ID ?? "demo";
const SLACK_VIGIL_USER_ID = process.env.SLACK_VIGIL_USER_ID ?? "slack-bot";
const VIGIL_APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://vigil-apr-2026.vercel.app";

// Strip bot mention from message text (e.g. "<@U12345> log a contract" → "log a contract")
function stripMention(text: string): string {
  return text.replace(/<@[A-Z0-9]+>/g, "").trim();
}

// Build messages array from a Slack thread for multi-turn conversation
async function buildThreadMessages(
  channel: string,
  threadTs: string,
  botUserId: string
): Promise<Message[]> {
  const result = await slack.conversations.replies({
    channel,
    ts: threadTs,
    limit: 50,
  });

  const messages: Message[] = [];
  for (const msg of result.messages ?? []) {
    // Skip the thread parent if it's a bot message with no user text
    const isBot = msg.bot_id || msg.user === botUserId;
    const text = stripMention(msg.text ?? "");
    if (!text) continue;

    messages.push({
      role: isBot ? "assistant" : "user",
      content: text,
    });
  }

  return messages;
}

// Process a Slack event and post the agent's reply
async function handleSlackMessage(
  channel: string,
  text: string,
  threadTs: string | undefined,
  eventTs: string,
  botUserId: string
) {
  try {
    // The thread_ts to reply in — use existing thread or start a new one
    const replyThreadTs = threadTs ?? eventTs;

    let messages: Message[];

    if (threadTs) {
      // Multi-turn: fetch full thread history
      messages = await buildThreadMessages(channel, threadTs, botUserId);
    } else {
      // Single turn: just the user's message
      messages = [{ role: "user", content: stripMention(text) }];
    }

    if (!messages.length) return;

    const result = await processChat(messages, SLACK_VIGIL_ORG_ID, SLACK_VIGIL_USER_ID);

    let replyText = result.message;
    if (result.item_logged) {
      replyText += `\n\n:white_check_mark: *${result.item_name}* logged to Vigil.`;
    }
    if (result.reminders_added) {
      replyText += `\n\n:bell: Reminders added for *${result.item_name}*.`;
    }

    await slack.chat.postMessage({
      channel,
      thread_ts: replyThreadTs,
      text: replyText,
    });
  } catch (error) {
    console.error("Slack message handling error:", error);

    // Post error message back to the thread so user isn't left hanging
    const replyThreadTs = threadTs ?? eventTs;
    await slack.chat.postMessage({
      channel,
      thread_ts: replyThreadTs,
      text: "Sorry, I ran into an issue processing that. Please try again.",
    }).catch(() => {}); // Don't throw if error message fails
  }
}

// Publish the App Home tab for a user
async function publishHomeTab(userId: string) {
  // Fetch upcoming items (next 30 days) for the traffic light summary
  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const { data: urgentItems } = await supabaseAdmin
    .from("items")
    .select("name, type, department, key_date")
    .eq("org_id", SLACK_VIGIL_ORG_ID)
    .not("key_date", "is", null)
    .lte("key_date", in30Days.toISOString().split("T")[0])
    .order("key_date", { ascending: true })
    .limit(5);

  const { data: recentItems } = await supabaseAdmin
    .from("items")
    .select("name, type, department, created_at")
    .eq("org_id", SLACK_VIGIL_ORG_ID)
    .order("created_at", { ascending: false })
    .limit(5);

  // Build urgent items section
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const urgentBlocks: any[] = [];
  if (urgentItems && urgentItems.length > 0) {
    const lines = urgentItems.map((item) => {
      const daysLeft = item.key_date
        ? Math.ceil((new Date(item.key_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : null;
      const emoji = daysLeft === null ? "\u{1f514}" : daysLeft < 0 ? "\u{1f6a8}" : daysLeft <= 7 ? "\u{1f534}" : daysLeft <= 30 ? "\u{1f7e0}" : "\u{1f7e2}";
      const status = daysLeft === null ? "" : daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d remaining`;
      return `${emoji}  *${item.name}* — ${item.department?.toUpperCase()} — ${status}`;
    });

    urgentBlocks.push(
      { type: "header", text: { type: "plain_text", text: "\u{26a0}\u{fe0f} Needs Attention", emoji: true } },
      { type: "section", text: { type: "mrkdwn", text: lines.join("\n") } },
      { type: "divider" }
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recentBlocks: any[] = [];
  if (recentItems && recentItems.length > 0) {
    const lines = recentItems.map((item) => {
      const typeEmoji = item.type === "employee" ? "\u{1f464}" : item.type === "asset" ? "\u{1f4bb}" : "\u{1f4c4}";
      const date = new Date(item.created_at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });
      return `${typeEmoji}  *${item.name}* — ${date}`;
    });

    recentBlocks.push(
      { type: "header", text: { type: "plain_text", text: "\u{1f4cb} Recently Logged", emoji: true } },
      { type: "section", text: { type: "mrkdwn", text: lines.join("\n") } },
      { type: "divider" }
    );
  }

  const blocks = [
    {
      type: "header",
      text: { type: "plain_text", text: "\u{1f6e1}\u{fe0f} Vigil", emoji: true },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "AI-powered asset and contract tracking. Log and track employees, contracts, and IT assets — just by talking.",
      },
    },
    { type: "divider" },
    {
      type: "section",
      text: { type: "mrkdwn", text: "*Get started — tell me what to log:*" },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "\u{1f464} Log a new hire", emoji: true },
          value: "log_employee",
          action_id: "action_log_employee",
        },
        {
          type: "button",
          text: { type: "plain_text", text: "\u{1f4c4} Add a contract", emoji: true },
          value: "log_contract",
          action_id: "action_log_contract",
        },
        {
          type: "button",
          text: { type: "plain_text", text: "\u{1f4bb} Track an asset", emoji: true },
          value: "log_asset",
          action_id: "action_log_asset",
        },
      ],
    },
    { type: "divider" },
    ...urgentBlocks,
    ...recentBlocks,
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `\u{1f4ac} DM me or \`@Vigil\` in any channel  \u{2022}  \u{2328}\u{fe0f} \`/vigil\` slash command  \u{2022}  <${VIGIL_APP_URL}/dashboard|Open Dashboard>`,
        },
      ],
    },
  ];

  await slack.views.publish({
    user_id: userId,
    view: {
      type: "home",
      blocks,
    },
  });
}

// ============================================================
// POST handler — receives all Slack events and slash commands
// ============================================================

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  const timestamp = req.headers.get("x-slack-request-timestamp");
  const signature = req.headers.get("x-slack-signature");

  // Check for Slack retries — skip them (we already acknowledged the first)
  const retryNum = req.headers.get("x-slack-retry-num");
  if (retryNum) {
    return new NextResponse("ok", { status: 200 });
  }

  // Determine if this is a slash command (url-encoded) or event (JSON)
  const contentType = req.headers.get("content-type") ?? "";

  // Handle URL verification challenge first — Slack sends this during setup
  // and needs a fast response. We still verify the signature when possible.
  if (contentType.includes("application/json")) {
    try {
      const payload = JSON.parse(rawBody);
      if (payload.type === "url_verification") {
        return NextResponse.json({ challenge: payload.challenge });
      }
    } catch {
      // Not valid JSON, continue to other handlers
    }
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    // ---- Slash command (/vigil) ----
    if (!verifySlackRequest(rawBody, timestamp, signature)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const params = new URLSearchParams(rawBody);
    const text = params.get("text") ?? "";
    const channelId = params.get("channel_id") ?? "";
    const responseUrl = params.get("response_url") ?? "";

    if (!text.trim()) {
      return NextResponse.json({
        response_type: "ephemeral",
        text: "Hi! Tell me what you'd like to log. For example:\n`/vigil Log a new MacBook Pro assigned to Sarah Chen, purchased today for £2,400`",
      });
    }

    // Acknowledge immediately, process in background
    waitUntil(
      (async () => {
        try {
          const messages: Message[] = [{ role: "user", content: text }];
          const result = await processChat(messages, SLACK_VIGIL_ORG_ID, SLACK_VIGIL_USER_ID);

          let replyText = result.message;
          if (result.item_logged) {
            replyText += `\n\n:white_check_mark: *${result.item_name}* logged to Vigil.`;
          }

          // Post back via response_url (visible to channel)
          await fetch(responseUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              response_type: "in_channel",
              text: replyText,
            }),
          });
        } catch (error) {
          console.error("Slash command processing error:", error);
          await fetch(responseUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              response_type: "ephemeral",
              text: "Sorry, I ran into an issue processing that. Please try again.",
            }),
          }).catch(() => {});
        }
      })()
    );

    // Return 200 immediately (Slack requires < 3s response)
    return new NextResponse(null, { status: 200 });
  }

  // ---- JSON event payload ----
  if (!verifySlackRequest(rawBody, timestamp, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload = JSON.parse(rawBody);

  // Event callback
  if (payload.type === "event_callback") {
    const event = payload.event;

    // Ignore bot's own messages
    if (event.bot_id || event.subtype === "bot_message") {
      return new NextResponse("ok", { status: 200 });
    }

    // Handle App Home tab opened
    if (event.type === "app_home_opened") {
      waitUntil(publishHomeTab(event.user));
      return new NextResponse("ok", { status: 200 });
    }

    // Handle app_mention and direct messages
    if (event.type === "app_mention" || event.type === "message") {
      // Get bot's own user ID to filter in thread history
      const authResult = await slack.auth.test();
      const botUserId = authResult.user_id ?? "";

      // Acknowledge immediately, process in background
      waitUntil(
        handleSlackMessage(
          event.channel,
          event.text ?? "",
          event.thread_ts,
          event.ts,
          botUserId
        )
      );

      return new NextResponse("ok", { status: 200 });
    }
  }

  return new NextResponse("ok", { status: 200 });
}
