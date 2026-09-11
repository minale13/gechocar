'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Search, Sparkles, X } from 'lucide-react';
import { useLanguage } from '@/components/app/language-provider';
import { CheckoutModal } from '@/components/app/checkout-modal';
import { supabase } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

const DEFAULT_TICKET_PRICE = 2500;
const DEFAULT_TOTAL_TICKETS = 10000;

interface TicketSelectionProps {
  ticketPrice?: number;
  totalTickets?: number;
}

/** Pad a number to a 5-digit ticket string, e.g. 7 → "00007". */
const formatTicketNumber = (n: number) => String(n).padStart(5, '0');

/**
 * Fetch the live pending/sold status pool from BOTH data sources:
 *  1. public.tickets rows (status 'pending' | 'sold') — the authoritative
 *     reservation table written at checkout / admin approval time.
 *  2. public.payments receipts — a submitted receipt (status 'pending') locks
 *     its ticket_ids as pending while under admin review; an approved/sold
 *     receipt marks them sold. This guarantees numbers locked under review
 *     show the correct color even if the tickets row is missing or stale.
 */
async function fetchTicketStatuses(): Promise<Record<string, 'pending' | 'sold'>> {
  const next: Record<string, 'pending' | 'sold'> = {};

  // Primary source: tickets table.
  const { data, error } = await supabase
    .from('tickets')
    .select('ticket_number, status')
    .in('status', ['sold', 'pending']);
  if (error) {
    console.error('TicketSelection: tickets status fetch failed:', error.message);
  }
  (data ?? []).forEach((row) => {
    const num = String((row as { ticket_number?: unknown }).ticket_number ?? '');
    const status = (row as { status?: unknown }).status;
    if (num && (status === 'sold' || status === 'pending')) next[num] = status;
  });

  // Receipt source: payments table (non-fatal when unavailable).
  const { data: pRows, error: pError } = await supabase
    .from('payments')
    .select('ticket_ids, status');
  if (pError) {
    console.warn('TicketSelection: payments status fetch failed (non-fatal):', pError.message);
  }
  (pRows ?? []).forEach((row) => {
    const receipt = row as { ticket_ids?: unknown; status?: unknown };
    if (!Array.isArray(receipt.ticket_ids)) return;
    const receiptStatus = String(receipt.status ?? '').toLowerCase();
    const mapped =
      receiptStatus === 'approved' || receiptStatus === 'sold'
        ? 'sold'
        : receiptStatus === 'pending'
          ? 'pending'
          : null;
    if (!mapped) return;
    (receipt.ticket_ids as unknown[]).forEach((num) => {
      const n = String(num ?? '').trim();
      if (n) next[n] = mapped;
    });
  });

  return next;
}

