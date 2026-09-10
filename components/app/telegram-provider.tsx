'use client';

/**
 * Resolves the Telegram Mini App identity (initDataUnsafe.user) and shares it
 * app-wide.
 *
 * Robustness notes:
 *  • ready()/expand() are called once on mount (Bot API lifecycle).
 *  • The SDK script (telegram-web-app.js) is injected beforeInteractive in
 *    app/layout.tsx, but some clients inject window.Telegram slightly AFTER
 *    the first effect run — so the identity is re-checked on a short retry
 *    window instead of being read exactly once. As soon as the user object
 *    appears, the guest state flips to the real identity dynamically
 *    (no re-open required).
 *  • Outside Telegram (plain browser) the retry window elapses and the app
 *    stays in guest mode — checkout falls back to the persistent guest id.
 */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  getTelegramSupportLink,
  getTelegramUser,
  initializeTelegramWebApp,
  type TelegramUser,
} from '@/lib/tma';
import { syncMiniAppSession } from '@/lib/mini-app-sync';

const TelegramContext = createContext<{
  user: TelegramUser | null;
  supportLink: string;
  /** True while the identity retry window is still running (no user yet). */
  identityPending: boolean;
}>({
  user: null,
  supportLink: 'https://t.me/support',
  identityPending: true,
});

/** How long we keep polling for the TMA identity before settling as guest. */
const IDENTITY_RETRY_MS = 250;
const IDENTITY_MAX_ATTEMPTS = 40; // ≈ 10 seconds

export function TelegramProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<TelegramUser | null>(null);
  const [identityPending, setIdentityPending] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // Bot API lifecycle: ready() + expand() (no-ops outside Telegram).
    initializeTelegramWebApp();

    const resolve = () => {
      if (cancelled) return;
      const current = getTelegramUser();
      if (current && current.id) {
        // Identity found — flip the guest state dynamically.
        setUser(current);
        setIdentityPending(false);
        // Fire-and-forget analytics sync: records the Mini App open
        // (profiles.last_opened_at / is_registered) for the admin dashboard.
        void syncMiniAppSession(current);
        return;
      }
      // Not yet available (SDK still loading / identity injected late) — retry.
      if (attempts++ < IDENTITY_MAX_ATTEMPTS) {
        timer = setTimeout(resolve, IDENTITY_RETRY_MS);
      } else {
        // Retry window exhausted — this is a real guest (browser) session.
        setIdentityPending(false);
      }
    };

    resolve();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const value = useMemo(
    () => ({
      user,
      supportLink: getTelegramSupportLink(user?.username ?? '@support'),
      identityPending,
    }),
    [user, identityPending]
  );

  return <TelegramContext.Provider value={value}>{children}</TelegramContext.Provider>;
}

export function useTelegram() {
  return useContext(TelegramContext);
}
