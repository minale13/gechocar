'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Grid3X3,
  Hash,
  Loader2,
  PackagePlus,
  Pencil,
  Phone,
  Plus,
  Send,
  StickyNote,
  Ticket,
  Trash2,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { toDbUserId } from '@/lib/user-identity';
import { useToast } from '@/components/admin/toast';
import { PRIZE_RANK_OPTIONS } from '@/components/admin/types';
import type { RaffleItem } from '@/components/admin/types';
import { SafeImage } from '@/components/admin/safe-image';
import {
  isTicketsTableUnavailableError,
  reloadPgrstSchema,
} from '@/lib/supabase/schema-cache';

export type ItemFormShape = {
  title: string;
  /** Prize rank — 1-5 for the main draws, 6 = መጽናኛ (Consolation). */
  rank: number;
  description: string;
  imageUrl: string;
  location: string;
  /**
   * Draw date/time for this lottery (ISO string, "" when unset).
   *
   * NOTE: Ticket Price & Total Tickets are intentionally NOT part of the form
   * — they are strictly inherited from the global App Settings (app_settings
   * row id = 1) at save time, so a prize can never carry per-draw values.
   */
  drawDatetime: string;
};

type Props = {
  totalTickets: number;
  /** Ticket price (ETB) — used to compute the amount for an offline sale recorded
   * as an approved receipt when the tickets table is missing from the schema cache. */
  ticketPrice?: number;
  savedItems: RaffleItem[];
  itemForm: ItemFormShape;
  onItemChange: (field: keyof ItemFormShape, value: string | number) => void;
  saveItem: () => void | Promise<void>;
  resetItemForm: () => void;
  editItem: (item: RaffleItem) => void;
  deleteItem: (itemId: string) => void | Promise<void>;
  uploadingImage: boolean;
  onImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void | Promise<void>;
  postingToTelegramId: string | null;
  postItemToTelegram: (itemId: string) => void | Promise<void>;
  savingItem: boolean;
  selectedItemId: string | null;
  /**
   * Offline (manual) sales: the component validates + writes the sold ticket
   * numbers itself and reports the count so the parent can keep the session
   * total for the Overview stats.
   */
  onManualSaleRecorded: (count: number) => void;
  manualTicketsSold: number;
};

type TicketStatus = 'available' | 'pending' | 'sold';
// Maximum number of ticket tiles rendered at once. Set to 10000 (the full
// ticket pool) so admins can see every ticket — search and status filters
// let them pinpoint specific numbers without a "load more" paging step.
const MATRIX_RENDER_PAGE = 10000;

// Maximum ticket numbers accepted per offline (manual) sale — mirrors the
// old quantity-incrementer cap.
const MANUAL_SALE_MAX = 100;

type ParsedTickets = { numbers: string[]; invalid: string[] };

/**
 * Parse a manual ticket input like "0042" or "0005, 0006 0007" into
 * normalized 5-digit numbers + any invalid (non-numeric) tokens.
 */
