/**
 * Shared client-side user identity resolution.
 *
 * Resolves the `users.id` used across payments / tickets for the current
 * visitor, in priority order:
 *   1) Telegram Mini App user  (window.Telegram.WebApp.initDataUnsafe.user.id)
 *   2) Supabase auth session   (supabase.auth.getUser() — id derived deterministically)
 *   3) Persistent guest id     (localStorage-backed anonymous id)
 * Never throws — a valid id is ALWAYS returned so flows can proceed.
 *
 * ⚠️ UUID-CAST SAFETY: ids are returned as canonical STRINGS. Depending on
 * which schema version the live database was provisioned with, users.id /
 * payments.user_id / tickets.user_id may be bigint, text, or (in drifted
 * databases) uuid. A raw non-numeric string (e.g. a Supabase auth UUID like
 * "9b2f…") sent to such a column triggers Postgres
 * "invalid input syntax for type uuid". toDbUserId() guarantees only numeric
 * strings ever reach Supabase, which cast cleanly into text AND bigint
 * columns (supabase/migrations/014_user_id_text.sql aligns the live schema).
 */
import { supabase } from '@/lib/supabase/client';
import type { TelegramUser } from '@/lib/tma';

const GUEST_USER_ID_KEY = 'admas-guest-user-id';

/**
 * Deterministic 53-bit hash (cyrb53). Used to derive a stable, bigint-safe
 * numeric id from a string (e.g. a Supabase auth UUID) so the same account
 * always maps to the same users.id without needing a bigint column.
 */
function hashStringToId(str: string): number {
  let h1 = 0xdeadbeef ^ str.length;
  let h2 = 0x41c6ce57 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  // Result is always < 2^53, so it is safe as a JS number / bigint column value.
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/**
 * Normalize ANY user id (Telegram numeric id, guest id, auth UUID string)
 * into a canonical numeric STRING that is safe for every user-id column
 * format (text, bigint, uuid-drift).
 *
 *   • 4502572551        → "4502572551"        (Telegram id)
 *   • "-4502572551053"  → "-4502572551053"    (guest id — numeric string kept)
 *   • "9b2fdeb4-c0a8…"  → hashed numeric id   (raw UUID NEVER sent raw —
 *                        sending it to a bigint/uuid column throws
 *                        "invalid input syntax for type uuid/bigint")
 */
export function toDbUserId(id: number | string): string {
  // Numbers (finite integers) are already safe — stringify only.
  if (typeof id === 'number') {
    if (!Number.isFinite(id)) return createAndStoreGuestId().toString();
    return String(Math.trunc(id));
  }

  const raw = (id ?? '').toString().trim();
  // Numeric strings (Telegram ids can arrive as strings, e.g. "-4502572551053578")
  // are safe as-is — they cast cleanly into text and bigint columns alike.
  if (raw !== '' && Number.isFinite(Number(raw))) {
    return String(Math.trunc(Number(raw)));
  }

  // Non-numeric string (auth UUID, arbitrary token): hash to a stable numeric
  // id instead of sending the raw value to Postgres. Same input → same id,
  // so the same account keeps mapping to the same users row.
  return String(-hashStringToId(raw || String(Date.now())) - 1);
}

/** Read the persistent guest id from localStorage (negative ⇒ never collides with real Telegram ids). */
export function readStoredGuestId(): number | null {
  try {
    const raw = window.localStorage.getItem(GUEST_USER_ID_KEY);
    const parsed = raw !== null ? Number.parseInt(raw, 10) : Number.NaN;
    return Number.isFinite(parsed) && parsed < 0 ? parsed : null;
  } catch {
    return null;
  }
}

/** Create + persist a fresh anonymous guest id (negative bigint). */
function createAndStoreGuestId(): number {
  const guestId = -hashStringToId(`${Date.now()}-${Math.random()}`) - 1;
  try {
    window.localStorage.setItem(GUEST_USER_ID_KEY, String(guestId));
  } catch {
    /* localStorage unavailable — the in-memory id still works for this session */
  }
  return guestId;
}

/**
 * Make sure a matching row exists in public.users before inserting a payment
 * (payments.user_id → users.id FK). Uses ON CONFLICT DO NOTHING so existing
 * rows (e.g. admins) are never modified. Failures are non-fatal: if RLS blocks
 * it the payment insert attempt will surface its own descriptive error.
 * The id is passed as a string so it inserts cleanly into text OR bigint
 * id columns (Postgres casts the text literal automatically).
 */
async function ensureUserRow(
  id: string,
  username: string | null,
  fullName: string | null,
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('users')
      .upsert(
        { id, username, full_name: fullName, role: 'user' },
        { onConflict: 'id', ignoreDuplicates: true },
      );
    if (error) {
      console.warn('ensureUserRow: could not upsert user row:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('ensureUserRow threw (payment insert may still succeed):', err);
    return false;
  }
}

/**
 * Resolve the submitting user's id as a canonical numeric STRING (must match
 * public.users.id). See the module docblock for the resolution order and the
 * UUID-cast safety guarantees.
 */
export async function resolveAppUserId(telegramUser: TelegramUser | null): Promise<string> {
  // 1) Telegram Mini App context (primary path). The TMA id may arrive as a
  //    number OR a numeric string depending on the Telegram client — both are
  //    accepted and normalized by toDbUserId().
  if (telegramUser && telegramUser.id !== undefined && telegramUser.id !== null) {
    const normalized = toDbUserId(telegramUser.id);
    if (normalized !== '') {
      await ensureUserRow(
        normalized,
        telegramUser.username ?? null,
        [telegramUser.first_name, telegramUser.last_name].filter(Boolean).join(' ').trim() || null,
      );
      return normalized;
    }
  }

  // 2) Supabase auth fallback (persisted session / local auth)
  try {
    const { data } = await supabase.auth.getUser();
    const authUser = data?.user;
    if (authUser) {
      // The auth id is a UUID — NEVER send it raw (uuid/bigint column cast
      // error). Hash it to a stable negative numeric string instead.
      const authId = toDbUserId(authUser.id);
      await ensureUserRow(authId, authUser.email ?? null, authUser.email ?? null);
      return authId;
    }
  } catch (authErr) {
    console.warn('Supabase auth fallback unavailable:', authErr);
  }

  // 3) Guest fallback — persistent anonymous id instead of a hard error
  const guestId = toDbUserId(readStoredGuestId() ?? createAndStoreGuestId());
  await ensureUserRow(guestId, `Guest-${guestId.replace('-', '').slice(-6)}`, 'Guest');
  return guestId;
}
