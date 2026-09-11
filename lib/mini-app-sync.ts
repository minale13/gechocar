/**
 * Mini App open tracking (fire-and-forget).
 *
 * POSTs the resolved Telegram identity to /api/user/sync, which upserts the
 * profiles row with last_opened_at = now() and is_registered = true using the
 * service-role key. Non-fatal by design — analytics must never break the
 * Mini App. Guest / browser sessions (negative or missing ids) are skipped.
 *
 * The Telegram user's numeric id is forwarded as both telegramId and chatId
 * (in a private DM chat the user's personal chat id equals their account id),
 * ensuring telegram_chat_id is populated on the profiles row even when the
 * user never sent /start to the bot.
 */
import type { TelegramUser } from '@/lib/tma';
import { toDbUserId } from '@/lib/user-identity';

export async function syncMiniAppSession(
  telegramUser: TelegramUser | null,
  languagePreference?: string | null,
): Promise<boolean> {
  if (!telegramUser || telegramUser.id === undefined || telegramUser.id === null) {
    return false;
  }
  const telegramId = toDbUserId(telegramUser.id);
  if (!telegramId || telegramId.startsWith('-')) return false;

  try {
    const response = await fetch('/api/user/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telegramId,
        // chatId = the Telegram user's numeric id as a string. In a private
        // (DM) chat the user's personal chat id equals their account id, so
        // this is a valid broadcast target and ensures telegram_chat_id is
        // set on the profiles row.
        chatId: telegramId,
        firstName: telegramUser.first_name ?? null,
        lastName: telegramUser.last_name ?? null,
        username: telegramUser.username ?? null,
        photoUrl: telegramUser.photo_url ?? null,
        // Language picked in the Mini App (or by the bot's «🌐 ቋንቋ» inline
        // keyboard) — persisted to profiles.language_preference by /api/user/sync.
        languagePreference: languagePreference ?? null,
      }),
    });

    if (!response.ok) {
      console.warn('syncMiniAppSession: /api/user/sync failed:', response.status);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('syncMiniAppSession threw (non-fatal):', err);
    return false;
  }
}
