'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle, Loader2, RefreshCw, Ticket } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { getTelegramUser } from '@/lib/tma';
import { useTelegram } from '@/components/app/telegram-provider';
import { useLanguage } from '@/components/app/language-provider';
import { resolveAppUserId } from '@/lib/user-identity';
import { getErrorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';

const REFRESH_INTERVAL_MS = 30_000;
const VISIBLE_TICKET_CHIPS = 12;

/** A payment receipt the admin has APPROVED — the user's actual tickets. */
export type ApprovedTicketBatch = {
  id: string;
  ticket_ids: string[];
  amount: number;
  created_at: string;
};

/**
 * Format a stored ticket id as the display code shown on ticket cards.
 * Numeric ids are zero-padded to 5 digits (e.g. 3 → "00003", matching the
 * selection grid); non-numeric ids are shown as-is. Rendered with a "#" prefix.
 */
const formatTicketCode = (raw: string) =>
  /^\d+$/.test(raw) ? raw.padStart(5, '0') : raw;

/**
 * Mini App "My Tickets" tab (ትኬቶች).
 *
 * Fetches every payment/receipt belonging to the current visitor (Telegram
 * user, Supabase auth session, or persistent guest) whose status is strictly
 * 'approved' and renders the owned ticket numbers as active ticket cards.
 *
 * Fetches on every mount — the home page unmounts tab content when switching,
 * so switching to this tab ALWAYS shows the latest approved tickets (seamless
 * state refresh after an admin approves a receipt). Also auto-refreshes every
 * 30 seconds and provides a manual refresh button.
 */
export function MyTickets() {
  const { t } = useLanguage();
  const { user: telegramUser } = useTelegram();
  const [batches, setBatches] = useState<ApprovedTicketBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadApprovedTickets = useCallback(async () => {
    setError(null);
    try {
      // Same identity resolution as the submissions tab / checkout:
      // Telegram → auth session → persistent guest id.
      const userId = await resolveAppUserId(telegramUser ?? getTelegramUser());

      const fetchApproved = async (columns: string) =>
        supabase
          .from('payments')
          .select(columns)
          .eq('user_id', userId)
          .eq('status', 'approved') // STRICTLY approved tickets in this tab
          .order('created_at', { ascending: false });

      // Preferred query includes admin_note for column-shape consistency with
      // the submissions tab; the column is not rendered here so a missing
      // admin_note column (migration 011 not applied) just falls back.
      let query = await fetchApproved(
        'id, ticket_ids, amount, status, admin_note, created_at',
      );

      if (query.error) {
        console.error(
          'MyTickets: full query failed, retrying without admin_note:',
          getErrorMessage(query.error),
        );
        query = await fetchApproved('id, ticket_ids, amount, status, created_at');
      }

      if (query.error) throw query.error;

      const rows = (query.data ?? []) as unknown as Array<Record<string, unknown>>;
      setBatches(
        rows.map((row) => ({
          id: String(row.id),
          ticket_ids: Array.isArray(row.ticket_ids) ? row.ticket_ids.map(String) : [],
          amount: Number(row.amount) || 0,
          created_at: String(row.created_at),
        })),
      );
    } catch (err) {
      console.error('MyTickets: failed to load approved tickets:', getErrorMessage(err));
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [telegramUser]);

  // Fetch on mount — tab switches remount this component, so the latest
  // approved receipts are always fetched when the user opens ትኬቶች.
  useEffect(() => {
    void loadApprovedTickets();
  }, [loadApprovedTickets]);

  // Keep in sync with admin approvals without a manual reload.
  useEffect(() => {
    const timer = setInterval(() => void loadApprovedTickets(), REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [loadApprovedTickets]);

  const totalTickets = batches.reduce((sum, b) => sum + b.ticket_ids.length, 0);

  if (loading && batches.length === 0) {
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
      {/* Section header with total + manual refresh */}
      <div className="flex items-center justify-between rounded-2xl border border-card-border bg-card px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-bold text-white">{t('tickets')}</h3>
          {totalTickets > 0 && (
            <span className="rounded-full border border-green-500/40 bg-green-500/15 px-2 py-0.5 text-xs font-bold text-green-300">
              {totalTickets}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => void loadApprovedTickets()}
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

      {batches.length === 0 ? (
        <div className="flex min-h-[360px] items-center justify-center">
          <div className="w-full rounded-2xl border border-card-border bg-card p-6 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-card-dark text-gold-dark">
              <Ticket className="h-8 w-8" />
            </div>
            <h3 className="mt-5 text-xl font-bold text-white">{t('noTickets')}</h3>
            <p className="mt-2 text-sm text-text-secondary">{t('waitingApproval')}</p>
          </div>
        </div>
      ) : (
        batches.map((batch) => {
          const isExpanded = expandedId === batch.id;
          const visibleTickets = isExpanded
            ? batch.ticket_ids
            : batch.ticket_ids.slice(0, VISIBLE_TICKET_CHIPS);
          const hiddenCount = batch.ticket_ids.length - visibleTickets.length;

          return (
            <div
              key={batch.id}
              className="rounded-2xl border border-green-500/40 bg-card p-4 shadow-card"
            >
              {/* Approved badge + amount */}
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-green-500/40 bg-green-500/15 px-3 py-1 text-xs font-bold text-green-300">
                  <CheckCircle className="h-3.5 w-3.5" />
                  {t('receiptStatusApproved')}
                </span>
                <span className="text-sm font-bold text-gold-dark">
                  {batch.amount.toLocaleString()} ETB
                </span>
              </div>

              {/* Active ticket numbers */}
              <div className="mt-3">
                <p className="mb-1.5 text-[10px] uppercase tracking-[0.2em] text-text-secondary">
                  {t('ticketNumbers')}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {visibleTickets.map((raw) => (
                    <span
                      key={`${batch.id}-${raw}`}
                      className="rounded-lg border border-green-500/40 bg-green-500/10 px-2.5 py-1.5 font-mono text-xs font-bold text-green-200"
                    >
                      #{formatTicketCode(raw)}
                    </span>
                  ))}
                  {batch.ticket_ids.length === 0 && (
                    <span className="text-xs text-text-secondary">—</span>
                  )}
                  {hiddenCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : batch.id)}
                      className="rounded-lg border border-cyan/30 bg-cyan/10 px-2 py-1 text-xs font-bold text-cyan-light"
                    >
                      {isExpanded ? t('viewTickets') : `+${hiddenCount}`}
                    </button>
                  )}
                </div>
              </div>

              {/* Submission date */}
              <p className="mt-3 text-xs text-text-secondary">
                {t('submittedOn')}: {new Date(batch.created_at).toLocaleString()}
              </p>
            </div>
          );
        })
      )}
    </div>
  );
}
