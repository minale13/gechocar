import './globals.css';
import type { Metadata } from 'next';
import Script from 'next/script';
import { Inter } from 'next/font/google';
import { AppProviders } from './providers';
import { AppErrorBoundary } from '@/components/app/error-boundary';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'GECHO CAR',
  description: 'Luxury lottery and ticket buying experience',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {/* Telegram WebApp SDK — provides window.Telegram.WebApp for the Mini App
            identity (initDataUnsafe.user). The script is OPTIONAL by design:
            if it fails to load (offline, blocked, plain browser), every access
            goes through lib/tma.ts which optional-chains window.Telegram and
            falls back to guest mode — no crash, no white screen. */}
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
        <AppErrorBoundary>
          <AppProviders>{children}</AppProviders>
        </AppErrorBoundary>
      </body>
    </html>
  );
}
