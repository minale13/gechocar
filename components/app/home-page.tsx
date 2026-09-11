'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Crown,
  Gift,
  MapPin,
  Medal,
  Ticket,
  Trophy,
} from 'lucide-react';
import { BottomNav } from '@/components/app/bottom-nav';
import { Header } from '@/components/app/header';
import { TicketSelection } from '@/components/app/ticket-selection';
import { PendingTickets } from '@/components/app/pending-tickets';
import { MyTickets } from '@/components/app/my-tickets';
import { ProfileCard } from '@/components/app/profile-card';
import { useLanguage } from '@/components/app/language-provider';
import { ReceiptHistory } from '@/components/app/receipt-history';

export type HomeLotteryItem = {
  id: string;
  title: string;
  description: string;
  ticketPrice: number;
  totalTickets: number;
  location: string;
  imageUrl: string;
  rank: number;
};

export type HomeHeroBanner = {
  id: string;
  title: string;
  imageUrl: string;
  linkUrl: string;
};

export type HomeAppSettings = {
  appTitle: string;
  logoUrl: string;
  ticketPrice: number;
  totalTickets: number;
  /** Telegram support handle (no @) saved from Admin → Support Team. */
  supportUrl: string;
};

const RANK_SUFFIX: Record<number, string> = { 1: 'st', 2: 'nd', 3: 'rd' };

const rankLabel = (rank: number, t: (key: string) => string) => {
  const suffix = RANK_SUFFIX[rank];
  return suffix ? `${rank}${suffix} ${t('prize')}` : `${t('prize')} #${rank}`;
};

// Circled numerals used inside the metallic gold rank badges (①-⑥).
const RANK_CIRCLED: Record<number, string> = {
  1: '①',
  2: '②',
  3: '③',
  4: '④',
  5: '⑤',
  6: '⑥',
};
const rankCircledNumber = (rank: number): string => RANK_CIRCLED[rank] ?? String(rank);

// Amharic prize-tier labels shown on the gold badge chips (e.g. "2ኛ ዕጣ").
const RANK_AMHARIC: Record<number, string> = {
  1: '1ኛ ዕጣ',
  2: '2ኛ ዕጣ',
  3: '3ኛ ዕጣ',
  4: '4ኛ ዕጣ',
  5: '5ኛ ዕጣ',
  6: 'መጽናኛ ዕጣ',
};
const rankAmharicLabel = (rank: number): string => RANK_AMHARIC[rank] ?? `ዕጣ #${rank}`;

const formatNumber = (value: number) => value.toLocaleString();

// Fallback shown when app_settings (row id = 1) is not yet populated, so the
// silver-blue price banner never renders "0 ETB" on a fresh database.
const DEFAULT_TICKET_PRICE = 2500;

const AUTOPLAY_INTERVAL_MS = 5000;

