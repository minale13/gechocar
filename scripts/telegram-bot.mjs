#!/usr/bin/env node
/**
 * ============================================================================
 * ADMAS TELEGRAM REGISTRATION BOT
 * ============================================================================
 *
 * Standalone long-polling Telegram bot that registers users and serves them a
 * main reply-keyboard menu:
 *
 *   Main keyboard (resize_keyboard: true, persistent):
 *     Row 1: "መተግበሪያ ክፈት" -> opens the production Mini App. NOTE: the Bot API
 *                             only allows `web_app` buttons on INLINE keyboards,
 *                             so this reply-keyboard button's handler replies
 *                             with an InlineKeyboardMarkup web_app button.
 *     Row 2: "ትኬቶች" | "እገዛ"  -> tickets lookup in Supabase / support contact.
 *     Row 3: "ስልክ አጋራ"      -> request_contact: true; captures phone_number
 *                             and upserts the Supabase profiles row.
 *
 *   /start -> sends the main keyboard. Contact -> upserts the user into the
 *   Supabase `profiles` table (override with PROFILES_TABLE env var).
 *
 * RUN:  npm run bot      (or: node scripts/telegram-bot.mjs)
 *
 * ENV (from .env.local or the process environment):
 *   TELEGRAM_BOT_TOKEN         Bot token from @BotFather. Optional — when
 *                              empty the token saved in Admin -> Telegram Bot
 *                              Settings (app_settings.telegram_bot_token) is
 *                              used instead, matching lib/telegram.ts.
 *   SUPABASE_SERVICE_ROLE_KEY  Server-only key. REQUIRED in practice: the
 *                              profiles table is protected by RLS and the bot
 *                              writes outside any user session.
 *   NEXT_PUBLIC_SUPABASE_URL   Project URL (falls back to the hardcoded one).
 *   PROFILES_TABLE             Table to upsert into (default: "profiles").
 *   WEBAPP_URL                 Production Mini App URL (default below).
 *   SUPPORT_USERNAME           Support handle for the "እገዛ" button. Optional —
 *                              falls back to app_settings.support.support_username
 *                              (Admin → Support Manager), then @AdmasSupport1.
 *   PORT                       HTTP health-check port (Render Web Service
 *                              requirement). Default 3000. GET / responds
 *                              "Bot is running!" while long polling runs.
 *
 * NOTE: The bot uses raw Bot API HTTP calls (fetch) — no extra dependencies.
 *       Telegram user ids are stored as text to avoid precision loss.
 * ============================================================================
 */

import fs from "fs";
import http from "http";
import { createClient } from "@supabase/supabase-js";

// ── Configuration ───────────────────────────────────────────────────────────

const DEFAULT_WEBAPP_URL = "https://gechocar.vercel.app";
const DEFAULT_SUPABASE_URL = "https://itcovomjihrfvanykrtf.supabase.co";

/** Reuse the simple .env.local parser pattern from scripts/validate-supabase-env.mjs. */
function parseEnvFile(path) {
  try {
    const text = fs.readFileSync(path, "utf8");
    const out = {};
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (!m) continue;
      // Strip surrounding quotes; ignore inline comments on unquoted values.
      let value = m[2].trim();
      if (/^".*"$/.test(value) || /^'.*'$/.test(value)) value = value.slice(1, -1);
      out[m[1]] = value;
    }
    return out;
  } catch {
    return {};
  }
}

const fileEnv = parseEnvFile(".env.local");
const env = (name) => (process.env[name] ?? fileEnv[name] ?? "").trim();

const isPlaceholder = (v) => !v || /your-|placeholder|put-|replace|xxx|TODO/i.test(v);

const SUPABASE_URL = env("NEXT_PUBLIC_SUPABASE_URL") || DEFAULT_SUPABASE_URL;
const SERVICE_KEY = env("SUPABASE_SERVICE_ROLE_KEY");
const ANON_KEY = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const PROFILES_TABLE = env("PROFILES_TABLE") || "profiles";
const WEBAPP_URL = env("WEBAPP_URL") || DEFAULT_WEBAPP_URL;
const SUPPORT_USERNAME = env("SUPPORT_USERNAME");
const DEFAULT_SUPPORT_USERNAME = "@AdmasSupport1";

