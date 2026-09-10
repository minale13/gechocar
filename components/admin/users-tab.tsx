'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import {
  AtSign,
  Ban,
  CalendarDays,
  CheckCircle2,
  Eye,
  Loader2,
  Phone,
  RefreshCw,
  Search,
  Ticket,
  Users as UsersIcon,
  Wallet,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

type DirectoryUser = {
  id: string;
  telegramId: string | null;
  username: string | null;
  fullName: string | null;
  phoneNumber: string | null;
  ticketsBought: number;
  ticketsPending: number;
  isBlocked: boolean;
  walletBalance: number;
  createdAt: string | null;
};

/** SWR fetcher for GET /api/admin/users — throws so error states surface. */
const usersFetcher = async (url: string): Promise<DirectoryUser[]> => {
  const res = await fetch(url, { cache: 'no-store' });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    throw new Error(json?.error || `Request failed (${res.status})`);
  }
  return Array.isArray(json.data?.users) ? (json.data.users as DirectoryUser[]) : [];
};

/** ISO string → readable local date, or "—" when unset. */
const formatDate = (iso: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
};

/** ETB currency formatter. */
const formatBirr = (amount: number): string => {
  return `${(Number(amount) || 0).toLocaleString()} ETB`;
};

/**
 * 👥 Users Directory (ተጠቃሚዎች ዝርዝር) — every registered user from
 * public.profiles with Telegram ID, username, phone number, total tickets
 * bought and registration date, plus a quick search filter by username /
 * phone / Telegram ID / name.
 *
 * Data comes from GET /api/admin/users (service-role reads → RLS-proof) via
 * an SWR hook: cached across mounts, de-duplicated, 60s background refresh,
 * focus revalidation, and a manual Refresh button wired to mutate().
 */
