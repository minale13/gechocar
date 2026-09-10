/**
 * Telegram Bot Webhook handler — /start user registration.
 *
 * Receives raw Telegram Bot API updates (POSTed by Telegram to
 * /api/telegram/webhook) and, for EVERY message a human sends to the bot
 * (especially /start), captures:
 *
 *   chat_id    — message.chat.id  (the user's personal chat with the bot;
 *                the broadcast target for sendMessage/sendPhoto)
 *   telegram_id — message.from.id (the user's Telegram account id)
 *   first_name — message.from.first_name  (+ last_name / username when sent)
 *
 * It UPSERTS those into BOTH:
 *   • public.telegram_users  — the dedicated webhook registration registry
 *     (primary broadcast source, onConflict "telegram_id").
 *   • public.profiles        — the existing user table the Mini App / checkout
 *     read, so /start alone (no phone shared, no Mini App opened) is enough
 *     to register the chat_id.
 *
 * Writes use createSupabaseAdminClient() (service role), which bypasses RLS —
 * the same posture scripts/telegram-bot.mjs relies on, because Telegram
 * webhook calls carry no Supabase user session.
 *
 * Registration NEVER blocks the webhook handshake: a failed upsert is logged
 * and the caller still acks Telegram with 200 (otherwise Telegram retries the
 * same update forever).
 */

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getTelegramConfigFromSettings } from "@/lib/telegram";

const TELEGRAM_API_BASE = "https://api.telegram.org/bot";

/** Production Mini App URL — used by the /start "Launch Mini App" button. */
const WEBAPP_URL =
  process.env.WEBAPP_URL ?? "https://admass-lotterys-app.vercel.app";

/** Minimal, structural type for the only Telegram update fields we use. */
export type TelegramUpdate = {
  update_id?: number;
  message?: {
    message_id?: number;
    chat?: { id?: number; type?: string };
    from?: {
      id?: number;
      is_bot?: boolean;
      first_name?: string;
      last_name?: string;
      username?: string;
    };
    text?: string;
    contact?: { phone_number?: string; user_id?: number };
  };
};

export type TelegramWebhookResult = {
  registered: boolean;
  telegramId?: number;
  chatId?: string;
  /** True when at least one Supabase upsert failed (registration incomplete). */
  supabaseFailed?: boolean;
};

// ── Reply-keyboard menu (mirrors scripts/telegram-bot.mjs) ───────────────────

// Reply-keyboard button labels — a pressed button arrives back as msg.text.
const BTN_OPEN_APP = "መተግበሪያ ክፈት";
const BTN_TICKETS = "ትኬቶች";
const BTN_SUPPORT = "እገዛ";
const BTN_SHARE_PHONE = "ስልክ አጋራ";

/**
 * Main menu reply keyboard (auto-resizing, persistent):
 *   Row 1: open the Mini App | Row 2: tickets + support | Row 3: share phone.
 */
const MAIN_KEYBOARD = {
  keyboard: [
    [{ text: BTN_OPEN_APP }],
    [{ text: BTN_TICKETS }, { text: BTN_SUPPORT }],
    [{ text: BTN_SHARE_PHONE, request_contact: true }],
  ],
  resize_keyboard: true,
  is_persistent: true,
  one_time_keyboard: false,
};

/**
 * Inline keyboard with a single "🚀 Launch Mini App" WebApp button. The Bot
 * API only allows web_app buttons on INLINE keyboards, so the /start welcome
 * uses this as its reply_markup while the persistent reply-keyboard menu is
 * presented in a follow-up message.
 */
function buildOpenAppKeyboard(): {
  inline_keyboard: Array<Array<{ text: string; web_app: { url: string } }>>;
} {
  return {
    inline_keyboard: [[{ text: "🚀 Launch Mini App", web_app: { url: WEBAPP_URL } }]],
  };
}