export function TicketSelection({ ticketPrice, totalTickets }: TicketSelectionProps) {
  const { t } = useLanguage();
  const [selected, setSelected] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  // Live status pool: number → 'pending' | 'sold'. Every pending/sold number is
  // LOCKED — it cannot be selected by anyone else, and gets its own badge.
  const [ticketStatuses, setTicketStatuses] = useState<Record<string, 'pending' | 'sold'>>({});

  const price = ticketPrice && ticketPrice > 0 ? ticketPrice : DEFAULT_TICKET_PRICE;
  const total = totalTickets && totalTickets > 0 ? totalTickets : DEFAULT_TOTAL_TICKETS;

  // Generate the full pool of ticket numbers dynamically from totalTickets
  // (managed in /admin → App Settings → Total Available Tickets).
  const availableNumbers = useMemo(
    () => Array.from({ length: total }, (_, i) => formatTicketNumber(i + 1)),
    [total]
  );

  // Load sold / pending ticket numbers from Supabase so they can't be
  // re-selected, and keep polling so numbers LOCKED by another buyer's
  // submitted receipt appear locked here within seconds (no manual refresh).
  useEffect(() => {
    let cancelled = false;

    const loadTicketStatuses = async () => {
      const next = await fetchTicketStatuses();
      if (!cancelled) setTicketStatuses(next);
    };

    void loadTicketStatuses();
    const interval = setInterval(() => void loadTicketStatuses(), 15_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const isPending = (number: string) => ticketStatuses[number] === 'pending';
  const isSold = (number: string) => ticketStatuses[number] === 'sold';
  const isTaken = (number: string) => isPending(number) || isSold(number);
  const pendingCount = Object.values(ticketStatuses).filter((s) => s === 'pending').length;
  const soldCount = Object.values(ticketStatuses).filter((s) => s === 'sold').length;

  const grandTotal = useMemo(() => selected.length * price, [selected, price]);

  const filteredNumbers = useMemo(() => {
    if (!searchQuery.trim()) return availableNumbers;
    return availableNumbers.filter((num) => num.includes(searchQuery.trim()));
  }, [searchQuery, availableNumbers]);

  // ONLY available tickets can be toggled — pending (under admin review) and
  // sold/approved tickets are hard-blocked here AND at checkout submission.
  const toggleNumber = (number: string) => {
    if (isTaken(number)) return;
    setSelected((current) =>
      current.includes(number) ? current.filter((item) => item !== number) : [...current, number]
    );
  };

  const quickPick = () => {
    const available = availableNumbers.filter((num) => !isTaken(num) && !selected.includes(num));
    if (available.length === 0) return;
    const picks = available.slice(0, 5);
    setSelected((current) => [...current, ...picks]);
  };

  const clearSelection = () => setSelected([]);

  const openCheckout = () => {
    if (selected.length === 0) return;
    setIsCheckoutOpen(true);
  };

  const handleCheckoutComplete = () => {
    setSelected([]);
    setIsCheckoutOpen(false);
  };

  const handleCheckoutClose = () => setIsCheckoutOpen(false);

  // If the checkout detects a number was just taken by another buyer, drop it
  // from the selection and immediately refresh the live status pool.
  const handleSelectionInvalid = (takenNumbers: string[]) => {
    const taken = new Set(takenNumbers);
    setSelected((current) => current.filter((num) => !taken.has(num)));
    void (async () => {
      setTicketStatuses(await fetchTicketStatuses());
    })();
  };

  return (
    // pb-28 reserves scroll space below the number grid so the floating
    // Checkout summary bar never hides the last rows of numbers or sits on top
    // of the bottom navigation.
    <div className={cn("space-y-4", selected.length > 0 && "pb-28")}>
      {/* Number Grid */}
      <div className="rounded-2xl border border-cyan/30 bg-card p-4 shadow-cyan-glow-soft">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-white">{t('step1Title')}</h3>
            <p className="mt-1 text-xs text-text-secondary">
              {t('ticketPrice')}: <span className="font-bold text-cyan">{price.toLocaleString()} {t('etb')}</span>
              {' · '}
              {t('totalTicketsShort') || 'Total'}: <span className="font-bold text-cyan">{total}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={quickPick}
              className="flex items-center gap-1.5 rounded-xl border border-cyan/30 bg-cyan/10 px-3 py-2 text-xs font-semibold text-cyan-light transition hover:bg-cyan/20 hover:shadow-cyan-glow-soft"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {t('quickPick')}
            </button>
            {selected.length > 0 && (
              <button
                onClick={clearSelection}
                className="flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300 transition hover:bg-red-500/20"
              >
                <X className="h-3.5 w-3.5" />
                {t('reset')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('searchTicket')}
          className="w-full rounded-xl border border-cyan/30 bg-card-dark py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-text-secondary focus:border-cyan/60 focus:shadow-cyan-glow-soft focus:outline-none"
        />
      </div>

      {/* Selected / Available counts */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-text-secondary">
          {t('selected')}: <span className="font-bold text-gold-light">{selected.length}</span>
        </span>
        <span className="text-text-secondary">
          {t('available')}: <span className="font-bold text-white">
            {Math.max(0, total - soldCount - pendingCount)}
          </span>
        </span>
      </div>

      {/* Ticket Number Grid — color-coded by status:
          • Available → clean green accent (selectable)
          • Pending   → orange/yellow + "Pending" badge (locked, non-clickable)
          • Sold      → dark red/grayed + "Sold" badge (locked, non-clickable) */}
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
        {filteredNumbers.map((number) => {
          const isPendingNumber = isPending(number);
          const isSoldNumber = isSold(number);
          const locked = isPendingNumber || isSoldNumber;
          const isSelected = selected.includes(number);

          return (
            <button
              key={number}
              type="button"
              disabled={locked}
              onClick={() => toggleNumber(number)}
              aria-pressed={isSelected}
              title={locked ? t('unavailable') : isSelected ? t('selected') : t('available')}
              className={cn(
                'relative flex h-11 items-center justify-center rounded-xl border text-xs font-bold tracking-wide transition-all duration-150 active:scale-95',
                locked && 'cursor-not-allowed',
                isPendingNumber &&
                  'border-orange-500/50 bg-orange-500/10 text-orange-300',
                isSoldNumber &&
                  'border-red-900/80 bg-red-950/50 text-red-400/80 line-through',
                !locked &&
                  !isSelected &&
                  'border-emerald-500/30 bg-card text-slate-200 hover:-translate-y-0.5 hover:border-emerald-400/60 hover:bg-emerald-500/10 hover:text-emerald-100',
                isSelected &&
                  'border-cyan bg-cyan-gradient text-background shadow-cyan-glow-strong'
              )}
            >
              {isPendingNumber && (
                <span className="absolute -right-1 -top-2 rounded-md bg-orange-500 px-1 py-0.5 text-[8px] font-black uppercase tracking-wide text-slate-950">
                  {t('pendingStatus')}
                </span>
              )}
              {isSoldNumber && (
                <span className="absolute -right-1 -top-2 rounded-md bg-red-700 px-1 py-0.5 text-[8px] font-black uppercase tracking-wide text-white">
                  {t('sold')}
                </span>
              )}
              {isSelected && (
                <Check className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full bg-background p-0.5 text-cyan-dark" />
              )}
              {number}
            </button>
          );
        })}
      </div>

      {filteredNumbers.length === 0 && (
        <div className="rounded-xl border border-dashed border-card-border bg-card-dark p-6 text-center text-sm text-text-secondary">
          {t('noNumbersSelected')}
        </div>
      )}

      {/* Floating Continue Bar — fixed cleanly above the bottom nav.
          Glassmorphism backdrop with clear Selected / Total text and a vibrant
          gold-gradient Continue CTA. Non-scrolling overlay with proper spacing. */}
      {selected.length > 0 && (
        <div className="fixed inset-x-0 bottom-20 z-40 px-4 pb-2">
          <div className="mx-auto flex w-full max-w-md flex-col gap-3 rounded-2xl border border-gold/40 bg-slate-900/95 p-4 shadow-[0_-4px_24px_rgba(0,0,0,0.45)] backdrop-blur-md sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <div className="flex items-center gap-1.5">
                <span className="whitespace-nowrap text-xs font-medium uppercase tracking-wide text-text-secondary">
                  {t('selected')}
                </span>
                <span className="inline-flex items-center justify-center rounded-lg bg-cyan/20 px-2 py-0.5 text-base font-black text-cyan-light">
                  {selected.length}
                </span>
              </div>
              <span className="hidden h-6 w-px bg-slate-600/60 sm:block" />
              <div className="flex items-baseline gap-1.5">
                <span className="whitespace-nowrap text-xs font-medium uppercase tracking-wide text-text-secondary">
                  {t('total')}
                </span>
                <span className="whitespace-nowrap text-xl font-black leading-none text-gold-light">
                  {grandTotal.toLocaleString()}{' '}
                  <span className="text-sm font-bold text-gold-light/80">{t('etb')}</span>
                </span>
              </div>
            </div>
            <button
              onClick={openCheckout}
              className="flex w-full flex-shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-gradient-to-r from-emerald-600 via-emerald-500 to-[#00FF87] px-6 py-3 text-base font-black text-background shadow-[0_4px_16px_rgba(16,185,129,0.4)] transition hover:brightness-110 active:scale-[0.97] sm:w-auto"
            >
              {t('continueBtn')}
            </button>
          </div>
        </div>
      )}

      {/* Checkout Modal — handles dynamic bank accounts, receipt upload & Supabase submission */}
      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={handleCheckoutClose}
        selectedNumbers={selected}
        onComplete={handleCheckoutComplete}
        ticketPrice={price}
        onSelectionInvalid={handleSelectionInvalid}
      />
    </div>
  );
}