export function UsersTab() {
  const {
    data,
    error,
    mutate,
    isLoading,
    isValidating,
  } = useSWR<DirectoryUser[]>('/api/admin/users', usersFetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: true,
    keepPreviousData: true,
    dedupingInterval: 10_000,
  });
  const loading = isLoading || (isValidating && !data);

  // In-flight block-toggle tracking — keyed by userId so we can optimistically
  // flip the badge and disable the button while the POST is in flight.
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  /** Toggle a user's blocked status via POST /api/admin/users. */
  const handleToggleBlock = useCallback(
    async (user: DirectoryUser) => {
      if (togglingId) return; // guard against double-clicks
      setTogglingId(user.id);
      setToast(null);
      const newBlocked = !user.isBlocked;
      try {
        const res = await fetch('/api/admin/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id, blocked: newBlocked }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) {
          throw new Error(json?.error || `Request failed (${res.status})`);
        }
        setToast({
          type: 'success',
          text: newBlocked
            ? `Blocked @${user.username || user.telegramId || 'user'}.`
            : `Unblocked @${user.username || user.telegramId || 'user'}.`,
        });
        // Refresh SWR data so the table reflects the new state.
        await mutate();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to update user status.';
        setToast({ type: 'error', text: msg });
      } finally {
        setTogglingId(null);
      }
    },
    [togglingId, mutate],
  );

  // Supabase Realtime: live-refresh the directory when the profiles table
  // changes (a user registers through the Telegram bot/webhook, updates their
  // avatar, or shares their phone via /start). This makes new registrations
  // appear INSTANTLY instead of waiting for the 60s SWR interval or a manual
  // Refresh click. Debounced (300ms) so a burst of profile upserts coalesces
  // into a single fetch. Requires the profiles table to be in the
  // supabase_realtime publication — see
  // supabase/migrations/031_profiles_realtime.sql.
  const profilesDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const channel = supabase
      .channel('admin-users-directory')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        (change) => {
          console.info(
            '[admin-users] profiles changed:',
            change.eventType,
            '→ refreshing Users List'
          );
          if (profilesDebounceRef.current) clearTimeout(profilesDebounceRef.current);
          profilesDebounceRef.current = setTimeout(() => {
            profilesDebounceRef.current = null;
            void mutate();
          }, 300);
        },
      )
      .subscribe();

    return () => {
      if (profilesDebounceRef.current) {
        clearTimeout(profilesDebounceRef.current);
        profilesDebounceRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [mutate]);

  const [query, setQuery] = useState('');
  const users = data ?? [];

  // Search filter — matches username, phone number, Telegram ID or full name.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      String(u.username ?? '').toLowerCase().includes(q) ||
      String(u.phoneNumber ?? '').toLowerCase().includes(q) ||
      String(u.telegramId ?? '').includes(q) ||
      String(u.fullName ?? '').toLowerCase().includes(q)
    );
  }, [users, query]);

  const totalBought = users.reduce((sum, u) => sum + (Number(u.ticketsBought) || 0), 0);
  const totalPending = users.reduce((sum, u) => sum + (Number(u.ticketsPending) || 0), 0);
  const blockedCount = users.filter((u) => u.isBlocked).length;
  const errorText = error instanceof Error ? error.message : error ? 'Network error' : null;

  return (
    <div className="space-y-6">
      {/* ── Toast feedback ── */}
      {toast && (
        <div
          className={`flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold ${
            toast.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <Ban className="h-4 w-4" />
          )}
          {toast.text}
          <button
            type="button"
            onClick={() => setToast(null)}
            className="ml-auto text-xs opacity-60 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Header + search ── */}
      <div className="lux-card flex flex-col gap-4 rounded-3xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400">
              <UsersIcon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-amber-400/70">
                ተጠቃሚዎች ዝርዝር
              </p>
              <h3 className="text-lg font-bold text-white">Users List</h3>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void mutate()}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-amber-500/40 hover:text-amber-300 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Quick stats */}
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Registered Users
            </p>
            <p className="mt-0.5 text-2xl font-black text-white">
              {users.length.toLocaleString()}
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-950/20 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-400/80">
              Total Tickets Bought
            </p>
            <p className="mt-0.5 text-2xl font-black text-emerald-300">
              {totalBought.toLocaleString()}
            </p>
          </div>
          <div className="rounded-2xl border border-amber-500/20 bg-amber-950/20 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-400/80">
              Awaiting Approval
            </p>
            <p className="mt-0.5 text-2xl font-black text-amber-300">
              {totalPending.toLocaleString()}
            </p>
          </div>
          <div className="rounded-2xl border border-rose-500/20 bg-rose-950/20 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-rose-400/80">
              Blocked Users
            </p>
            <p className="mt-0.5 text-2xl font-black text-rose-300">
              {blockedCount.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by username, phone number, Telegram ID or name…"
            className="lux-input rounded-2xl py-2.5 pl-10 pr-4 placeholder:text-slate-500"
          />
        </div>

        {errorText && !data && (
          <p className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-300">
            {errorText} — check that SUPABASE_SERVICE_ROLE_KEY is configured and the
            admin session is active.
          </p>
        )}
      </div>

      {/* ── Directory table ── */}
      <section className="lux-card overflow-hidden rounded-3xl">
        {loading && users.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin text-amber-400" />
            Loading users…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center">
            <UsersIcon className="h-10 w-10 text-slate-600" />
            <p className="text-sm text-slate-400">
              {users.length === 0
                ? 'No registered users yet — users appear here after they register through the bot or open the Mini App.'
                : 'No users match your search.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] uppercase tracking-[0.14em] text-slate-500">
                  <th className="px-5 py-3 font-semibold">Telegram ID</th>
                  <th className="px-5 py-3 font-semibold">Username</th>
                  <th className="px-5 py-3 font-semibold">Phone Number</th>
                  <th className="px-5 py-3 text-center font-semibold">Status</th>
                  <th className="px-5 py-3 text-center font-semibold">Wallet Balance</th>
                  <th className="px-5 py-3 text-center font-semibold">Tickets Bought</th>
                  <th className="px-5 py-3 text-center font-semibold">Pending</th>
                  <th className="px-5 py-3 font-semibold">Registered</th>
                  <th className="px-5 py-3 text-center font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((user) => (
                  <tr
                    key={user.id}
                    className={`border-b border-slate-800/60 transition last:border-0 hover:bg-white/[0.03] ${
                      user.isBlocked ? 'opacity-70' : ''
                    }`}
                  >
                    <td className="px-5 py-3.5">
                      <span className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-cyan-300">
                        <AtSign className="h-3.5 w-3.5 text-slate-600" />
                        {user.telegramId ?? '—'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-col">
                        <span className="font-semibold text-white">
                          {user.username
                            ? `@${String(user.username).replace(/^@/, '')}`
                            : user.fullName || '—'}
                        </span>
                        {user.fullName && user.username ? (
                          <span className="text-xs text-slate-500">{user.fullName}</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      {user.phoneNumber ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
                          <Phone className="h-3.5 w-3.5 text-slate-600" />
                          {user.phoneNumber}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-600">—</span>
                      )}
                    </td>
                    {/* Status badge */}
                    <td className="px-5 py-3.5 text-center">
                      {user.isBlocked ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-xs font-bold text-rose-300">
                          <Ban className="h-3 w-3" />
                          Blocked
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-300">
                          <CheckCircle2 className="h-3 w-3" />
                          Active
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                        <Wallet className="h-3.5 w-3.5 text-slate-600" />
                        {formatBirr(user.walletBalance)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-300">
                        <Ticket className="h-3.5 w-3.5" />
                        {(Number(user.ticketsBought) || 0).toLocaleString()}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      {(Number(user.ticketsPending) || 0) > 0 ? (
                        <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-bold text-amber-300">
                          {(Number(user.ticketsPending) || 0).toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-600">0</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                        <CalendarDays className="h-3.5 w-3.5 text-slate-600" />
                        {formatDate(user.createdAt)}
                      </span>
                    </td>
                    {/* Actions */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-center gap-2">
                        {/* View History button — copies the Telegram ID to clipboard
                            as a shortcut for the admin to paste into the Receipts
                            search, and dispatches an event to switch to receipts tab. */}
                        <button
                          type="button"
                          onClick={() => {
                            const chatId = user.telegramId || '';
                            if (chatId) {
                              navigator.clipboard.writeText(chatId).catch(() => {});
                            }
                            window.dispatchEvent(
                              new CustomEvent('admin:go-to-receipts', {
                                detail: { search: chatId },
                              })
                            );
                          }}
                          title="View this user's tickets / receipts history"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/30 bg-sky-500/10 px-2.5 py-1.5 text-xs font-semibold text-sky-300 transition hover:border-sky-400/50 hover:bg-sky-500/20"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          History
                        </button>
                        {/* Block / Unblock toggle */}
                        <button
                          type="button"
                          onClick={() => void handleToggleBlock(user)}
                          disabled={togglingId === user.id}
                          title={user.isBlocked ? 'Unblock this user' : 'Block this user'}
                          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                            user.isBlocked
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:border-emerald-400/50 hover:bg-emerald-500/20'
                              : 'border-rose-500/30 bg-rose-500/10 text-rose-300 hover:border-rose-400/50 hover:bg-rose-500/20'
                          }`}
                        >
                          {togglingId === user.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : user.isBlocked ? (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          ) : (
                            <Ban className="h-3.5 w-3.5" />
                          )}
                          {user.isBlocked ? 'Unblock' : 'Block'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {query.trim() && (
              <p className="border-t border-slate-800/60 px-5 py-3 text-xs text-slate-500">
                Showing {filtered.length} of {users.length} registered users.
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

