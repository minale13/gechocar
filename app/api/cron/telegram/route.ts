import { NextRequest, NextResponse } from "next/server";
import { runTelegramSchedulerCron } from "@/lib/admin/management";

// This endpoint reads cookies via createSupabaseServerClient and must always
// execute fresh at request time — a statically cached snapshot would break
// interval scheduling. Also silences the DYNAMIC_SERVER_USAGE build warning.
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Background cron runner for the Telegram Auto-Post Scheduler.
 *
 * This endpoint is called periodically (e.g. by Vercel Cron, an external
 * uptime monitor, or a manual ping) and checks whether the configured
 * interval has elapsed. If so, it sends the scheduled image + text to the
 * configured Telegram bot/channel.
 *
 * It is intentionally lightweight and idempotent — it only sends when the
 * interval timer has passed, so calling it frequently is safe.
 *
 * RESPONSE CONTRACT — always valid JSON, never an unhandled crash:
 *   200 { success: true, ... }                          → ran or safely skipped
 *   200 { success: false, skipped: true, reason, error} → handleable failure
 *                                                         (missing env, DB
 *                                                         schema mismatch…)
 *   401 { success: false, error }                       → CRON_SECRET mismatch
 *   500 { success: false, error }                       → truly unexpected only
 */
export async function GET(request: NextRequest) {
  // CRON_SECRET is OPTIONAL. When it is configured, requests must present it
  // (Authorization: Bearer <secret> or ?secret=<secret>). When it is missing
  // the endpoint stays open — a missing env var must never throw a 500.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const provided =
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
      request.nextUrl.searchParams.get("secret") ||
      "";
    if (provided !== cronSecret) {
      console.warn("Telegram cron: rejected request — invalid or missing CRON_SECRET.");
      return NextResponse.json(
        { success: false, error: "Unauthorized: invalid or missing CRON_SECRET." },
        { status: 401 },
      );
    }
  }

  try {
    const result = await runTelegramSchedulerCron();

    // Structured, handleable failures come back as 200 with success:false —
    // the Admin poller checks result?.success so this stays compatible.
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    // Last-resort safety net: log the exact error and answer with JSON.
    const message =
      error instanceof Error ? error.message : "Scheduled Telegram post failed.";
    console.error("Telegram scheduler cron error:", message, error);

    // Classify the failure so the status code is meaningful:
    //  - Supabase/Postgrest errors (have code/details/hint)  → 503 Unavailable
    //  - Telegram Bot API failures                           → 502 Bad Gateway
    //  - anything else                                       → 500 Internal
    const asPostgrest = error as { code?: unknown; details?: unknown; hint?: unknown };
    const isPostgrest =
      typeof asPostgrest === "object" &&
      asPostgrest !== null &&
      ("code" in asPostgrest || "details" in asPostgrest || "hint" in asPostgrest);
    const isTelegramFailure = /telegram/i.test(message);

    const status = isPostgrest ? 503 : isTelegramFailure ? 502 : 500;

    return NextResponse.json(
      { success: false, error: message },
      { status },
    );
  }
}