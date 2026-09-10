'use client';

import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';

type Props = {
  /** payments INSERT/UPDATE/DELETE → refresh the receipt queue. */
  onPaymentsChange: () => void;
  /**
   * telegram_scheduler INSERT/UPDATE → receives the changed columns so the
   * caller can patch dashboard state without a round-trip (the payload's `new`
   * row already carries every fresh column value).
   */
  onSchedulerChange: (patch: { lastPostedAt?: string | null }) => void;
  /** lottery_items INSERT/UPDATE/DELETE → refresh the raffle item list. */
  onItemsChange: () => void;
};

/**
 * Supabase Realtime sync for the Admin Dashboard.
 *
 * Subscribes ONCE to Postgres changes on the three active admin tables —
 * payments, telegram_scheduler and lottery_items — on a single websocket
 * channel, so the dashboard updates INSTANTLY without any manual browser
 * refresh. Requires the tables to be added to the supabase_realtime
 * publication: supabase/migrations/029_realtime_admin_tables.sql.
 *
 * Renders nothing itself. Mounted once inside AdminDashboard
 * (app/admin/page.tsx); callbacks are debounced per table so a burst of
 * writes (e.g. approve + ticket sync, or a multi-row upsert) coalesces into
 * a single state refresh per slice.
 */
export function AdminRealtimeSync({
  onPaymentsChange,
  onSchedulerChange,
  onItemsChange,
}: Props) {
  // One debounce timer per table — independent slices refresh independently.
  const timersRef = useRef<
    Partial<Record<'payments' | 'scheduler' | 'items', ReturnType<typeof setTimeout>>>
  >({});

  useEffect(() => {
    const schedule = (key: 'payments' | 'scheduler' | 'items', fn: () => void) => {
      const existing = timersRef.current[key];
      if (existing) clearTimeout(existing);
      timersRef.current[key] = setTimeout(() => {
        timersRef.current[key] = undefined;
        fn();
      }, 250);
    };

    // ONE channel, THREE postgres_changes topics — a single websocket carries
    // payments + telegram_scheduler + lottery_items events.
    const channel = supabase
      .channel('admin-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'payments' },
        (change) => {
          console.info('[admin-realtime] payments changed:', change.eventType, '→ refreshing receipts');
          schedule('payments', onPaymentsChange);
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'telegram_scheduler' },
        (change) => {
          console.info('[admin-realtime] telegram_scheduler changed:', change.eventType, '→ patching scheduler');
          // The bot/cron service stamps last_posted_at after every delivered
          // auto-post. The payload's `new` row carries the fresh column value,
          // so the "Last Posted" display updates live without an extra fetch.
          const newRow = (change as unknown as { new?: Record<string, unknown> }).new ?? null;
          const lastPostedAt =
            typeof newRow?.last_posted_at === 'string' ? newRow.last_posted_at : null;
          schedule('scheduler', () => onSchedulerChange({ lastPostedAt }));
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lottery_items' },
        (change) => {
          console.info('[admin-realtime] lottery_items changed:', change.eventType, '→ refreshing items');
          schedule('items', onItemsChange);
        },
      )
      .subscribe();

    return () => {
      (
        Object.keys(timersRef.current) as Array<'payments' | 'scheduler' | 'items'>
      ).forEach((key) => {
        const timer = timersRef.current[key];
        if (timer) clearTimeout(timer);
        timersRef.current[key] = undefined;
      });
      void supabase.removeChannel(channel);
    };
  }, [onPaymentsChange, onSchedulerChange, onItemsChange]);

  return null;
}
