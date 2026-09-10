'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

/**
 * Hero Banner realtime sync for the Host (landing) page.
 *
 * Subscribes to Postgres changes on public.hero_banners. When an admin
 * saves or deletes a banner in /admin, this triggers router.refresh(),
 * which re-renders the server component (app/page.tsx — force-dynamic,
 * so it re-fetches hero_banners from Supabase) and streams the fresh
 * banner list into HomePage. The deleted banner disappears INSTANTLY,
 * without the visitor refreshing or the server restarting.
 *
 * Mounted once in app/page.tsx — renders nothing itself.
 */
export function HeroBannerSync() {
  const router = useRouter();
  // Debounce: a burst of admin changes (e.g. sort-order re-save) can emit
  // several events in quick succession — coalesce them into one refresh.
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const scheduleRefresh = () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => {
        refreshTimerRef.current = null;
        router.refresh();
      }, 250);
    };

    const channel = supabase
      .channel('hero_banners')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'hero_banners' },
        (change) => {
          console.info('hero_banners changed — refreshing home page:', change.eventType);
          scheduleRefresh();
        },
      )
      .subscribe();

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
