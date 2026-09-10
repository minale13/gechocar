/**
 * Telegram Bot API broadcast service.
 *
 * Reads TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID from the app_settings table
 * (managed in /admin) and sends formatted lottery announcements to a
 * Telegram bot/channel using the official Bot API (sendMessage / sendPhoto).
 */

const TELEGRAM_API_BASE = "https://api.telegram.org/bot";

export type TelegramConfig = {
  botToken: string;
  chatId: string;
};

export type TelegramSendResult = {
  ok: boolean;
  messageId?: number;
  error?: string;
};

/** Fetch the Telegram config from app_settings (server-side only).
 *
 * app_settings is a single-row table (id = 1); the bot token and chat id live
 * in the dedicated `telegram_bot_token` / `telegram_chat_id` columns (added by
 * supabase/migrations/005 & 006).
 *
 * The bot token is MANDATORY (nothing can be sent without it). The chat id is
 * OPTIONAL: when blank, callers treat the bot as being in BROADCAST mode and
 * deliver directly to every registered Telegram user's personal chat instead
 * of a single channel/group. A chat id may be a personal numeric Telegram chat
 * id (e.g. "123456789"), a @channelusername, or a -100… group/supergroup id.
 */
export async function getTelegramConfigFromSettings(
  supabase: ReturnType<typeof import("@/lib/supabase/server").createSupabaseServerClient>
): Promise<TelegramConfig> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("telegram_bot_token, telegram_chat_id")
    .eq("id", 1)
    .maybeSingle();

  if (error) throw error;

  const botToken = (data?.telegram_bot_token ?? "").trim();
  const chatId = (data?.telegram_chat_id ?? "").trim();

  if (!botToken) {
    throw new Error(
      "Telegram bot token is not configured. Set it in Admin → Telegram Bot Settings."
    );
  }

  // NOTE: an empty chatId is intentional — it signals broadcast mode to callers.
  return { botToken, chatId };
}

/**
 * Validate a bot token via the Telegram getMe endpoint (no message is sent).
 * Used by "Send Test" when no chat id is configured (broadcast mode) so the
 * admin can still verify the token without spamming every registered user.
 */
export async function getTelegramMe(
  botToken: string
): Promise<{ ok: boolean; botName?: string; error?: string }> {
  try {
    const url = `${TELEGRAM_API_BASE}${botToken}/getMe`;
    const response = await fetch(url, { method: "POST" });

    const data = (await response.json()) as {
      ok?: boolean;
      result?: { username?: string };
      description?: string;
    };

    if (!response.ok || !data.ok) {
      console.error("=== Telegram getMe failed ===");
      console.error("Status:", response.status);
      console.error("Response:", data);
      return {
        ok: false,
        error: data.description || `Telegram API returned HTTP ${response.status}`,
      };
    }

    return { ok: true, botName: data.result?.username };
  } catch (err) {
    console.error("=== Telegram getMe network error ===", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error contacting Telegram API",
    };
  }
}

/** Build a formatted lottery announcement message. */
export function buildLotteryMessage(input: {
  title: string;
  description?: string;
  price?: number | string;
  tickets?: number | string;
  location?: string;
  link: string;
}): string {
  const lines: string[] = [];
  lines.push(`🎉 *${input.title}*`);
  lines.push("");

  if (input.description) {
    lines.push(input.description);
    lines.push("");
  }

  if (input.price !== undefined && input.price !== null && input.price !== "") {
    lines.push(`💰 *Ticket Price:* ${Number(input.price).toLocaleString()} ETB`);
  }

  if (input.tickets !== undefined && input.tickets !== null && input.tickets !== "") {
    lines.push(`🎟️ *Total Tickets:* ${Number(input.tickets).toLocaleString()}`);
  }

  if (input.location) {
    lines.push(`📍 *Location:* ${input.location}`);
  }

  lines.push("");
  lines.push(`🔗 *Join now:* ${input.link}`);

  return lines.join("\n");
}

