import { NextRequest, NextResponse } from "next/server";
import { WebClient } from "@slack/web-api";
import { waitUntil } from "@vercel/functions";
import { verifySlackRequest } from "@/lib/slack-verify";
import { processChat } from "@/lib/chat-engine";
import { supabaseAdmin } from "@/lib/supabase";
import { getChips } from "@/lib/response-chips";
import type { Message } from "@/lib/chat-engine";

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

const SLACK_VIGIL_ORG_ID = process.env.SLACK_VIGIL_ORG_ID ?? "demo";
const SLACK_VIGIL_USER_ID = process.env.SLACK_VIGIL_USER_ID ?? "slack-bot";
const VIGIL_APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://vigil-apr-2026.vercel.app";

// Strip bot mention from message text (e.g. "<@U12345> log a contract" → "log a contract")
function stripMention(text: string): string {
  return text.replace(/<@[A-Z0-9]+>/g, "").trim();
}

// Convert Markdown bold (**text**, __text__) to Slack mrkdwn bold (*text*).
// The agent emits standard Markdown; Slack's mrkdwn uses single asterisks.
function toSlackMrkdwn(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "*$1*")
    .replace(/__(.+?)__/g, "*$1*");
}

// Build messages from recent channel history (flat conversation, no threads).
// In DMs, every message is part of the conversation. In public channels we only
// include messages from the bot or that mention the bot, so unrelated chatter
// doesn't pollute the agent's context.
async function buildChannelHistory(
  channel: string,
  botUserId: string,
  isDM: boolean
): Promise<Message[]> {
  const result = await slack.conversations.history({
    channel,
    limit: 20,
  });

  const botMention = `<@${botUserId}>`;
  const messages: Message[] = [];
  for (const msg of (result.messages ?? []).reverse()) {
    // Skip subtypes like channel_join, bot_add, etc
    if (msg.subtype && msg.subtype !== "bot_message") continue;
    const isBot = msg.bot_id || msg.user === botUserId;
    const rawText = msg.text ?? "";

    // In channels: only include bot replies and messages that mentioned the bot
    if (!isDM && !isBot && !rawText.includes(botMention)) continue;

    const text = stripMention(rawText);
    if (!text) continue;

    messages.push({
      role: isBot ? "assistant" : "user",
      content: text,
    });
  }

  return messages;
}

// Process a Slack event and post the agent's reply.
// Both DMs and channel mentions use flat (non-threaded) responses with
// context-aware suggestion buttons — channel behavior matches the Messages tab.
async function handleSlackMessage(
  channel: string,
  botUserId: string,
  channelType: string
) {
  try {
    const isDM = channelType === "im";
    const messages = await buildChannelHistory(channel, botUserId, isDM);

    if (!messages.length) return;

    const result = await processChat(messages, SLACK_VIGIL_ORG_ID, SLACK_VIGIL_USER_ID);

    let replyText = toSlackMrkdwn(result.message);
    if (result.item_logged) {
      replyText += `\n\n:white_check_mark: *${result.item_name}* logged to Vigil.`;
    }
    if (result.reminders_added) {
      replyText += `\n\n:bell: Reminders added for *${result.item_name}*.`;
    }

    const suggestionBlocks = buildSuggestionBlocks(replyText);
    const blocks = [
      { type: "section", text: { type: "mrkdwn", text: replyText } },
      ...suggestionBlocks,
    ];

    await slack.chat.postMessage({
      channel,
      text: replyText,
      ...(suggestionBlocks.length > 0 ? { blocks } : {}),
    });
  } catch (error) {
    console.error("Slack message handling error:", error);

    await slack.chat.postMessage({
      channel,
      text: "Sorry, I ran into an issue processing that. Please try again.",
    }).catch(() => {});
  }
}

// ============================================================
// Dynamic suggestion chips (matching web app)
// ============================================================