// The service-role key bypasses RLS — the bot MUST use it for the upsert.
// Fall back to the anon key only with a loud warning (writes will likely fail).
let supabaseKey = SERVICE_KEY;
if (isPlaceholder(supabaseKey)) {
  supabaseKey = ANON_KEY;
  if (isPlaceholder(supabaseKey)) {
    console.error(
      "✖ FATAL: No usable Supabase key found.\n" +
        "  Set SUPABASE_SERVICE_ROLE_KEY (server-only) in .env.local."
    );
    process.exit(1);
  }
  console.warn(
    "⚠ SUPABASE_SERVICE_ROLE_KEY is missing/placeholder — falling back to the " +
      "anon key. Row Level Security will very likely BLOCK the profiles upsert.\n" +
      "  Fix: Supabase Dashboard → Project Settings → API → service_role key."
  );
}

const supabase = createClient(SUPABASE_URL, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── HTTP health server (Render Web Service requirement) ─────────────────────
//
// Render (and most PaaS hosts) require the service to LISTEN on
// process.env.PORT, otherwise the deploy is marked failed. This tiny server:
//   • binds process.env.PORT || 3000 immediately — before bot-token lookup and
//     Telegram long polling start — so the platform health check never times
//     out while the bot is still initializing;
//   • answers GET /  → "Bot is running!"  (also GET /health);
//   • runs ALONGSIDE the long-polling loop (Node's event loop serves both —
//     no threads, no extra dependency).
//
// A bind failure (e.g. port already taken locally) is logged but does NOT kill
// the bot: polling can still work in local/dev environments.
const PORT = Number(process.env.PORT) || 3000;

const httpServer = http.createServer((req, res) => {
  if (req.method === "GET" && (req.url === "/" || req.url === "/health")) {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Bot is running!");
    return;
  }
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
});

httpServer.on("error", (err) => {
  console.error(
    `✖ HTTP health server could not bind port ${PORT} (${err?.message ?? err}).\n` +
      `  The Telegram bot will keep running, but Render deploys REQUIRE the\n` +
      `  port to listen — free the port or set PORT to a free value.`
  );
});

httpServer.listen(PORT, () => {
  console.log(`• HTTP health server listening on port ${PORT} (GET / → "Bot is running!")`);
});

// ── Telegram Bot API helpers ────────────────────────────────────────────────

const maskToken = (t) => (t.length > 10 ? `${t.slice(0, 6)}…${t.slice(-4)}` : "***");

/**
 * Resolve the bot token: TELEGRAM_BOT_TOKEN env first, then the token saved in
 * Admin → Telegram Bot Settings (app_settings.telegram_bot_token, row id = 1)
 * — the same source lib/telegram.ts uses for broadcasts.
 */
async function resolveBotToken() {
  const envToken = env("TELEGRAM_BOT_TOKEN");
  if (envToken) {
    console.log(`• Using TELEGRAM_BOT_TOKEN from environment (${maskToken(envToken)})`);
    return envToken;
  }

  console.log("• TELEGRAM_BOT_TOKEN not set — reading app_settings.telegram_bot_token…");
  const { data, error } = await supabase
    .from("app_settings")
    .select("telegram_bot_token")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    console.error("✖ Could not read app_settings:", error.message);
    process.exit(1);
  }

  const settingsToken = (data?.telegram_bot_token ?? "").trim();
  if (!settingsToken) {
    console.error(
      "✖ FATAL: No bot token available.\n" +
        "  Set TELEGRAM_BOT_TOKEN in .env.local, or save a token in\n" +
        "  Admin → Telegram Bot Settings (it is stored in app_settings)."
    );
    process.exit(1);
  }
  console.log(`• Using bot token from app_settings (${maskToken(settingsToken)})`);
  return settingsToken;
}

