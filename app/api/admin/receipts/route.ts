import { NextResponse } from "next/server";

import { getPaymentReceipts } from "@/lib/admin/management";

// The receipt queue changes constantly (realtime-triggered revalidation) —
// always serve a fresh response, never a cached one.
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Extract a readable message from any thrown error. */
function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message?: unknown }).message);
  }
  return String(error ?? "Unknown error");
}

/**
 * GET /api/admin/receipts — paginated payment receipt queue.
 *
 * Previously the receipts rode on GET /api/admin, which forced EVERY dashboard
 * load AND the 30s poll to scan the ENTIRE payments table. This dedicated,
 * lightweight endpoint fixes that:
 *
 *   Query params:
 *     ?limit=20   — page size (default 20, capped at 200). Initial admin load
 *                   fetches ONLY the newest 20 rows.
 *     ?offset=0   — rows to skip for deeper pages ("Load more").
 *
 *   Response data:
 *     paymentReceipts      — the loaded page (newest first)
 *     paymentReceiptsTotal — exact count across ALL statuses, piggy-backed on
 *                            the same PostgREST request (count: "exact") so
 *                            the UI knows when "Load more" has more to fetch.
 *
 * Consumed by the SWR hook in app/admin/page.tsx, which revalidates on a 30s
 * interval, on window focus, and on Supabase Realtime payments events.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const rawLimit = Number(url.searchParams.get("limit"));
    const rawOffset = Number(url.searchParams.get("offset"));
    const limit =
      Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 200) : 20;
    const offset =
      Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0;

    const page = await getPaymentReceipts({ limit, offset });

    return NextResponse.json({
      success: true,
      data: {
        paymentReceipts: page.receipts,
        paymentReceiptsTotal: page.total,
        limit,
        offset,
      },
    });
  } catch (error) {
    const errorMessage = describeError(error);
    console.error("Admin receipts API GET error:", errorMessage, error);

    // Non-2xx so the SWR layer treats it as an error and KEEPS the previous
    // cached list on screen instead of blanking the queue on a transient hiccup.
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
