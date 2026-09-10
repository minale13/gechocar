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

export type PendingSubmission = {
  id: string;
  ticket_ids: string[];
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  admin_note: string | null;
  created_at: string;
};

const REFRESH_INTERVAL_MS = 30_000;
const COLLAPSED_TICKET_CHIPS = 6;

/**
 * Mini App "Pending Tickets" tab.
 *
 * Lists every receipt/payment the current visitor (Telegram user, Supabase
 * auth session, or persistent guest) submitted, with a live status badge:
 *   • Pending  — yellow badge, waiting for admin verification
 *   • Approved — green badge with a "View Tickets" expander
 *   • Rejected — red badge with the admin note (or a generic one) + "Try Again"
 *
 * Refreshes automatically every 30 seconds so admin approve/reject decisions
 * show up without the user reloading the Mini App. A manual refresh button
 * is also provided.
 */
export function PendingTickets({ onRetry }: { onRetry?: () => void }) {
  const { t } = useLanguage();
  const { user: telegramUser } = useTelegram();
  const [submissions, setSubmissions] = useState<PendingSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadSubmissions = useCallback(async () => {
    setError(null);
    try {
      // Same identity resolution as checkout: Telegram → auth session → guest.
      // A valid numeric id is ALWAYS returned (guests get a persistent local
      // id), so receipts submitted in local browser testing are retrievable.
      const userId = await resolveAppUserId(telegramUser ?? getTelegramUser());

      const fetchSubmissions = async (columns: string) =>
        supabase
          .from('payments')
          .select(columns)
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

      // Preferred query includes the admin rejection note (migration 011).
      let query = await fetchSubmissions(
        'id, ticket_ids, amount, status, admin_note, created_at',
      );

      if (query.error) {
        // The admin_note column may not exist yet (migration 011 not applied)
        // — retry without it instead of surfacing a broken error badge.
        console.error(
          'PendingTickets: full query failed, retrying without admin_note:',
          getErrorMessage(query.error),
        );
        query = await fetchSubmissions('id, ticket_ids, amount, status, created_at');
      }

      if (query.error) throw query.error;

      // Map rows explicitly (never spread raw objects into typed state).
      const rows = (query.data ?? []) as unknown as Array<Record<string, unknown>>;
      const mapped = rows.map((row) => ({
          id: String(row.id),
          ticket_ids: Array.isArray(row.ticket_ids) ? row.ticket_ids.map(String) : [],
          amount: Number(row.amount) || 0,
          status:
            row.status === 'approved' || row.status === 'rejected'
              ? (row.status as PendingSubmission['status'])
              : ('pending' as PendingSubmission['status']),
          admin_note: typeof row.admin_note === 'string' ? row.admin_note : null,
          created_at: String(row.created_at),
        }));

      // SUBMISSIONS TAB = PENDING ONLY. Strictly filter to status 'pending'
      // so receipts the admin has already approved/rejected automatically
      // disappear from this list on the next refresh (30s poll or manual).
      // Approved receipts are rendered by the MyTickets tab instead.
      setSubmissions(mapped.filter((s) => s.status === 'pending'));
    } catch (err) {
      // getErrorMessage never renders "[object Object]" — Supabase errors are
      // plain PostgrestError objects ({ message, code, details, hint }), not
      // Error instances, so String(err) would previously show [object Object].
      console.error('PendingTickets: failed to load submissions:', getErrorMessage(err));
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [telegramUser]);

  // Initial load + refresh whenever the tab identity changes.
  useEffect(() => {
    void loadSubmissions();
  }, [loadSubmissions]);

  // Keep in sync with admin decisions without a manual reload.
  useEffect(() => {
    const timer = setInterval(() => void loadSubmissions(), REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [loadSubmissions]);

  if (loading && submissions.length === 0) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
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
        <h3 className="text-base font-bold text-white">{t('mySubmissions')}</h3>
        <button
          type="button"
          onClick={() => void loadSubmissions()}
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

      {submissions.length === 0 ? (
        <div className="flex min-h-[360px] items-center justify-center">
          <div className="w-full rounded-2xl border border-card-border bg-card p-6 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-card-dark text-gold-dark">
              <Clock3 className="h-8 w-8" />
            </div>
            <h3 className="mt-5 text-xl font-bold text-white">{t('noPending')}</h3>
          </div>
        </div>
      ) : (
        submissions.map((submission) => {
          const isPending = submission.status === 'pending';
          const isApproved = submission.status === 'approved';
          const isRejected = submission.status === 'rejected';
          const isExpanded = expandedId === submission.id;
          const visibleTickets = isExpanded
            ? submission.ticket_ids
            : submission.ticket_ids.slice(0, COLLAPSED_TICKET_CHIPS);
          const hiddenCount = submission.ticket_ids.length - visibleTickets.length;

          return (
            <div
              key={submission.id}
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
                  {submission.amount.toLocaleString()} ETB
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
                      key={`${submission.id}-${number}`}
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
                  {submission.ticket_ids.length === 0 && (
                    <span className="text-xs text-text-secondary">—</span>
                  )}
                  {hiddenCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setExpandedId(submission.id)}
                      className="rounded-lg border border-cyan/30 bg-cyan/10 px-2 py-1 text-xs font-bold text-cyan-light"
                    >
                      +{hiddenCount}
                    </button>
                  )}
                </div>
              </div>

              {/* Submission date */}
              <p className="mt-3 text-xs text-text-secondary">
                {t('submittedOn')}: {new Date(submission.created_at).toLocaleString()}
              </p>

              {/* Approved: view tickets expander */}
              {isApproved && submission.ticket_ids.length > COLLAPSED_TICKET_CHIPS && (
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : submission.id)}
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

              {/* Rejected: admin note + retry */}
              {isRejected && (
                <div className="mt-3 space-y-3">
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
                    {submission.admin_note?.trim() || t('rejectedNote')}
                  </div>
                  <button
                    type="button"
                    onClick={onRetry}
                    className="cyan-glow-button inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold"
                  >
                    <RefreshCw className="h-4 w-4" />
                    {t('retry')}
                  </button>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