/** Minimal wrapper around the Bot API. Returns the parsed JSON result. */
async function callTelegramApi(method, botToken, payload = {}) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(
      `${method} failed: ${data.description || `HTTP ${response.status}`}`
    );
  }
  return data.result;
}

async function sendMessage(botToken, chatId, text, replyMarkup) {
  return callTelegramApi("sendMessage", botToken, {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    reply_markup: replyMarkup,
  });
}

// ── Keyboard layouts ────────────────────────────────────────────────────────

// Reply-keyboard button labels — a pressed button arrives back as msg.text.
// (web_app / request_contact buttons open/request directly and send no text.)
const BTN_SHARE_PHONE = "📱 ስልክ አጋራ";
const BTN_OPEN_APP = "🚀 መተግበሪያ ክፈት";
const BTN_TICKETS = "🎟️ ትኬቶቼ";
const BTN_LANGUAGE = "🌐 ቋንቋ";
const BTN_SUPPORT = "🎧 ድጋፍ";

/**
 * Main menu reply keyboard (auto-resizing, persistent):
 *   Row 1: share phone + open the Mini App (web_app — private chats only).
 *   Row 2: tickets + language.
 *   Row 3: support.
 */
const MAIN_KEYBOARD = {
  keyboard: [
    [
      { text: BTN_SHARE_PHONE, request_contact: true },
      { text: BTN_OPEN_APP, web_app: { url: WEBAPP_URL } },
    ],
    [{ text: BTN_TICKETS }, { text: BTN_LANGUAGE }],
    [{ text: BTN_SUPPORT }],
  ],
  resize_keyboard: true,
  is_persistent: true,
  one_time_keyboard: false,
};

/**
 * Inline keyboard with a WebApp button — fallback for old clients / manually
 * typed text, because the persistent reply keyboard already carries the
 * web_app button (the Bot API allows web_app on reply keyboards in private
 * chats, Bot API 5.5+).
 */
function buildOpenAppKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "🚗 መተግበሪያውን ይክፈቱ", web_app: { url: WEBAPP_URL } }],
    ],
  };
}

// ── Supabase upsert ─────────────────────────────────────────────────────────

/**
 * Upsert the registering user.
 *
 * IMPORTANT: the live public.profiles table uses a UUID primary key that is
 * generated by Supabase (gen_random_uuid()). Sending the Telegram id as `id`
 * fails with 22P02 "invalid input syntax for type uuid: '<telegram id>'", so:
 *   • `id` is NEVER included in the payload — Supabase generates it,
 *   • the Telegram user id is mapped to the `telegram_id` BIGINT column
 *     (Number(), because JSON cannot serialize BigInt — Telegram ids fit
 *     safely below Number.MAX_SAFE_INTEGER),
 *   • conflicts are resolved on the UNIQUE `telegram_id` column, so
 *     re-sharing the contact refreshes the profile instead of duplicating it.
 */
