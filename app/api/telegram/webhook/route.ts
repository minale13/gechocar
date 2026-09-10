import { NextRequest, NextResponse } from "next/server";
import {
  handleTelegramWebhookUpdate,
  type TelegramUpdate,
} from "@/lib/telegram-webhook";

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
 * Telegram Bot webhook receiver.
 *
 * Point the bot at this URL with:
 *   setWebhook?url=<PUBLIC_URL>/api/telegram/webhook
 *
 * For every update with a human message (including /start) it captures
 * chat_id / telegram_id / first_name and upserts them into public.profiles
 * so the auto-post broadcast can reach users who never opened the Mini App.
 */
export async function POST(request: NextRequest) {
  // Optional guard: when TELEGRAM_WEBHOOK_SECRET is set, Telegram includes it
  // as the X-Telegram-Bot-Api-Secret-Token header (setWebhook secret_token).
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret) {
    const provided = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
    if (provided !== secret) {
      console.warn("telegram-webhook: rejected request — invalid secret token.");
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    // Malformed payload — Telegram's retry won't fix a broken body.
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const result = await handleTelegramWebhookUpdate(update);
    console.log(
      `telegram-webhook: update ${update.update_id ?? "?"} handled` +
        (result.registered
          ? ` (registered chat ${result.chatId})`
          : " (no registration needed)") +
        (result.supabaseFailed
          ? " — ⚠ Supabase upsert failed; still acking 200 so Telegram keeps delivering updates"
          : "")
    );
  } catch (error) {
    // Never let a handler failure bubble into a non-200: Telegram would retry
    // the same update forever. Log it and still acknowledge.
    console.error("telegram-webhook: handler failed — acking anyway:", error);
  }

  // Telegram considers the update handled on 200 — always acknowledge.
  return NextResponse.json({ ok: true });
}