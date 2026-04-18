import { createHmac, timingSafeEqual } from "crypto";

const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET ?? "";

export function verifySlackRequest(
  body: string,
  timestamp: string | null,
  signature: string | null
): boolean {
  if (!SLACK_SIGNING_SECRET || !timestamp || !signature) return false;

  // Reject requests older than 5 minutes (replay protection)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > 300) return false;

  const baseString = `v0:${timestamp}:${body}`;
  const computed = "v0=" + createHmac("sha256", SLACK_SIGNING_SECRET)
    .update(baseString)
    .digest("hex");

  try {
    return timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
  } catch {
    return false;
  }
}