async function upsertProfile({ telegramId, firstName, lastName, username, phoneNumber }) {
  const payload = {
    telegram_id: Number(telegramId),
    chat_id: String(telegramId),
    telegram_chat_id: String(telegramId),
    first_name: firstName ?? null,
    last_name: lastName ?? null,
    username: username ?? null,
    phone_number: phoneNumber ?? null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from(PROFILES_TABLE)
    .upsert(payload, { onConflict: "telegram_id" });

  if (error) {
    // Full error dump for debugging (code / details / hint / raw object).
    console.error(`✖ ${PROFILES_TABLE} upsert failed for telegram_id ${payload.telegram_id}:`);
    console.error("   code:   ", error.code ?? "(none)");
    console.error("   message:", error.message);
    if (error.details) console.error("   details:", error.details);
    if (error.hint) console.error("   hint:   ", error.hint);
    console.error("   full error object:", JSON.stringify(error, null, 2));
    console.error("   payload sent:", JSON.stringify(payload, null, 2));

    // Actionable hints for the known failure modes.
    if (error.code === "PGRST205" || /could not find the table/i.test(error.message ?? "")) {
      console.error(
        `   → The "${PROFILES_TABLE}" table does not exist in this Supabase project.\n` +
          "     Fix: Supabase Dashboard → SQL Editor → run\n" +
          "     supabase/migrations/023_profiles_table.sql, then restart the bot."
      );
    } else if (error.code === "42P10" || /no unique or exclusion constraint/i.test(error.message ?? "")) {
      console.error(
        `   → onConflict "telegram_id" requires a UNIQUE constraint on\n` +
          `     ${PROFILES_TABLE}.telegram_id.\n` +
          "     Fix: Supabase Dashboard → SQL Editor → run\n" +
          "     supabase/migrations/023_profiles_table.sql (adds the unique index),\n" +
          "     then restart the bot."
      );
    } else if (
      error.code === "42501" ||
      error.code === "PGRST301" ||
      /row-level security/i.test(error.message ?? "")
    ) {
      console.error(
        "   → Blocked by Row Level Security: the bot is NOT using the service-role key.\n" +
          "     Fix: set SUPABASE_SERVICE_ROLE_KEY in .env.local\n" +
          "     (Supabase Dashboard → Project Settings → API → service_role key)."
      );
    }
    throw error;
  }
  // Mirror the same identity into public.users (id = Telegram id) so the
  // payments/tickets FK joins and admin receipts can attribute the verified
  // phone. Best-effort — a missing table/column must never fail the
  // registration.
  try {
    const fullName =
      [payload.first_name, payload.last_name].filter(Boolean).join(" ").trim() || null;
    await supabase
      .from("users")
      .upsert(
        {
          id: payload.telegram_id,
          username: payload.username,
          full_name: fullName,
          phone_number: payload.phone_number,
        },
        { onConflict: "id" }
      );
    console.log(
      `✔ mirrored phone into public.users (telegram_id ${payload.telegram_id})`
    );
  } catch (usersErr) {
    console.warn(
      `⚠ public.users mirror skipped for telegram_id ${payload.telegram_id}:`,
      usersErr?.message ?? usersErr
    );
  }

  console.log(
    `✔ upserted ${PROFILES_TABLE} row (telegram_id ${payload.telegram_id}, ` +
      `@${username ?? "no-username"}, ${phoneNumber ?? "no-phone"})`
  );
}

// ── Supabase queries ────────────────────────────────────────────────────────

/**
 * Resolve the support handle for the "እገዛ" button: SUPPORT_USERNAME env first,
 * then app_settings.support.support_username / support_contact (row id = 1,
 * edited from Admin → Support Manager — same shape as lib/admin/management.ts),
 * then the built-in default.
 */
async function resolveSupportUsername() {
  if (SUPPORT_USERNAME) return SUPPORT_USERNAME;
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("support")
      .eq("id", 1)
      .maybeSingle();
    const support = data?.support ?? {};
    const handle =
      (typeof support.support_username === "string" && support.support_username.trim()) ||
      (typeof support.support_contact === "string" && support.support_contact.trim());
    return handle || DEFAULT_SUPPORT_USERNAME;
  } catch {
    return DEFAULT_SUPPORT_USERNAME;
  }
}

/**
 * Fetch the user's purchased tickets (status "sold" = approved purchase,
 * "pending" = receipt under review), joined with their lottery titles.
 * tickets.user_id is TEXT (migration 014) and stores the canonical numeric
 * Telegram id — the same value upsertProfile() writes.
 */
async function fetchUserTickets(telegramId) {
  const { data, error } = await supabase
    .from("tickets")
    .select("ticket_number, status, lotteries(title, vehicle_type, is_active)")
    .eq("user_id", String(telegramId))
    .neq("status", "available")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error(`✖ tickets query failed for ${telegramId}:`, error.message);
    throw error;
  }
  return data ?? [];
}

