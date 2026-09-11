import { NextRequest, NextResponse } from "next/server";
import { handleTelegramWebhookRequest } from "@/lib/telegram-webhook";

// Registration must always execute fresh at request time — a statically cached
// snapshot would drop /start registrations. Also silences the
// DYNAMIC_SERVER_USAGE build warning.
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Telegram Bot webhook endpoint (CANONICAL mount).
 *
 * Point the bot at this URL with:
 *   setWebhook?url=https://gechocar.vercel.app/api/telegram
 *
 * (scripts/set-telegram-webhook.mjs does this for you — `npm run set-webhook`.)
 * The legacy /api/telegram/webhook path is wired identically via the shared
 * handleTelegramWebhookRequest() helper.
 *
 * For every update with a human message (including /start) the handler:
 *   1. replies with a message + the persistent reply keyboard
 *      (see lib/telegram-webhook.ts → handleTelegramWebhookUpdate), and
 *   2. captures chat_id / telegram_id / first_name / phone_number into
 *      public.profiles (+ public.users) via the service-role client so the
 *      Mini App profile and broadcasts stay in sync.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "Telegram Bot webhook endpoint is ready.",
  });
}

export async function POST(request: NextRequest) {
  // callback_query taps (the «🌐 ቋንቋ» inline keyboard: lang_am / lang_en /
  // lang_om / lang_ti) are dispatched inside handleTelegramWebhookRequest →
  // handleTelegramWebhookUpdate, which persists the choice to Supabase and
  // answers the callback in the selected language.
  const { status, body } = await handleTelegramWebhookRequest(request);
  return NextResponse.json(body, { status });
}
