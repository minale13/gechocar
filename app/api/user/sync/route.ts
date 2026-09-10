import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * Mini App session sync — POST /api/user/sync
 *
 * Called by the Mini App (components/app/telegram-provider.tsx via
 * lib/mini-app-sync.ts) as soon as the Telegram identity
 * (window.Telegram.WebApp.initDataUnsafe.user) is resolved. It:
 *
 *   • upserts the profile row (service-role key → RLS bypassed) so a user who
 *     NEVER sent /start still gets a profiles row on first Mini App open;
 *   • refreshes last_opened_at → powers the admin "Active Mini App Users"
 *     metric (last 24h / all-time);
 *   • flags is_registered = true.
 *
 * Always returns HTTP 200 (ok flag carries the outcome) so a transient
 * Supabase failure never breaks the Mini App's first paint.
 */
export async function POST(request: NextRequest) {
  let body: {
    telegramId?: string | number;
    firstName?: string | null;
    lastName?: string | null;
    username?: string | null;
    photoUrl?: string | null;
    chatId?: string | number | null;
  } | null = null;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  // telegram_id is required — without it there is nothing to upsert. Guests
  // (negative ids) and browser sessions are ignored silently.
  const rawId = body?.telegramId;
  const telegramId = typeof rawId === "number" ? rawId : Number(String(rawId ?? ""));
  if (!rawId || !Number.isFinite(telegramId) || telegramId <= 0) {
    return NextResponse.json(
      { ok: false, error: "A positive numeric telegramId is required." },
      { status: 400 }
    );
  }

  try {
    const supabase = createSupabaseAdminClient();
    const now = new Date().toISOString();

    // PERMANENT FIX: Set the profile `id` to the Telegram user's numeric id
    // (from initDataUnsafe.user.id) so the row is keyed by Telegram identity.
    // The upsert uses { onConflict: "id" } — a profile row is created on first
    // Mini App open (even for users who never sent /start) and refreshed on
    // every subsequent open. We also set telegram_id AND telegram_chat_id =
    // user.id.toString() so the row is always a valid broadcast target. In a
    // private (DM) chat the user's personal chat id equals their account id,
    // so stringified telegram_id is a valid broadcast target. This guarantees
    // telegram_chat_id is ALWAYS populated for every Mini App user.
    const effectiveChatId = body?.chatId != null ? String(body.chatId) : String(telegramId);
    const payload: Record<string, unknown> = {
      id: telegramId,
      telegram_id: telegramId,
      first_name: body?.firstName?.trim() || null,
      last_name: body?.lastName?.trim() || null,
      username: body?.username?.trim() || null,
      chat_id: effectiveChatId,
      telegram_chat_id: effectiveChatId,
      last_opened_at: now,
      is_registered: true,
      updated_at: now,
    };
    // Only persist the avatar when Telegram actually provides one — never
    // clobber a previously saved photo_url with null.
    if (body?.photoUrl) payload.photo_url = body.photoUrl;

    const { error } = await supabase
      .from("profiles")
      .upsert(payload, { onConflict: "id" });

    if (error) {
      console.error(
        "[user/sync] profiles upsert FAILED:",
        JSON.stringify({ message: error.message, code: error.code, details: error.details, hint: error.hint })
      );
      console.error(
        "[user/sync] → Fix: run supabase/migrations/023 + 025 + 026 and set SUPABASE_SERVICE_ROLE_KEY. Payload:",
        JSON.stringify(payload)
      );
      return NextResponse.json({ ok: true, synced: false }, { status: 200 });
    }

    console.log(`[user/sync] Mini App open recorded (telegram_id=${telegramId}, telegram_chat_id=${effectiveChatId})`);
    return NextResponse.json({ ok: true, synced: true }, { status: 200 });
  } catch (error) {
    // Never break the Mini App on a sync failure — log and acknowledge.
    console.error("[user/sync] threw — returning ok anyway:", error);
    return NextResponse.json({ ok: true, synced: false }, { status: 200 });
  }
}
