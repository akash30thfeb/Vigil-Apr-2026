import { NextRequest, NextResponse } from "next/server";
import { WebClient } from "@slack/web-api";
import { waitUntil } from "@vercel/functions";
import { verifySlackRequest } from "@/lib/slack-verify";
import { processChat } from "@/lib/chat-engine";
import type { Message } from "@/lib/chat-engine";

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

const SLACK_VIGIL_ORG_ID = process.env.SLACK_VIGIL_ORG_ID ?? "demo";
const SLACK_VIGIL_USER_ID = process.env.SLACK_VIGIL_USER_ID ?? "slack-bot";

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

// ============================================================
// POST handler — receives all Slack events and slash commands
// ============================================================

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  // Verify signing secret (skip for url_verification which happens during setup)
  const timestamp = req.headers.get("x-slack-request-timestamp");
  const signature = req.headers.get("x-slack-signature");

  // Check for Slack retries — skip them (we already acknowledged the first)
  const retryNum = req.headers.get("x-slack-retry-num");
  if (retryNum) {
    return new NextResponse("ok", { status: 200 });
  }

  // Determine if this is a slash command (url-encoded) or event (JSON)
  const contentType = req.headers.get("content-type") ?? "";

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

  // URL verification handshake (Slack setup)
  if (payload.type === "url_verification") {
    return NextResponse.json({ challenge: payload.challenge });
  }

  // Event callback
  if (payload.type === "event_callback") {
    const event = payload.event;

    // Ignore bot's own messages
    if (event.bot_id || event.subtype === "bot_message") {
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
