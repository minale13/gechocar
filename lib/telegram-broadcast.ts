import { NextRequest, NextResponse } from "next/server";

import {
  broadcastTelegramToUsers,
  getTelegramBroadcastChatIds,
} from "@/lib/admin/management";
import {
  createSupabaseAdminClient,
  requireAdminAccess,
} from "@/lib/supabase/server";
import {
  getTelegramConfigFromSettings,
  sendTelegramMessage,
  sendTelegramPhotoWithFallback,
  type TelegramConfig,
} from "@/lib/telegram";

/**
 * Shared Telegram broadcast handler used by BOTH routes:
 *   • POST/GET /api/admin/broadcast
 *   • POST/GET /api/telegram/broadcast
 *
 * RECIPIENT QUERY (OR-based via the SERVICE ROLE client):
 * getTelegramBroadcastChatIds() runs against createSupabaseAdminClient()
 * (SUPABASE_SERVICE_ROLE_KEY → bypasses RLS) and selects from
 * public.profiles using OR-based filtering:
 *   telegram_chat_id IS NOT NULL OR telegram_id IS NOT NULL
 * resolving each row's effective chat id as
 * COALESCE(telegram_chat_id, telegram_id::text). It is NOT restricted by
 * secondary flags such as is_registered — anyone who ever sent /start (or any
 * direct message) to the bot, or opened the Mini App, is included.
 *
 * Sends go through broadcastTelegramToUsers(): one sendMessage / sendPhoto
 * call per chat id, throttled to ~20 msg/s, tolerating per-recipient failures
 * (users who never opened a chat with the bot answer 403 — skipped, not fatal).
 */

/** Map requireAdminAccess() failures to HTTP statuses. */
function authErrorStatus(error: unknown): number {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (message.includes("Forbidden")) return 403;
  if (message.includes("Unauthorized")) return 401;
  return 500;
}

/** Resolve the bot token: env first, then Admin → Telegram Bot Settings. */
async function resolveBotToken(
  adminClient: ReturnType<typeof createSupabaseAdminClient>
): Promise<string> {
  const fromEnv = (process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
  if (fromEnv) return fromEnv;

  try {
    // Reads app_settings with the service-role client (bypasses RLS).
    const config = await getTelegramConfigFromSettings(adminClient as never);
    return config.botToken;
  } catch (error) {
    console.error("broadcast: could not resolve bot token from settings:", error);
    return "";
  }
}

/** GET — registered broadcast recipient count (admin-only; user data). */
export async function handleBroadcastGet(): Promise<NextResponse> {
  try {
    await requireAdminAccess();
  } catch (error) {
    console.error("broadcast: unauthorized GET:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unauthorized" },
      { status: authErrorStatus(error) }
    );
  }

  try {
    // SERVICE ROLE client — the OR-based recipient query must not be filtered
    // by RLS policies that only expose the caller's own profile row.
    const adminClient = createSupabaseAdminClient();
    const chatIds = await getTelegramBroadcastChatIds(adminClient as never);

    return NextResponse.json({
      ok: true,
      recipients: chatIds.length,
      message:
        chatIds.length > 0
          ? `${chatIds.length} registered chat id(s) will receive broadcasts.`
          : "No registered chat ids yet — users are registered when they send /start to the bot or open the Mini App.",
    });
  } catch (error) {
    console.error(
      "broadcast: recipient count query failed:",
      error instanceof Error ? error.message : error,
      error
    );
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to count recipients.",
      },
      { status: 500 }
    );
  }
}

/** POST — broadcast { text, photo_url? } to every registered Telegram user. */
export async function handleBroadcastPost(
  request: NextRequest
): Promise<NextResponse> {
  try {
    await requireAdminAccess();
  } catch (error) {
    console.error("broadcast: unauthorized POST:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unauthorized" },
      { status: authErrorStatus(error) }
    );
  }

  // ── Parse + validate the payload ──────────────────────────────────────────
  let body: { text?: unknown; photo_url?: unknown };
  try {
    body = (await request.json()) as { text?: unknown; photo_url?: unknown };
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body. Expected { text?, photo_url? }." },
      { status: 400 }
    );
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  const photoUrl = typeof body.photo_url === "string" ? body.photo_url.trim() : "";

  if (!text && !photoUrl) {
    return NextResponse.json(
      { ok: false, error: "Provide at least one of `text` or `photo_url` to broadcast." },
      { status: 400 }
    );
  }
  if (text.length > 4096) {
    // Telegram's hard message limit — fail fast instead of erroring per user.
    return NextResponse.json(
      { ok: false, error: "`text` exceeds Telegram's 4096-character message limit." },
      { status: 400 }
    );
  }

  // ── SERVICE ROLE client for the OR-based recipient query ─────────────────
  const adminClient = createSupabaseAdminClient();

  const botToken = await resolveBotToken(adminClient);
  if (!botToken) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "No Telegram bot token available. Set TELEGRAM_BOT_TOKEN or save it in Admin → Telegram Bot Settings.",
      },
      { status: 400 }
    );
  }

  // Per-recipient send: photo (with optional caption) when photo_url is given,
  // otherwise a plain text message. `config.chatId` is each user's chat id.
  // Base64 data URLs are uploaded as multipart/form-data; photo failures
  // degrade to a text-only send instead of surfacing raw Telegram errors.
  const send = photoUrl
    ? (config: TelegramConfig) =>
        sendTelegramPhotoWithFallback(config, photoUrl, text || undefined)
    : (config: TelegramConfig) => sendTelegramMessage(config, text);

  try {
    const result = await broadcastTelegramToUsers(
      adminClient as never,
      botToken,
      send
    );

    console.log(
      `broadcast: POST completed — ok=${result.ok}, sent=${result.sent}/${result.recipients}.`
    );

    // 502 signals "Telegram delivery failed" without masking auth/validation
    // errors that legitimately returned 400/401/403 above.
    return NextResponse.json(
      {
        ok: result.ok,
        recipients: result.recipients,
        sent: result.sent,
        failed: result.failed,
        message: result.message,
        error: result.firstError,
      },
      { status: result.ok ? 200 : 502 }
    );
  } catch (error) {
    console.error("broadcast: unexpected failure:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Broadcast failed unexpectedly.",
      },
      { status: 500 }
    );
  }
}
