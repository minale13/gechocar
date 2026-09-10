import { NextResponse } from "next/server";
import {
  getTelegramUserStats,
  type TelegramUserStats,
} from "@/lib/admin/management";

/**
 * Admin user analytics — GET /api/admin/user-stats
 *
 * Returns the profile-based user metrics rendered by the Settings tab metric
 * cards (above the Auto-Post Scheduler):
 *   • totalRegistered    — count of ALL rows in public.profiles (every
 *   • activeMiniApp24h   — Mini App opens in the last 24 hours.
 *   • activeMiniAppTotal — all-time Mini App opens.
 *
 * Authorization failures and Supabase errors return 200 with zeroed stats so
 * the dashboard card degrades gracefully instead of throwing.
 */
export async function GET() {
  const emptyStats: TelegramUserStats = {
    totalRegistered: 0,
    activeMiniApp24h: 0,
    activeMiniAppTotal: 0,
  };

  try {
    const stats = await getTelegramUserStats();
    return NextResponse.json({ success: true, data: stats });
  } catch (error) {
    console.error("Admin user-stats API error:", error);
    return NextResponse.json(
      { success: false, data: emptyStats },
      { status: 200 }
    );
  }
}
