'use client';

import useSWR from 'swr';
import {
  Activity,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Headphones,
  Layers,
  Loader2,
  MousePointerClick,
  RefreshCw,
  Users,
  Wallet,
} from 'lucide-react';
import type { Receipt } from '@/components/admin/types';
import { receiptUserLabel } from '@/components/admin/types';

type MiniAppUserStats = {
  totalRegistered: number;
  activeMiniApp24h: number;
  activeMiniAppTotal: number;
};

/**
 * Telegram user analytics — rendered ONLY on the main Overview / Analytics
 * page (never inside the Auto-Post Scheduler, which stays a clean
 * posting/scheduling UI). Fetches GET /api/admin/user-stats (service-role
 * counts over profiles: chat_id IS NOT NULL / last_opened_at within 24h /
 * last_opened_at IS NOT NULL) and auto-refreshes every 60 seconds.
 */
/** SWR fetcher for GET /api/admin/user-stats — throws so error states surface. */
const userStatsFetcher = async (url: string): Promise<MiniAppUserStats> => {
  const res = await fetch(url, { cache: 'no-store' });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success || !json?.data) {
    throw new Error(json?.error || `Request failed (${res.status})`);
  }
  return {
    totalRegistered: Number(json.data.totalRegistered) || 0,
    activeMiniApp24h: Number(json.data.activeMiniApp24h) || 0,
    activeMiniAppTotal: Number(json.data.activeMiniAppTotal) || 0,
  };
};

