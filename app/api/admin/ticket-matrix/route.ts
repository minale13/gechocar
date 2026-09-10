import { NextResponse } from "next/server";

import { createSupabaseAdminClient, requireAdminAccess } from "@/lib/supabase/server";

// The ticket matrix changes on every checkout / approval — always fresh.
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
 * GET /api/admin/ticket-matrix — RLS-proof ticket status source.
 *
 * WHY THIS EXISTS: the Admin Ticket Matrix (and the Mini App availability
 * grid) previously read `public.tickets` straight from the browser with the
 * anon-key client. When Row Level Security blocks that read (a live database
 * initialized before migration 001's permissive SELECT policy, or a policy
 * that was tightened), the query silently returns ZERO rows and the matrix
 * renders every ticket as 'available' even though pending/sold rows exist.
 *
 * This endpoint reads the SAME two sources through the SERVICE-ROLE admin
 * client (bypasses RLS entirely, see createSupabaseAdminClient) so sold and
 * pending counts are always accurate:
 *
 *   ticketRows  — every public.tickets row   (ticket_number, status)
 *   paymentRows — every public.payments row  (ticket_ids, status)
 *
 * The client merges both exactly like before: tickets pending/sold first,
 * then payments (pending → pending, approved/sold → sold) as the overlay so
 * numbers locked under review are colored even if their tickets row is
 * missing or stale.
 *
 * Sub-query failures (missing table / schema cache) are NON-FATAL — they are
 * returned in `warnings` and the client falls back to its direct queries.
 */
export async function GET() {
  try {
    await requireAdminAccess();
  } catch (error) {
    return NextResponse.json(
      { success: false, error: describeError(error) },
      { status: 401 }
    );
  }

  // PARALLEL FETCH CONTRACT: both sources run in ONE Promise.all.
  const supabase = createSupabaseAdminClient();
  const [ticketsRes, paymentsRes] = await Promise.all([
    supabase.from("tickets").select("ticket_number, status"),
    supabase.from("payments").select("ticket_ids, status"),
  ]);

  const warnings: Record<string, string> = {};
  if (ticketsRes.error) {
    warnings.tickets = ticketsRes.error.message;
    console.error("Ticket matrix API: tickets query failed:", ticketsRes.error.message);
  }
  if (paymentsRes.error) {
    warnings.payments = paymentsRes.error.message;
    console.error("Ticket matrix API: payments query failed:", paymentsRes.error.message);
  }

  return NextResponse.json({
    success: true,
    data: {
      ticketRows: ticketsRes.data ?? [],
      paymentRows: paymentsRes.data ?? [],
      warnings,
    },
  });
}