const PEOPLE = [
  "Priya Sharma", "James Okafor", "Aisha Patel", "Marcus Chen",
  "Sofia Rodriguez", "Daniel Kim", "Fatima Al-Rashid", "Tom Bradley",
];
const DEPT_ROLES = [
  { dept: "Engineering", role: "Software Engineer" },
  { dept: "Data Science", role: "ML Engineer" },
  { dept: "Data Analytics", role: "Data Analyst" },
  { dept: "IT", role: "Systems Administrator" },
  { dept: "Sales", role: "Account Executive" },
];
const CONTRACTS = [
  { name: "Datadog APM", vendor: "Datadog", value: "18,000" },
  { name: "Jira Cloud", vendor: "Atlassian", value: "9,600" },
  { name: "HubSpot CRM", vendor: "HubSpot", value: "24,000" },
];
const ASSETS = [
  { name: "MacBook Pro 16-inch", vendor: "Apple", price: "2,499" },
  { name: "ThinkPad X1 Carbon", vendor: "Lenovo", price: "1,899" },
  { name: "Dell XPS 15", vendor: "Dell", price: "1,750" },
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateDynamicSuggestions(): string[] {
  const p1 = pick(PEOPLE);
  const dr = pick(DEPT_ROLES);
  const c = pick(CONTRACTS);
  const a = pick(ASSETS);

  return [
    `${p1} is joining ${dr.dept} as a ${dr.role} next Monday`,
    `Log the ${c.name} contract with ${c.vendor} — \u00a3${c.value}/year`,
    `New ${a.name} from ${a.vendor}, \u00a3${a.price}, purchased today`,
  ];
}

// ============================================================
// App Home tab
// ============================================================

async function publishHomeTab(userId: string) {
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const urgentBlocks: any[] = [];
  if (urgentItems && urgentItems.length > 0) {
    const lines = urgentItems.map((item) => {
      const daysLeft = item.key_date
        ? Math.ceil((new Date(item.key_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : null;
      const emoji = daysLeft === null ? "\u{1f514}" : daysLeft < 0 ? "\u{1f6a8}" : daysLeft <= 7 ? "\u{1f534}" : daysLeft <= 30 ? "\u{1f7e0}" : "\u{1f7e2}";
      const status = daysLeft === null ? "" : daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d remaining`;
      return `${emoji}  *${item.name}* \u2014 ${item.department?.toUpperCase()} \u2014 ${status}`;
    });

    urgentBlocks.push(
      { type: "header", text: { type: "plain_text", text: "\u26a0\ufe0f Needs Attention", emoji: true } },
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
      return `${typeEmoji}  *${item.name}* \u2014 ${date}`;
    });

    recentBlocks.push(
      { type: "header", text: { type: "plain_text", text: "\u{1f4cb} Recently Logged", emoji: true } },
      { type: "section", text: { type: "mrkdwn", text: lines.join("\n") } },
      { type: "divider" }
    );
  }

  // Dynamic suggestions
  const suggestions = generateDynamicSuggestions();

  const blocks = [
    // Disclaimer
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "\u{2139}\ufe0f This tool uses generative AI, which can produce inaccurate responses. Review for accuracy before acting on any output.",
        },
      ],
    },
    { type: "divider" },
    // Centered agent icon (128px — sized to match Policy Support Assistant)
    {
      type: "image",
      image_url: `${VIGIL_APP_URL}/icon-128.png`,
      alt_text: "Vigil",
    },
    // Centered app name
    {
      type: "header",
      text: { type: "plain_text", text: "Vigil", emoji: true },
    },
    // Long description
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "AI-powered asset and contract tracking. Log and track employees, contracts, and IT assets \u2014 just by talking. Vigil automatically creates workflows, reminders, and notifications so your team never misses a renewal, warranty expiry, or onboarding milestone.",
      },
    },
    { type: "divider" },
    // 4 suggestion chips — 2x2 layout
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Log a new hire", emoji: true },
          value: "I'd like to log a new employee",
          action_id: "action_log_employee",
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Add a contract", emoji: true },
          value: "I'd like to add a new contract",
          action_id: "action_log_contract",
        },
      ],
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Track an asset", emoji: true },
          value: "I'd like to track a new IT asset",
          action_id: "action_log_asset",
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Update a record", emoji: true },
          value: "I'd like to update an existing record",
          action_id: "action_update_record",
        },
      ],
    },
    { type: "divider" },
    // Dynamic "Try saying" suggestions
    {
      type: "context",
      elements: [
        { type: "mrkdwn", text: "*Or try one of these:*" },
      ],
    },
    // Section + accessory button so the full prompt wraps across the row
    // (Block Kit buttons truncate; sections expand to fill available width).
    ...suggestions.map((s, i) => ({
      type: "section" as const,
      text: { type: "mrkdwn" as const, text: `\u{1f4ac}  ${s}` },
      accessory: {
        type: "button" as const,
        text: { type: "plain_text" as const, text: "Try", emoji: true },
        value: s,
        action_id: `action_suggestion_${i}`,
      },
    })),
    { type: "divider" },
    ...urgentBlocks,
    ...recentBlocks,
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `\u{1f4ac} DM me or \`@Vigil\` in any channel  \u2022  \u2328\ufe0f \`/vigil\` slash command  \u2022  <${VIGIL_APP_URL}/dashboard|Open Dashboard>`,
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
// Context-aware suggestion buttons (shared logic from lib/response-chips.ts)
// ============================================================

// Build Block Kit actions from contextual chips. Returns empty array if no suggestions.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildSuggestionBlocks(agentMessage: string): any[] {
  const chips = getChips(agentMessage);
  if (chips.length === 0) return [];

  // Use a unique action_id per chip to avoid collisions across messages
  const ts = Date.now();
  return [
    {
      type: "actions",
      elements: chips.map((chip, i) => ({
        type: "button",
        text: { type: "plain_text", text: chip, emoji: true },
        value: chip,
        action_id: `dm_chip_${ts}_${i}`,
      })),
    },
  ];
}

// Handle button click from Home tab or DM suggestions — DM the user with the prompt
async function handleButtonAction(userId: string, actionValue: string, channelId?: string) {
  try {
    // Determine the DM channel: use provided channel (from DM button click) or open one
    let channel = channelId;
    if (!channel) {
      try {
        const dm = await slack.conversations.open({ users: userId });
        channel = dm.channel?.id;
      } catch (openErr) {
        console.error("conversations.open failed (may need im:write scope):", openErr);
        // Fallback: post directly using user ID as channel (works with chat:write)
        channel = userId;
      }
    }
    if (!channel) return;

    // Process with the agent
    const messages: Message[] = [{ role: "user", content: actionValue }];
    const result = await processChat(messages, SLACK_VIGIL_ORG_ID, SLACK_VIGIL_USER_ID);

    let replyText = toSlackMrkdwn(result.message);
    if (result.item_logged) {
      replyText += `\n\n:white_check_mark: *${result.item_name}* logged to Vigil.`;
    }
    if (result.reminders_added) {
      replyText += `\n\n:bell: Reminders added for *${result.item_name}*.`;
    }

    const suggestionBlocks = buildSuggestionBlocks(replyText);

    await slack.chat.postMessage({
      channel,
      text: replyText,
      blocks: [
        {
          type: "section",
          text: { type: "mrkdwn", text: replyText },
        },
        ...suggestionBlocks,
      ],
    });
  } catch (error) {
    console.error("Button action error:", error);
  }
}

// ============================================================
// POST handler — receives all Slack events, slash commands, and interactions
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

  const contentType = req.headers.get("content-type") ?? "";

  // Handle URL verification challenge first
  if (contentType.includes("application/json")) {
    try {
      const payload = JSON.parse(rawBody);
      if (payload.type === "url_verification") {
        return NextResponse.json({ challenge: payload.challenge });
      }
    } catch {
      // Not valid JSON, continue
    }
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(rawBody);

    // ---- Interactive payload (button clicks) ----
    const payloadStr = params.get("payload");
    if (payloadStr) {
      // Verify signature for interactions
      if (!verifySlackRequest(rawBody, timestamp, signature)) {
        console.error("Interaction signature verification failed");
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }

      try {
        const interaction = JSON.parse(payloadStr);
        console.log("Interaction received:", interaction.type, interaction.actions?.[0]?.action_id);

        if (interaction.type === "block_actions") {
          const action = interaction.actions?.[0];
          const userId = interaction.user?.id;

          if (action && userId) {
            // If click came from a DM, pass the channel ID so we don't need conversations.open
            const channelId = interaction.channel?.id;
            waitUntil(handleButtonAction(userId, action.value, channelId));
          }
        }

        return new NextResponse("ok", { status: 200 });
      } catch (error) {
        console.error("Interaction parse error:", error);
        return new NextResponse("ok", { status: 200 });
      }
    }

    // Verify signature for slash commands
    if (!verifySlackRequest(rawBody, timestamp, signature)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // ---- Slash command (/vigil) ----
    const text = params.get("text") ?? "";
    const responseUrl = params.get("response_url") ?? "";

    if (!text.trim()) {
      return NextResponse.json({
        response_type: "ephemeral",
        text: "Hi! Tell me what you'd like to log. For example:\n`/vigil Log a new MacBook Pro assigned to Sarah Chen, purchased today for \u00a32,400`",
      });
    }

    waitUntil(
      (async () => {
        try {
          const messages: Message[] = [{ role: "user", content: text }];
          const result = await processChat(messages, SLACK_VIGIL_ORG_ID, SLACK_VIGIL_USER_ID);

          let replyText = toSlackMrkdwn(result.message);
          if (result.item_logged) {
            replyText += `\n\n:white_check_mark: *${result.item_name}* logged to Vigil.`;
          }

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

    return new NextResponse(null, { status: 200 });
  }

  // ---- JSON event payload ----
  if (!verifySlackRequest(rawBody, timestamp, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload = JSON.parse(rawBody);

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
      const authResult = await slack.auth.test();
      const botUserId = authResult.user_id ?? "";

      waitUntil(
        handleSlackMessage(
          event.channel,
          botUserId,
          event.channel_type ?? ""
        )
      );

      return new NextResponse("ok", { status: 200 });
    }
  }

  return new NextResponse("ok", { status: 200 });
}