// ── Update handlers ─────────────────────────────────────────────────────────

/** /start → greet and show the main reply-keyboard menu. */
async function handleStart(botToken, msg) {
  const name = msg.from?.first_name ? `, ${msg.from.first_name}` : "";
  await sendMessage(
    botToken,
    msg.chat.id,
    `👋 እንኳን ደህና መጡ${name}!\n\n` +
      `🚗 <b>GECHO CAR</b> — የመኪና ጨዋታ መድረክ።\n\n` +
      `ከታች ያሉትን ቁልፎች ይጠቀሙ፦\n` +
      `• «${BTN_OPEN_APP}» — መተግበሪያውን በቀጥታ ይክፈቱ\n` +
      `• «${BTN_TICKETS}» — የገዙትን ትኬቶች ይመልከቱ\n` +
      `• «${BTN_LANGUAGE}» — ቋንቋ ይቀይሩ\n` +
      `• «${BTN_SUPPORT}» — የድጋፍ ቡድን ያግኙ\n` +
      `• «${BTN_SHARE_PHONE}» — ስልክ ቁጥርዎን ያጋሩ\n\n` +
      `🔒 ቁጥርዎ ደህንነቱ ተጠብቆ ለማረጋገጫ ብቻ ያገለግላል።`,
    MAIN_KEYBOARD
  );
}

/** Contact message → upsert the user's profile and confirm registration. */
async function handleContact(botToken, msg) {
  const contact = msg.contact;
  const from = msg.from;

  // Reject forwarded/borrowed contacts — the shared contact must belong to
  // the user who sent the message.
  if (!contact || !from || (contact.user_id && contact.user_id !== from.id)) {
    await sendMessage(
      botToken,
      msg.chat.id,
      `⚠️ እባክዎ የራስዎን ስልክ ቁጥር ያጋሩ — «${BTN_SHARE_PHONE}» ቁልፉን ተጠቀም።`,
      MAIN_KEYBOARD
    );
    return;
  }

  try {
    await upsertProfile({
      telegramId: from.id,
      firstName: from.first_name,
      lastName: from.last_name,
      username: from.username,
      phoneNumber: contact.phone_number,
    });
  } catch (err) {
    // Surface the underlying Supabase failure in the console for debugging.
    console.error(
      `✖ handleContact: registration failed for telegram id ${from?.id ?? "?"}:`,
      err?.message ?? err
    );
    if (err && typeof err === "object") {
      console.error("   full error object:", JSON.stringify(err, null, 2));
    }
    await sendMessage(
      botToken,
      msg.chat.id,
      "❌ ይቅርታ — ምዝገባዎ አልተሳካም። እባክዎ ትንሽ ቆይተው እንደገና ይሞክሩ።",
      MAIN_KEYBOARD
    );
    return;
  }

  await sendMessage(
    botToken,
    msg.chat.id,
    `✅ <b>ስልክ ቁጥርዎ በተሳካ ሁኔታ ተመዝግቧል!</b>\n\n` +
      `📱 <code>${escapeHtml(contact.phone_number)}</code> በመገለጫዎ ላይ ተመዝግቧል።\n\n` +
      `🎉 እንኳን ደህና መጡ${from.first_name ? `, ${from.first_name}` : ""} — ` +
      `አሁን ትክክለኛ የGECHO CAR ተጠቃሚ ነዎት።\n\n` +
      `👇 ሎተሪዎችን ለመመልከት «${BTN_OPEN_APP}» ቁልፉን ይጫኑ።`,
    MAIN_KEYBOARD
  );
}

/** Escape HTML entities for parse_mode: "HTML" messages. */
function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** "መተግበሪያ ክፈት" → launch the Mini App via an inline web_app button. */
async function handleOpenApp(botToken, msg) {
  await sendMessage(
    botToken,
    msg.chat.id,
    `🚗 ወደ <b>GECHO CAR</b> መተግበሪያ እንኳን ደህና መጡ!\n\n` +
      `👇 ሎተሪዎችን ለመመልከት እና ትኬት ለመግዛት ከታች ያለውን ቁልፍ ይጫኑ።`,
    buildOpenAppKeyboard()
  );
}