/**
 * Send a text message to the configured Telegram chat.
 * Returns a structured result instead of throwing so the caller can
 * surface a friendly error message.
 */
export async function sendTelegramMessage(
  config: TelegramConfig,
  text: string,
  parseMode: "HTML" | "Markdown" = "Markdown"
): Promise<TelegramSendResult> {
  try {
    const url = `${TELEGRAM_API_BASE}${config.botToken}/sendMessage`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: config.chatId,
        text,
        parse_mode: parseMode,
        disable_web_page_preview: false,
      }),
    });

    const data = (await response.json()) as {
      ok?: boolean;
      result?: { message_id?: number };
      description?: string;
    };

    if (!response.ok || !data.ok) {
      console.error("=== Telegram sendMessage failed ===");
      console.error("Status:", response.status);
      console.error("Response:", data);
      return {
        ok: false,
        error: data.description || `Telegram API returned HTTP ${response.status}`,
      };
    }

    return { ok: true, messageId: data.result?.message_id };
  } catch (err) {
    console.error("=== Telegram sendMessage network error ===", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error contacting Telegram API",
    };
  }
}

/** Shape of an inline (base64) image decoded and ready for multipart upload. */
type DecodedImage = { bytes: Uint8Array<ArrayBuffer>; mime: string; filename: string };

/**
 * Decode a base64 data URL (e.g. "data:image/jpeg;base64,…" — the fallback
 * format stored when Supabase Storage is unavailable) into raw image bytes.
 * Returns null for anything that is not a well-formed base64 image data URL.
 */
function decodeBase64DataUrl(value: string): DecodedImage | null {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(
    value.trim()
  );
  if (!match) return null;

  const mime = match[1].toLowerCase();
  try {
    const decoded = Buffer.from(match[2], "base64");
    if (decoded.length === 0) return null;
    // Copy into a Uint8Array explicitly backed by a concrete ArrayBuffer so
    // the value is a valid BlobPart for the multipart upload below.
    const bytes = new Uint8Array(new ArrayBuffer(decoded.byteLength));
    bytes.set(decoded);
    const ext = (mime.split("/")[1] ?? "jpg").replace(/[^a-z0-9]/g, "");
    const filename = `photo.${ext === "jpeg" ? "jpg" : ext || "jpg"}`;
    return { bytes, mime, filename };
  } catch (err) {
    console.error("sendTelegramPhoto: base64 decode failed:", err);
    return null;
  }
}

/** Shared Telegram send* response handling (JSON and multipart paths alike). */
async function readTelegramSendResponse(
  response: Response,
  endpoint: string
): Promise<TelegramSendResult> {
  let data: {
    ok?: boolean;
    result?: { message_id?: number };
    description?: string;
  } = {};
  try {
    data = (await response.json()) as typeof data;
  } catch {
    // Non-JSON body (e.g. an HTML error page) — fall through to the failure
    // branch with the HTTP status only.
  }

  if (!response.ok || !data.ok) {
    console.error(`=== Telegram ${endpoint} failed ===`);
    console.error("Status:", response.status);
    console.error("Response:", data);
    return {
      ok: false,
      error: data.description || `Telegram API returned HTTP ${response.status}`,
    };
  }

  return { ok: true, messageId: data.result?.message_id };
}

/**
 * Upload an inline image to sendPhoto as multipart/form-data. This is the
 * ONLY correct way to send a base64 image: the Telegram Bot API does not
 * accept data URLs as the JSON `photo` string parameter ("Bad Request: wrong
 * remote file identifier specified: Wrong padding length").
 */
async function sendTelegramPhotoMultipart(
  config: TelegramConfig,
  image: DecodedImage,
  caption?: string
): Promise<TelegramSendResult> {
  const url = `${TELEGRAM_API_BASE}${config.botToken}/sendPhoto`;
  const form = new FormData();
  form.append("chat_id", config.chatId);
  form.append("parse_mode", "Markdown");
  if (caption) form.append("caption", caption);
  form.append(
    "photo",
    new Blob([image.bytes], { type: image.mime }),
    image.filename
  );

  // NOTE: no explicit Content-Type header — fetch generates the multipart
  // boundary automatically.
  const response = await fetch(url, { method: "POST", body: form });
  return readTelegramSendResponse(response, "sendPhoto (multipart)");
}

