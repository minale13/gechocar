'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  CheckCheck,
  CheckCircle2,
  Clock3,
  Eye,
  FileSearch,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import type { Receipt } from '@/components/admin/types';
import { receiptUserLabel } from '@/components/admin/types';
import { useToast } from '@/components/admin/toast';
import { useLanguage } from '@/components/app/language-provider';
import { SafeImage } from '@/components/admin/safe-image';

type Props = {
  pendingReceipts: Receipt[];
  approvedReceipts: Receipt[];
  approve: (id: string) => Promise<boolean>;
  decline: (id: string, note?: string) => Promise<boolean>;
  loading: boolean;
  /** True when more (older) receipts exist beyond the loaded page. */
  hasMoreReceipts?: boolean;
  /** True while the next page is loading (SWR isValidating). */
  loadingMoreReceipts?: boolean;
  /** Grows the SWR page size (Load more pagination). */
  onLoadMoreReceipts?: () => void;
  /** How many receipt rows are currently loaded. */
  receiptsLoadedCount?: number;
  /** Exact payments-table count across ALL statuses. */
  receiptsTotalCount?: number;
};

/**
 * 📥 Pending Receipts management — luxury grid of payment submissions with
 * search/filter, high-res lightbox inspection, one-click approval and a
 * rejection modal with an optional reason (released back to the pool).
 */