/** "ትኬቶች" → list the user's purchased tickets from Supabase. */
async function handleTickets(botToken, msg) {
  let tickets;
  try {
    tickets = await fetchUserTickets(msg.from.id);
  } catch {
    await sendMessage(
      botToken,
      msg.chat.id,
      "❌ ይቅርታ — ትኬቶችዎን ማምጣት አልተቻለም። እባክዎ ትንሽ ቆይተው እንደገና ይሞክሩ።",
      MAIN_KEYBOARD
    );
    return;
  }

  if (tickets.length === 0) {
    await sendMessage(
      botToken,
      msg.chat.id,
      `🎟 እስካሁን የተመዘገበ ትኬት አልተገኘም።\n\n` +
        `🚗 ሎተሪዎችን ለመመልከት እና ትኬት ለመግዛት መተግበሪያውን ይክፈቱ።`,
      buildOpenAppKeyboard()
    );
    return;
  }

  // Group tickets per lottery for a tidy listing.
  const byLottery = new Map();
  for (const t of tickets) {
    const title = t.lotteries?.title ?? "ሎተሪ";
    if (!byLottery.has(title)) byLottery.set(title, []);
    byLottery.get(title).push(t);
  }

  let text = `🎟 <b>የእርስዎ ትኬቶች</b> (ብዛት፦ ${tickets.length})\n`;
  for (const [title, rows] of byLottery) {
    text += `\n🚗 <b>${escapeHtml(title)}</b>\n`;
    for (const row of rows) {
      const badge = row.status === "sold" ? "✅" : "⏳";
      text += `   ${badge} <code>${escapeHtml(row.ticket_number)}</code>` +
        `${row.status === "pending" ? " (ማረጋገጫ በመጠባበቅ ላይ)" : ""}\n`;
    }
  }
  text += `\n✅ = ተከፍሏል    ⏳ = ማረጋገጫ በመጠባበቅ ላይ\n👇 ለዝርዝር መተግበሪያውን ይክፈቱ።`;

  await sendMessage(botToken, msg.chat.id, text, buildOpenAppKeyboard());
}

/** "🌐 ቋንቋ" → current language + hint. */
async function handleLanguage(botToken, msg) {
  await sendMessage(
    botToken,
    msg.chat.id,
    `🌐 <b>ቋንቋ</b>\n\n` +
      `የአሁኑ ቋንቋ፦ <b>አማርኛ</b> 🇪🇹\n\n` +
      `➕ ተጨማሪ ቋንቋዎች በቅርቡ ይጨመራሉ።`,
    MAIN_KEYBOARD
  );
}

/** "ድጋፍ" → support team contact details. */
async function handleSupport(botToken, msg) {
  const username = await resolveSupportUsername();
  const handle = username.replace(/^@/, "");
  await sendMessage(
    botToken,
    msg.chat.id,
    `🆘 <b>የድጋፍ ቡድን</b>\n\n` +
      `ማንኛውም ጥያቄ ወይም ችግር ካጋጠምዎ እኛን ያግኙን፦\n` +
      `• Telegram፦ <b>@${escapeHtml(handle)}</b>\n\n` +
      `👇 በቀጥታ ለመነጋገር ወይም መተግበሪያውን ለመክፈት ይጫኑ።`,
    {
      inline_keyboard: [
        [{ text: "💬 ድጋፍ ያግኙ", url: `https://t.me/${handle}` }],
        [{ text: "🚗 መተግበሪያውን ይክፈቱ", web_app: { url: WEBAPP_URL } }],
      ],
    }
  );
}

