import { createSupabaseServerClient, createSupabaseAdminClient, requireAdminAccess } from "@/lib/supabase/server";
import { getErrorMessage } from "@/lib/errors";
import {
  getTelegramConfigFromSettings,
  getTelegramMe,
  postLotteryToTelegram as postLotteryToTelegramService,
  sendTelegramMessage,
  sendTelegramPhotoWithFallback,
  type TelegramConfig,
  type TelegramSendResult,
} from "@/lib/telegram";

export type LotteryItemInput = {
  id?: string;
  title: string;
  description?: string;
  imageUrl?: string;
  location?: string;
  rank?: number;
};

export type AppSettingsInput = {
  appTitle: string;
  logoUrl?: string;
  bannerImage?: string;
  ticketPrice?: string | number;
  totalTickets?: string | number;
  drawDatetime?: string;
};

export type SupportSettingsInput = {
  supportUsername: string;
  supportContact: string;
  supportPhone?: string;
};

export type PaymentMethodInput = {
  id?: string;
  bank_name: string;
  account_name: string;
  account_number: string;
  is_active?: boolean;
  sort_order?: number;
};

export type TelegramSettingsInput = {
  botToken: string;
  chatId: string;
};

/**
 * Input for saving the single Telegram scheduler configuration row
 * (telegram_scheduler). Fields mirror the admin Settings tab form; id is only
 * present when updating an existing row. Interval fields accept numbers from
 * the API route (or strings from forms) and are coerced with Number() before
 * persisting.
 */
export type TelegramSchedulerSettings = {
  id?: string;
  caption?: string;
  imageUrl?: string;
  intervalHours?: string | number;
  intervalMinutes?: string | number;
  isActive?: boolean;
  botToken?: string;
  chatId?: string;
};

export type PaymentReceipt = {
  id: string;
  /**
   * user_id is TEXT in the live schema (Telegram numeric ids, negative guest
   * ids, hashed auth ids). Widen to number | string for the same reason as
   * components/admin/types.ts Receipt.
   */
  user_id: number | string;
  ticket_ids: string[];
  amount: number;
  receipt_url: string | null;
  transaction_reference: string | null;
  admin_note: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  /** Embedded submitter details (from public.users via PostgREST relationship). */
  users?: {
    username: string | null;
    full_name: string | null;
  } | null;
};

export async function getLotteries() {
  await requireAdminAccess();
  const supabase = createSupabaseServerClient();

  // Read from lottery_items — the SAME table the Host page (/) reads from —
  // so the admin panel and the public Host page always show the same data.
  const { data, error } = await supabase
    .from("lottery_items")
    .select("*")
    .order("rank", { ascending: true, nullsFirst: false });

  if (error) throw error;

  return (data ?? []).map((item) => ({
    id: item.id,
    title: item.title,
    description: item.description ?? "",
    price: String(item.price),
    imageUrl: item.image_url ?? "",
    location: item.location ?? "",
    tickets: String(item.tickets),
    sold_count: 0,
    rank: item.rank || 0,
  }));
}

/**
 * app_settings is a SINGLE-ROW table (always row id = 1) with dedicated
 * columns: id, app_title, logo_url, banner_url, ticket_price, total_tickets,
 * updated_at (+ support / telegram_* columns added by migrations 005 & 006).
 *
 * All reads filter .eq("id", 1) and all writes upsert with
 * { id: 1, ... }, { onConflict: "id" } — so exactly one settings row is ever
 * created or updated, using only real column names (no PGRST204 surprises).
 */

/**
 * Reads the global ticket configuration from app_settings.
 * Ticket Price & Total Tickets have a single source of truth: App Settings.
 */
async function getGlobalTicketSettings(supabase: ReturnType<typeof createSupabaseServerClient>) {
  const { data, error } = await supabase
    .from("app_settings")
    .select("ticket_price, total_tickets")
    .eq("id", 1)
    .maybeSingle();

  if (error) throw error;

  return {
    price: Number(data?.ticket_price) || 0,
    totalTickets: Number(data?.total_tickets) || 0,
  };
}

export async function saveLotteryItem(input: LotteryItemInput) {
  await requireAdminAccess();
  const supabase = createSupabaseServerClient();

  const title = input.title?.trim();
  const description = input.description?.trim() ?? "";
  const location = input.location?.trim() ?? "";
  const imageUrl = (input.imageUrl ?? "").trim();
  const rank = input.rank || null;

  if (!title) {
    throw new Error("Lottery title is required.");
  }

  // Single source of truth: price & ticket count come from App Settings,
  // never from the client form. Reject saving when they are not configured.
  const { price, totalTickets } = await getGlobalTicketSettings(supabase);

  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(
      "Global ticket price is not configured. Set it in Admin → App Settings first."
    );
  }

  if (!Number.isFinite(totalTickets) || totalTickets <= 0) {
    throw new Error(
      "Total available tickets are not configured. Set them in Admin → App Settings first."
    );
  }

  const payload = {
    id: input.id ?? undefined,
    title,
    description,
    location,
        price: price,
    tickets: totalTickets,
    image_url: imageUrl || null,
    is_active: true,
    rank,
  };

    // Write to lottery_items — the SAME table the Host page reads from — so
  // that items saved here appear on the public Host page (/) after a
  // revalidatePath("/") call. Writing to `lotteries` would save to a table
  // the Host page never reads, making the save invisible.
  const { data, error } = await supabase
    .from("lottery_items")
    .upsert(payload, { onConflict: "id" })
    .select()
    .single();

  if (error) throw error;

  return {
    id: data.id,
    title: data.title,
    description: data.description ?? "",
        price: String(data.price),
    imageUrl: data.image_url ?? "",
    location: data.location ?? "",
    tickets: String(data.tickets),
    rank: data.rank || 0,
  };
}

export async function getAppSettings() {
  await requireAdminAccess();
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("app_settings")
    .select("app_title, logo_url, banner_url, ticket_price, total_tickets, draw_datetime")
    .eq("id", 1)
    .maybeSingle();

  if (error) throw error;

  // Keep the historical `banner_image` field name for API consumers; it maps
  // to the `banner_url` column in the database.
  return {
    app_title: data?.app_title ?? "",
    logo_url: data?.logo_url ?? "",
    banner_image: data?.banner_url ?? "",
    ticket_price: String(data?.ticket_price ?? ""),
    total_tickets: String(data?.total_tickets ?? ""),
    draw_datetime: data?.draw_datetime ?? "",
  };
}

export async function getTelegramSettings() {
  await requireAdminAccess();
  const supabase = createSupabaseServerClient();

  // Dedicated columns on row id = 1 (added by migrations 005 & 006).
  const { data, error } = await supabase
    .from("app_settings")
    .select("telegram_bot_token, telegram_chat_id")
    .eq("id", 1)
    .maybeSingle();

  if (error) throw error;

  return {
    botToken: data?.telegram_bot_token ?? "",
    chatId: data?.telegram_chat_id ?? "",
  };
}

