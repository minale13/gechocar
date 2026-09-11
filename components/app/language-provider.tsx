'use client';

import { createContext, useContext, useMemo, useState, useEffect } from 'react';
import { translations, languageNames, type Language } from '@/lib/translations';
import { getTelegramUser, getTelegramWebApp } from '@/lib/tma';
import { fetchUserProfile } from '@/lib/profile';
import { syncMiniAppSession } from '@/lib/mini-app-sync';

const VALID_LANGUAGES = new Set<Language>(['en', 'am', 'om', 'ti']);

/**
 * Coerce an arbitrary value (localStorage / Supabase / start_param) into a
 * supported Language — or null when unknown. Accepts the bot's callback_data
 * codes ("lang_am"), plain codes ("am") and a defensive "startapp=…" prefix.
 */
function normalizeLanguage(value: unknown): Language | null {
  if (typeof value !== 'string') return null;
  const code = value.trim().replace(/^startapp=/, '').replace(/^lang_/, '');
  return VALID_LANGUAGES.has(code as Language) ? (code as Language) : null;
}

const LanguageContext = createContext<{
  language: Language;
  setLanguage: (value: Language) => void;
  t: (key: string) => string;
  languageNames: Record<Language, string>;
}>({
  language: 'en',
  setLanguage: () => undefined,
  t: (key: string) => translations.en[key as keyof typeof translations.en] || key,
  languageNames,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('en');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // 1) Immediate: the last choice from this browser (fast first paint).
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('preferred-language');
      const normalized = normalizeLanguage(saved);
      if (normalized) setLanguageState(normalized);
    }

    // 2) Async, non-blocking: the bot-registered source of truth so the Mini
    //    App opens in the user's chosen language automatically. Priority:
    //       a) start_param (?startapp=lang_xx on the Mini App link),
    //       b) profiles.language_preference (written by the bot's «🌐 ቋንቋ»
    //          inline keyboard; read via the anon-readable profiles row).
    //    Both are mirrored to localStorage so the choice also sticks for
    //    browser/guest sessions.
    const applyLanguage = (value: Language | null): boolean => {
      if (!value) return false;
      setLanguageState(value);
      if (typeof window !== 'undefined') {
        localStorage.setItem('preferred-language', value);
      }
      return true;
    };

    void (async () => {
      try {
        const startParam = getTelegramWebApp()?.initDataUnsafe?.start_param ?? '';
        if (!applyLanguage(normalizeLanguage(startParam))) {
          const user = getTelegramUser();
          if (user) {
            const profile = await fetchUserProfile(user);
            if (profile) applyLanguage(normalizeLanguage(profile.language_preference));
          }
        }
      } catch {
        // Never let a profile/network failure break the UI — keep local.
      }
    })();

    setMounted(true);
  }, []);

  const setLanguage = (value: Language) => {
    setLanguageState(value);
    if (typeof window !== 'undefined') {
      localStorage.setItem('preferred-language', value);
    }
    // Best-effort write-back so the bot and the Mini App stay in sync with
    // the user's choice (profiles.language_preference via POST /api/user/sync).
    const user = getTelegramUser();
    if (user) void syncMiniAppSession(user, value);
  };

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      t: (key: string) => {
        const trans = translations[language];
        return (trans[key as keyof typeof trans] || translations.en[key as keyof typeof translations.en] || key) as string;
      },
      languageNames,
    }),
    [language]
  );

  if (!mounted) {
    return <>{children}</>;
  }

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export type { Language };