/** Route one Telegram update to the right handler. */
async function handleUpdate(botToken, update) {
  const msg = update.message;
  if (!msg || !msg.from || msg.from.is_bot) return;

  // Reply-keyboard button presses arrive as the button's label text.
  const text = (msg.text ?? "").trim();

  try {
    if (text.startsWith("/start")) {
      await handleStart(botToken, msg);
    } else if (msg.contact) {
      await handleContact(botToken, msg);
    } else if (text === BTN_OPEN_APP) {
      await handleOpenApp(botToken, msg);
    } else if (text === BTN_TICKETS) {
      await handleTickets(botToken, msg);
    } else if (text === BTN_LANGUAGE) {
      await handleLanguage(botToken, msg);
    } else if (text === BTN_SUPPORT) {
      await handleSupport(botToken, msg);
    } else if (text.startsWith("/help")) {
      await handleSupport(botToken, msg);
    } else {
      // Anything else — point back at the menu.
      await sendMessage(
        botToken,
        msg.chat.id,
        `🤖 እባክዎ ከታች ካሉት ቁልፎች ይጠቀሙ፦ «${BTN_OPEN_APP}», «${BTN_TICKETS}», «${BTN_SUPPORT}» ወይም «${BTN_SHARE_PHONE}»።`,
        MAIN_KEYBOARD
      );
    }
  } catch (err) {
    console.error(`✖ Error handling update ${update.update_id}:`, err?.message ?? err);
  }
}

// ── Long-polling main loop ──────────────────────────────────────────────────

async function main() {
  console.log("=== Admas Telegram Bot (menu + registration) ===");
  console.log(`• Supabase: ${SUPABASE_URL}`);
  console.log(`• Profiles table: ${PROFILES_TABLE}`);
  console.log(`• WebApp URL: ${WEBAPP_URL}`);

  const botToken = await resolveBotToken();

  const me = await callTelegramApi("getMe", botToken);
  console.log(`• Connected as @${me.username} (id ${me.id})`);

  // Make the bot's native ☰ chat menu button launch the Mini App directly,
  // so "መተግበሪያ ክፈት" works from the menu as well as the reply keyboard.
  await callTelegramApi("setChatMenuButton", botToken, {
    menu_button: {
      type: "web_app",
      text: BTN_OPEN_APP,
      web_app: { url: WEBAPP_URL },
    },
  });
  console.log(`• Chat menu button set to launch ${WEBAPP_URL}`);

  // Sanity check that the profiles table exists AND has the exact columns the
  // upsert writes (RLS may legitimately return an empty array — only a
  // missing-table / schema error matters here).
  const probe = await supabase
    .from(PROFILES_TABLE)
    .select("id, telegram_id, first_name, last_name, username, phone_number, updated_at")
    .limit(1);
  if (probe.error) {
    if (/could not find the table/i.test(probe.error.message ?? "")) {
      console.error(
        `✖ Table "${PROFILES_TABLE}" is MISSING from this Supabase project —\n` +
          `  contact registration WILL FAIL.\n` +
          `  Fix: Supabase Dashboard → SQL Editor → run\n` +
          `  supabase/migrations/023_profiles_table.sql, then restart the bot.`
      );
    } else {
      console.warn(
        `⚠ Could not read "${PROFILES_TABLE}" (${probe.error.code ?? ""} ${probe.error.message}).\n` +
          `  Apply supabase/migrations/023_profiles_table.sql and make sure the\n` +
          `  service-role key is configured.`
      );
    }
  }

  let offset = 0;
  console.log("• Long polling started — waiting for updates…\n");

  for (;;) {
    try {
      const updates = await callTelegramApi("getUpdates", botToken, {
        offset,
        timeout: 30,
        allowed_updates: ["message"],
      });
      for (const update of updates) {
        offset = update.update_id + 1; // acknowledge the update
        await handleUpdate(botToken, update);
      }
    } catch (err) {
      console.error("✖ Polling error:", err?.message ?? err);
      await new Promise((r) => setTimeout(r, 3000)); // back off before retrying
    }
  }
}

main().catch((err) => {
  console.error("✖ FATAL:", err?.message ?? err);
  process.exit(1);
});
