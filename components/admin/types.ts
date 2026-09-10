// Shared type definitions for the Admin Dashboard.
// Used by app/admin/page.tsx (logic hub) and components/admin/* (UI tabs).

export type RaffleItem = {
  id: string;
  title: string;
  description: string;
  price: number;
  imageUrl: string;
  location: string;
  tickets: number;
  rank: number;
  /** Per-draw date/time (ISO string). Empty string when not scheduled. */
  drawDate: string;
};

/**
 * Prize ranks offered by the Raffle Item form's rank dropdown.
 * Ranks 1-5 are the main draws; 6 is the መጽናኛ (Consolation) prize.
 * Each value maps 1:1 to the `rank` integer column in lottery_items.
 */
export type PrizeRankTier = 1 | 2 | 3 | 4 | 5 | 6;

export type PrizeRankOption = {
  value: PrizeRankTier;
  labelAm: string;
  labelEn: string;
};

export const PRIZE_RANK_OPTIONS: PrizeRankOption[] = [
  { value: 1, labelAm: "1ኛ ዕጣ (1st Prize)", labelEn: "1st Prize" },
  { value: 2, labelAm: "2ኛ ዕጣ (2nd Prize)", labelEn: "2nd Prize" },
  { value: 3, labelAm: "3ኛ ዕጣ (3rd Prize)", labelEn: "3rd Prize" },
  { value: 4, labelAm: "4ኛ ዕጣ (4th Prize)", labelEn: "4th Prize" },
  { value: 5, labelAm: "5ኛ ዕጣ (5th Prize)", labelEn: "5th Prize" },
  { value: 6, labelAm: "መጽናኛ ዕጣ (Consolation)", labelEn: "Consolation" },
];

/** Amharic label for a prize rank (falls back to "Prize #N"). */
export const prizeRankLabel = (rank: number): string =>
  PRIZE_RANK_OPTIONS.find((o) => o.value === rank)?.labelAm ?? `Prize #${rank}`;

export type HeroBanner = {
  id: string;
  title: string;
  imageUrl: string;
  linkUrl: string;
  isActive: boolean;
  sortOrder: number;
};

export type PaymentMethod = {
  id: string;
  bank_name: string;
  account_name: string;
  account_number: string;
  is_active: boolean;
  sort_order: number;
};

export type SupportManager = {
  username: string;
  contact: string;
  phone: string;
};

export type Receipt = {
  id: string;
  /**
   * user_id is TEXT in the live schema (Telegram numeric ids, negative guest
   * ids, hashed auth ids). Widen to number | string so live rows (strings)
   * and mock data (numbers) both type-check.
   */
  user_id: number | string;
  ticket_ids: string[];
  amount: number;
  receipt_url: string | null;
  transaction_reference: string | null;
  admin_note?: string | null;
  /** Exact reason an admin attached when rejecting the receipt (migration 019). */
  rejection_reason?: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  /** Embedded submitter profile (public.users) — optional for mock data. */
  users?: {
    username: string | null;
    full_name: string | null;
  } | null;
  /**
   * Buyer attribution captured at checkout (migration 024): the bot-registered
   * Telegram id + phone number stored on the payments row. Optional so mock
   * data and not-yet-migrated databases keep type-checking — the UI hides
   * these when absent.
   */
  telegram_id?: string | null;
  phone_number?: string | null;
};

export type TelegramSettings = {
  botToken: string;
  chatId: string;
};

export type TelegramSchedulerSettings = {
  id?: string;
  caption: string;
  imageUrl: string;
  intervalHours: number;
  intervalMinutes: number;
  isActive: boolean;
  botToken: string;
  chatId: string;
  lastPostedAt?: string | null;
};

export type AppSettings = {
  appTitle: string;
  logoUrl: string;
  bannerImage: string;
  ticketPrice: number;
  totalTickets: number;
  /** ISO datetime string ("" when unset) for the next draw. */
  drawDatetime: string;
};

/**
 * Human-readable submitter label.
 *
 * Resolution order:
 *   1) "Full Name (@username)"   — when both profile fields are populated
 *   2) "Full Name"               — name only
 *   3) "@username"               — username only
 *   4) "User #12345"             — no profile but user_id is set
 *   5) "Telegram User"           — user_id is null/undefined (edge case: receipt
 *                                  saved without a resolved submitter id)
 *
 * The transaction_reference is never used here because it is a payment id, not
 * a user identity — but callers can access receipt.transaction_reference
 * directly for a secondary identifier.
 */
export function receiptUserLabel(receipt: Receipt): string {
  const name = receipt.users?.full_name?.trim();
  const username = receipt.users?.username?.trim().replace(/^@/, "");
  if (name && username) return `${name} (@${username})`;
  if (name) return name;
  if (username) return `@${username}`;

  // No user profile was embedded — fall back to the user_id.
  const uid = receipt.user_id;
  if (uid !== undefined && uid !== null && uid !== "") {
    return `User #${uid}`;
  }

  // user_id was null/undefined: this happens when a receipt was saved without
  // a resolved submitter identity. Show a clean, non-technical label instead
  // of "User #null" or "User #undefined".
  return "Telegram User";
}