function parseManualTicketInput(raw: string): ParsedTickets {
  const numbers = new Set<string>();
  const invalid: string[] = [];
  raw
    .split(/[,\s;]+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .forEach((token) => {
      if (/^\d{1,5}$/.test(token)) numbers.add(token.padStart(5, '0'));
      else invalid.push(token);
    });
  return { numbers: Array.from(numbers), invalid };
}

/** True when a write failed because the buyer columns (migration 018) are missing. */
function isMissingBuyerColumnError(err: { message?: string } | null | undefined): boolean {
  const msg = (err?.message ?? '').toLowerCase();
  return msg.includes('buyer_phone') || msg.includes('buyer_note');
}

/**
 * True when a payments write failed because an OPTIONAL payments column is
 * missing from the live table / PostgREST schema cache — e.g.
 *   "Could not find the 'transaction_reference' column of 'payments' in the
 *    schema cache" (PGRST204 / SQLSTATE 42703).
 * This happens on databases initialized before migrations 003/008/010 added
 * transaction_reference. The safe fix is to retry the insert WITHOUT the
 * optional columns (user_id, ticket_ids, amount, status always exist).
 */
function isMissingPaymentsColumnError(
  err: { message?: string; code?: string; details?: string } | null | undefined,
): boolean {
  const pieces = [err?.message, err?.details, err?.code].filter(Boolean);
  const msg = pieces.join(' ').toLowerCase();
  return (
    msg.includes('transaction_reference') ||
    msg.includes('receipt_url') ||
    msg.includes('admin_note') ||
    msg.includes('could not find the') ||
    msg.includes('schema cache') ||
    msg.includes('pgrst204') ||
    msg.includes('42703')
  );
}

/** ISO string → "YYYY-MM-DDTHH:mm" for <input type="datetime-local">. */
function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 🎟️ Ticket Matrix & Sales — live availability grid + raffle items + manual sales. */
export function TicketsTab({
  totalTickets,
  ticketPrice,
  savedItems,
  itemForm,
  onItemChange,
  saveItem,
  resetItemForm,
  editItem,
  deleteItem,
  uploadingImage,
  onImageUpload,
  postingToTelegramId,
  postItemToTelegram,
  savingItem,
  selectedItemId,
  onManualSaleRecorded,
  manualTicketsSold,
}: Props) {
  const toast = useToast();
  const [matrix, setMatrix] = useState<Map<string, TicketStatus>>(new Map());
  const [matrixLoading, setMatrixLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | TicketStatus>('all');
  // Render window for the grid — 10000 matches the full ticket pool so every
  // ticket is visible at once (no "load more" step needed for full scans).
  const [renderLimit, setRenderLimit] = useState(MATRIX_RENDER_PAGE);

  // ── Offline (manual) sale state ──
  // selectedManualTickets is the click-to-select MULTI-selection: clicking any
  // 'Available' tile in the Ticket Matrix toggles it in/out of this array, and
  // the entire array is recorded as ONE batch sale. manualTicketInput is only
  // an auxiliary "add by number" field (accepts "0042" or "0005, 0006") that
  // merges into the same array — there is no single-search / one-ticket
  // constraint. buyerPhone/buyerNotes are optional offline-buyer details
  // persisted to tickets.buyer_phone / tickets.buyer_note.
  const [selectedManualTickets, setSelectedManualTickets] = useState<string[]>([]);
  const [manualTicketInput, setManualTicketInput] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [buyerNotes, setBuyerNotes] = useState('');
  const [recordingSale, setRecordingSale] = useState(false);

  // Load live ticket statuses and keep polling so an admin approval/rejection
  // (which flips ticket rows between pending and sold) shows up across the
  // platform without a manual reload. Status is derived from BOTH the tickets
  // table AND the payments (receipts) table so pending/sold counts reflect
  // submitted receipts even if ticket rows drift or are missing.
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const map = new Map<string, TicketStatus>();

      // PRIMARY SOURCE (RLS-proof): GET /api/admin/ticket-matrix reads BOTH the
      // tickets table AND the payments receipts through the SERVICE-ROLE admin
      // client (bypasses Row Level Security). This fixes the "missing ticket
      // data" issue where an RLS-restricted anon-key read of public.tickets
      // silently returned ZERO rows and every tile rendered as 'available'
      // even though pending/sold rows existed.
      try {
        const res = await fetch('/api/admin/ticket-matrix', { cache: 'no-store' });
        const json = await res.json().catch(() => null);
        if (res.ok && json?.success && json?.data) {
          const ticketRows = (json.data.ticketRows ?? []) as Array<{
            ticket_number?: unknown;
            status?: unknown;
          }>;
          const paymentRows = (json.data.paymentRows ?? []) as Array<{
            ticket_ids?: unknown;
            status?: unknown;
          }>;

          ticketRows.forEach((row) => {
            if (row && typeof row.ticket_number === 'string') {
              const status = String(row.status ?? '').toLowerCase();
              if (status === 'pending' || status === 'sold') {
                map.set(row.ticket_number, status as TicketStatus);
              }
            }
          });

          paymentRows.forEach((row) => {
            if (row && Array.isArray(row.ticket_ids)) {
              const receiptStatus = String(row.status ?? '').toLowerCase();
              const mapped =
                receiptStatus === 'approved' || receiptStatus === 'sold'
                  ? 'sold'
                  : receiptStatus === 'pending'
                    ? 'pending'
                    : null;
              if (mapped) {
                (row.ticket_ids as unknown[]).forEach((num) => {
                  const n = String(num ?? '').trim();
                  if (n) map.set(n, mapped);
                });
              }
            }
          });

          const warnings = (json.data.warnings ?? {}) as Record<string, string>;
          if (warnings.tickets) {
            console.warn('TicketsTab: matrix tickets source warning:', warnings.tickets);
          }
          if (warnings.payments) {
            console.warn('TicketsTab: matrix payments source warning:', warnings.payments);
          }

          if (!cancelled) {
            setMatrix(map);
            setMatrixLoading(false);
          }
          return;
        }
        console.warn(
          'TicketsTab: matrix endpoint returned an error payload — falling back to direct queries.'
        );
      } catch (matrixError) {
        console.warn(
          'TicketsTab: matrix endpoint unreachable — falling back to direct queries:',
          matrixError
        );
      }

      // FALLBACK SOURCE (previous behavior): direct anon-key queries so the
      // matrix still renders when the server endpoint is unavailable.
      // GRACEFUL SCHEMA-CACHE HANDLING: PostgREST can fail with "Could not
      // find the table 'public.tickets' in the schema cache" right after a
      // migration / table creation. We best-effort reload the schema cache and
      // retry once, then continue with the receipts (payments) source below —
      // the matrix must NEVER crash or blank out because of a stale cache.
      const loadTicketRows = async (): Promise<Array<{ ticket_number: unknown; status?: unknown }>> => {
        const probe = await supabase
          .from('tickets')
          .select('ticket_number, status');
        if (probe.error && isTicketsTableUnavailableError(probe.error)) {

          console.warn('TicketsTab: tickets table not in schema cache — reloading schema:', probe.error.message);
          await reloadPgrstSchema();
          const retried = await supabase.from('tickets').select('ticket_number, status');
          if (retried.error) {
            console.error('TicketsTab: failed to load ticket matrix:', retried.error.message);
            return [];
          }
          return (retried.data ?? []) as Array<{ ticket_number: unknown; status?: unknown }>;
        }
        if (probe.error) {
          console.error('TicketsTab: failed to load ticket matrix:', probe.error.message);
        }
        return (probe.data ?? []) as Array<{ ticket_number: unknown; status?: unknown }>;
      };
      const ticketRows = await loadTicketRows();
      (ticketRows ?? []).forEach((row) => {
        if (row && typeof row.ticket_number === 'string') {
          const status = String(row.status ?? '').toLowerCase();
          if (status === 'pending' || status === 'sold') {
            map.set(row.ticket_number, status as TicketStatus);
          }
        }
      });

      // Receipt source: payments pending → pending, approved/sold → sold. This
      // guarantees a number locked under admin review (or sold after approval)
      // shows the right color even if its tickets row is missing or stale.
      const { data: pRows, error: pError } = await supabase
        .from('payments')
        .select('ticket_ids, status');
      if (pError) {
        console.warn('TicketsTab: payments status fetch failed (non-fatal):', pError.message);
      }
      (pRows ?? []).forEach((row) => {
        if (row && Array.isArray(row.ticket_ids)) {
          const receiptStatus = String(row.status ?? '').toLowerCase();
          const mapped =
            receiptStatus === 'approved' || receiptStatus === 'sold'
              ? 'sold'
              : receiptStatus === 'pending'
                ? 'pending'
                : null;
          if (mapped) {
            (row.ticket_ids as unknown[]).forEach((num) => {
              const n = String(num ?? '').trim();
              if (n) map.set(n, mapped);
            });
          }
        }
      });

      if (!cancelled) {
        setMatrix(map);
        setMatrixLoading(false);
      }
    };

    void load();
    const interval = setInterval(() => void load(), 30_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // Full pool of ticket numbers — defaults to 10,000 (00001–10000) and is NOT
  // capped at 2,000 anymore. 5-digit padding matches the Mini App selection
  // grid (components/app/ticket-selection.tsx uses padStart(5, '0')).
  const numbers = useMemo(() => {
    const count = Math.max(0, Math.min(Math.max(totalTickets, 0), 10000)) || 10000;
    return Array.from({ length: count }, (_, i) => String(i + 1).padStart(5, '0'));
  }, [totalTickets]);

  // Status-filtered full list — counts and badges reflect the true database
  // totals across all 10,000 tickets in the pool.
  const filteredNumbers = useMemo(
    () =>
      numbers.filter((n) => {
        const status = matrix.get(n) ?? 'available';
        if (statusFilter !== 'all' && status !== statusFilter) return false;
        if (query.trim() && !n.includes(query.trim())) return false;
        return true;
      }),
    [numbers, matrix, statusFilter, query],
  );

  // Rendered slice — the full pool (up to 10000) is always visible so admins
  // can scan, search, and filter across every ticket without a "load more" step.
  const visibleNumbers = useMemo(
    () => filteredNumbers.slice(0, renderLimit),
    [filteredNumbers, renderLimit],
  );

  const hasMore = filteredNumbers.length > visibleNumbers.length;

  const soldCount = numbers.filter((n) => matrix.get(n) === 'sold').length;
  const pendingCount = numbers.filter((n) => matrix.get(n) === 'pending').length;

  // Luxury glow status styles — Sold = crimson, Pending = amber, Available = emerald/cyan.
  const statusStyles: Record<TicketStatus, string> = {
    sold: 'border-rose-500/50 bg-rose-950/60 text-rose-300 line-through shadow-[0_0_10px_rgba(244,63,94,0.25)]',
    pending:
      'border-amber-500/50 bg-amber-500/10 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.22)]',
    available:
      'border-emerald-500/30 bg-emerald-950/30 text-emerald-300/70 hover:border-cyan-400/50 hover:text-cyan-200 hover:shadow-[0_0_10px_rgba(34,211,238,0.2)]',
  };

  // ── Manual (offline) sale helpers ──

  // Fast lookup for tile highlighting + chip rendering.
  const selectedManualSet = useMemo(
    () => new Set(selectedManualTickets),
    [selectedManualTickets],
  );

  // STATE SYNC: if the 30s polling (or an approval elsewhere) flips a selected
  // ticket to pending/sold, prune it from the selection so the batch never
  // contains non-available tickets and the UI can never drift.
  useEffect(() => {
    setSelectedManualTickets((prev) => {
      const next = prev.filter((n) => (matrix.get(n) ?? 'available') === 'available');
      return next.length === prev.length ? prev : next;
    });
  }, [matrix]);

  /**
   * Click-to-select toggle for the Ticket Matrix grid (and the chip "×").
   * Only 'available' tickets can enter the multi-selection; clicking a
   * selected tile removes it again.
   *
   * Guarded against the recording window: while a batch sale is being written
   * to Supabase the selection is frozen, so a late click can never re-add a
   * ticket after the availability validation and leave it in the array when
   * the sale resets (which would surface it as a stale "selected" chip).
   */
  const toggleManualTicket = (n: string) => {
    if (recordingSale) return;
    if ((matrix.get(n) ?? 'available') !== 'available') return;
    setSelectedManualTickets((prev) =>
      prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n],
    );
  };

  /**
   * Merge the typed "Add by Number" field ("0042" or "0005, 0006 0007") into
   * the multi-selection. Invalid / out-of-range / not-available / duplicate
   * numbers are rejected with a single summary toast.
   */
  const addManualTicketsFromInput = () => {
    const { numbers: parsed, invalid } = parseManualTicketInput(manualTicketInput);
    if (parsed.length === 0 && invalid.length === 0) return;

    const pool = new Set(numbers);
    const invalidAll = [...invalid];
    const outOfRange = parsed.filter((n) => !pool.has(n));
    invalidAll.push(...outOfRange);
    const notAvailable = parsed.filter(
      (n) => pool.has(n) && (matrix.get(n) ?? 'available') !== 'available',
    );
    const addable = parsed.filter(
      (n) =>
        pool.has(n) &&
        (matrix.get(n) ?? 'available') === 'available' &&
        !selectedManualSet.has(n),
    );

    if (invalidAll.length > 0) {
      toast.push('error', `Invalid ticket number(s): ${invalidAll.join(', ')} — digits only, within the pool.`);
    }
    if (notAvailable.length > 0) {
      toast.push('error', `Not available: ${notAvailable.join(', ')}`);
    }
    if (addable.length === 0) {
      setManualTicketInput('');
      return;
    }
    if (selectedManualTickets.length + addable.length > MANUAL_SALE_MAX) {
      toast.push('error', `Limit is ${MANUAL_SALE_MAX} tickets per sale.`);
      return;
    }
    setSelectedManualTickets((prev) => [...prev, ...addable]);
    toast.push('success', `Added ${addable.length} ticket(s) to the sale.`);
    setManualTicketInput('');
  };

  /**
   * 🎟️ Record an offline (walk-in) sale:
   *   1. validate the entered numbers (format, range, freshness)
   *   2. mark them 'sold' in Supabase for an "Offline Buyer" pseudo-user
   *   3. attach the optional buyer phone / note (best-effort, migration 018)
   */
  const handleRecordOfflineSale = async () => {
    if (recordingSale) return;
    // The ENTIRE multi-selection is recorded as one batch — selectedManualTickets
    // is the source of truth (built by clicking tiles in the Ticket Matrix grid
    // and/or the "Add by Number" field, both of which only admit 'available'
    // tickets already).
    const parsed = selectedManualTickets;

    if (parsed.length === 0) {
      toast.push(
        'error',
        'Select at least one ticket — click "Available" tiles in the Ticket Matrix (or add numbers below).',
      );
      return;
    }
    if (parsed.length > MANUAL_SALE_MAX) {
      toast.push('error', `Limit is ${MANUAL_SALE_MAX} tickets per sale.`);
      return;
    }

    setRecordingSale(true);
    try {
      // 1) Fresh availability check straight from the DB — the polling matrix
      //    can be up to 30s stale, so never trust it alone for a sale.
      let saleRows: Array<{ ticket_number: unknown; status?: unknown }> = [];
      let ticketsTableAvailable = true;
      const availability = await supabase
        .from('tickets')
        .select('ticket_number, status')
        .in('ticket_number', parsed);
      if (availability.error && isTicketsTableUnavailableError(availability.error)) {

        console.warn('Manual sale: tickets table notin schema cache — reloading schema:', availability.error.message);
        await reloadPgrstSchema();
        const retried = await supabase
          .from('tickets')
          .select('ticket_number, status')
          .in('ticket_number', parsed);
        if (retried.error && isTicketsTableUnavailableError(retried.error)) {



          console.warn('Manual sale: tickets table still unavailable — using receipts-only availability check:', retried.error.message);
          ticketsTableAvailable = false;
        } else if (retried.error) {
          throw new Error(retried.error.message);
        } else {
          saleRows = (retried.data ?? []) as Array<{ ticket_number: unknown; status?: unknown }>;
        }
      } else if (availability.error) {
        throw new Error(availability.error.message);
      } else {
        saleRows = (availability.data ?? []) as Array<{ ticket_number: unknown; status?: unknown }>;
      }

      const blocked = new Set<string>();
      (saleRows ?? []).forEach((row) => {
        const status = String(row?.status ?? '').toLowerCase();
        if (status === 'pending' || status === 'sold') {
          blocked.add(String(row.ticket_number));
        }
      });

      // 2) Receipt-source check — numbers locked under a pending/approved
      //    payment are NOT sellable even if the tickets rows drifted.
      const { data: pRows, error: pError } = await supabase
        .from('payments')
        .select('ticket_ids, status')
        .in('status', ['pending', 'approved']);
      if (pError) {
        console.warn('Manual sale: payments availability check failed (non-fatal):', pError.message);
      }
      (pRows ?? []).forEach((row) => {
        if (!Array.isArray(row?.ticket_ids)) return;
        const ids = new Set((row.ticket_ids as unknown[]).map((x) => String(x ?? '').trim()));
        parsed.forEach((n) => {
          if (ids.has(n)) blocked.add(n);
        });
      });

      // 3) Local matrix as an extra safety net (covers source drift).
      parsed.forEach((n) => {
        if ((matrix.get(n) ?? 'available') !== 'available') blocked.add(n);
      });

      // 3b) BATCH VALIDATION: every selected number must be 'available' before
      //     the batch sale is finalized. If ANY is taken, abort the whole sale
      //     (no partial recording) and list the blocked numbers so the admin
      //     can remove them and retry.
      if (blocked.size > 0) {
        toast.push(
          'error',
          `Cannot record sale — ticket(s) not available: ${Array.from(blocked).join(', ')}. ` +
            `Only 'available' tickets can be sold; remove them and try again.`,
        );
        return;
      }

      const sellable = parsed;

      // 4) Offline-buyer pseudo-user. The id MUST be a numeric string (the
      //    live users.id column is bigint/text — see lib/user-identity.ts),
      //    so derive a stable negative id from the phone key.
      const offlineKey = buyerPhone.trim() ? `offline:${buyerPhone.trim()}` : 'offline-walk-in';
      const offlineUserId = toDbUserId(offlineKey);
      const { error: userError } = await supabase
        .from('users')
        .upsert(
          {
            id: offlineUserId,
            username: null,
            full_name: 'Offline Buyer',
            phone_number: buyerPhone.trim() || null,
            role: 'user',
          },
          { onConflict: 'id', ignoreDuplicates: true },
        );
      if (userError) {
        console.warn('Manual sale: offline buyer user row not saved:', userError.message);
      }

      // 5) Mark sold. Buyer fields are included best-effort — if migration
      //    018 has not been applied yet the write is retried without them so
      //    the sale ALWAYS records (same pattern as admin_note in 011).
      const buyerFields = () => ({
        ...(buyerPhone.trim() ? { buyer_phone: buyerPhone.trim() } : {}),
        ...(buyerNotes.trim() ? { buyer_note: buyerNotes.trim() } : {}),
      });

      if (ticketsTableAvailable) {
        let update = await supabase
        .from('tickets')
        .update({ status: 'sold' as const, user_id: offlineUserId, ...buyerFields() })
        .in('ticket_number', sellable)
        .neq('status', 'sold');
      if (update.error && isMissingBuyerColumnError(update.error)) {
        update = await supabase
          .from('tickets')
          .update({ status: 'sold' as const, user_id: offlineUserId })
          .in('ticket_number', sellable)
          .neq('status', 'sold');
      }
      if (update.error) throw new Error(update.error.message);

      // Numbers never reserved before have no tickets row — insert them so
      // the sale is definitively recorded. saleRows already holds every
      // existing tickets row for the selected numbers (fetched in step 1).
      const existingSet = new Set(saleRows.map((row) => String(row.ticket_number)));
      const missing = sellable.filter((n) => !existingSet.has(n));
      if (missing.length > 0) {
        let insert = await supabase.from('tickets').insert(
          missing.map((n) => ({
            ticket_number: n,
            user_id: offlineUserId,
            status: 'sold' as const,
            ...buyerFields(),
          })),
        );
        if (insert.error && isMissingBuyerColumnError(insert.error)) {
          insert = await supabase.from('tickets').insert(
            missing.map((n) => ({
              ticket_number: n,
              user_id: offlineUserId,
              status: 'sold' as const,
            })),
          );
        }
        if (insert.error) throw new Error(insert.error.message);
      }
      } else {
        // GRACEFUL SCHEMA-CACHE FALLBACK: public.tickets is STILL missing from
        //    the schema cache (even after a reload attempt). In this schema the
        //    receipts table IS public.payments — record the offline sale as an
        //    approved receipt there, so the numbers are tracked 'sold'
        //    platform-wide via the matrix + receipts readers without a tickets
        //    write — no data is lost during the cache outage.
        //
        //    SCHEMA-SAFE INSERT: the live payments table may pre-date migrations
        //    003/008/010, i.e. transaction_reference (and even receipt_url) can
        //    be ABSENT — sending them raises "Could not find the
        //    'transaction_reference' column of 'payments' in the schema cache".
        //    Attempt 1 includes the generated reference; attempt 2 retries with
        //    only the columns that exist in every schema version.
        const baseReceipt = {
          user_id: offlineUserId,
          ticket_ids: sellable,
          amount: sellable.length * (ticketPrice ?? 0),
          status: 'approved' as const,
        };
        let receipt = await supabase.from('payments').insert({
          ...baseReceipt,
          receipt_url: null,
          transaction_reference: `OFFLINE-${Date.now()}`,
        });
        if (receipt.error && isMissingPaymentsColumnError(receipt.error)) {
          console.warn(
            'Manual sale: payments optional column missing — retrying with minimal receipt payload:',
            receipt.error.message,
          );
          receipt = await supabase.from('payments').insert(baseReceipt);
        }
        if (receipt.error) throw new Error(receipt.error.message);
      }

      // 6) Optimistic local update — the matrix turns crimson instantly.
      setMatrix((prev) => {
        const next = new Map(prev);
        sellable.forEach((n) => next.set(n, 'sold'));
        return next;
      });
      onManualSaleRecorded(sellable.length);

      const skipped = parsed.length - sellable.length;
      toast.push(
        'success',
        `Recorded ${sellable.length} ticket(s): ${sellable.join(', ')}` +
          (skipped > 0 ? ` — skipped ${skipped} already taken` : ''),
      );
      // Reset the multi-selection (and the auxiliary input) after the batch
      // is recorded.
      setSelectedManualTickets([]);
      setManualTicketInput('');
      setBuyerPhone('');
      setBuyerNotes('');
    } catch (err) {
      console.error('Manual sale failed:', err);
      toast.push('error', err instanceof Error ? err.message : 'Failed to record the offline sale.');
    } finally {
      setRecordingSale(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Ticket availability matrix ── */}
      <section className="lux-card rounded-3xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400">
              <Grid3X3 className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-amber-400/70">Live pool</p>
              <h3 className="text-lg font-bold text-white">Ticket Matrix</h3>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className="badge-glow-sold rounded-full px-3 py-1">{soldCount} sold</span>
            <span className="badge-glow-pending rounded-full px-3 py-1">{pendingCount} pending</span>
            <span className="badge-glow-available rounded-full px-3 py-1">
              {Math.max(0, numbers.length - soldCount - pendingCount)} available
            </span>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find number… (e.g. 0042)"
            className="lux-input sm:max-w-xs"
          />
          <div className="flex flex-wrap gap-1.5">
            {(['all', 'sold', 'pending', 'available'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setStatusFilter(f)}
                className={`rounded-full px-3 py-1.5 text-xs font-bold capitalize transition ${
                  statusFilter === f
                    ? 'lux-nav-active'
                    : 'border border-slate-700/80 bg-slate-950/60 text-slate-400 hover:border-amber-500/40 hover:text-white'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        {matrixLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin text-amber-400" />
            Loading matrix…
          </div>
        ) : (
          <>
            <div className="mt-4 grid max-h-[420px] grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-1.5 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950/50 p-3">
              {visibleNumbers.map((n) => {
                const status = matrix.get(n) ?? 'available';
                const isSelected = selectedManualSet.has(n);
                const clickable = status === 'available';
                const tileClass = [
                  'relative rounded-lg border px-1 py-1.5 text-center font-mono text-[11px] font-bold',
                  // Selected = distinct Active Gold border + glow (overrides status style).
                  isSelected
                    ? 'border-amber-400 bg-amber-500/20 text-amber-100 shadow-[0_0_14px_rgba(251,191,36,0.55)] ring-2 ring-amber-300/70'
                    : statusStyles[status],
                  clickable
                    ? 'cursor-pointer transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/80 disabled:cursor-wait disabled:opacity-70'
                    : 'cursor-default',
                ].join(' ');
                const inner = (
                  <>
                    {status === 'pending' && (
                      <span className="absolute -right-0.5 -top-1.5 rounded bg-orange-500 px-0.5 py-px text-[7px] font-black uppercase leading-none text-slate-950">
                        Pend
                      </span>
                    )}
                    {status === 'sold' && (
                      <span className="absolute -right-0.5 -top-1.5 rounded bg-red-700 px-0.5 py-px text-[7px] font-black uppercase leading-none text-white">
                        Sold
                      </span>
                    )}
                    {isSelected && (
                      <span className="absolute -right-0.5 -top-1.5 rounded bg-amber-400 px-0.5 py-px text-[7px] font-black uppercase leading-none text-slate-950">
                        Sel
                      </span>
                    )}
                    {n}
                  </>
                );
                // 'Available' tiles are click-to-select — toggling adds/removes
                // them from the selectedManualTickets multi-selection batch.
                return clickable ? (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={isSelected}
                    disabled={recordingSale}
                    title={`${n} — ${status}${isSelected ? ' (selected — click to deselect)' : ' (click to select)'}`}
                    onClick={() => toggleManualTicket(n)}
                    className={tileClass}
                  >
                    {inner}
                  </button>
                ) : (
                  <span key={n} title={`${n} — ${status}`} className={tileClass}>
                    {inner}
                  </span>
                );
              })}
              {visibleNumbers.length === 0 && (
                <p className="col-span-full py-6 text-center text-sm text-slate-500">
                  No numbers match this filter.
                </p>
              )}
            </div>
            {hasMore && (
              <div className="mt-3 flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
                <p className="text-xs text-slate-500">
                  Showing {visibleNumbers.length} of {filteredNumbers.length} numbers — refine the
                  search/filter to narrow the view.
                </p>
                <button
                  type="button"
                  onClick={() => setRenderLimit((l) => l + MATRIX_RENDER_PAGE)}
                  className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-300 transition hover:bg-amber-500/20"
                >
                  Load {Math.min(MATRIX_RENDER_PAGE, filteredNumbers.length - visibleNumbers.length)} more
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {/* ── Manual ticket sales ── */}
      <section className="lux-card rounded-3xl p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 shadow-[0_0_16px_rgba(52,211,153,0.25)]">
            <Ticket className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-amber-400/70">Offline sales</p>
            <h3 className="text-lg font-bold text-white">Manual Ticket Sales</h3>
          </div>
        </div>

        <div className="mt-4 space-y-4">
          {/* Auxiliary "add by number" field — the PRIMARY selection path is
              clicking tiles in the Ticket Matrix grid above. This input is
              optional and merges into the same selectedManualTickets array,
              so there is no single-search / one-ticket-at-a-time constraint. */}
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              <Hash className="h-3.5 w-3.5 text-amber-400/80" />
              Add by Number (optional)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={manualTicketInput}
                onChange={(e) => setManualTicketInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addManualTicketsFromInput();
                  }
                }}
                placeholder="e.g. 0042 or 0005, 0006"
                autoComplete="off"
                className="lux-input font-mono tracking-wider"
              />
              <button
                type="button"
                onClick={addManualTicketsFromInput}
                disabled={recordingSale || !manualTicketInput.trim()}
                className="btn-lux-gold flex-shrink-0"
              >
                <Plus className="h-4 w-4" />
                Add
              </button>
            </div>
          </div>

          {/* Multi-selection summary — selected tags + count badge. Click a
              tag to remove that ticket, or clear the whole batch. */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="lux-cyan-live rounded-full px-3 py-1 text-xs font-bold">
                Selected: {selectedManualTickets.length} ticket
                {selectedManualTickets.length === 1 ? '' : 's'}
              </span>
              {selectedManualTickets.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedManualTickets([])}
                  disabled={recordingSale}
                  className="rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1 text-xs font-bold text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
                >
                  Clear all
                </button>
              )}
            </div>
            {selectedManualTickets.length > 0 ? (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {selectedManualTickets.map((n) => (
                  <button
                    key={`sel-${n}`}
                    type="button"
                    onClick={() => toggleManualTicket(n)}
                    disabled={recordingSale}
                    title="Remove ticket from selection"
                    className="group inline-flex items-center gap-1 rounded-lg border border-amber-400/60 bg-amber-500/15 px-2 py-1 font-mono text-xs font-bold text-amber-200 transition hover:bg-amber-500/25 disabled:opacity-50"
                  >
                    {n}
                    <X className="h-3 w-3 opacity-60 transition group-hover:opacity-100" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-500">
                Click <span className="font-semibold text-emerald-300">Available</span> tiles in the
                Ticket Matrix above to build a batch sale (or add numbers here).
              </p>
            )}
          </div>

          {/* Optional offline buyer info — stored on tickets.buyer_phone/buyer_note */}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                <Phone className="h-3.5 w-3.5 text-amber-400/80" />
                Buyer Phone (optional)
              </span>
              <input
                type="tel"
                value={buyerPhone}
                onChange={(e) => setBuyerPhone(e.target.value)}
                placeholder="+251 …"
                className="lux-input"
              />
            </label>
            <label className="block">
              <span className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                <StickyNote className="h-3.5 w-3.5 text-amber-400/80" />
                Buyer Note (optional)
              </span>
              <input
                type="text"
                value={buyerNotes}
                onChange={(e) => setBuyerNotes(e.target.value)}
                placeholder="Name / cash amount…"
                className="lux-input"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void handleRecordOfflineSale()}
              disabled={recordingSale}
              className="btn-lux-gold"
            >
              {recordingSale ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Ticket className="h-4 w-4" />
              )}
              Record Sale
            </button>
            <span className="text-sm text-slate-400">
              Recorded this session:{' '}
              <span className="font-bold text-emerald-300">{manualTicketsSold}</span> tickets
            </span>
          </div>
        </div>
      </section>


      {/* ── Raffle item (prize) management ── */}
      <section className="lux-card rounded-3xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400">
              <PackagePlus className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-amber-400/70">Prizes</p>
              <h3 className="text-lg font-bold text-white">Raffle Item Management</h3>
            </div>
          </div>
          <button
            type="button"
            onClick={resetItemForm}
            className="btn-lux-gold"
          >
            <Plus className="h-4 w-4" />
            Add New Item
          </button>
        </div>

        <div className="mt-4 grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
          {/* Item form */}
          <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
            <p className="text-sm font-bold text-amber-300">
              {selectedItemId ? 'Update Raffle Item' : 'Add Raffle Item'}
            </p>
            <input
              value={itemForm.title}
              onChange={(e) => onItemChange('title', e.target.value)}
              placeholder="Title (e.g. IVECO Truck Draw)"
              className="w-full rounded-xl border border-slate-700/80 bg-slate-900 px-3.5 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20"
            />
            <textarea
              value={itemForm.description}
              onChange={(e) => onItemChange('description', e.target.value)}
              placeholder="Description"
              rows={2}
              className="w-full resize-none rounded-xl border border-slate-700/80 bg-slate-900 px-3.5 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20"
            />
            <input
              value={itemForm.location}
              onChange={(e) => onItemChange('location', e.target.value)}
              placeholder="Location"
              className="w-full rounded-xl border border-slate-700/80 bg-slate-900 px-3.5 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20"
            />
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Prize Rank (ዕጣ ደረጃ)
              </span>
              <select
                value={itemForm.rank}
                onChange={(e) => onItemChange('rank', Number(e.target.value) || 1)}
                className="w-full appearance-none rounded-xl border border-slate-700/80 bg-slate-900 px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20"
              >
                {PRIZE_RANK_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.labelAm} — {opt.labelEn}
                  </option>
                ))}
              </select>
            </label>
            {/* Shared pricing note — the form intentionally has NO per-item
                price or total-ticket inputs. Everything is managed globally in
                Admin → App Settings and applied here on save. */}
            <p className="text-[11px] leading-snug text-slate-500">
              💡 Ticket price (ETB) &amp; total tickets are managed globally in{' '}
              <span className="font-semibold text-amber-300/90">App Settings</span> — this item
              will use the current global values on save.
            </p>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Draw Date &amp; Time (የስሤት ቀን)
              </span>
              <input
                type="datetime-local"
                value={itemForm.drawDatetime ? toLocalInputValue(itemForm.drawDatetime) : ''}
                onChange={(e) =>
                  onItemChange(
                    'drawDatetime',
                    e.target.value ? new Date(e.target.value).toISOString() : '',
                  )
                }
                className="w-full rounded-xl border border-slate-700/80 bg-slate-900 px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20"
              />
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <label className="cursor-pointer rounded-xl border border-dashed border-slate-600 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-amber-500/50 hover:text-amber-300">
                {uploadingImage ? 'Uploading…' : 'Upload Image'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void onImageUpload(e)}
                  disabled={uploadingImage}
                />
              </label>
              {uploadingImage ? (
                <Loader2 className="h-5 w-5 animate-spin text-amber-400" aria-label="Uploading image" />
              ) : itemForm.imageUrl ? (
                <SafeImage
                  src={itemForm.imageUrl}
                  alt="Item preview"
                  className="h-16 w-16 rounded-xl border border-amber-500/40 object-cover"
                  fallbackClassName="flex h-16 w-16 items-center justify-center rounded-xl border border-red-500/30 bg-red-500/10 text-red-300"
                  fallbackLabel="!"
                />
              ) : null}
              {itemForm.imageUrl && !uploadingImage && (
                <span className="text-[11px] text-slate-500">
                  {itemForm.imageUrl.startsWith('data:') ? 'Preview (saved locally)' : 'Preview'}
                </span>
              )}
              {itemForm.imageUrl && !uploadingImage && (
                <button
                  type="button"
                  onClick={() => onItemChange('imageUrl', '')}
                  title="Remove image"
                  aria-label="Remove image"
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-red-500/40 bg-red-500/10 text-red-300 transition hover:bg-red-500/20"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => void saveItem()}
              disabled={savingItem}
              className="btn-lux-gold w-full"
            >
              {savingItem && <Loader2 className="h-4 w-4 animate-spin" />}
              {selectedItemId ? 'Update Item' : 'Save Item'}
            </button>
          </div>

          {/* Item list */}
          <div className="space-y-2">
            {savedItems.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">
                No raffle items yet — add your first prize.
              </p>
            ) : (
              savedItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-950/50 p-3 transition hover:border-amber-500/30"
                >
                  <button
                    type="button"
                    onClick={() => editItem(item)}
                    className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
                    aria-label={`Edit: ${item.title}`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      {item.imageUrl ? (
                        <SafeImage
                          src={item.imageUrl}
                          alt=""
                          className="h-10 w-10 flex-shrink-0 rounded-xl border border-slate-700 object-cover"
                          fallbackClassName="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-red-500/30 bg-red-500/10 text-red-300"
                          fallbackLabel=""
                        />
                      ) : (
                        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-slate-800 text-slate-500">
                          <Ticket className="h-4 w-4" />
                        </span>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">{item.title}</p>
                        <p className="text-xs text-slate-500">
                          {item.price.toLocaleString()} ETB · {item.tickets} tickets
                          {item.location ? ` · ${item.location}` : ''}
                        </p>
                      </div>
                    </div>
                    <Pencil className="h-3.5 w-3.5 flex-shrink-0 text-amber-400" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void postItemToTelegram(item.id)}
                    disabled={postingToTelegramId === item.id}
                    title="Post to Telegram"
                    className="inline-flex flex-shrink-0 items-center gap-1 rounded-lg border border-sky-500/40 bg-sky-500/10 px-2 py-1.5 text-sky-300 transition hover:bg-sky-500/20 disabled:opacity-50"
                  >
                    {postingToTelegramId === item.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteItem(item.id)}
                    title="Delete"
                    className="inline-flex flex-shrink-0 items-center gap-1 rounded-lg border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-red-300 transition hover:bg-red-500/20"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>

        </div>
      </section>
    </div>
  );
}

// EOF
