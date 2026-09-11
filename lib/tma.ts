export type TelegramUser = {
  /**
   * Telegram delivers the user id as a number OR a numeric string depending
   * on the client (and it can be negative, e.g. "-4502572551053578" for
   * channel/bot contexts). Preserve the RAW value — coercing with Number()
   * risks precision loss on large ids and NaN on unexpected strings, both of
   * which would silently change the resolved users.id between sessions.
   * lib/user-identity.ts toDbUserId() normalizes it safely.
   */
  id: number | string;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  /** Avatar URL from initDataUnsafe.user (present when the TMA runs inside Telegram). */
  photo_url?: string | null;
};

export type TelegramWebApp = {
  initData?: string;
  initDataUnsafe?: {
    user?: TelegramUser;
    start_param?: string;
  };
  version?: string;
  platform?: string;
  colorScheme?: 'light' | 'dark';
  themeParams?: Record<string, string>;
  /** Bot API lifecycle — must be called once the Mini App is interactive. */
  ready?: () => void;
  /** Expands the Mini App to full height. */
  expand?: () => void;
};

export function getTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === 'undefined') return null;

  try {
    const globalWindow = window as Window & {
      Telegram?: {
        WebApp?: TelegramWebApp;
      };
    };

    return globalWindow.Telegram?.WebApp ?? null;
  } catch {
    // Defensive: some privacy modes / extensions make window members throw on
    // access. The Telegram identity is optional — the app must still render.
    return null;
  }
}

export function getTelegramUser(): TelegramUser | null {
  let user: TelegramUser | undefined;

  try {
    const webApp = getTelegramWebApp();
    user = webApp?.initDataUnsafe?.user;
  } catch {
    // Accessing TMA properties must never crash the app — treat as guest.
    user = undefined;
  }

  if (!user) return null;

  return {
    // Preserve the raw id (number or numeric string) — see TelegramUser.id doc.
    id: (user.id ?? 0) as number | string,
    username: user.username ?? null,
    first_name: user.first_name ?? null,
    last_name: user.last_name ?? null,
    photo_url: user.photo_url ?? null,
  };
}

/**
 * One-time Bot API initialization: tells Telegram the Mini App is ready
 * (removes the loading placeholder) and expands it to full height.
 * Safe to call multiple times / outside Telegram (no-ops).
 */
export function initializeTelegramWebApp(): void {
  const webApp = getTelegramWebApp();
  try {
    webApp?.ready?.();
    webApp?.expand?.();
  } catch {
    // Older clients may not implement these — never fatal.
  }
}

export function getTelegramSupportLink(username?: string | null) {
  const sanitized = (username ?? '@support').replace(/^@/, '');
  return `https://t.me/${sanitized}`;
}

export function getTelegramUserName(user?: TelegramUser | null) {
  if (!user) return 'Guest';
  return user.username || `${user.first_name ?? 'User'} ${user.last_name ?? ''}`.trim();
}
