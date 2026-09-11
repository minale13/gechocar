import { createSupabaseServerClient } from '@/lib/supabase/server';
import { HomePage, type HomeLotteryItem, type HomeHeroBanner, type HomeAppSettings } from '@/components/app/home-page';
import { HeroBannerSync } from '@/components/app/hero-banner-sync';

// Never cache the database — always fetch the latest data from Supabase so
// items / banners / settings created, updated, or deleted in /admin show up
// immediately on the Host page. force-dynamic + revalidate = 0 guarantees a
// fresh render on every request (no Full-Route or Data Cache snapshot), so
// changes made from the admin panel appear as soon as the user visits /
// or refreshes. fetchCache = 'force-no-store' additionally opts every fetch
// inside this route out of the Next.js Data Cache (belt-and-braces for
// no-store behavior on the Supabase REST calls).
export const revalidate = 0;
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

// ── Supabase row shapes ──────────────────────────────────────────────────────
// Rows are typed as any[] (safe, degrade-friendly): every property access is
// mapped to a primitive with an explicit fallback ("") / (0), never an empty
// object ({}). This avoids the TS error where `unknownValue ?? ''` infers the
// type `{}` (unknown minus null/undefined), which is not assignable to string.

export default async function Page() {
  const supabase = createSupabaseServerClient();

  // Every fetch below is failure-tolerant: if the Supabase client is
  // unconfigured (missing NEXT_PUBLIC_* env vars) or a query fails, the home
  // page STILL renders — with empty items/banners and default settings —
  // instead of throwing a 500.

  // Fetch ALL columns from lottery_items, only active rows, ordered by rank.
  let itemsData: any[] = [];
  try {
    const { data, error } = await supabase
      .from('lottery_items')
      .select('*')
      .eq('is_active', true)
      .order('rank', { ascending: true, nullsFirst: false });
    if (error) throw error;
    itemsData = (data ?? []) as any[];
  } catch (itemsError) {
    console.error('Failed to fetch lottery items:', itemsError);
  }

  // Fetch active hero banners, ordered by sort_order.
  let bannersData: any[] = [];
  try {
    const { data, error } = await supabase
      .from('hero_banners')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true, nullsFirst: false });
    if (error) throw error;
    bannersData = (data ?? []) as any[];
  } catch (bannersError) {
    console.error('Failed to fetch hero banners:', bannersError);
  }

  // Fetch app settings: ticket price, total tickets, logo, title & support handle.
  // app_settings is a single-row table (row id = 1) with dedicated columns
  // (support team info lives in the jsonb `support` column — Admin → Support).
  let settingsData: any = null;
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('app_title, logo_url, ticket_price, total_tickets, support')
      .eq('id', 1)
      .maybeSingle();
    if (error) throw error;
    settingsData = (data ?? null) as any;
  } catch (settingsError) {
    console.error('Failed to fetch app settings:', settingsError);
  }

  // Support handle (e.g. "@admas_support") saved from the Admin dashboard —
  // rendered as a tappable Telegram support button on the Host page header.
  const supportValue = settingsData?.support ?? {};
  const supportHandle =
    (supportValue.support_username || supportValue.support_contact || '@gecho_support')
      .trim()
      .replace(/^@/, '');

  const appSettings: HomeAppSettings = {
    appTitle: settingsData?.app_title || 'GECHO CAR',
    logoUrl: settingsData?.logo_url || '',
    ticketPrice: Number(settingsData?.ticket_price) || 0,
    totalTickets: Number(settingsData?.total_tickets) || 0,
    supportUrl: supportHandle,
  };

  // Map Supabase snake_case columns → HomePage card UI props. Every string
  // prop falls back to "" (never {} / null), every numeric prop to 0.
  const items: HomeLotteryItem[] = itemsData.map((item) => ({
    id: String(item.id ?? ''),
    title: item.title ?? '',
    description: item.description ?? '',
    ticketPrice: Number(item.price) || 0,
    totalTickets: Number(item.tickets) || 0,
    location: item.location ?? '',
    imageUrl: item.image_url ?? '',
    rank: Number(item.rank) || 0,
  }));

  const banners: HomeHeroBanner[] = bannersData.map((banner) => ({
    id: String(banner.id ?? ''),
    title: banner.title ?? '',
    imageUrl: banner.image_url ?? '',
    linkUrl: banner.link_url ?? '',
  }));

  return (
    <>
      {/* Realtime sync — admin hero banner saves/deletes refresh this page
          instantly for every open landing-page visitor (no manual reload). */}
      <HeroBannerSync />
      <HomePage items={items} banners={banners} settings={appSettings} />
    </>
  );
}