'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock3,
  Loader2,
  RefreshCw,
  Ticket,
  XCircle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { getTelegramUser } from '@/lib/tma';
import { useTelegram } from '@/components/app/telegram-provider';
import { useLanguage } from '@/components/app/language-provider';
import { resolveAppUserId } from '@/lib/user-identity';
import { getErrorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';

export type ReceiptHistoryEntry = {
  id: string;
  ticket_ids: string[];
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  /** Exact rejection reason provided by the admin (payments.rejection_reason). */
  rejection_reason: string | null;
  created_at: string;
};

const REFRESH_INTERVAL_MS = 30_000;
const COLLAPSED_TICKET_CHIPS = 6;

/**
 * Mini App "Profile → History" receipt list.
 *
 * Renders EVERY payment receipt the current visitor (Telegram user, Supabase
 * auth session, or persistent guest) submitted, newest first, with a live
 * status badge:
 *   • Rejected — red badge with the EXACT rejection_reason written by the
 *     admin (falls back to admin_note / a generic localized note).
 *   • Approved — green badge with the awarded ticket numbers.
 *   • Pending  — yellow badge while waiting for admin verification.
 *
 * Auto-refreshes every 30 seconds so an admin approve/reject decision shows
 * up without the user reloading the Mini App.
 */
export function ReceiptHistory({ onRetry }: { onRetry?: () => void }) {
  const { t } = useLanguage();
  const { user: telegramUser } = useTelegram();
  const [entries, setEntries] = useState<ReceiptHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    setError(null);
    try {
      // Same identity resolution as checkout / the other tabs:
      // Telegram → auth session → persistent guest id.
      const userId = await resolveAppUserId(telegramUser ?? getTelegramUser());

      const fetchFrom = async (columns: string) =>
        supabase
          .from('payments')
          .select(columns)
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

      // Preferred query includes rejection_reason (migration 019) + admin_note
      // (migration 011); each is dropped with a retry when the live schema has
      // not applied that migration yet.
      let query = await fetchFrom(
        'id, ticket_ids, amount, status, admin_note, rejection_reason, created_at',
      );
      if (query.error) {
        console.error(
          'ReceiptHistory: full query failed, retrying without rejection_reason:',
          getErrorMessage(query.error),
        );
        query = await fetchFrom('id, ticket_ids, amount, status, admin_note, created_at');
      }
      if (query.error) {
        console.error(
          'ReceiptHistory: query failed, retrying without admin_note:',
          getErrorMessage(query.error),
        );
        query = await fetchFrom('id, ticket_ids, amount, status, created_at');
      }
      if (query.error) throw query.error;

      const rows = (query.data ?? []) as unknown as Array<Record<string, unknown>>;
      const mapped = rows.map((row) => ({
        id: String(row.id),
        ticket_ids: Array.isArray(row.ticket_ids) ? row.ticket_ids.map(String) : [],
        amount: Number(row.amount) || 0,
        status:
          row.status === 'approved' || row.status === 'rejected'
            ? (row.status as ReceiptHistoryEntry['status'])
            : ('pending' as ReceiptHistoryEntry['status']),
        // Exact admin explanation — prefer the dedicated column (019), then
        // fall back to legacy admin_note (011).
        rejection_reason:
          typeof row.rejection_reason === 'string' && row.rejection_reason.trim()
            ? row.rejection_reason
            : typeof row.admin_note === 'string' && row.admin_note.trim()
              ? row.admin_note
              : null,
        created_at: String(row.created_at),
      }));
      setEntries(mapped);
    } catch (err) {
      console.error('ReceiptHistory: failed to load history:', getErrorMessage(err));
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [telegramUser]);

  // Initial load + refresh whenever the identity changes.
  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  // Keep in sync with admin decisions without a manual reload.
  useEffect(() => {
    const timer = setInterval(() => void loadHistory(), REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [loadHistory]);

  if (loading && entries.length === 0) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-text-secondary">
          <Loader2 className="h-8 w-8 animate-spin text-cyan" />
          <p className="text-sm">{t('pendingStatusAm')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Section header with manual refresh */}
      <div className="flex items-center justify-between rounded-2xl border border-card-border bg-card px-4 py-3">
        <h3 className="text-base font-bold text-white">{t('receiptHistory')}</h3>
        <button
          type="button"
          onClick={() => void loadHistory()}
          className="flex items-center gap-1.5 rounded-full border border-cyan/30 bg-cyan/10 px-3 py-1.5 text-xs font-semibold text-cyan-light transition hover:bg-cyan/20"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          {t('live')}
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {entries.length === 0 ? (
        <div className="rounded-2xl border border-card-border bg-card p-6 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-card-dark text-gold-dark">
            <Clock3 className="h-8 w-8" />
          </div>
          <h3 className="mt-5 text-xl font-bold text-white">{t('noHistory')}</h3>
        </div>
      ) : (
        entries.map((entry) => {
          const isPending = entry.status === 'pending';
          const isApproved = entry.status === 'approved';
          const isRejected = entry.status === 'rejected';
          const isExpanded = expandedId === entry.id;
          const visibleTickets = isExpanded
            ? entry.ticket_ids
            : entry.ticket_ids.slice(0, COLLAPSED_TICKET_CHIPS);
          const hiddenCount = entry.ticket_ids.length - visibleTickets.length;

          return (
            <div
              key={entry.id}
              className={cn(
                'rounded-2xl border bg-card p-4 shadow-card',
                isApproved && 'border-green-500/40',
                isRejected && 'border-red-500/40',
                isPending && 'border-yellow-500/40',
              )}
            >
              {/* Status badge + amount */}
              <div className="flex items-center justify-between gap-2">
                {isPending && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-yellow-500/40 bg-yellow-500/15 px-3 py-1 text-xs font-bold text-yellow-300">
                    <Clock3 className="h-3.5 w-3.5" />
                    {t('receiptStatusPending')}
                  </span>
                )}
                {isApproved && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-green-500/40 bg-green-500/15 px-3 py-1 text-xs font-bold text-green-300">
                    <CheckCircle className="h-3.5 w-3.5" />
                    {t('receiptStatusApproved')}
                  </span>
                )}
                {isRejected && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/15 px-3 py-1 text-xs font-bold text-red-300">
                    <XCircle className="h-3.5 w-3.5" />
                    {t('receiptStatusRejected')}
                  </span>
                )}
                <span className="text-sm font-bold text-gold-dark">
                  {entry.amount.toLocaleString()} ETB
                </span>
              </div>


              {/* Ticket numbers */}
              <div className="mt-3">
                <p className="mb-1.5 text-[10px] uppercase tracking-[0.2em] text-text-secondary">
                  {t('tickets')}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {visibleTickets.map((number) => (
                    <span
                      key={`${entry.id}-${number}`}
                      className={cn(
                        'rounded-lg border px-2 py-1 font-mono text-xs font-bold',
                        isApproved
                          ? 'border-green-500/40 bg-green-500/10 text-green-200'
                          : isRejected
                            ? 'border-slate-600 bg-card-dark text-slate-300'
                            : 'border-yellow-500/40 bg-yellow-500/10 text-yellow-200',
                      )}
                    >
                      {number}
                    </span>
                  ))}
                  {entry.ticket_ids.length === 0 && (
                    <span className="text-xs text-text-secondary">—</span>
                  )}
                  {hiddenCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setExpandedId(entry.id)}
                      className="rounded-lg border border-cyan/30 bg-cyan/10 px-2 py-1 text-xs font-bold text-cyan-light"
                    >
                      +{hiddenCount}
                    </button>
                  )}
                </div>
              </div>

              {/* Submission date */}
              <p className="mt-3 text-xs text-text-secondary">
                {t('submittedOn')}: {new Date(entry.created_at).toLocaleString()}
              </p>

              {/* Rejected: exact admin rejection reason + retry */}
              {isRejected && (
                <div className="mt-3 space-y-3">
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3">
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-red-400/80">
                      {t('rejectionReasonLabel')}
                    </p>
                    <p className="text-xs font-semibold leading-relaxed text-red-200">
                      {entry.rejection_reason?.trim() || t('rejectedNote')}
                    </p>
                  </div>
                  {onRetry && (
                    <button
                      type="button"
                      onClick={onRetry}
                      className="cyan-glow-button inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold"
                    >
                      <RefreshCw className="h-4 w-4" />
                      {t('retry')}
                    </button>
                  )}
                </div>
              )}

              {/* Approved: view tickets expander */}
              {isApproved && entry.ticket_ids.length > COLLAPSED_TICKET_CHIPS && (
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-green-500/40 bg-green-500/10 px-4 py-2.5 text-sm font-semibold text-green-300 transition hover:bg-green-500/20"
                >
                  <Ticket className="h-4 w-4" />
                  {t('viewTickets')}
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