export function HeroCarousel({ banners }: { banners: HomeHeroBanner[] }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const goTo = useCallback(
    (index: number) => {
      setCurrentIndex((index + banners.length) % banners.length);
    },
    [banners.length]
  );

  // Auto-advance the carousel every 5 seconds for smooth seamless slides.
  useEffect(() => {
    if (banners.length <= 1) return;

    timerRef.current = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % banners.length);
    }, AUTOPLAY_INTERVAL_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [banners.length]);

  // If the current index becomes invalid (e.g. banners shrunk), reset.
  useEffect(() => {
    if (currentIndex >= banners.length) {
      setCurrentIndex(0);
    }
  }, [banners.length, currentIndex]);

  if (banners.length === 0) return null;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-card-border shadow-card">
      {/* Slides — stacked, active one fades in for smooth transitions */}
      <div className="relative h-48 sm:h-56">
        {banners.map((banner, index) => {
          const isActive = index === currentIndex;
          return (
            <div
              key={banner.id}
              className={`absolute inset-0 transition-opacity duration-700 ease-in-out ${
                isActive ? 'opacity-100' : 'pointer-events-none opacity-0'
              }`}
              aria-hidden={!isActive}
            >
              <img
                src={banner.imageUrl}
                alt={banner.title}
                className="h-full w-full object-cover"
              />
              {/* Gradient overlay for text legibility */}
              <div className="absolute inset-0 bg-gradient-to-t from-[#030f18]/90 via-[#030f18]/20 to-transparent" />

              {/* Slide content */}
              <div className="absolute inset-x-0 bottom-0 p-4">
                <p className="text-sm font-black uppercase tracking-wider text-gold-light drop-shadow">
                  {banner.title}
                </p>
                {banner.linkUrl && (
                  <a
                    href={banner.linkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-gold-gradient px-4 py-1.5 text-xs font-black text-background shadow-gold transition hover:brightness-110 active:scale-[0.97]"
                  >
                    Learn More
                    <svg
                      className="h-3 w-3"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M5 12h14" />
                      <path d="m12 5 7 7-7 7" />
                    </svg>
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Dots indicator */}
      {banners.length > 1 && (
        <div className="absolute bottom-2 right-3 flex items-center gap-1.5">
          {banners.map((banner, index) => (
            <button
              key={banner.id}
              type="button"
              aria-label={`Go to slide ${index + 1}`}
              onClick={() => goTo(index)}
              className={`h-2 w-2 rounded-full transition-all duration-300 ${
                index === currentIndex
                  ? 'w-5 bg-gold shadow-gold-glow'
                  : 'bg-white/40 hover:bg-white/70'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function HomePage({
  items,
  banners,
  settings,
}: {
  items: HomeLotteryItem[];
  banners: HomeHeroBanner[];
  settings: HomeAppSettings;
}) {
  const [activeTab, setActiveTab] = useState('home');
  const [showTicketGrid, setShowTicketGrid] = useState(false);
  const { t } = useLanguage();

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (tab === 'home') {
      setShowTicketGrid(false);
    }
  };

  const navLabels = useMemo(
    () => ({
      home: t('home'),
      pending: t('pending'),
      tickets: t('tickets'),
      winners: t('winners'),
      profile: t('profile'),
    }),
    [t]
  );

  // Items arrive ordered by `rank` (ascending) from the server component.
  const featuredItem = items[0] ?? null;
  const runnerUpItems = items.slice(1, 3);
  const moreItems = items.slice(3);

  const tabContent = {
    pending: (
      <PendingTickets onRetry={() => handleTabChange('home')} />
    ),
    tickets: <MyTickets />,
    winners: (
      <div className="flex min-h-[420px] items-center justify-center">
        <div className="w-full rounded-2xl border border-card-border bg-card p-6 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-card-dark text-gold-dark">
            <Trophy className="h-8 w-8" />
          </div>
          <h3 className="mt-5 text-xl font-bold text-white">{t('noWinners')}</h3>
        </div>
      </div>
    ),
    profile: (
      <div className="space-y-4">
        {/* Real account identity — fetched from public.profiles by the
            Telegram WebApp user id (the row the registration bot upserts
            when the user presses «ስልክ አጋራ»). */}
        <ProfileCard />

        {/* Receipt / payment history — rejected receipts show a red badge with
            the exact admin rejection reason. */}
        <ReceiptHistory onRetry={() => handleTabChange('home')} />
      </div>
    ),
  };

  return (
    <div className="min-h-screen bg-background text-white">
      <div className="mx-auto max-w-md px-4 pb-28 pt-5">
        <Header appTitle={settings.appTitle} logoUrl={settings.logoUrl} supportUrl={settings.supportUrl} />
        <main className="mt-4">
          {activeTab === 'home' ? (
            showTicketGrid ? (
              <div className="space-y-4">
                <button
                  onClick={() => setShowTicketGrid(false)}
                  className="flex items-center gap-2 rounded-xl border border-card-border bg-card px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-card-dark"
                >
                  <ArrowLeft className="h-4 w-4" />
                  {t('back')}
                </button>
                <TicketSelection
                  ticketPrice={settings.ticketPrice}
                  totalTickets={settings.totalTickets}
                />
              </div>
            ) : (
              <div className="space-y-6">
                {/* Hero Banner Carousel — promotional ads managed from /admin */}
                {banners.length > 0 && <HeroCarousel banners={banners} />}

                {/* Prize Showcase — rendered from lottery_items in Supabase */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 px-1">
                    <Medal className="h-5 w-5 text-gold" />
                    <h2 className="text-lg font-bold text-white">{t('activeDraw')}</h2>
                  </div>

                  {items.length === 0 && (
                    <div className="rounded-2xl border border-card-border bg-card p-6 text-center">
                      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-card-dark text-gold-dark">
                        <Gift className="h-7 w-7" />
                      </div>
                      <h3 className="mt-4 text-lg font-bold text-white">{t('noActivePrizes')}</h3>
                      <p className="mt-1 text-sm text-text-secondary">
                        {t('checkBackSoon')}
                      </p>
                    </div>
                  )}

                {/* Global Ticket Price — silver-blue banner with dark text.
                    Bound DIRECTLY to settings.ticketPrice (app_settings row
                    id = 1) so live price updates saved from /admin → App
                    Settings render immediately on the Host page. Rendered
                    independently of featuredItem so the global price always
                    shows, even before any prize exists. */}
                <div className="flex justify-center">
                  <div className="silver-blue-banner inline-flex items-center gap-3 px-6 py-3">
                    <Ticket className="h-5 w-5 flex-shrink-0 text-background" />
                    <span className="text-xs font-black uppercase tracking-[0.2em] text-background">
                      {t('ticketPrice')}:
                    </span>
                    <span className="text-xl font-black leading-none text-background">
                      {formatNumber(settings?.ticketPrice && settings.ticketPrice > 0 ? settings.ticketPrice : DEFAULT_TICKET_PRICE)}
                    </span>
                    <span className="text-sm font-bold leading-none text-background/80">{t('etb')}</span>
                  </div>
                </div>

                  {/* Featured Prize (rank 1 / first item) — Tech-Glow card */}
                  {featuredItem && (
                    <div className="relative overflow-hidden rounded-2xl border border-cyan/40 bg-card p-5 shadow-cyan-glow">
                      <div className="absolute right-3 top-3 rounded-full bg-gold-gradient px-3 py-1 text-[10px] font-black uppercase tracking-wider text-background shadow-gold-glow">
                        {rankLabel(featuredItem.rank, t)}
                      </div>

                      {featuredItem.imageUrl && (
                        <img
                          src={featuredItem.imageUrl}
                          alt={featuredItem.title}
                          className="mb-4 h-40 w-full rounded-xl border border-cyan/20 object-cover"
                        />
                      )}

                      <div className="relative inline-flex shrink-0 rounded-2xl bg-gradient-to-tr from-gold-dark via-gold to-cyan p-[1.5px] shadow-[0_0_20px_rgba(234,179,8,0.4)]">
                        <div className="flex h-14 w-14 items-center justify-center rounded-[15px] bg-card-dark">
                          <Crown className="h-7 w-7 text-gold-light drop-shadow-[0_0_10px_rgba(245,208,97,0.85)]" />
                        </div>
                      </div>
                      <h3 className="mt-4 text-2xl font-black text-white">{featuredItem.title}</h3>
                      {featuredItem.description && (
                        <p className="mt-1 text-sm text-cyan-light">{featuredItem.description}</p>
                      )}

                      <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-200">
                        <span className="inline-flex items-center gap-1 rounded-full border border-cyan/30 bg-card-dark px-3 py-1.5">
                          <Medal className="h-3.5 w-3.5 text-cyan" />
                          {t('ticketsCount')}: {formatNumber(featuredItem.totalTickets)}
                        </span>
                        {featuredItem.location && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-cyan/30 bg-card-dark px-3 py-1.5">
                            <MapPin className="h-3.5 w-3.5 text-cyan" />
                            {featuredItem.location}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 2nd & 3rd Prizes — Tech-Glow cards */}
                  {runnerUpItems.length > 0 && (
                    <div className={`grid gap-3 ${runnerUpItems.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                      {runnerUpItems.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-2xl border border-sky-400/30 bg-card p-4 shadow-cyan-glow-soft transition hover:border-gold-light/60 hover:shadow-gold-glow"
                        >
                          {/* Metallic-gold circular rank badge + Amharic gold chip */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-gold-dark via-gold to-gold-light shadow-[0_0_14px_rgba(234,179,8,0.35)] ring-2 ring-gold-light/40">
                              <span className="text-lg font-black leading-none text-background">
                                {rankCircledNumber(item.rank)}
                              </span>
                            </div>
                            <span className="inline-flex items-center rounded-full bg-gold-gradient px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-background shadow-gold-glow">
                              {rankAmharicLabel(item.rank)}
                            </span>
                          </div>
                          <h4 className="mt-3 text-sm font-bold text-white">{item.title}</h4>
                          {item.description && (
                            <p className="mt-1 text-xs leading-snug text-cyan-light">{item.description}</p>
                          )}
                          {item.imageUrl && (
                            <img
                              src={item.imageUrl}
                              alt={item.title}
                              className="mt-3 h-20 w-full rounded-xl border border-cyan/20 object-cover"
                            />
                          )}
                          <p className="mt-2 text-xs text-text-secondary">
                            {t('ticketsCount')}: {formatNumber(item.totalTickets)}
                          </p>
                          {item.location && (
                            <p className="mt-1 inline-flex items-center gap-1 text-xs text-cyan-light">
                              <MapPin className="h-3 w-3" />
                              {item.location}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Additional Prizes — Tech-Glow */}
                  {moreItems.length > 0 && (
                    <div className="rounded-2xl border border-cyan/30 bg-card p-4 shadow-cyan-glow-soft">
                      <div className="flex items-center gap-2">
                        <Gift className="h-4 w-4 text-cyan" />
                        <h4 className="text-sm font-bold text-white">{t('morePrizes')}</h4>
                      </div>
                      <div className="mt-3 space-y-2">
                        {moreItems.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center gap-3 rounded-xl border border-cyan/20 bg-card-dark p-3 transition hover:border-cyan/40"
                          >
                            {item.imageUrl && (
                              <img
                                src={item.imageUrl}
                                alt={item.title}
                                className="h-10 w-10 flex-shrink-0 rounded-lg border border-cyan/20 object-cover"
                              />
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-white">{item.title}</p>
                              <p className="mt-0.5 text-xs text-slate-300">
                                {formatNumber(item.totalTickets)} {t('tickets')}
                              </p>
                            </div>
                            {item.location && (
                              <span className="inline-flex items-center gap-1 text-xs text-slate-300">
                                <MapPin className="h-3 w-3 text-cyan" />
                                {item.location}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* How It Works — step-by-step guide (እንዴት ይሰራል) — mirrors
                      the checkout flow: pick numbers → pay & upload receipt →
                      get official confirmation behind the scenes. */}
                  <div className="rounded-2xl border border-cyan/30 bg-card p-4 shadow-cyan-glow-soft">
                    <div className="flex items-center gap-2">
                      <Medal className="h-4 w-4 text-cyan" />
                      <h4 className="text-sm font-bold text-white">{t('howItWorks')}</h4>
                    </div>
                    <div className="mt-3 space-y-3">
                      {/* Step 1 — choose ticket numbers */}
                      <div className="flex items-center gap-3 rounded-xl border border-cyan/20 bg-card-dark p-3 transition hover:border-cyan/40">
                        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-cyan/40 bg-cyan/10 text-cyan">
                          <Ticket className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-white">{t('howItWorksStep1Title')}</p>
                          <p className="mt-0.5 text-[11px] leading-snug text-text-secondary">
                            {t('howItWorksStep1Subtitle')}
                          </p>
                        </div>
                        <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-cyan/20 text-[11px] font-black text-cyan-light">1</span>
                      </div>
                      {/* Step 2 — pay & upload receipt */}
                      <div className="flex items-center gap-3 rounded-xl border border-cyan/20 bg-card-dark p-3 transition hover:border-cyan/40">
                        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-cyan/40 bg-cyan/10 text-cyan">
                          <Gift className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-white">{t('howItWorksStep2Title')}</p>
                          <p className="mt-0.5 text-[11px] leading-snug text-text-secondary">
                            {t('howItWorksStep2Subtitle')}
                          </p>
                        </div>
                        <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-cyan/20 text-[11px] font-black text-cyan-light">2</span>
                      </div>
                      {/* Step 3 — get official confirmation */}
                      <div className="flex items-center gap-3 rounded-xl border border-cyan/20 bg-card-dark p-3 transition hover:border-cyan/40">
                        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-cyan/40 bg-cyan/10 text-cyan">
                          <Crown className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-white">{t('howItWorksStep3Title')}</p>
                          <p className="mt-0.5 text-[11px] leading-snug text-text-secondary">
                            {t('howItWorksStep3Subtitle')}
                          </p>
                        </div>
                        <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-cyan/20 text-[11px] font-black text-cyan-light">3</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          ) : (
            tabContent[activeTab as keyof typeof tabContent]
          )}
        </main>
      </div>

      {/* Sticky Buy Ticket Button — Tech-Glow */}
      {activeTab === 'home' && !showTicketGrid && (
        <div className="fixed bottom-20 left-0 right-0 z-40 px-4">
          <div className="mx-auto max-w-md">
            <button
              onClick={() => setShowTicketGrid(true)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-gradient px-6 py-4 text-base font-black text-background shadow-cyan-glow transition hover:brightness-110 hover:shadow-cyan-glow-strong active:scale-[0.98]"
            >
              <Ticket className="h-5 w-5" />
              {t('buyTicket')}
            </button>
          </div>
        </div>
      )}

      <BottomNav activeTab={activeTab} onChange={handleTabChange} labels={navLabels} />
    </div>
  );
}