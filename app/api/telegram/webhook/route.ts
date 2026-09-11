import { NextRequest, NextResponse } from "next/server";
import { handleTelegramWebhookRequest } from "@/lib/telegram-webhook";

// Registration must always execute fresh at request time — a statically cached
// snapshot would drop /start registrations. Also silences the
// DYNAMIC_SERVER_USAGE build warning.
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Health check — also handy to confirm deployment before setWebhook. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "Telegram Bot webhook endpoint is ready.",
  });
}

/**
 * Telegram Bot webhook receiver (LEGACY ALIAS of /api/telegram).
 *
 * The canonical webhook mount is /api/telegram — register it with:
 *   setWebhook?url=https://gechocar.vercel.app/api/telegram
 * (see scripts/set-telegram-webhook.mjs). This path is kept so an existing
 * webhook registration keeps delivering while the switch happens; both paths
 * share handleTelegramWebhookRequest() so behavior can never drift.
 *
 * For every update with a human message (including /start) it captures
 * chat_id / telegram_id / first_name and upserts them into public.profiles
 * so the auto-post broadcast can reach users who never opened the Mini App.
 */
export async function POST(request: NextRequest) {
  const { status, body } = await handleTelegramWebhookRequest(request);
  return NextResponse.json(body, { status });
}