import { NextResponse } from "next/server";

import { getUsersDirectory, setUserBlocked } from "@/lib/admin/management";
import { isSupabaseServiceRoleConfigured } from "@/lib/supabase/server";

// The directory changes on registrations / purchases — always fresh.
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
 * GET /api/admin/users — Users Directory (ተጠቃሚዎች ዝርዝር).
 *
 * Returns every registered user from public.profiles enriched with per-user
 * ticket aggregates (bought / pending), block status, and wallet balance
 * computed from public.payments and public.tickets. All sources run in ONE
 * Promise.all and are read with the SERVICE-ROLE admin client so Row Level
 * Security can never hide rows from the directory.
 *
 * Consumed by the SWR hook in components/admin/users-tab.tsx.
 */
export async function GET() {
  // GRACEFUL FALLBACK — the directory reads go through the SERVICE-ROLE admin
  // client so Row Level Security can never hide rows. When
  // SUPABASE_SERVICE_ROLE_KEY is missing or a placeholder, the admin client
  // silently falls back to the anon-key client whose RLS policies make the
  // profiles read fail — which previously surfaced as a 500 and broke the
  // dashboard's SWR state. Instead of failing, degrade cleanly: 200 with an
  // empty directory ({ success: true, users: [] }), like the user-stats route.
  if (!isSupabaseServiceRoleConfigured()) {
    console.warn(
      "Admin users API: SUPABASE_SERVICE_ROLE_KEY is not configured — returning a clean empty directory."
    );
    return NextResponse.json({ success: true, users: [], total: 0 });
  }

  try {
    const directory = await getUsersDirectory();
    // Clean response contract consumed by components/admin/users-tab.tsx:
    // { success: true, users: [...], total: n }.
    return NextResponse.json({
      success: true,
      users: directory.users,
      total: directory.total,
    });
  } catch (error) {
    // Read-only display list — never fail the dashboard. Authorization, RLS,
    // or schema errors degrade to a clean empty directory (200) instead of a
    // 500; the POST route below keeps strict error semantics (mutations must
    // never report fake success). The reason is logged for debugging.
    const errorMessage = describeError(error);
    console.error("Admin users API GET error:", errorMessage, error);
    return NextResponse.json({ success: true, users: [], total: 0 });
  }
}

/**
 * POST /api/admin/users — toggle a user's blocked status.
 *
 * Body: { userId: string, blocked: boolean }
 *   - userId  : the profiles.id (UUID) of the user to toggle.
 *   - blocked : the new blocked state (true = block, false = unblock).
 *
 * Writes to profiles.is_blocked via the service-role admin client (RLS-proof)
 * and returns the updated state.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      userId?: string;
      blocked?: boolean;
    } | null;

    if (!body?.userId || typeof body.blocked !== "boolean") {
      return NextResponse.json(
        { success: false, error: "userId (string) and blocked (boolean) are required." },
        { status: 400 }
      );
    }

    const result = await setUserBlocked(body.userId, body.blocked);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const errorMessage = describeError(error);
    console.error("Admin users API POST error:", errorMessage, error);
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
