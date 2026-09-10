'use server';

import { revalidatePath } from 'next/cache';

/**
 * Server Action: invalidate the Host (landing) page so server-rendered
 * content — including the Hero Banner carousel — is re-fetched from Supabase
 * on the next render.
 *
 * Called from the Admin dashboard right after a hero banner is saved or
 * deleted. Because app/page.tsx is `force-dynamic` + `revalidate = 0`, the
 * revalidation drops the cached RSC payload so the next request (or the
 * router.refresh() that follows this action) rebuilds the page with fresh
 * hero_banners data — no server restart or hard refresh needed.
 */
export async function revalidateHome(): Promise<{ ok: boolean }> {
  revalidatePath('/');
  return { ok: true };
}