export async function saveTelegramSettings(input: TelegramSettingsInput) {
  await requireAdminAccess();
  const supabase = createSupabaseServerClient();

  const botToken = (input.botToken ?? "").trim();
  const chatId = (input.chatId ?? "").trim();

  // Update ONLY the telegram columns of row id = 1; other columns untouched.
  const payload = {
    id: 1,
    telegram_bot_token: botToken,
    telegram_chat_id: chatId,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("app_settings")
    .upsert(payload, { onConflict: "id" })
    .select()
    .single();

  if (error) {
    console.error("=== telegram settings upsert failed ===");
    console.error("Payload:", payload);
    console.error("Full error object:", {
      message: (error as { message?: string }).message,
      code: (error as { code?: string }).code,
      details: (error as { details?: string }).details,
      hint: (error as { hint?: string }).hint,
    });
    throw new Error(`Failed to save Telegram settings. ${(error as { message?: string }).message}`);
  }

  return {
    botToken,
    chatId,
    rows: data ?? [],
  };
}

type SupabaseServerClient = ReturnType<
  typeof import("@/lib/supabase/server").createSupabaseServerClient
>;

/**
 * Fetch every distinct Telegram user chat id that can receive a direct bot DM.
 *
 * Recipients come ONLY from public.profiles — the live Supabase schema has NO
 * telegram_users table. Every profile with a Telegram identity
 * (telegram_chat_id IS NOT NULL OR telegram_id IS NOT NULL) is a broadcast
 * target:
 *
 *   • telegram_chat_id — canonical string chat id (set by the /start webhook,
 *     Mini App sync and the bot script). Preferred target.
 *   • telegram_id      — numeric Telegram account id. In a private DM the
 *     user's personal chat id equals their account id, so as a string it is a
 *     valid fallback target.
 *
 * NEVER THROWS for missing tables / schema-cache errors / RLS blocks: the
 * failure is logged as a warning and skipped. An empty recipient list is a
 * normal, handleable outcome (the caller reports it gracefully).
 */
export async function getTelegramBroadcastChatIds(
  supabase: SupabaseServerClient
): Promise<string[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("telegram_chat_id, telegram_id")
    .or("telegram_chat_id.not.is.null,telegram_id.not.is.null");

  if (error) {
    if (/could not find the (table|column)/i.test(error.message || "")) {
      console.warn("getTelegramBroadcastChatIds: profiles table/columns unavailable, skipping.");
      return [];
    }
    throw error;
  }

  const seen = new Set<string>();
  const result: string[] = [];
  for (const row of data || []) {
    const primary = row.telegram_chat_id;
    const fallback = row.telegram_id;
    const chatId = (typeof primary === "string" && primary) ? primary
      : (typeof fallback === "number") ? String(fallback)
      : (typeof fallback === "string" && fallback) ? fallback : null;
    if (chatId && !seen.has(chatId)) { seen.add(chatId); result.push(chatId); }
  }
  if (result.length === 0) {
    console.warn("getTelegramBroadcastChatIds: no recipients found.");
  }
  return result;
}

// Telegram "Bad Request: chat not found" — a stale/blocked recipient whose chat
// the bot can no longer message. It is a per-user skippable outcome, never a
// reason to fail the whole broadcast.
const CHAT_NOT_FOUND_RE = /bad request:\s*chat not found|chat not found/i;

export async function broadcastTelegramToUsers(
  supabase: SupabaseServerClient,
  botToken: string,
  send: (config: TelegramConfig) => Promise<TelegramSendResult>
): Promise<{
  ok: boolean;
  sent: number;
  failed: number;
  recipients: number;
  /** Human-readable summary, e.g. "Sent to 12 users, failed/skipped 3 users." */
  message: string;
  firstError?: string;
}> {
  const chatIds = await getTelegramBroadcastChatIds(supabase);

  // FALLBACK ARRAY: an empty recipient list is handled gracefully — no
  // database exception is thrown, a warning is logged and the caller receives
  // a friendly, reportable error instead of a crash.
  if (chatIds.length === 0) {
    console.warn(
      "Telegram broadcast: recipient list is empty — skipping broadcast gracefully " +
        "(no user rows available in users/profiles/app_users, payments or tickets)."
    );
    return {
      ok: false,
      sent: 0,
      failed: 0,
      recipients: 0,
      message:
        "No registered Telegram users found to broadcast to. Users appear here after they send /start to the Telegram bot.",
      firstError:
        "No registered Telegram users found to broadcast to. Users appear here after they send /start to the Telegram bot.",
    };
  }

  let sent = 0;
  let failed = 0;
  let firstError: string | undefined;

  for (const chatId of chatIds) {
    try {
      const result = await send({ botToken, chatId });
      if (result.ok) {
        sent += 1;
      } else {
        failed += 1;
        const errorMsg = result.error ?? "Unknown send error";
        // A "chat not found" recipient is a stale/blocked user — log a focused
        // warning but KEEP sending to the rest. It never fails the request.
        if (CHAT_NOT_FOUND_RE.test(errorMsg)) {
          console.warn(
            `Telegram broadcast: chat ${chatId} not found ("Bad Request: chat not found") — skipping recipient.`
          );
        } else {
          if (!firstError) firstError = errorMsg;
          console.warn(
            `Telegram broadcast: send to user chat ${chatId} failed:`,
            errorMsg
          );
        }
      }
    } catch (err) {
      failed += 1;
      const msg = err instanceof Error ? err.message : "Unknown broadcast error";
      // A "chat not found" that THREW (rather than returning an error result)
      // is still just one skippable stale recipient, not a broadcast failure.
      if (CHAT_NOT_FOUND_RE.test(msg)) {
        console.warn(
          `Telegram broadcast: chat ${chatId} not found ("Bad Request: chat not found") — skipping recipient.`
        );
      } else {
        if (!firstError) firstError = msg;
        console.warn(`Telegram broadcast: send to user chat ${chatId} threw:`, msg);
      }
    }
    // ~50ms between sends ≈ 20 msg/s — comfortably inside Telegram's limits.
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  console.log(
    `Telegram broadcast: delivered to ${sent}/${chatIds.length} users (${failed} failed).`
  );

  const summary = `Sent to ${sent} users, failed/skipped ${failed} users.`;

  return {
    ok: sent > 0,
    sent,
    failed,
    recipients: chatIds.length,
    message: summary,
    firstError,
  };
}

/**
 * Telegram error thrown when a bot tries to message itself (e.g. the admin
 * typed the bot's own username into the Chat ID field). Used to trigger a
 * graceful broadcast fallback instead of failing the whole post.
 */
const BOT_SELF_ERROR_RE = /bots? can't send messages to (the )?bots?/i;

/**
 * Decide whether a Telegram send should go to the configured chat DIRECTLY or
 * be BROADCAST to all registered users instead. Broadcast when:
 *   • no Chat ID is configured (blank), OR
 *   • the Chat ID is the BOT'S OWN username (e.g. the admin typed
 *     "@AdmasLotterysbot") — Telegram always rejects self-messaging with
 *     "Forbidden: the bot can't send messages to the bot", so we deliver to
 *     real registered users instead.
 *
 * NEVER THROWS: if getMe fails (network, bad token) the check degrades to
 * direct mode so the caller's own error handling stays in charge.
 */
async function resolveTelegramSendMode(
  botToken: string,
  chatId: string
): Promise<{ broadcast: boolean; reason: string; botUsername?: string }> {
  const target = (chatId || "").trim();

  if (!target) {
    return { broadcast: true, reason: "no-chat-id-configured" };
  }

  // Only @username-shaped chat ids can be the bot itself — numeric ids
  // ("123456789", "-100…") can never match the bot's own username.
  if (target.startsWith("@")) {
    try {
      const me = await getTelegramMe(botToken);
      if (
        me.ok &&
        me.botName &&
        target.slice(1).trim().toLowerCase() === me.botName.toLowerCase()
      ) {
        return {
          broadcast: true,
          reason: "chat-id-is-the-bot-itself",
          botUsername: me.botName,
        };
      }
    } catch {
      // getMe failure must not break the send — fall through to direct mode.
    }
  }

  return { broadcast: false, reason: "direct-chat" };
}

/**
 * Run a broadcast for the scheduler AND stamp last_posted_at so the cron
 * interval timer restarts from now. Shared by "Post Now" and the cron runner.
 */
async function finishSchedulerBroadcast(
  supabase: SupabaseServerClient,
  schedulerRowId: string,
  botToken: string,
  send: (config: TelegramConfig) => Promise<TelegramSendResult>
): Promise<{
  ok: boolean;
  error?: string;
  sent: number;
  failed: number;
  recipients: number;
}> {
  const broadcast = await broadcastTelegramToUsers(supabase, botToken, send);

  if (!broadcast.ok) {
    return {
      ok: false,
      error: broadcast.firstError,
      sent: broadcast.sent,
      failed: broadcast.failed,
      recipients: broadcast.recipients,
    };
  }

  // Update last_posted_at so the cron interval timer starts from now.
  // Non-fatal if it fails — the messages were already delivered.
  const { error } = await supabase
    .from("telegram_scheduler")
    .update({ last_posted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", schedulerRowId);

  if (error) {
    console.warn("Telegram scheduler: could not update last_posted_at:", error.message);
  }

  return {
    ok: true,
    sent: broadcast.sent,
    failed: broadcast.failed,
    recipients: broadcast.recipients,
  };
}

export async function testTelegramConnection() {
  await requireAdminAccess();
  const supabase = createSupabaseServerClient();

  const config = await getTelegramConfigFromSettings(supabase);

  // Blank chat id OR chat id pointing at the bot itself = BROADCAST mode. Do
  // NOT spam every registered user with a test — validate the bot token via
  // getMe instead and report back.
  const sendMode = await resolveTelegramSendMode(config.botToken, config.chatId);
  if (sendMode.broadcast) {
    const me = await getTelegramMe(config.botToken);
    if (!me.ok) {
      throw new Error(me.error || "Telegram test failed: invalid bot token.");
    }
    const message =
      sendMode.reason === "chat-id-is-the-bot-itself"
        ? `Chat ID is the bot's own username — auto-posts will be broadcast to all registered users instead. Bot @${me.botName ?? ""} token is valid ✓`
        : `Broadcast mode ✓ Bot @${me.botName ?? ""} token is valid. Test messages are sent to this bot's chat only when a Chat ID is set — leave it blank to broadcast to all registered users.`;

    return {
      success: true,
      mode: "broadcast" as const,
      botName: me.botName,
      message,
    };
  }

  // A chat id IS configured — a personal numeric id (e.g. 123456789) sends the
  // test straight to that private chat, @channel / -100… ids go to channels.
  const result = await sendTelegramMessage(
    config,
    "✅ *GECHO CAR — Test Message*\n\nYour Telegram bot connection is working correctly!"
  );

  if (!result.ok) {
    throw new Error(result.error || "Telegram test message failed.");
  }

  return {
    success: true,
    mode: "direct" as const,
    messageId: result.messageId,
    message: "Test message delivered to the configured chat.",
  };
}

export async function postLotteryToTelegram(lotteryId: string) {
  await requireAdminAccess();
  const supabase = createSupabaseServerClient();

  const { data: item, error } = await supabase
    .from("lottery_items")
    .select("*")
    .eq("id", lotteryId)
    .maybeSingle();

  if (error) throw error;
  if (!item) throw new Error("Lottery item not found.");

  const config = await getTelegramConfigFromSettings(supabase);

  // Build the direct link to the lottery page (home page).
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_URL ||
    "http://localhost:3000";
  const link = `${baseUrl}/?item=${encodeURIComponent(item.id)}`;

  // BROADCAST mode: no Chat ID configured, OR the Chat ID is the bot's own
  // username (Telegram rejects self-messaging) — deliver the announcement
  // directly to every registered Telegram user's personal chat instead.
  const sendMode = await resolveTelegramSendMode(config.botToken, config.chatId);
  const sendAnnouncement = (perUser: TelegramConfig) =>
    postLotteryToTelegramService(perUser, {
      title: item.title,
      description: item.description ?? "",
      price: item.price,
      tickets: item.tickets,
      location: item.location ?? "",
      imageUrl: item.image_url ?? "",
      link,
    });

  if (sendMode.broadcast) {
    const broadcast = await broadcastTelegramToUsers(supabase, config.botToken, sendAnnouncement);

    if (!broadcast.ok) {
      throw new Error(
        broadcast.firstError || "Failed to broadcast lottery item to Telegram users."
      );
    }

    return {
      success: true,
      broadcast: true,
      sent: broadcast.sent,
      failed: broadcast.failed,
      recipients: broadcast.recipients,
    };
  }

  let result = await postLotteryToTelegramService(config, {
    title: item.title,
    description: item.description ?? "",
    price: item.price,
    tickets: item.tickets,
    location: item.location ?? "",
    imageUrl: item.image_url ?? "",
    link,
  });

  // Graceful fallback: if the direct send was rejected because the Chat ID
  // turned out to be the bot itself, broadcast to all registered users
  // instead of failing the whole post.
  if (!result.ok && BOT_SELF_ERROR_RE.test(result.error ?? "")) {
    console.warn(
      "postLotteryToTelegram: Chat ID rejected as the bot itself — broadcasting to registered users instead."
    );
    const broadcast = await broadcastTelegramToUsers(supabase, config.botToken, sendAnnouncement);
    if (!broadcast.ok) {
      throw new Error(result.error || "Failed to post lottery to Telegram.");
    }
    return {
      success: true,
      broadcast: true,
      sent: broadcast.sent,
      failed: broadcast.failed,
      recipients: broadcast.recipients,
    };
  }

  if (!result.ok) {
    throw new Error(result.error || "Failed to post lottery to Telegram.");
  }

  return { success: true, messageId: result.messageId };
}

export async function saveAppSettings(input: AppSettingsInput) {
  await requireAdminAccess();
  const supabase = createSupabaseServerClient();

  const appTitle = input.appTitle?.trim() || "GECHO CAR";
  const logoUrl = (input.logoUrl ?? "").trim();
  // Database column is `banner_url`; the form/API field stays `bannerImage`.
  const bannerUrl = (input.bannerImage ?? "").trim();
  const ticketPrice = Number(input.ticketPrice) || 0;
  const totalTickets = Number(input.totalTickets) || 0;
  // Optional draw date/time — stored as a proper timestamptz (null when unset).
  const drawDatetimeRaw = (input.drawDatetime ?? "").trim();
  const drawDatetime = drawDatetimeRaw && !Number.isNaN(Date.parse(drawDatetimeRaw))
    ? new Date(drawDatetimeRaw).toISOString()
    : null;

  // app_settings is a single-row table: ALWAYS row id = 1. Upsert with the
  // EXACT column names below so Postgres never sees an unknown column
  // (avoids PGRST204 "Could not find the '...' column of 'app_settings'").
  const settingsRow = {
    id: 1,
    app_title: appTitle,
    ticket_price: ticketPrice,
    total_tickets: totalTickets,
    logo_url: logoUrl,
    banner_url: bannerUrl,
    draw_datetime: drawDatetime,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("app_settings")
    .upsert(settingsRow, { onConflict: "id" })
    .select()
    .single();

  if (error) {
    console.error("=== app_settings upsert failed ===");
    console.error("Payload:", settingsRow);
    console.error("Full error object:", {
      message: (error as { message?: string }).message,
      code: (error as { code?: string }).code,
      details: (error as { details?: string }).details,
      hint: (error as { hint?: string }).hint,
    });
    throw new Error(`Failed to save app settings. ${(error as { message?: string }).message}`);
  }

  return {
    appTitle,
    logoUrl,
    // API field stays `bannerImage`; it carries the value saved to `banner_url`.
    bannerImage: bannerUrl,
    ticketPrice: String(ticketPrice || ""),
    totalTickets: String(totalTickets || ""),
    drawDatetime: drawDatetime ?? "",
    rows: data ?? [],
  };
}

export async function deleteLotteryItem(id: string) {
  await requireAdminAccess();
  const supabase = createSupabaseServerClient();

  if (!id) throw new Error("Lottery id is required.");

  // .select() returns the deleted rows so we can verify the DELETE actually
  // removed something. With RLS enabled a filtered-out delete otherwise
  // reports success while deleting 0 rows (silent failure).
  const { data, error } = await supabase
    .from("lottery_items")
    .delete()
    .eq("id", id)
    .select();

  if (error) {
    console.error("=== Server-side lottery delete failed ===");
    console.error("Table:", "lottery_items", "| id:", id);
    console.error("Full error object:", {
      message: (error as { message?: string }).message,
      code: (error as { code?: string }).code,
      details: (error as { details?: string }).details,
      hint: (error as { hint?: string }).hint,
    });
    throw new Error(`Failed to delete lottery item. ${(error as { message?: string }).message}`);
  }

  const deletedCount = Array.isArray(data) ? data.length : 0;
  if (deletedCount === 0) {
    throw new Error(
      "No lottery item was deleted — it may have already been removed or blocked by row-level security."
    );
  }

  return { success: true, deletedCount };
}

export async function getSupportSettings() {
  await requireAdminAccess();
  const supabase = createSupabaseServerClient();

  // Support info lives in the JSONB `support` column of row id = 1
  // ({ support_username, support_contact, support_phone }) — the same shape
  // the client-side Support Manager editor writes. Column is added by
  // supabase/migrations/005 (run it once in the SQL editor).
  const { data, error } = await supabase
    .from("app_settings")
    .select("support")
    .eq("id", 1)
    .maybeSingle();

  if (error) throw error;

  const value = (data?.support ?? {}) as Record<string, unknown>;

  return {
    supportUsername:
      typeof value.support_username === "string" ? value.support_username : "@admas_support",
    supportContact:
      typeof value.support_contact === "string" ? value.support_contact : "@admas_support",
    supportPhone: typeof value.support_phone === "string" ? value.support_phone : "",
  };
}

export async function saveSupportSettings(input: SupportSettingsInput) {
  await requireAdminAccess();
  const supabase = createSupabaseServerClient();

  const supportUsername = (input.supportUsername ?? "").trim();
  const supportContact = (input.supportContact ?? "").trim();
  const supportPhone = (input.supportPhone ?? "").trim();

  // Support info lives in the JSONB `support` column of app_settings row id = 1
  // ({ support_username, support_contact, support_phone }). Read the existing
  // value and MERGE so unknown fields survive — same behaviour as the
  // client-side Support Manager editor write in app/admin/page.tsx.
  const { data: existing } = await supabase
    .from("app_settings")
    .select("support")
    .eq("id", 1)
    .maybeSingle();

  const mergedSupport = {
    ...((existing?.support as Record<string, unknown>) ?? {}),
    support_username: supportUsername,
    support_contact: supportContact,
    support_phone: supportPhone,
  };

  const { error } = await supabase
    .from("app_settings")
    .upsert(
      { id: 1, support: mergedSupport, updated_at: new Date().toISOString() },
      { onConflict: "id" }
    );

  if (error) {
    console.error("=== support settings upsert failed ===");
    console.error("Payload:", { id: 1, support: mergedSupport });
    console.error("Full error object:", {
      message: (error as { message?: string }).message,
      code: (error as { code?: string }).code,
      details: (error as { details?: string }).details,
      hint: (error as { hint?: string }).hint,
    });
    throw new Error(
      `Failed to save support settings. ${(error as { message?: string }).message}`
    );
  }

  return { supportUsername, supportContact, supportPhone };
}

export type TelegramUserStats = {
  /** Profiles with a Telegram identity (telegram_chat_id OR telegram_id). */
  totalRegistered: number;
  /** Opened the Mini App in the last 24 hours. */
  activeMiniApp24h: number;
  /** Opened the Mini App at least once (last_opened_at set). */
  activeMiniAppTotal: number;
};

/**
 * User analytics for the Admin Dashboard metric cards (Settings tab, above the
 * Auto-Post Scheduler). Counts come ONLY from public.profiles (the single user
 * registry — the live database has no telegram_users table) via the
 * SERVICE-ROLE admin client so RLS can never filter the totals down to the
 * caller's own row:
 *
 *   • totalRegistered    — count of ALL rows in public.profiles (every
 *                          registered user in the single user registry).
 *   • activeMiniApp24h   — last_opened_at within the last 24 hours.
 *   • activeMiniAppTotal — last_opened_at IS NOT NULL.
 *
 * RESILIENCE: the count degrades gracefully instead of throwing when the
 * live schema has not received migrations 025/026/027 yet
 * (profiles table or telegram_chat_id / last_opened_at missing). Each
 * fallback is logged with a targeted fix hint so the root cause is visible in
 * the server logs.
 */
export async function getTelegramUserStats(
  client?: SupabaseServerClient
): Promise<TelegramUserStats> {
  // Build the SERVICE-ROLE admin client here (bypasses RLS) so the Admin route
  // can call getTelegramUserStats() without passing a client, and the totals
  // can never be filtered down to the caller's own row.
  const supabase = client ?? createSupabaseAdminClient();

  // ALL profiles is the source of truth. totalRegistered = EVERY row in the
  // profiles table (the single user registry). A head-count query transfers no
  // data rows and can never break if the schema gains columns.
  const { count, error: countError } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true });

  if (countError) {
    // Fallback: if the table or columns are missing, degrade gracefully.
    if (/could not find the (table|column)/i.test(countError.message || "")) {
      console.warn("getTelegramUserStats: profiles table/columns missing, returning zeroed stats.");
      return { totalRegistered: 0, activeMiniApp24h: 0, activeMiniAppTotal: 0 };
    }
    throw countError;
  }

  // Mini App activity metrics come from profiles (last_opened_at lives there).
  const { data: profilesData, error: profilesError } = await supabase
    .from("profiles")
    .select("telegram_chat_id, telegram_id, last_opened_at");

  if (profilesError) {
    // Fallback: if the table or columns are missing, degrade gracefully.
    if (/could not find the (table|column)/i.test(profilesError.message || "")) {
      console.warn("getTelegramUserStats: profiles table/columns missing, returning zeroed activity stats.");
      return { totalRegistered: count ?? 0, activeMiniApp24h: 0, activeMiniAppTotal: 0 };
    }
    throw profilesError;
  }

  const profiles = (profilesData || []) as Array<{
    telegram_chat_id: string | null;
    telegram_id: number | null;
    last_opened_at: string | null;
  }>;

  const activeMiniAppTotal = profiles.filter((p) => p.last_opened_at != null).length;
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const activeMiniApp24h = profiles.filter((p) => {
    if (!p.last_opened_at) return false;
    return new Date(p.last_opened_at).getTime() >= oneDayAgo;
  }).length;

  return { totalRegistered: count ?? 0, activeMiniApp24h, activeMiniAppTotal };
}

export type UsersDirectoryEntry = {
  id: string;
  /** Canonical numeric-string Telegram account id (from profiles.telegram_id). */
  telegramId: string | null;
  username: string | null;
  fullName: string | null;
  phoneNumber: string | null;
  /** Tickets marked sold/approved for this user (payments + tickets sources). */
  ticketsBought: number;
  /** Tickets currently locked under review (payments status 'pending'). */
  ticketsPending: number;
  /** True when an admin has blocked this user from accessing the Mini App. */
  isBlocked: boolean;
  /** Wallet balance in ETB. */
  walletBalance: number;
  createdAt: string | null;
};

/**
 * Users Directory (ተጠቃሚዎች ዝርዝር) — every registered user from
 * public.profiles enriched with per-user ticket aggregates.
 *
 * DATA SOURCES (all read with the SERVICE-ROLE admin client so RLS can never
 * hide rows, and fetched in ONE parallel Promise.all):
 *   1) profiles                     — the registration registry (id,
 *                                     telegram_id, username, names, phone,
 *                                     created_at).
 *   2) payments (user_id, ticket_ids, status)
 *                                   — approved → bought, pending → under
 *                                     review. ticket_ids is the array of
 *                                     numbers on the receipt.
 *   3) tickets (user_id, status)    — rows flipped to 'sold' by approvals.
 *
 * BUYER IDENTITY NOTE: payments.user_id / tickets.user_id are free-form TEXT
 * (stringified Telegram ids, guest ids, users-table ids). A profile's buyer
 * rows are therefore matched under BOTH its stringified telegram_id AND its
 * profile id. Bought/pending take the MAX across the two keys (and across
 * both sources) so neither double-counting nor under-counting skews the
 * display.
 */
export async function getUsersDirectory(): Promise<{
  users: UsersDirectoryEntry[];
  total: number;
}> {
  await requireAdminAccess();
  const supabase = createSupabaseAdminClient();

  const [profilesRes, paymentsRes, ticketsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, telegram_id, username, first_name, last_name, phone_number, is_blocked, wallet_balance, created_at"
      )
      .order("created_at", { ascending: false }),
    supabase.from("payments").select("user_id, ticket_ids, status"),
    supabase.from("tickets").select("user_id, status"),
  ]);

  if (profilesRes.error) throw profilesRes.error;
  if (paymentsRes.error) {
    // Non-fatal: the directory still lists users without ticket aggregates.
    console.warn(
      "getUsersDirectory: payments query failed (aggregates may be incomplete):",
      paymentsRes.error.message
    );
  }
  if (ticketsRes.error) {
    console.warn(
      "getUsersDirectory: tickets query failed (aggregates may be incomplete):",
      ticketsRes.error.message
    );
  }

  const profiles = (profilesRes.data ?? []) as Array<{
    id: string;
    telegram_id: number | string | null;
    username: string | null;
    first_name: string | null;
    last_name: string | null;
    phone_number: string | null;
    is_blocked: boolean;
    wallet_balance: number;
    created_at: string | null;
  }>;

  // Per-user ticket aggregates keyed by the canonical TEXT id.
  const approvedByKey = new Map<string, number>();
  const pendingByKey = new Map<string, number>();
  for (const row of (paymentsRes.data ?? []) as Array<{
    user_id: unknown;
    ticket_ids: unknown;
    status: unknown;
  }>) {
    const key = String(row.user_id ?? "").trim();
    if (!key) continue;
    const count = Array.isArray(row.ticket_ids) ? row.ticket_ids.length : 0;
    const status = String(row.status ?? "").toLowerCase();
    if (status === "approved" || status === "sold") {
      approvedByKey.set(key, (approvedByKey.get(key) ?? 0) + count);
    } else if (status === "pending") {
      pendingByKey.set(key, (pendingByKey.get(key) ?? 0) + count);
    }
  }

  const soldByKey = new Map<string, number>();
  for (const row of (ticketsRes.data ?? []) as Array<{
    user_id: unknown;
    status: unknown;
  }>) {
    const key = String(row.user_id ?? "").trim();
    if (!key) continue;
    if (String(row.status ?? "").toLowerCase() === "sold") {
      soldByKey.set(key, (soldByKey.get(key) ?? 0) + 1);
    }
  }

  const users: UsersDirectoryEntry[] = profiles.map((profile) => {
    const telegramKey = String(profile.telegram_id ?? "").trim();
    const profileKey = String(profile.id ?? "").trim();

    const bought = Math.max(
      soldByKey.get(telegramKey) ?? 0,
      soldByKey.get(profileKey) ?? 0,
      approvedByKey.get(telegramKey) ?? 0,
      approvedByKey.get(profileKey) ?? 0
    );
    const pending = Math.max(
      pendingByKey.get(telegramKey) ?? 0,
      pendingByKey.get(profileKey) ?? 0
    );

    const fullName =
      [profile.first_name, profile.last_name]
        .map((part) => (part ?? "").trim())
        .filter(Boolean)
        .join(" ") || null;

    return {
      id: profile.id,
      telegramId: telegramKey || null,
      username: profile.username ?? null,
      fullName,
      phoneNumber: profile.phone_number ?? null,
      ticketsBought: bought,
      ticketsPending: pending,
      isBlocked: profile.is_blocked ?? false,
      walletBalance: Number(profile.wallet_balance) || 0,
      createdAt: profile.created_at ?? null,
    };
  });

  return { users, total: users.length };
}

/**
 * Toggle a user's blocked status — block or unblock their Mini App access.
 * Writes to profiles.is_blocked via the service-role client (RLS-proof).
 *
 * @param userId   — the profiles.id (UUID) of the user to toggle.
 * @param blocked  — the new blocked state (true = block, false = unblock).
 * @returns the updated is_blocked value.
 */
export async function setUserBlocked(
  userId: string,
  blocked: boolean
): Promise<{ success: boolean; isBlocked: boolean }> {
  await requireAdminAccess();
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("profiles")
    .update({ is_blocked: blocked, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .select("is_blocked")
    .single();

  if (error) {
    console.error("setUserBlocked: update failed:", error.message);
    throw error;
  }

  return { success: true, isBlocked: data.is_blocked ?? blocked };
}

export async function getTelegramScheduler() {
  await requireAdminAccess();
  const supabase = createSupabaseServerClient();

  // telegram_scheduler holds a SINGLE configuration row. Fetch it schema-
  // agnostically: no ORDER BY (created_at may not exist) and no .eq("id", ...)
  // (the live table's id column may be integer, not uuid). .limit(1) guarantees
  // at most one row so .maybeSingle() never throws on duplicates.
  const { data, error } = await supabase
    .from("telegram_scheduler")
    .select("*")
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  if (!data) return null;

  return {
    id: String(data.id),
    caption: data.caption ?? "",
    imageUrl: data.image_url ?? "",
    intervalHours: Number(data.interval_hours) || 0,
    intervalMinutes: Number(data.interval_minutes) || 0,
    isActive: data.is_active === true,
    botToken: data.bot_token ?? "",
    chatId: data.chat_id ?? "",
    lastPostedAt: data.last_posted_at ?? null,
  };
}

export async function saveTelegramScheduler(input: TelegramSchedulerSettings) {
  await requireAdminAccess();
  const supabase = createSupabaseServerClient();

  const caption = (input.caption ?? "").trim();
  const imageUrl = (input.imageUrl ?? "").trim();

  // Hours/Minutes interval timer. Both fields persist in their own columns;
  // the combined total must be at least 5 minutes so an active scheduler can
  // never spam the channel.
  const intervalHours = Math.max(0, Math.floor(Number(input.intervalHours) || 0));
  const intervalMinutes = Math.min(
    59,
    Math.max(0, Math.floor(Number(input.intervalMinutes) || 0))
  );
  if (intervalHours * 60 + intervalMinutes < 5) {
    throw new Error("The post interval must be at least 5 minutes in total.");
  }

  const isActive = input.isActive === true;
  const botToken = (input.botToken ?? "").trim();
  const chatId = (input.chatId ?? "").trim();

  const payload = {
    caption,
    image_url: imageUrl || null,
    interval_hours: intervalHours,
    interval_minutes: intervalMinutes,
    is_active: isActive,
    bot_token: botToken,
    chat_id: chatId,
    updated_at: new Date().toISOString(),
  };

  let result;
  if (input.id) {
    const { data, error } = await supabase
      .from("telegram_scheduler")
      .update(payload)
      .eq("id", input.id)
      .select()
      .single();
    if (error) throw error;
    result = data;
  } else {
    const { data, error } = await supabase
      .from("telegram_scheduler")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    result = data;
  }

  return {
    id: result.id,
    caption: result.caption ?? "",
    imageUrl: result.image_url ?? "",
    intervalHours: Number(result.interval_hours) || 0,
    intervalMinutes: Number(result.interval_minutes) || 0,
    isActive: result.is_active === true,
    botToken: result.bot_token ?? "",
    chatId: result.chat_id ?? "",
    lastPostedAt: result.last_posted_at ?? null,
  };
}

export async function postSchedulerNow() {
  await requireAdminAccess();
  const supabase = createSupabaseServerClient();

  const scheduler = await getTelegramScheduler();
  if (!scheduler) throw new Error("No Telegram scheduler configuration found.");

  // Credentials: scheduler row first, app_settings as fallback. An EMPTY chat
  // id is valid — it switches the post into BROADCAST mode (delivered directly
  // to every registered Telegram user's personal chat).
  const settingsConfig = await getTelegramConfigFromSettings(supabase);
  const botToken = scheduler.botToken || settingsConfig.botToken;
  const chatId = scheduler.chatId || settingsConfig.chatId;

  if (!botToken) {
    throw new Error(
      "Telegram bot token is required. Configure it in the Telegram Bot Settings."
    );
  }

  const caption = scheduler.caption || "🔔 GECHO CAR — Scheduled Announcement";
  // Photo when an image is configured (base64 data URLs are uploaded as
  // multipart/form-data), with a graceful text-only fallback if the photo
  // fails — raw Telegram HTTP errors never reach the admin toast.
  const sendToTargets = (perUser: TelegramConfig) =>
    sendTelegramPhotoWithFallback(perUser, scheduler.imageUrl, caption);

  // BROADCAST when: no Chat ID is set, OR the Chat ID is the bot's own
  // username (Telegram rejects self-messaging with "Forbidden: the bot can't
  // send messages to the bot"). Loop through all registered user chat ids,
  // one API call each — individual blocked users never crash the post.
  const sendMode = await resolveTelegramSendMode(botToken, chatId);
  if (sendMode.broadcast) {
    console.log(
      `postSchedulerNow: broadcasting to registered users (${sendMode.reason}).`
    );
    const finish = await finishSchedulerBroadcast(supabase, scheduler.id, botToken, sendToTargets);

    if (!finish.ok) {
      throw new Error(finish.error || "Failed to broadcast the scheduled Telegram post.");
    }

    return {
      success: true,
      broadcast: true,
      sent: finish.sent,
      failed: finish.failed,
      recipients: finish.recipients,
    };
  }

  const config: TelegramConfig = { botToken, chatId };
  const result = await sendToTargets(config);

  // Graceful fallback: if the direct send was rejected because the Chat ID
  // turned out to be the bot itself (e.g. entered without the "@" prefix),
  // broadcast to all registered users instead of failing the whole post.
  if (!result.ok && BOT_SELF_ERROR_RE.test(result.error ?? "")) {
    console.warn(
      "postSchedulerNow: Chat ID rejected as the bot itself — broadcasting to registered users instead."
    );
    const finish = await finishSchedulerBroadcast(supabase, scheduler.id, botToken, sendToTargets);

    if (!finish.ok) {
      throw new Error(result.error || "Failed to send the scheduled Telegram post.");
    }

    return {
      success: true,
      broadcast: true,
      sent: finish.sent,
      failed: finish.failed,
      recipients: finish.recipients,
    };
  }

  if (!result.ok) {
    throw new Error(result.error || "Failed to send scheduled Telegram post.");
  }

  // Update last_posted_at so the cron interval timer starts from now.
  await supabase
    .from("telegram_scheduler")
    .update({ last_posted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", scheduler.id);

  return { success: true, messageId: result.messageId };
}

/**
 * Background cron runner — checks the scheduler config and sends the
 * scheduled Telegram post if the elapsed interval has passed and active.
 * Called by GET /api/cron/telegram (Vercel Cron / external uptime ping).
 *
 * NEVER THROWS for expected/handleable conditions (missing env vars, missing
 * table, schema mismatch, Telegram API failures) — it always returns a
 * JSON-serializable result so the route can respond with a proper status
 * code instead of an unhandled 500 crash.
 */
export async function runTelegramSchedulerCron() {
  // Guard: missing Supabase environment variables must not crash the route.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.error(
      "Telegram scheduler: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY missing — skipping run."
    );
    return { success: false, skipped: true, reason: "missing-supabase-env" };
  }

  let supabase;
  try {
    supabase = createSupabaseServerClient();
  } catch (initError) {
    console.error("Telegram scheduler: Supabase client init failed:", initError);
    return {
      success: false,
      skipped: true,
      reason: "supabase-init-failed",
      error: initError instanceof Error ? initError.message : "Supabase init failed",
    };
  }

  // Single-row fetch, schema-agnostic (no created_at ORDER BY, no uuid .eq).
  const { data, error } = await supabase
    .from("telegram_scheduler")
    .select("*")
    .limit(1)
    .maybeSingle();

  if (error) {
    // Table missing / schema mismatch / RLS: log details and degrade
    // gracefully instead of crashing the cron endpoint with a 500.
    console.error("=== Telegram scheduler: Supabase query failed ===");
    console.error("Table: telegram_scheduler");
    console.error("Full error object:", {
      message: (error as { message?: string }).message,
      code: (error as { code?: string }).code,
      details: (error as { details?: string }).details,
      hint: (error as { hint?: string }).hint,
    });
    return {
      success: false,
      skipped: true,
      reason: "db-error",
      error: (error as { message?: string }).message || "Supabase query failed",
    };
  }
  if (!data) {
    console.log("Telegram scheduler: no configuration row found, skipping.");
    return { success: true, skipped: true, reason: "no-config" };
  }

  if (data.is_active !== true) {
    console.log("Telegram scheduler: inactive, skipping.");
    return { success: true, skipped: true, reason: "inactive" };
  }

  // Credentials: DB row first, then environment variables, then app_settings
  // (the Telegram Bot Settings panel). An EMPTY chat id is valid — it switches
  // the scheduled post into BROADCAST mode. Only the bot token is mandatory.
  let settingsBotToken = "";
  let settingsChatId = "";
  try {
    const settingsConfig = await getTelegramConfigFromSettings(supabase);
    settingsBotToken = settingsConfig.botToken;
    settingsChatId = settingsConfig.chatId;
  } catch (settingsError) {
    // Non-fatal: app_settings may simply have no token configured.
    console.log(
      "Telegram scheduler: app_settings credentials unavailable, relying on scheduler row / env."
    );
  }

  const botToken = (
    data.bot_token ||
    process.env.TELEGRAM_BOT_TOKEN ||
    settingsBotToken ||
    ""
  ).trim();
  const chatId = (
    data.chat_id ||
    process.env.TELEGRAM_CHAT_ID ||
    settingsChatId ||
    ""
  ).trim();

  if (!botToken) {
    console.log("Telegram scheduler: bot token missing (DB + env + settings), skipping.");
    return { success: true, skipped: true, reason: "missing-credentials" };
  }

  // Interval timer supports Hours AND Minutes.
  const intervalHours = Number(data.interval_hours) || 0;
  const intervalMinutes = Number(data.interval_minutes) || 0;
  const intervalMs =
    (intervalHours * 60 * 60 + intervalMinutes * 60) * 1000;

  if (intervalMs <= 0) {
    console.log("Telegram scheduler: invalid interval, skipping.");
    return { success: true, skipped: true, reason: "invalid-interval" };
  }

  const lastPostedAt = data.last_posted_at
    ? new Date(data.last_posted_at).getTime()
    : 0;
  const elapsedMs = Date.now() - lastPostedAt;

  if (elapsedMs < intervalMs) {
    const nextInMin = Math.ceil((intervalMs - elapsedMs) / 60000);
    console.log(`Telegram scheduler: next post in ~${nextInMin} minutes.`);
    return { success: true, skipped: true, reason: "not-due", nextInMin };
  }

  const config: TelegramConfig = { botToken, chatId };
  const caption = (data.caption ?? "").trim() || "🔔 GECHO CAR — Scheduled Announcement";
  // Photo when an image is configured (base64 data URLs are uploaded as
  // multipart/form-data), with a graceful text-only fallback if the photo
  // fails — raw Telegram HTTP errors never crash the cron run.
  const sendToTargets = (perUser: TelegramConfig) =>
    sendTelegramPhotoWithFallback(perUser, data.image_url, caption);

  try {
    // BROADCAST mode: no Chat ID configured, OR the Chat ID is the bot's own
    // username (Telegram rejects self-messaging). Loop through every
    // registered Telegram user's chat id, sending photo/message to each user
    // individually — one blocked user never crashes the whole run.
    const sendMode = await resolveTelegramSendMode(botToken, chatId);
    if (sendMode.broadcast) {
      console.log(`Telegram scheduler: broadcasting to users (${sendMode.reason}).`);
      const finish = await finishSchedulerBroadcast(supabase, data.id, botToken, sendToTargets);

      if (!finish.ok) {
        console.error("Telegram scheduler: broadcast failed:", finish.error);
        return {
          success: false,
          reason: "telegram-send-failed",
          error: finish.error || "Scheduled Telegram broadcast failed.",
        };
      }

      console.log(
        `Telegram scheduler: broadcast completed (${finish.sent}/${finish.recipients} users).`
      );
      return {
        success: true,
        broadcast: true,
        sent: finish.sent,
        failed: finish.failed,
        recipients: finish.recipients,
      };
    }

    // DIRECT mode (chat id configured): single send to the channel/group chat.
    const result = await sendToTargets(config);

    // Graceful fallback: if the direct send was rejected because the Chat ID
    // turned out to be the bot itself, broadcast to all registered users
    // instead of failing the run.
    if (!result.ok && BOT_SELF_ERROR_RE.test(result.error ?? "")) {
      console.warn(
        "Telegram scheduler: Chat ID rejected as the bot itself — broadcasting to registered users instead."
      );
      const finish = await finishSchedulerBroadcast(supabase, data.id, botToken, sendToTargets);

      if (!finish.ok) {
        console.error("Telegram scheduler: fallback broadcast failed:", finish.error);
        return {
          success: false,
          reason: "telegram-send-failed",
          error: finish.error || result.error || "Scheduled Telegram post failed.",
        };
      }

      console.log(
        `Telegram scheduler: fallback broadcast completed (${finish.sent}/${finish.recipients} users).`
      );
      return {
        success: true,
        broadcast: true,
        sent: finish.sent,
        failed: finish.failed,
        recipients: finish.recipients,
      };
    }

    if (!result.ok) {
      // Telegram API failure — reported as a structured result, not a crash.
      console.error("Telegram scheduler: send failed:", result.error);
      return {
        success: false,
        reason: "telegram-send-failed",
        error: result.error || "Scheduled Telegram post failed.",
      };
    }

    // Update last_posted_at so the cron interval timer starts from now.
    // Non-fatal if it fails — the post was already delivered.
    const { error: updateError } = await supabase
      .from("telegram_scheduler")
      .update({ last_posted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", data.id);

    if (updateError) {
      console.warn("Telegram scheduler: could not update last_posted_at:", updateError.message);
    }

    console.log(`Telegram scheduler: posted successfully (msg ${result.messageId}).`);
    return { success: true, messageId: result.messageId };
  } catch (unexpectedError) {
    console.error("Telegram scheduler: unexpected error during send/update:", unexpectedError);
    return {
      success: false,
      reason: "unexpected-error",
      error: unexpectedError instanceof Error
        ? unexpectedError.message
        : "Unexpected scheduler failure",
    };
  }
}

export type PaymentReceiptsPage = {
  receipts: PaymentReceipt[];
  /**
   * Total rows in public.payments across ALL statuses. Sourced from the
   * PostgREST `count: "exact"` header on the SAME query — no extra round-trip.
   * Falls back to the loaded page length when the count is unavailable.
   */
  total: number;
};

export async function getPaymentReceipts(
  options?: { limit?: number; offset?: number }
): Promise<PaymentReceiptsPage> {
  await requireAdminAccess();
  const supabase = createSupabaseServerClient();

  // TABLE CONTRACT: this reads from `public.payments` — the SAME table the
  // Host checkout writes to (components/app/checkout-modal.tsx inserts
  // { user_id, ticket_ids, amount, receipt_url, status: 'pending' } there).
  // There is NO separate `receipts` database table — "receipts" is only the
  // Supabase Storage bucket that holds the uploaded images.
  //
  // SCOPE: NO user/telegram filter here — rows are ordered newest-first and
  // the admin dashboard splits them by status (pending / approved). A receipt
  // submitted from the Host page therefore appears under "Pending Approval"
  // and "Latest Pending Submissions" automatically.
  //
  // PAGINATION CONTRACT: `limit`/`offset` bound the query so the dashboard
  // NEVER scans the entire payments table on initial load — only the newest
  // page (default 20 rows) is fetched and "Load more" grows the page.
  // Omitted → unbounded (previous behavior, kept for compatibility).

  const rawLimit = options?.limit;
  const limit =
    typeof rawLimit === "number" && Number.isFinite(rawLimit)
      ? Math.max(0, Math.floor(rawLimit))
      : undefined;
  const rawOffset = options?.offset;
  const offset =
    typeof rawOffset === "number" && Number.isFinite(rawOffset)
      ? Math.max(0, Math.floor(rawOffset))
      : 0;

  // 1) Preferred path: embed the submitter profile from public.users through
  //    the payments.user_id → users.id relationship so the admin dashboard can
  //    show real user details in one round-trip. `count: "exact"` piggy-backs
  //    the total row count onto the same request.
  let embedBuilder = supabase
    .from("payments")
    .select("*, users(username, full_name)", { count: "exact" })
    .order("created_at", { ascending: false });
  if (limit !== undefined) embedBuilder = embedBuilder.range(offset, offset + limit - 1);

  const embedResult = await embedBuilder;

  if (!embedResult.error) {
    const page = (embedResult.data ?? []) as PaymentReceipt[];
    return { receipts: page, total: embedResult.count ?? page.length };
  }

  // The embed can fail when the FK relationship is missing from the PostgREST
  // schema cache (e.g. after migration 014 re-typed user_id without triggering
  // a schema reload) — PostgREST answers with PGRST200 "Could not find a
  // relationship between 'payments' and 'users'". A single bad embed must
  // NEVER blank the receipt queue — fall back to a plain select + a separate
  // users lookup merged below.
  console.error("=== getPaymentReceipts: users embed failed ===");
  console.error(
    "Query: payments.select('*, users(username, full_name)') — the PostgREST",
    "payments.user_id → users.id relationship is missing or not in the schema cache.",
    JSON.stringify({
      message: (embedResult.error as { message?: string }).message,
      code: (embedResult.error as { code?: string }).code,
      details: (embedResult.error as { details?: string }).details,
      hint: (embedResult.error as { hint?: string }).hint,
    })
  );
  console.error(
    "   → Fix: run supabase/migrations/015_receipt_admin_fetch.sql (or " +
      "017_payments_users_relation_fix.sql) — they add the FK and reload the " +
      "PostgREST schema cache. Retrying with a plain select + manual hydration."
  );

  let fallbackBuilder = supabase
    .from("payments")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });
  if (limit !== undefined) fallbackBuilder = fallbackBuilder.range(offset, offset + limit - 1);

  const fallbackResult = await fallbackBuilder;

  if (fallbackResult.error) {
    console.error("=== Failed to fetch payment receipts ===");
    console.error("Full error object:", {
      message: (fallbackResult.error as { message?: string }).message,
      code: (fallbackResult.error as { code?: string }).code,
      details: (fallbackResult.error as { details?: string }).details,
      hint: (fallbackResult.error as { hint?: string }).hint,
    });
    // Return an empty page instead of throwing so the rest of the admin
    // dashboard (settings, payment methods, scheduler) still loads.
    return { receipts: [], total: 0 };
  }

  const receipts = (fallbackResult.data ?? []) as PaymentReceipt[];
  const total = fallbackResult.count ?? receipts.length;

  // 2) Hydrate the submitter profile manually (best-effort) so "Pending
  //    Receipts" still shows user details even when the relationship-based
  //    embed is unavailable.
  try {
    const userIds = Array.from(
      new Set(
        receipts
          .map((receipt) => String(receipt.user_id ?? "").trim())
          .filter(Boolean)
      )
    );

    if (userIds.length > 0) {
      const { data: users, error: usersError } = await supabase
        .from("users")
        .select("id, username, full_name")
        .in("id", userIds);

      if (usersError) {
        // Hydration is best-effort — receipts are still returned WITHOUT user
        // details rather than failing the whole queue. Log so the root cause
        // (missing users table, RLS, bad FK types) is visible in the logs.
        console.warn(
          "getPaymentReceipts: manual users hydration failed (receipts returned without submitter details):",
          JSON.stringify({
            message: (usersError as { message?: string }).message,
            code: (usersError as { code?: string }).code,
            details: (usersError as { details?: string }).details,
            hint: (usersError as { hint?: string }).hint,
          })
        );
      } else if (users) {
        const usersById = new Map(
          ((users ?? []) as Array<{
            id: string;
            username: string | null;
            full_name: string | null;
          }>).map((user) => [String(user.id), user])
        );

        return {
          receipts: receipts.map((receipt) => ({
            ...receipt,
            users: usersById.get(String(receipt.user_id)) ?? null,
          })) as PaymentReceipt[],
          total,
        };
      }
    }
  } catch (hydrationErr) {
    console.warn(
      "getPaymentReceipts: user hydration skipped (receipts still returned):",
      getErrorMessage(hydrationErr)
    );
  }

  return { receipts, total };
}

/**
 * Approve or reject a payment receipt AND keep the ticket numbers in sync:
 *
 *   approved → the requested numbers are marked 'sold' for the submitting
 *              user (rows are created if an older checkout never reserved
 *              them), completing the sale.
 *   rejected → numbers that are still 'pending' for that user are released
 *              back to 'available' so other buyers can pick them again.
 *
 * An optional rejection reason is stored on both payments.admin_note and
 * payments.rejection_reason when rejecting — the Mini App Profile / History
 * screen shows the exact rejection_reason on the rejected submission card.
 */
export async function updatePaymentReceiptStatus(
  id: string,
  status: "approved" | "rejected",
  note?: string | null,
  rejectionReason?: string | null
) {
  await requireAdminAccess();
  // Use the Service Role key (when configured) so RLS can never silently
  // block the payment UPDATE or the ticket sync. If the key is missing this
  // falls back to the anon-key client (RLS policies must then permit the
  // write — see supabase/migrations/016_admin_receipt_approval_rls.sql).
  const supabase = createSupabaseAdminClient();

  // 1) Load the payment first — we need the user + requested ticket numbers
  //    to keep public.tickets in sync.
  const { data: payment, error: fetchError } = await supabase
    .from("payments")
    .select("id, user_id, ticket_ids")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!payment) throw new Error("Receipt not found.");

  // 2) Update the payment status (+ rejection details when rejecting). The
  //    reason is written to BOTH admin_note (011, backward compat) and the new
  //    rejection_reason (019) so every reader has the exact admin explanation.
  const resolvedReason =
    (rejectionReason ?? note)?.trim() || null;
  const updatePayload: {
    status: "approved" | "rejected";
    admin_note?: string | null;
    rejection_reason?: string | null;
  } = { status };
  if (status === "rejected") {
    updatePayload.admin_note = resolvedReason;
    updatePayload.rejection_reason = resolvedReason;
  }

  // IMPORTANT: never attach .single() to an UPDATE. PostgREST returns the
  // updated rows as an ARRAY (Prefer: return=representation) and .single()
  // can fail with "Cannot coerce the result to a single JSON object" in some
  // deployments — surfacing a toast error even though the DB write succeeded.
  // Use a plain .select() and read the first element instead.
  let update = await supabase
    .from("payments")
    .update(updatePayload)
    .eq("id", id)
    .select();

  // If the admin_note (011) or rejection_reason (019) column is missing from
  // the live schema, retry with a progressively smaller payload so the status
  // change still succeeds no matter which migrations got applied. The reason
  // is preserved when only one of the two columns is present.
  if (update.error && /admin_note|rejection_reason/i.test(update.error.message ?? "")) {
    const blockedColumns = (update.error.message ?? "").toLowerCase();
    console.error(
      "updatePaymentReceiptStatus: rejection columns unavailable, retrying minimal payload:",
      update.error.message
    );
    if (status === "rejected") {
      if (blockedColumns.includes("rejection_reason") && !blockedColumns.includes("admin_note")) {
        // Only rejection_reason (019) is missing → keep writing admin_note.
        update = await supabase
          .from("payments")
          .update({ status, admin_note: resolvedReason })
          .eq("id", id)
          .select();
      } else if (blockedColumns.includes("admin_note") && !blockedColumns.includes("rejection_reason")) {
        // Only admin_note (011) is missing → keep writing rejection_reason.
        update = await supabase
          .from("payments")
          .update({ status, rejection_reason: resolvedReason })
          .eq("id", id)
          .select();
      }
    }
    if (update.error && /admin_note|rejection_reason/i.test(update.error.message ?? "")) {
      update = await supabase
        .from("payments")
        .update({ status })
        .eq("id", id)
        .select();
    }
  }

  if (update.error) throw update.error;

  // CRITICAL: Supabase/PostgREST returns SUCCESS (no error) with an EMPTY
  // array when RLS blocks the UPDATE or the row does not exist. Treating
  // that as success made the admin UI show a green toast while the receipt
  // stayed 'pending' in the database — so refreshReceipts() re-fetched it
  // straight back into the Pending list ("sticky pending" bug).
  // Detect the 0-rows-affected case and surface a real error instead.
  const affectedRows = (update.data ?? []).length;
  if (affectedRows === 0) {
    // Distinguish "row missing" from "RLS blocked" with a follow-up read so
    // the error message is actionable for the admin.
    const { data: existing, error: readError } = await supabase
      .from("payments")
      .select("id, status")
      .eq("id", id)
      .maybeSingle();

    if (readError) {
      throw new Error(
        `Approval failed — could not verify the receipt in the database: ${readError.message}`
      );
    }

    if (!existing) {
      throw new Error("Receipt not found — it may have been removed. Refresh the list.");
    }

    // The row EXISTS but the UPDATE wrote 0 rows → RLS silently blocked it.
    throw new Error(
      "The database rejected this approval (row-level security). Apply the " +
        "service_role key (SUPABASE_SERVICE_ROLE_KEY) or run migration " +
        "016_admin_receipt_approval_rls.sql, then try again."
    );
  }

  // Extract the updated row from the array response. If the server did not
  // return a representation for the write, re-read the row so the caller
  // always receives a complete object (never a thrown coercion error).
  let updatedPayment = (update.data ?? [])[0] ?? null;
  if (!updatedPayment) {
    const { data: reloaded } = await supabase
      .from("payments")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    updatedPayment = reloaded ?? null;
  }

  // 3) Sync the ticket rows for the requested numbers. Best-effort: the
  //    payment status is the source of truth for the workflow, so a ticket
  //    sync failure is logged but NEVER surfaced to the user — approval must
  //    always complete with a single clean success message.
  //
  // IMPORTANT: The public.tickets table may not exist in all Supabase
  // deployments (e.g. if migrations were never applied). We first probe for
  // the table with a lightweight .select() and skip the entire sync block
  // if it is missing — the ticket numbers are already stored in
  // payments.ticket_ids jsonb so no data is lost.
  let ticketsTableExists = false;
  try {
    const { error: probeError } = await supabase
      .from("tickets")
      .select("id")
      .limit(1);
    // A "relation does not exist" / "could not find the table" error means
    // the table is absent — treat that as "sync skipped", not a failure.
    ticketsTableExists = !probeError;
  } catch {
    ticketsTableExists = false;
  }

  if (ticketsTableExists) {
    try {
      const ticketNumbers = Array.isArray(payment.ticket_ids)
        ? (payment.ticket_ids as unknown[]).map(String)
        : [];

      if (ticketNumbers.length > 0) {
        if (status === "approved") {
          // Mark the user's reserved (or available) rows as sold.
          const dbUserId = String(payment.user_id);
          const { error: soldError } = await supabase
            .from("tickets")
            .update({ status: "sold" })
            .in("ticket_number", ticketNumbers)
            .eq("user_id", dbUserId);
          if (soldError) throw soldError;

          // Older checkouts may never have reserved rows — create any missing
          // ones so the numbers are definitively recorded as sold to this user.
          const { data: existing, error: existingError } = await supabase
            .from("tickets")
            .select("ticket_number")
            .in("ticket_number", ticketNumbers)
            .eq("user_id", dbUserId);
          if (existingError) throw existingError;

          const owned = new Set((existing ?? []).map((row) => String(row.ticket_number)));
          const missing = ticketNumbers.filter((number) => !owned.has(number));
          if (missing.length > 0) {
            const { error: insertError } = await supabase.from("tickets").insert(
              missing.map((number) => ({
                ticket_number: number,
                user_id: dbUserId,
                status: "sold" as const,
              })),
            );
            if (insertError) throw insertError;
          }

          // Retire any leftover 'available' rows with the SAME numbers from
          // older rejected checkouts or failed reservations, so a number never
          // appears as both 'available' and 'sold' in the live pool (the admin
          // matrix and the Mini App grid read every row). After approval the
          // number is definitively SOLD platform-wide.
          const { error: retireError } = await supabase
            .from("tickets")
            .update({ status: "sold" })
            .in("ticket_number", ticketNumbers)
            .eq("status", "available");
          if (retireError) {
            console.warn(
              "updatePaymentReceiptStatus: stale available rows not retired (non-fatal):",
              retireError.message
            );
          }
        } else {
          // Release the user's still-reserved numbers back to available.
          const { error: releaseError } = await supabase
            .from("tickets")
            .update({ status: "available" })
            .in("ticket_number", ticketNumbers)
            .eq("user_id", String(payment.user_id))
            .eq("status", "pending");
          if (releaseError) throw releaseError;
        }
      }
    } catch (syncErr) {
      // Log for debugging but DO NOT surface to the user — the payment status
      // update already succeeded and that is the source of truth.
      console.error(
        `updatePaymentReceiptStatus: ticket sync skipped (payment ${status} was saved OK):`,
        getErrorMessage(syncErr),
      );
    }
  } else {
    // Table absent — ticket numbers are still preserved in payments.ticket_ids.
    console.warn(
      "updatePaymentReceiptStatus: 'public.tickets' table not found — ticket sync skipped.",
    );
  }

  // Return the updated receipt row. No ticket_sync_error is ever surfaced
  // so the admin always sees a single clean success message.
  return {
    ...(updatedPayment ?? { id, status: updatePayload.status }),
  };
}

export async function getPaymentMethods() {
  await requireAdminAccess();
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("payment_methods")
    .select("*")
    .order("sort_order", { ascending: true, nullsFirst: false });

  if (error) throw error;

  return data ?? [];
}

export async function savePaymentMethod(input: PaymentMethodInput) {
  await requireAdminAccess();
  const supabase = createSupabaseServerClient();

  const bankName = input.bank_name?.trim();
  const accountName = input.account_name?.trim();
  const accountNumber = input.account_number?.trim();

  if (!bankName) throw new Error("Bank name is required.");
  if (!accountName) throw new Error("Account name is required.");
  if (!accountNumber) throw new Error("Account number is required.");

  const payload = {
    id: input.id ?? undefined,
    bank_name: bankName,
    account_name: accountName,
    account_number: accountNumber,
    is_active: input.is_active ?? true,
    sort_order: input.sort_order ?? 0,
  };

  const { data, error } = await supabase
    .from("payment_methods")
    .upsert(payload, { onConflict: "id" })
    .select()
    .single();

  if (error) throw error;

  return data;
}

export async function togglePaymentMethod(id: string, isActive: boolean) {
  await requireAdminAccess();
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("payment_methods")
    .update({ is_active: isActive })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;

  return data;
}

export async function deletePaymentMethod(id: string) {
  await requireAdminAccess();
  const supabase = createSupabaseServerClient();

  const { error } = await supabase
    .from("payment_methods")
    .delete()
    .eq("id", id);

  if (error) throw error;

  return { success: true };
}