/**
 * Send a photo (with optional caption) to the configured Telegram chat.
 *
 *   • https:// (or http://) URL / Telegram file_id → JSON `photo` parameter.
 *   • base64 data URL (data:image/...;base64,) → decoded server-side and
 *     uploaded as a multipart/form-data file, since Telegram rejects data
 *     URLs passed as JSON strings.
 *
 * Never throws — failures are returned as { ok: false, error }.
 */
export async function sendTelegramPhoto(
  config: TelegramConfig,
  photoUrl: string,
  caption?: string
): Promise<TelegramSendResult> {
  try {
    const trimmed = (photoUrl ?? "").trim();

    const inline = decodeBase64DataUrl(trimmed);
    if (inline) {
      return await sendTelegramPhotoMultipart(config, inline, caption);
    }

    if (trimmed.startsWith("data:")) {
      // A data URL we cannot decode — NEVER pass it as a string parameter
      // (Telegram answers "wrong remote file identifier: Wrong padding
      // length"). Report failure so callers can fall back to text-only.
      console.error(
        "sendTelegramPhoto: unsupported data URL (not a base64 image) — refusing to send it as a photo parameter."
      );
      return {
        ok: false,
        error: "Unsupported inline image format (not a base64 image data URL).",
      };
    }

    const url = `${TELEGRAM_API_BASE}${config.botToken}/sendPhoto`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: config.chatId,
        photo: trimmed,
        caption: caption || undefined,
        parse_mode: "Markdown",
      }),
    });
    return await readTelegramSendResponse(response, "sendPhoto");
  } catch (err) {
    console.error("=== Telegram sendPhoto network error ===", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error contacting Telegram API",
    };
  }
}

/**
 * Send a scheduler/announcement post: photo when `imageUrl` is present, with
 * a graceful TEXT-ONLY fallback when the photo cannot be delivered (failed
 * upload, unparsable image, Telegram rejection). Telegram HTTP errors are
 * logged server-side and never propagate raw to the admin UI toast.
 */
export async function sendTelegramPhotoWithFallback(
  config: TelegramConfig,
  imageUrl: string | null | undefined,
  caption?: string
): Promise<TelegramSendResult> {
  const image = (imageUrl ?? "").trim();
  if (!image) {
    return sendTelegramMessage(config, caption ?? "");
  }

  const photoResult = await sendTelegramPhoto(config, image, caption);
  if (photoResult.ok) return photoResult;

  console.warn(
    "=== Telegram photo send failed — falling back to a text-only message ===",
    "| Error:",
    photoResult.error ?? "unknown",
    "|"
  );

  if (!caption || !caption.trim()) {
    // Nothing meaningful to fall back to — surface the photo error as-is.
    return photoResult;
  }

  const textResult = await sendTelegramMessage(config, caption);
  if (textResult.ok) {
    return {
      ...textResult,
      error: `Photo skipped (${photoResult.error ?? "unknown"}); sent text-only instead.`,
    };
  }
  return textResult;
}

/**
 * Post a lottery item to Telegram. If the item has an image, sends a photo
 * with the formatted caption; otherwise sends a plain text message.
 */
export async function postLotteryToTelegram(
  config: TelegramConfig,
  input: {
    title: string;
    description?: string;
    price?: number | string;
    tickets?: number | string;
    location?: string;
    imageUrl?: string;
    link: string;
  }
): Promise<TelegramSendResult> {
  const message = buildLotteryMessage(input);

  // Photo when an image is present (base64 data URLs are uploaded as
  // multipart/form-data), with a graceful text-only fallback if the photo
  // cannot be delivered.
  return sendTelegramPhotoWithFallback(config, input.imageUrl, message);
}