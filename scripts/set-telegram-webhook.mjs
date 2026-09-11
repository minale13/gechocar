#!/usr/bin/env node
/**
 * ============================================================================
 * TELEGRAM BOT WEBHOOK MANAGER — set / inspect / delete the webhook
 * ============================================================================
 *
 * Points the bot at the Next.js webhook route that answers /start with the
 * persistent reply keyboard (see lib/telegram-webhook.ts):
 *
 *   webhook URL:      https://gechocar.vercel.app/api/telegram
 *                     (canonical; /api/telegram/webhook is a legacy alias)
 *   allowed_updates:  ["message"]  → only message updates reach the handler
 *   secret_token:     TELEGRAM_WEBHOOK_SECRET (optional — when set, the
 *                     route rejects requests that lack the
 *                     X-Telegram-Bot-Api-Secret-Token header)
 *
 * USAGE:
 *   npm run set-webhook             # register the webhook (default)
 *   npm run set-webhook -- info     # print getWebhookInfo for the bot
 *   npm run set-webhook -- delete   # delete the webhook (re-enable polling)
 *
 * ENV (process env, then .env.local, then app/api/.env.local — the files this
 * repo has been using locally):
 *   TELEGRAM_BOT_TOKEN        Bot token from @BotFather (REQUIRED).
 *   TELEGRAM_WEBHOOK_SECRET   Optional secret passed as setWebhook
 *                             secret_token — MUST match the webhook route's
 *                             TELEGRAM_WEBHOOK_SECRET environment variable.
 *   WEBHOOK_URL               Override the registered URL (default: the
 *                             canonical production URL below).
 *
 *   run:  node scripts/set-telegram-webhook.mjs
 * ============================================================================
 */

import fs from "fs";

const DEFAULT_WEBHOOK_URL = "https://gechocar.vercel.app/api/telegram";
const API_BASE = "https://api.telegram.org/bot";

const isPlaceholder = (v) =>
  !v ||
  /your-|placeholder|put-|replace|CHANGE|xxx|xxxx|TODO/i.test(v);

/** Minimal .env.local parser (mirrors scripts/telegram-bot.mjs). */
function parseEnvFile(path) {
  try {
    const text = fs.readFileSync(path, "utf8");
    const out = {};
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (!m) continue;
      let value = m[2].trim();
      if (/^".*"$/.test(value) || /^'.*'$/.test(value)) value = value.slice(1, -1);
      out[m[1]] = value;
    }
    return out;
  } catch {
    return {};
  }
}

// Load order mirrors where this repo keeps env files (.env.local is gitignored).
const rootEnv = parseEnvFile(".env.local");
const apiEnv = parseEnvFile("app/api/.env.local");
const env = (name) => (process.env[name] ?? rootEnv[name] ?? apiEnv[name] ?? "").trim();

const botToken = env("TELEGRAM_BOT_TOKEN");
if (isPlaceholder(botToken)) {
  console.error(
    "✖ FATAL: No usable TELEGRAM_BOT_TOKEN found.\n" +
      "  Set TELEGRAM_BOT_TOKEN in the environment or in .env.local\n" +
      "  (this repo also reads app/api/.env.local)."
  );
  process.exit(1);
}

const secret = env("TELEGRAM_WEBHOOK_SECRET");
const webhookUrl = env("WEBHOOK_URL") || DEFAULT_WEBHOOK_URL;
const command = (process.argv.find((a) => a === "info" || a === "delete") || "set").trim();

async function callApi(method, payload = {}) {
  const response = await fetch(`${API_BASE}${botToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(`${method} failed: ${data.description || `HTTP ${response.status}`}`);
  }
  return data.result;
}

async function main() {
  console.log("=== Telegram webhook manager ===");
  console.log(`• Bot token: ${botToken.slice(0, 6)}…${botToken.slice(-4)}`);

  if (command === "info") {
    const info = await callApi("getWebhookInfo");
    console.log("• Current webhook info:");
    console.log(JSON.stringify(info, null, 2));
    return;
  }

  if (command === "delete") {
    const ok = await callApi("deleteWebhook", { drop_pending_updates: true });
    console.log(`✔ Webhook deleted (${ok ? "pending updates dropped" : "no-op"}).`);
    return;
  }

  const allowedUpdates = ["message", "callback_query"];
  const payload = {
    url: webhookUrl,
    allowed_updates: allowedUpdates,
    drop_pending_updates: false,
  };

  // Preserve existing settings when re-running so we never accidentally
  // remove a secret_token configured on the server (matching the route's
  // TELEGRAM_WEBHOOK_SECRET guard) or drop other update types.
  if (secret) {
    payload.secret_token = secret;
  } else {
    try {
      const current = await callApi("getWebhookInfo");
      if (current?.secret_token) payload.secret_token = current.secret_token;
      if (Array.isArray(current?.allowed_updates) && current.allowed_updates.length) {
        const merged = new Set([...allowedUpdates, ...current.allowed_updates]);
        payload.allowed_updates = [...merged];
      }
    } catch (infoErr) {
      console.warn(
        "⚠ Could not read current webhook info — registering without a secret_token."
      );
    }
  }

  const ok = await callApi("setWebhook", payload);
  console.log(
    `✔ setWebhook → ${webhookUrl}` +
      (payload.secret_token ? " (with secret_token)" : " (no secret configured)")
  );
  console.log("  result:", JSON.stringify(ok));

  const info = await callApi("getWebhookInfo");
  console.log("\n• Current webhook info:");
  console.log(JSON.stringify(info, null, 2));
}

main().catch((err) => {
  console.error("✖", err?.message ?? err);
  process.exit(1);
});