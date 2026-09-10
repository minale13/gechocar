'use client';

import { createContext, useContext, useMemo, useState, useEffect } from 'react';
import { translations, languageNames, type Language } from '@/lib/translations';

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
    // Load from localStorage on mount
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('preferred-language') as Language | null;
      if (saved && ['en', 'am', 'om', 'ti'].includes(saved)) {
        setLanguageState(saved);
      }
    }
    setMounted(true);
  }, []);

  const setLanguage = (value: Language) => {
    setLanguageState(value);
    if (typeof window !== 'undefined') {
      localStorage.setItem('preferred-language', value);
    }
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

