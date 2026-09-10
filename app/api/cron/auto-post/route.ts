import { NextRequest, NextResponse } from "next/server";
import { runTelegramSchedulerCron } from "@/lib/admin/management";

// Reads the scheduler state via the Supabase server client — must always
// execute fresh at request time (a cached snapshot would break scheduling).
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/cron/auto-post — SERVER-SIDE Auto-Post execution for Vercel Cron.
 *
 * Registered in vercel.json as a Vercel Cron Job running every 15 minutes:
 *
 *   crons: [{ path: "/api/cron/auto-post", schedule: "every 15 minutes" }]
 *
 * (The schedule value in vercel.json is the standard cron expression for
 * every 15 minutes.)
 *
 * Previously auto-posting relied on the Admin Dashboard pinging the endpoint
 * from the browser — which stops the moment the admin closes the tab. This
 * route is triggered by Vercel's infrastructure instead, so scheduled image +
 * caption posts are dispatched to the configured Telegram chat (or broadcast
 * to every registered user's chat in broadcast mode) even when NO browser is
 * open.
 *
 * CONTRACT (identical to GET /api/cron/telegram — the two endpoints are
 * interchangeable and safe to call concurrently because the runner is
 * interval-guarded and idempotent):
 *   200 { success: true, ... }                          → ran or safely skipped
 *   200 { success: false, skipped: true, reason, error} → handleable failure
 *                                                         (missing env, DB
 *                                                         schema mismatch…)
 *   401 { success: false, error }                       → CRON_SECRET mismatch
 *   500 { success: false, error }                       → truly unexpected only
 *
 * CRON_SECRET: Vercel Cron automatically sends
 * `Authorization: Bearer $CRON_SECRET` when the env var is configured — which
 * this route validates. External uptime monitors can use `?secret=<secret>`.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const provided =
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
      request.nextUrl.searchParams.get("secret") ||
      "";
    if (provided !== cronSecret) {
      console.warn("Auto-post cron: rejected request — invalid or missing CRON_SECRET.");
      return NextResponse.json(
        { success: false, error: "Unauthorized: invalid or missing CRON_SECRET." },
        { status: 401 }
      );
    }
  }

  try {
    const result = await runTelegramSchedulerCron();
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    // Last-resort safety net: log the exact error and answer with JSON.
    const message =
      error instanceof Error ? error.message : "Scheduled auto-post failed.";
    console.error("Auto-post cron error:", message, error);

    const asPostgrest = error as { code?: unknown; details?: unknown; hint?: unknown };
    const isPostgrest =
      typeof asPostgrest === "object" &&
      asPostgrest !== null &&
      ("code" in asPostgrest || "details" in asPostgrest || "hint" in asPostgrest);
    const isTelegramFailure = /telegram/i.test(message);

    const status = isPostgrest ? 503 : isTelegramFailure ? 502 : 500;

    return NextResponse.json({ success: false, error: message }, { status });
  }
}