/** Escape HTML entities for parse_mode: "HTML" messages. */
function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Low-level sendMessage (HTML + optional reply_markup) — like the .mjs bot. */
async function sendHtmlMessage(
  botToken: string,
  chatId: number | string,
  text: string,
  replyMarkup?: unknown
): Promise<void> {
  await fetch(`${TELEGRAM_API_BASE}${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      reply_markup: replyMarkup ?? undefined,
    }),
  });
}

/** Resolve the bot token: env first, then Admin → Telegram Bot Settings. */
async function resolveBotToken(): Promise<string> {
  const fromEnv = (process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
  if (fromEnv) return fromEnv;

  try {
    const supabase = createSupabaseAdminClient();
    const config = await getTelegramConfigFromSettings(supabase as never);
    return config.botToken;
  } catch (error) {
    console.warn("telegram-webhook: no bot token available to reply with:", error);
    return "";
  }
}

/** Log a full Supabase error (code/details/hint) for a failed upsert. */
/**
 * Resolve the support contacts shown by the «እገዛ» reply-keyboard button.
 *
 * Reads the JSONB `support` column of app_settings row id = 1 (written by
 * Admin → Support Manager) with the service-role client (bypasses RLS — the
 * webhook has no Supabase session). Falls back to the same defaults as
 * getSupportSettings() on ANY failure — never throws, this is a best-effort
 * reply.
 */
async function resolveSupportInfo(): Promise<{
  username: string;
  contact: string;
  phone: string;
}> {
  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("app_settings")
      .select("support")
      .eq("id", 1)
      .maybeSingle();

    if (error) throw error;

    const value = (data?.support ?? {}) as Record<string, unknown>;
    return {
      username:
        typeof value.support_username === "string" && value.support_username
          ? value.support_username
          : "@admas_support",
      contact:
        typeof value.support_contact === "string" && value.support_contact
          ? value.support_contact
          : "@admas_support",
      phone: typeof value.support_phone === "string" ? value.support_phone : "",
    };
  } catch (error) {
    console.error(
      "telegram-webhook: support settings read failed — using defaults:",
      error
    );
    return { username: "@admas_support", contact: "@admas_support", phone: "" };
  }
}

function logUpsertError(table: string, err: unknown, payload: unknown): void {
  const e = (err ?? {}) as {
    message?: string;
    code?: string;
    details?: string;
    hint?: string;
  };
  console.error(`[telegram-webhook] "${table}" upsert FAILED`);
  console.error(`   message : ${e.message ?? "(no message)"}`);
  console.error(`   code    : ${e.code ?? "(none)"}`);
  console.error(`   details : ${e.details ?? "(none)"}`);
  console.error(`   hint    : ${e.hint ?? "(none)"}`);
  console.error("   full error:", JSON.stringify(e, null, 2));
  console.error("   payload  :", JSON.stringify(payload ?? {}, null, 2));
}

/**
 * Handle a single Telegram update.
 *
 * 1) Extracts msg.chat.id (chat_id) and msg.from.id (telegram_id) and UPSERTS
 *    the sender into telegram_users + profiles — recorded REGARDLESS of Mini
 *    App onboarding / phone sharing.
 * 2) Replies /start with the main menu and phone-shares with a confirmation
 *    so webhook mode doesn't regress the long-poll bot's UX.
 */
export async function handleTelegramWebhookUpdate(
  update: TelegramUpdate
): Promise<TelegramWebhookResult> {
  const msg = update?.message;
  if (!msg || !msg.chat?.id || !msg.from?.id || msg.from.is_bot) {
    // Non-message updates (callback_query, my_chat_member, bots…) → nothing
    // to register; still reported as handled so the route acks 200.
    return { registered: false };
  }

  // Only PRIVATE chats have a personal chat id that DM broadcasts can target.
  // Group/supergroup/channel ids are negative and would never be broadcast to —
  // skip storing them so the chat_id registry stays clean.
  if (msg.chat.type && msg.chat.type !== "private") {
    console.log(
      `telegram-webhook: skipping ${msg.chat.type} chat ${msg.chat.id} — only private chats are registered.`
    );
    return { registered: false };
  }

  // ── Requirement: extract chat_id + telegram_id from the update ────────────
  const chatId = String(msg.chat.id);
  const telegramId = Number(msg.from.id);
  const firstName = msg.from.first_name ?? null;
  const lastName = msg.from.last_name ?? null;
  const username = msg.from.username ?? null;
  const phoneNumber =
    msg.contact && msg.contact.user_id && msg.contact.user_id === msg.from.id
      ? msg.contact.phone_number
      : undefined;

  const isStart = (msg.text ?? "").trim().startsWith("/start");
  console.log(
    `telegram-webhook: ${isStart ? "/start" : "message"} from user ${telegramId} in chat ${chatId} — registering chat_id.`
  );

  const now = new Date().toISOString();

  let profileOk = true;

  try {
    const supabase = createSupabaseAdminClient();

    // 1) Register/mirror the sender into profiles (the ONLY user table — the
    //    live schema has no telegram_users table).
    //
    // PERMANENT FIX: Set telegram_chat_id = msg.chat.id.toString(). This is the
    // user's personal chat with the bot — the broadcast target for sendMessage.
    // Every /start (or any direct message) now guarantees a valid telegram_chat_id
    // on the profiles row, so the user becomes a broadcast target immediately.
    //
    // last_opened_at / is_registered power the Admin Dashboard metrics
    // ("Active Mini App" / "Total Registered Users") — a /start counts as the
    // user's first open so the counters move the moment they message the bot.
    const profilePayload: Record<string, unknown> = {
      telegram_id: telegramId,
      chat_id: chatId,
      telegram_chat_id: chatId,
      first_name: firstName,
      last_name: lastName,
      username,
      last_opened_at: now,
      is_registered: true,
      updated_at: now,
    };
    if (phoneNumber) profilePayload.phone_number = phoneNumber;

    const { data: profileRow, error: profileError } = await supabase
      .from("profiles")
      .upsert(profilePayload, { onConflict: "telegram_id" })
      .select("id, telegram_id, telegram_chat_id, chat_id")
      .maybeSingle();

    if (profileError) {
      profileOk = false;
      logUpsertError("profiles", profileError, profilePayload);
      console.error(
        "   → Fix: apply supabase/migrations/023_profiles_table.sql + " +
          "025_telegram_webhook_registration.sql (chat_id) + " +
          "026_profiles_activity.sql (last_opened_at, is_registered), and set " +
          "SUPABASE_SERVICE_ROLE_KEY (service-role writes bypass RLS — the " +
          "anon-key fallback CANNOT insert into profiles, which is why the " +
          "Admin user counts stay 0)."
      );
    } else {
      console.log(
        `telegram-webhook: upserted profiles${
          profileRow?.id ? ` row id=${profileRow.id}` : ""
        } (telegram_id=${telegramId}, chat_id=${chatId}, last_opened_at=${now})`
      );
    }

    console.log(
      `telegram-webhook: registered chat_id=${chatId} ` +
        `(telegram_id=${telegramId}, ${firstName ?? "no-name"})`
    );
  } catch (error) {
    // A registration failure must never break the webhook handshake.
    console.error("telegram-webhook: registration threw — continuing:", error);
  }

  // 2) Friendly replies (best-effort; a missing token just skips them).
  const botToken = await resolveBotToken();
  if (botToken) {
    const text = (msg.text ?? "").trim();

    try {
      if (text.startsWith("/start")) {
        // 1) IMMEDIATE welcome (sendMessage) with a "Launch Mini App" button.
        //    Sent right after the Supabase upsert so the user is greeted and
        //    can one-tap open the Mini App straight from the chat.
        await sendHtmlMessage(
          botToken,
          msg.chat.id,
          `👋 እንኳን ደህና መጡ${firstName ? `, ${escapeHtml(firstName)}` : ""}!\n\n` +
            `🚗 <b>Admas Lottery</b> — የመኪና ጨዋታ መድረክ።\n\n` +
            `👇 መተግበሪያውን ለመክፈት ከታች ያለውን «🚀 Launch Mini App» ቁልፍ ይጫኑ እና ትኬት ይግዙ!`,
          buildOpenAppKeyboard()
        );

        // 2) Follow-up with the main menu reply keyboard so «ትኬቶች»,
        //    «እገዛ» and «ስልክ አጋራ» stay one tap away.
        await sendHtmlMessage(
          botToken,
          msg.chat.id,
          `ከታች ካሉት ቁልፎች ይምረጡ፦\n` +
            `• «${BTN_TICKETS}» — የገዙትን ትኬቶች ይመልከቱ\n` +
            `• «${BTN_SUPPORT}» — የድጋፍ ቡድን ያግኙ\n` +
            `• «${BTN_SHARE_PHONE}» — ስልክ ቁጥርዎን ያጋሩ`,
          MAIN_KEYBOARD
        );
      } else if (text === BTN_OPEN_APP) {
        // «መተግበሪያ ክፈት» — the reply keyboard itself cannot carry a web_app
        // button, so guide the user to the inline "🚀 Launch Mini App" button
        // attached to this very message.
        await sendHtmlMessage(
          botToken,
          msg.chat.id,
          `🚀 <b>መተግበሪያውን ለመክፈት</b>\n\n` +
            `ከዚህ መልእክት ታች ያለውን «🚀 Launch Mini App» ቁልፍ ይጫኑ።\n\n` +
            `💡 ማሳሰቢያ፦ የቁልፍ ሰሌዳው «${BTN_OPEN_APP}» መጫን ብቻ በቂ አይሆንም — ` +
            `የመክፈቻው ቁልፍ በመልእክቱ ውስጥ ያለውን ወደ ታች ይጫኑ።`,
          buildOpenAppKeyboard()
        );
      } else if (text === BTN_TICKETS) {
        // «ትኬቶች» — active tickets are listed inside the Mini App.
        await sendHtmlMessage(
          botToken,
          msg.chat.id,
          `🎫 <b>የእርስዎ ትኬቶች</b>\n\n` +
            `የገዙትን ንቁ ትኬቶች ሁሉ በ<b>Mini App</b> ውስጥ ያገኛሉ — ` +
            `የ«የእኔ ትኬቶች» ገጽ ላይ።\n\n` +
            `👇 ለመጀመር ከታች ያለውን «🚀 Launch Mini App» ቁልፍ ይጫኑ።`,
          buildOpenAppKeyboard()
        );
      } else if (text === BTN_SUPPORT) {
        // «እገዛ» — support contacts (Admin → Support Manager settings).
        const support = await resolveSupportInfo();
        const supportLines = [
          `💬 <b>የድጋፍ ቡድን</b>\n`,
          `ለማንኛውም ጥያቄ ወይም ችግር የድጋፍ ቡድናችንን ያግኙን፦`,
          support.username ? `• Telegram፦ ${escapeHtml(support.username)}` : "",
          support.contact && support.contact !== support.username
            ? `• ግንኙነት፦ ${escapeHtml(support.contact)}`
            : "",
          support.phone ? `• ስልክ፦ ${escapeHtml(support.phone)}` : "",
          `\nወይም በዚህ ውይይት ውስጥ መልእክት ይተዉልን — በቅርቡ እንመልሳለን።`,
        ].filter(Boolean);
        await sendHtmlMessage(
          botToken,
          msg.chat.id,
          supportLines.join("\n"),
          MAIN_KEYBOARD
        );
      } else if (phoneNumber) {
        await sendHtmlMessage(
          botToken,
          msg.chat.id,
          `✅ <b>ስልክ ቁጥርዎ በተሳካ ሁኔታ ተመዝግቧል!</b>\n\n` +
            `📱 <code>${escapeHtml(phoneNumber)}</code> በመገለጫዎ ላይ ተመዝግቧል።\n\n` +
            `🎉 እንኳን ደህና መጡ${firstName ? `, ${escapeHtml(firstName)}` : ""} — ` +
            `አሁን ትክክለኛ የAdmas Lottery ተጠቃሚ ነዎት።\n\n` +
            `👇 ሎተሪዎችን ለመመልከት «${BTN_OPEN_APP}» ቁልፉን ይጫኑ።`,
          MAIN_KEYBOARD
        );
      }
    } catch (replyError) {
      // Reply failures must never affect the 200 ack — the registration above
      // already persisted (or its failure was logged) independently.
      console.error("telegram-webhook: reply send failed — continuing:", replyError);
    }
  }

  return {
    registered: profileOk,
    supabaseFailed: !profileOk,
    telegramId,
    chatId,
  };
}
