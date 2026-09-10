'use client';

import { LanguageProvider } from '@/components/app/language-provider';
import { TelegramProvider } from '@/components/app/telegram-provider';

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      <TelegramProvider>{children}</TelegramProvider>
    </LanguageProvider>
  );
}