export function ReceiptsTab({
  pendingReceipts,
  approvedReceipts,
  approve,
  decline,
  loading,
  hasMoreReceipts = false,
  loadingMoreReceipts = false,
  onLoadMoreReceipts,
  receiptsLoadedCount,
  receiptsTotalCount,
}: Props) {
  const { t } = useLanguage();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<Receipt | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Receipt | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [rejectBusy, setRejectBusy] = useState(false);
  // Distinct filtered views: "Pending Approvals" (receipts awaiting action) and
  // "Sold Tickets" (fully approved + verified with receipt + user details).
  const [activeSection, setActiveSection] = useState<'pending' | 'sold'>('pending');

  const matches = useCallback(
    (receipt: Receipt) => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return (
        receiptUserLabel(receipt).toLowerCase().includes(q) ||
        String(receipt.user_id).includes(q) ||
        // Buyer attribution (migration 024): registered phone + telegram id.
        String(receipt.phone_number ?? '').includes(q) ||
        String(receipt.telegram_id ?? '').includes(q) ||
        receipt.ticket_ids.some((n) => n.toLowerCase().includes(q)) ||
        (receipt.transaction_reference ?? '').toLowerCase().includes(q)
      );
    },
    [query],
  );

  const filteredPending = useMemo(() => pendingReceipts.filter(matches), [pendingReceipts, matches]);
  const filteredApproved = useMemo(
    () => approvedReceipts.filter(matches),
    [approvedReceipts, matches],
  );

  /** ✅ Approve directly from the card / lightbox. */
  const handleApprove = async (id: string) => {
    setBusyId(id);
    try {
      const ok = await approve(id);
      if (ok) {
        toast.push('success', 'Ticket approved — numbers assigned to the user ✓');
        if (lightbox?.id === id) setLightbox(null);
      }
    } finally {
      setBusyId(null);
    }
  };

  /** ❌ Reject from the modal with the required reason → releases reserved tickets. */
  const handleReject = async () => {
    if (!rejectTarget) return;
    if (!rejectNote.trim()) {
      toast.push('error', 'Please enter a rejection reason — it is shown to the user.');
      return;
    }
    setRejectBusy(true);
    try {
      const ok = await decline(rejectTarget.id, rejectNote.trim());
      if (ok) {
        toast.push('success', 'Request rejected — reserved tickets released back to the pool');
        setRejectTarget(null);
        setRejectNote('');
        if (lightbox?.id === rejectTarget.id) setLightbox(null);
      }
    } finally {
      setRejectBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Search / filter bar */}
      <div className="lux-card flex flex-col gap-3 rounded-3xl p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by user, phone, Telegram ID, ticket number or reference…"
            className="lux-input rounded-2xl py-2.5 pl-10 pr-4 placeholder:text-slate-500"
          />
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold">
          <span className="badge-glow-pending rounded-full px-3 py-1.5">
            {filteredPending.length} pending
          </span>
          <span className="badge-glow-available rounded-full px-3 py-1.5">
            {filteredApproved.length} approved
          </span>
        </div>
      </div>

      {/* Pending Approvals / Sold Tickets tabs */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActiveSection('pending')}
          className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition ${
            activeSection === 'pending'
              ? 'lux-nav-active'
              : 'border border-slate-700/80 bg-slate-950/60 text-slate-400 hover:border-amber-500/40 hover:text-white'
          }`}
        >
          <Clock3 className="h-3.5 w-3.5" />
          Pending Approvals
          <span className="rounded-full bg-slate-950/60 px-1.5 py-0.5 text-[10px]">
            {filteredPending.length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActiveSection('sold')}
          className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition ${
            activeSection === 'sold'
              ? 'border border-emerald-500/60 bg-emerald-500/15 text-emerald-300 shadow-[0_0_16px_rgba(52,211,153,0.25)]'
              : 'border border-slate-700/80 bg-slate-950/60 text-slate-400 hover:border-emerald-500/40 hover:text-white'
          }`}
        >
          <CheckCheck className="h-3.5 w-3.5" />
          Sold Tickets
          <span className="rounded-full bg-slate-950/60 px-1.5 py-0.5 text-[10px]">
            {filteredApproved.length}
          </span>
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin text-amber-400" />
          Loading submissions…
        </div>
      )}

      {/* Pending submissions grid — only when the Pending Approvals tab is active */}
      {activeSection === 'pending' && (
        <section>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.18em] text-amber-400/90">
            <Clock3 className="h-4 w-4" />
            Pending Approvals
          </h3>
        {!loading && filteredPending.length === 0 ? (
          <div className="lux-card flex flex-col items-center gap-2 rounded-3xl border border-dashed border-slate-700 p-10 text-center">
            <FileSearch className="h-10 w-10 text-slate-600" />
            <p className="text-sm text-slate-400">
              {pendingReceipts.length === 0
                ? 'No pending receipts — the queue is clear.'
                : 'No submissions match your search.'}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {filteredPending.map((receipt) => (
              <article
                key={receipt.id}
                className="lux-card flex flex-col gap-4 rounded-3xl p-4 transition hover:border-amber-500/40 sm:flex-row"
              >
                {/* Screenshot preview → lightbox */}
                <button
                  type="button"
                  onClick={() => setLightbox(receipt)}
                  className="group relative h-32 w-full flex-shrink-0 overflow-hidden rounded-2xl border border-slate-700 sm:h-auto sm:w-36"
                  aria-label="Inspect payment receipt"
                >
                  {receipt.receipt_url ? (
                    <>
                      <SafeImage
                        src={receipt.receipt_url}
                        alt="Payment receipt"
                        className="h-full w-full object-cover transition group-hover:scale-105"
                        fallbackClassName="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-slate-900 text-slate-500"
                        fallbackLabel="Receipt failed to load"
                      />
                      <span className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition group-hover:opacity-100">
                        <Eye className="h-6 w-6 text-white" />
                      </span>
                    </>
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-xs text-slate-600">
                      No screenshot
                    </span>
                  )}
                </button>

                {/* Details + actions */}
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-white">
                        {receiptUserLabel(receipt)}
                      </p>
                      <p className="text-xs text-slate-500">
                        Telegram ID: {receipt.user_id} ·{' '}
                        {new Date(receipt.created_at).toLocaleString()}
                      </p>
                      {/* Registered phone (migration 024) — hidden when the
                          payments row predates the attribution columns. */}
                      {receipt.phone_number && (
                        <p className="mt-0.5 flex items-center gap-1 truncate text-xs font-semibold text-emerald-300">
                          📱 {receipt.phone_number}
                        </p>
                      )}
                    </div>
                    <span className="badge-glow-pending flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-bold">
                      {receipt.amount.toLocaleString()} ETB
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {receipt.ticket_ids.map((number) => (
                      <span
                        key={`${receipt.id}-${number}`}
                        className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 font-mono text-xs font-bold text-sky-200"
                      >
                        {number}
                      </span>
                    ))}
                    {receipt.ticket_ids.length === 0 && (
                      <span className="text-xs text-slate-600">No ticket numbers</span>
                    )}
                  </div>

                  {receipt.transaction_reference && (
                    <p className="mt-2 font-mono text-[11px] text-slate-500">
                      Ref: {receipt.transaction_reference}
                    </p>
                  )}

                  <div className="mt-auto flex gap-2 pt-3">
                    <button
                      type="button"
                      onClick={() => void handleApprove(receipt.id)}
                      disabled={busyId === receipt.id}
                      className="btn-lux-gold flex-1 px-3 py-2 text-xs"
                    >
                      {busyId === receipt.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      Approve Ticket
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRejectTarget(receipt);
                        setRejectNote('');
                      }}
                      disabled={busyId === receipt.id}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-red-500/50 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-300 shadow-[0_0_18px_rgba(239,68,68,0.2)] transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <XCircle className="h-4 w-4" />
                      Reject Request
                    </button>
                  </div>
                </div>
              </article>
            ))}

          </div>
        )}
        </section>
      )}

      {/* Approved / Sold submissions — only when the Sold Tickets tab is active */}
      {activeSection === 'sold' && (
        <section>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.18em] text-emerald-400/90">
            <CheckCheck className="h-4 w-4" />
            Sold Tickets
          </h3>
        {!loading && filteredApproved.length === 0 ? (
          <div className="lux-card rounded-3xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-400">
            {approvedReceipts.length === 0
              ? 'No approved receipts yet.'
              : 'No approved receipts match your search.'}
          </div>
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {filteredApproved.map((receipt) => (
              <div
                key={receipt.id}
                className="lux-card flex items-center gap-3 rounded-2xl p-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-white">
                    {receiptUserLabel(receipt)}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {receipt.ticket_ids.join(', ')} · {receipt.amount.toLocaleString()} ETB ·{' '}
                    {new Date(receipt.created_at).toLocaleString()}
                  </p>
                  {/* Registered phone (migration 024) — hidden when absent. */}
                  {receipt.phone_number && (
                    <p className="mt-0.5 flex items-center gap-1 truncate text-xs font-semibold text-emerald-300">
                      📱 {receipt.phone_number}
                    </p>
                  )}
                </div>
                <span className="badge-glow-available flex flex-shrink-0 items-center gap-1 rounded-full px-3 py-1 text-xs font-bold">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {t('verified')}
                </span>
              </div>
            ))}
          </div>
        )}
        </section>
      )}

      {/* ── High-res lightbox ── */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[150] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="lightbox-in flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-amber-500/30 bg-[#0B0F19] shadow-[0_0_60px_rgba(212,175,55,0.18)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-white">
                  {receiptUserLabel(lightbox)}
                </p>
                <p className="text-xs text-slate-500">
                  ID {lightbox.user_id} · {lightbox.amount.toLocaleString()} ETB ·{' '}
                  {new Date(lightbox.created_at).toLocaleString()}
                </p>
                {/* Registered phone (migration 024) — hidden when absent. */}
                {lightbox.phone_number && (
                  <p className="mt-0.5 text-xs font-semibold text-emerald-300">
                    📱 {lightbox.phone_number}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setLightbox(null)}
                className="rounded-full border border-slate-700 p-1.5 text-slate-300 transition hover:text-white"
                aria-label="Close lightbox"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-4">
              {lightbox.receipt_url ? (
                <SafeImage
                  src={lightbox.receipt_url}
                  alt="Payment receipt (full resolution)"
                  className="mx-auto max-h-[60vh] w-auto max-w-full rounded-2xl border border-slate-800 object-contain"
                  fallbackClassName="mx-auto flex min-h-[240px] w-full max-w-md flex-col items-center justify-center gap-2 rounded-2xl border border-slate-800 bg-slate-900 text-slate-500"
                  fallbackLabel="Receipt photo failed to load — it may have been removed from storage"
                />
              ) : (
                <p className="py-10 text-center text-sm text-slate-500">
                  No screenshot attached to this submission.
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-1.5">
                {lightbox.ticket_ids.map((number) => (
                  <span
                    key={`lb-${number}`}
                    className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-2 py-1 font-mono text-xs font-bold text-sky-200"
                  >
                    {number}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex gap-3 border-t border-slate-800 p-4">
              <button
                type="button"
                onClick={() => void handleApprove(lightbox.id)}
                disabled={busyId === lightbox.id}
                className="btn-lux-gold flex-1 px-4 py-3 text-sm"
              >
                {busyId === lightbox.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Approve Ticket
              </button>
              <button
                type="button"
                onClick={() => {
                  setRejectTarget(lightbox);
                  setRejectNote('');
                }}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-300 transition hover:bg-red-500/20"
              >
                <ShieldAlert className="h-4 w-4" />
                Reject Request
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Load more (paginated receipts — initial page is .limit(20)) ── */}
      {hasMoreReceipts && onLoadMoreReceipts && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={onLoadMoreReceipts}
            disabled={loadingMoreReceipts}
            className="flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-amber-500/40 hover:text-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loadingMoreReceipts ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Load more receipts
            {typeof receiptsLoadedCount === 'number' && typeof receiptsTotalCount === 'number'
              ? ` (${receiptsLoadedCount}/${receiptsTotalCount})`
              : ''}
          </button>
        </div>
      )}

      {/* ── Rejection reason modal ── */}
      {rejectTarget && (
        <div
          className="fixed inset-0 z-[160] flex items-center justify-center bg-black/80 p-4"
          onClick={() => !rejectBusy && setRejectTarget(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="lightbox-in w-full max-w-md rounded-3xl border border-red-500/30 bg-slate-950 p-6 shadow-[0_0_50px_rgba(239,68,68,0.15)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-500/15 text-red-400">
                <XCircle className="h-5 w-5" />
              </span>
              <div>
                <h4 className="text-base font-bold text-white">Reject this request?</h4>
                <p className="text-xs text-slate-500">
                  {receiptUserLabel(rejectTarget)} · {rejectTarget.ticket_ids.join(', ')}
                </p>
              </div>
            </div>
            <label className="mt-4 block">
              <span className="mb-1 block text-xs font-medium text-slate-400">
                Rejection reason{' '}
                <span className="font-bold text-red-400">(required)</span> — shown to the user in
                the Mini App
              </span>
              <textarea
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                rows={3}
                required
                placeholder="e.g. Invalid transaction reference / Blurred receipt"
                className="w-full resize-none rounded-2xl border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-red-500/50 focus:ring-2 focus:ring-red-500/20"
              />
            </label>
            <p className="mt-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-200/80">
              Reserved ticket numbers will be released back to the available pool.
            </p>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => setRejectTarget(null)}
                disabled={rejectBusy}
                className="flex-1 rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-white/5 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleReject()}
                disabled={rejectBusy || !rejectNote.trim()}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-bold text-white shadow-[0_0_18px_rgba(239,68,68,0.4)] transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {rejectBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                Reject Request
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
