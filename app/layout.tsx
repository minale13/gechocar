import './globals.css';
import type { Metadata } from 'next';
import Script from 'next/script';
import { Inter } from 'next/font/google';
import { AppProviders } from './providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'አድማስ | Admas',
  description: 'Luxury lottery and ticket buying experience',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {/* Telegram WebApp SDK — MUST be present for the Mini App identity
            (window.Telegram.WebApp.initDataUnsafe.user) to exist.
            beforeInteractive injects it before hydration so the providers
            below can read the identity on their first effect run. */}
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