function MiniAppUserStatsCard() {
  // SWR caching strategy (replaces the manual setInterval poll): in-memory
  // cache shared across mounts, request de-duplication, 60s background refresh,
  // focus revalidation, and instant revalidation via mutate() from the Refresh
  // button. keepPreviousData keeps the numbers on screen while revalidating.
  const {
    data: stats,
    error,
    mutate,
    isLoading,
    isValidating,
  } = useSWR<MiniAppUserStats>('/api/admin/user-stats', userStatsFetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: true,
    keepPreviousData: true,
    dedupingInterval: 10_000,
  });

  const loading = isLoading || isValidating;
  const errorText = error instanceof Error ? error.message : error ? 'Network error' : null;

  const tiles: {
    label: string;
    value: number | null;
    hint: string;
    icon: React.ReactNode;
    accent: string;
    glow: string;
  }[] = [
    {
      label: 'Total Registered Users',
      value: stats?.totalRegistered ?? null,
      hint: 'profiles with a telegram chat id',
      icon: <Users className="h-5 w-5" />,
      accent: 'text-amber-400',
      glow: 'bg-amber-500/10',
    },
    {
      label: 'Active Mini App (24H)',
      value: stats?.activeMiniApp24h ?? null,
      hint: 'opened in the last 24 hours',
      icon: <Clock3 className="h-5 w-5" />,
      accent: 'text-emerald-400',
      glow: 'bg-emerald-500/10',
    },
    {
      label: 'Active Mini App (All Time)',
      value: stats?.activeMiniAppTotal ?? null,
      hint: 'opened the Mini App at least once',
      icon: <MousePointerClick className="h-5 w-5" />,
      accent: 'text-sky-400',
      glow: 'bg-sky-500/10',
    },
  ];

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-amber-400" />
          <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-slate-300">
            Telegram User Analytics
          </h3>
        </div>
        <button
          type="button"
          onClick={() => void mutate()}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-xl border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-amber-500/40 hover:text-amber-300 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {errorText && !stats && (
        <p className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-300">
          {errorText} — check that SUPABASE_SERVICE_ROLE_KEY is configured and the admin
          session is active.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className="lux-card relative overflow-hidden rounded-3xl p-5 transition hover:shadow-[0_0_34px_rgba(212,175,55,0.18)]"
          >
            <div className={`absolute -right-6 -top-6 h-24 w-24 rounded-full ${tile.glow} blur-2xl`} />
            <span className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-800/70 ${tile.accent}`}>
              {tile.icon}
            </span>
            <p className={`mt-4 text-xs font-semibold uppercase tracking-[0.18em] ${tile.accent}`}>
              {tile.label}
            </p>
            {loading && !stats ? (
              <Loader2 className="mt-2 h-6 w-6 animate-spin text-slate-500" />
            ) : (
              <p className="mt-1 text-4xl font-black text-white">
                {tile.value?.toLocaleString() ?? '—'}
              </p>
            )}
            <p className="mt-1 text-xs text-slate-400">{tile.hint}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export type OverviewStats = {
  pendingCount: number;
  approvedCount: number;
  approvedRevenue: number;
  approvedTickets: number;
  pendingTickets: number;
  totalTickets: number;
  manualTicketsSold: number;
  supportContact: string;
};

type Props = {
  stats: OverviewStats;
  pendingPreview: Receipt[];
  loading: boolean;
  onGoToReceipts: () => void;
};

/** 📊 Overview & Stats — high-impact metric cards. */
export function OverviewTab({ stats, pendingPreview, loading, onGoToReceipts }: Props) {
  const available = Math.max(0, stats.totalTickets - stats.approvedTickets - stats.pendingTickets);
  return (
    <div className="space-y-6">
      {/* Telegram user analytics — Overview page ONLY (requirement 1). */}
      <MiniAppUserStatsCard />

      {/* Metric cards */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* Pending approval */}
        <div className="lux-card relative overflow-hidden rounded-3xl p-5 transition hover:shadow-[0_0_34px_rgba(212,175,55,0.25)]">
          <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-amber-500/10 blur-2xl" />
          <div className="flex items-center justify-between">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-400">
              <Clock3 className="h-5 w-5" />
            </span>
            {loading && <Loader2 className="h-4 w-4 animate-spin text-slate-500" />}
          </div>
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-[#D4AF37]">
            Pending Approval
          </p>
          <p className="mt-1 text-4xl font-black text-white">{stats.pendingCount}</p>
          <p className="mt-1 text-xs text-slate-400">receipts awaiting review</p>
        </div>

        {/* Approved revenue */}
        <div className="lux-card relative overflow-hidden rounded-3xl p-5 transition hover:shadow-[0_0_34px_rgba(52,211,153,0.22)]">
          <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-emerald-500/10 blur-2xl" />
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400">
            <Wallet className="h-5 w-5" />
          </span>
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400/80">
            Approved Revenue
          </p>
          <p className="mt-1 text-4xl font-black text-white">
            {stats.approvedRevenue.toLocaleString()}
            <span className="ml-1 text-base font-bold text-slate-400">ETB</span>
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {stats.approvedTickets} sold tickets · {stats.approvedCount} receipts
          </p>
        </div>

        {/* Available tickets */}
        <div className="lux-card relative overflow-hidden rounded-3xl p-5 transition hover:shadow-[0_0_34px_rgba(34,211,238,0.22)]">
          <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-sky-500/10 blur-2xl" />
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-400">
            <Layers className="h-5 w-5" />
          </span>
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-sky-400/80">
            Tickets Available
          </p>
          <p className="mt-1 text-4xl font-black text-white">{available.toLocaleString()}</p>
          <p className="mt-1 text-xs text-slate-400">
            of {stats.totalTickets.toLocaleString()} total numbers
          </p>
        </div>

        {/* Support contact */}
        <div className="lux-card relative overflow-hidden rounded-3xl p-5 transition hover:shadow-[0_0_34px_rgba(217,70,239,0.22)]">
          <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-fuchsia-500/10 blur-2xl" />
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-fuchsia-500/15 text-fuchsia-400">
            <Headphones className="h-5 w-5" />
          </span>
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-fuchsia-400/80">
            Active Support
          </p>
          <p className="mt-1 truncate text-xl font-bold text-white">{stats.supportContact}</p>
          <p className="mt-1 text-xs text-slate-400">contact handle for players</p>
        </div>
      </section>

      {/* Pending queue preview */}
      <section className="lux-card rounded-3xl p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-amber-400" />
            <h3 className="text-lg font-bold text-white">Latest Pending Submissions</h3>
          </div>
          <button
            type="button"
            onClick={onGoToReceipts}
            className="btn-lux-gold px-4 py-2 text-sm"
          >
            Review all
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {pendingPreview.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-slate-700 p-5 text-center text-sm text-slate-400">
            🎉 No pending receipts — everything has been reviewed.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {pendingPreview.map((receipt) => (
              <li
                key={receipt.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-800 bg-slate-950/50 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">
                    {receiptUserLabel(receipt)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {receipt.ticket_ids.join(', ')} ·{' '}
                    {new Date(receipt.created_at).toLocaleString()}
                  </p>
                </div>
                <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-300">
                  {receipt.amount.toLocaleString()} ETB
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
