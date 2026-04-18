import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { processChat } from "@/lib/chat-engine";
import type { Message } from "@/lib/chat-engine";

export async function POST(req: NextRequest) {
  try {
    const { userId, orgId } = await auth();
    const body = await req.json();
    const messages: Message[] = body.messages ?? [];

    if (!messages.length) {
      return NextResponse.json({ error: "No messages provided" }, { status: 400 });
    }

    const safeOrgId = orgId ?? "demo";
    const safeUserId = userId ?? "anonymous";

    const result = await processChat(messages, safeOrgId, safeUserId);

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("/api/chat error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
