'use client';

/**
 * Mini App Profile card — the user's registered account identity.
 *
 * Reads window.Telegram.WebApp.initDataUnsafe.user on mount:
 *   id (telegram_id), first_name, last_name, username, photo_url — then
 * fetches the matching public.profiles row (created by the registration bot
 * when the user pressed «ስልክ አጋራ») for the verified phone number.
 *
 * Display rules:
 *   • Photo       — TMA photo_url (or the profile's saved one), falling back
 *                   to a first-initial avatar.
 *   • Name        — first_name + last_name (never a hardcoded "Guest").
 *   • Username    — @username.
 *   • Phone       — the fetched phone_number, or a prompt to press
 *                   «ስልክ አጋራ» in the Telegram bot when empty.
 *   • Telegram ID — the exact id value.
 *
 * The TMA photo_url is also synced back to profiles.photo_url (migration 023
 * allows anon updates on the photo column only) so the avatar survives
 * outside the Telegram context. Non-fatal when the profile row doesn't exist.
 */
import { useCallback, useEffect, useState } from 'react';
import { LogOut, Phone, RefreshCw, UserRound } from 'lucide-react';
import { useLanguage } from '@/components/app/language-provider';
import { useTelegram } from '@/components/app/telegram-provider';
import { fetchUserProfile, saveProfilePhoto, type UserProfile } from '@/lib/profile';
import { getTelegramUser, type TelegramUser } from '@/lib/tma';

export function ProfileCard() {
  const { t } = useLanguage();
  const { user: telegramUser, identityPending } = useTelegram();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  // True when the avatar <img> failed to load → render the letter fallback.
  const [avatarFailed, setAvatarFailed] = useState(false);

  const loadProfile = useCallback(
    async (user: TelegramUser | null) => {
      setLoading(true);
      try {
        const found = await fetchUserProfile(user);
        setProfile(found);

        // Keep the stored avatar fresh: when the TMA provides a photo_url and
        // it differs from the saved one, sync it (non-fatal; RLS restricts
        // anon writes to the photo column only).
        const photo = user?.photo_url ?? null;
        if (photo && (!found || found.photo_url !== photo)) {
          const saved = await saveProfilePhoto(user, photo);
          if (saved && found) setProfile({ ...found, photo_url: photo });
        }
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // Read the TMA identity on mount and fetch the matching profile. The
  // TelegramProvider resolves the user right after mount, so this effect
  // re-runs once the identity becomes available.
  useEffect(() => {
    void loadProfile(telegramUser ?? getTelegramUser());
  }, [loadProfile, telegramUser]);

  // ── Resolved display values ──────────────────────────────────────────────
  const firstName = profile?.first_name ?? telegramUser?.first_name ?? null;
  const lastName = profile?.last_name ?? telegramUser?.last_name ?? null;
  const displayName =
    [firstName, lastName].filter(Boolean).join(' ').trim() || 'Guest';
  const avatarInitial = (firstName ?? displayName).trim().charAt(0).toUpperCase();
  const handle = profile?.username ?? telegramUser?.username ?? null;
  const phone = profile?.phone_number ?? null;
  // Exact Telegram id: prefer the live TMA value, fall back to the profile row.
  const telegramId = telegramUser?.id ?? profile?.telegram_id ?? null;
  const photoUrl = telegramUser?.photo_url ?? profile?.photo_url ?? null;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-card-border bg-card p-4">
        <div className="flex items-center gap-3">
          {/* Avatar: TMA photo_url → saved profile photo → first-initial fallback */}
          {photoUrl && !avatarFailed ? (
            <img
              src={photoUrl}
              alt={displayName}
              onError={() => setAvatarFailed(true)}
              className="h-14 w-14 flex-shrink-0 rounded-full border border-card-border object-cover"
            />
          ) : (
            <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-gold-gradient text-lg font-black text-background">
              {avatarInitial || <UserRound className="h-6 w-6" />}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-lg font-bold text-white">{displayName}</p>
            <p className="truncate text-xs text-text-secondary">
              {handle ? `@${handle.replace(/^@/, '')}` : t('userHandle')}
            </p>
          </div>
        </div>

        {/* Opened outside Telegram (identity retry exhausted) → the TMA
            identity is unavailable. While the retry window is still open the
            card simply waits — the identity may arrive any moment. */}
        {!telegramUser && !identityPending && !loading && (
          <div className="mt-3 rounded-2xl border border-sky-500/30 bg-sky-500/10 p-3">
            <p className="text-xs leading-relaxed text-sky-200">
              ℹ️ Open this app from the Telegram bot ( «መተግበሪያ ክፈት» ) to load your
              account identity.
            </p>
          </div>
        )}
        {!telegramUser && identityPending && (
          <div className="mt-3 rounded-2xl border border-card-border bg-card-dark p-3">
            <p className="text-xs text-text-secondary">
              Loading your Telegram identity…
            </p>
          </div>
        )}

        {/* Registered phone number — the identity the bot captured. */}
        <div className="mt-4 flex items-center justify-between rounded-2xl bg-card-dark p-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.2em] text-text-secondary">
              {t('phone')}
            </p>
            {phone ? (
              <p className="mt-1 truncate text-sm font-semibold text-gold-dark">{phone}</p>
            ) : (
              <p className="mt-1 text-sm font-semibold text-amber-400">
                {t('phoneNotRegistered')}
              </p>
            )}
          </div>
          <Phone className={`h-5 w-5 flex-shrink-0 ${phone ? 'text-gold-dark' : 'text-amber-400'}`} />
        </div>

        {/* Telegram account id (initDataUnsafe.user.id ↔ profiles.telegram_id). */}
        <div className="mt-3 flex items-center justify-between rounded-2xl bg-card-dark p-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.2em] text-text-secondary">
              {t('telegramId')}
            </p>
            <p className="mt-1 truncate text-sm font-semibold text-white">
              {telegramId ?? '—'}
            </p>
          </div>
        </div>

        {/* Not-registered prompt — the bot captures the phone via «ስልክ አጋራ». */}
        {!loading && telegramUser && !phone && (
          <div className="mt-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3">
            <p className="text-xs leading-relaxed text-amber-200">
              📱 {t('registerPhonePrompt')}
            </p>
            <button
              onClick={() => void loadProfile(telegramUser ?? getTelegramUser())}
              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs font-semibold text-amber-200 transition hover:bg-amber-500/20"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t('recheckPhone')}
            </button>
          </div>
        )}

        <button className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-300">
          <LogOut className="h-4 w-4" />
          {t('logout')}
        </button>
      </div>
    </div>
  );
}
