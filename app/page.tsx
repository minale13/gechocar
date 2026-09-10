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

export default async function Page() {
  const supabase = createSupabaseServerClient();

  // Fetch ALL columns from lottery_items, only active rows, ordered by rank.
  const { data: itemsData, error: itemsError } = await supabase
    .from('lottery_items')
    .select('*')
    .eq('is_active', true)
    .order('rank', { ascending: true, nullsFirst: false });

  if (itemsError) {
    console.error('Failed to fetch lottery items:', itemsError);
  }

  // Fetch active hero banners, ordered by sort_order.
  const { data: bannersData, error: bannersError } = await supabase
    .from('hero_banners')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true, nullsFirst: false });

  if (bannersError) {
    console.error('Failed to fetch hero banners:', bannersError);
  }

  // Fetch app settings: ticket price, total tickets, logo, title & support handle.
  // app_settings is a single-row table (row id = 1) with dedicated columns
  // (support team info lives in the jsonb `support` column — Admin → Support).
  const { data: settingsData, error: settingsError } = await supabase
    .from('app_settings')
    .select('app_title, logo_url, ticket_price, total_tickets, support')
    .eq('id', 1)
    .maybeSingle();

  if (settingsError) {
    console.error('Failed to fetch app settings:', settingsError);
  }

  // Support handle (e.g. "@admas_support") saved from the Admin dashboard —
  // rendered as a tappable Telegram support button on the Host page header.
  const supportValue = (settingsData?.support ?? {}) as {
    support_username?: string;
    support_contact?: string;
  };
  const supportHandle =
    (supportValue.support_username || supportValue.support_contact || '@admas_support')
      .trim()
      .replace(/^@/, '');

  const appSettings: HomeAppSettings = {
    appTitle: settingsData?.app_title || 'Admas Lottery',
    logoUrl: settingsData?.logo_url || '',
    ticketPrice: Number(settingsData?.ticket_price) || 0,
    totalTickets: Number(settingsData?.total_tickets) || 0,
    supportUrl: supportHandle,
  };

  // Map Supabase snake_case columns → HomePage card UI props.
  const items: HomeLotteryItem[] = (itemsData ?? []).map((item) => ({
    id: item.id,
    title: item.title,
    description: item.description ?? '',
    ticketPrice: Number(item.price) || 0,
    totalTickets: Number(item.tickets) || 0,
    location: item.location ?? '',
    imageUrl: item.image_url ?? '',
    rank: Number(item.rank) || 0,
  }));

  const banners: HomeHeroBanner[] = (bannersData ?? []).map((banner) => ({
    id: banner.id,
    title: banner.title,
    imageUrl: banner.image_url,
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