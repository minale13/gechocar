import { NextRequest } from "next/server";

import { handleBroadcastGet, handleBroadcastPost } from "@/lib/telegram-broadcast";

// Broadcasts must always run fresh — never serve cached results.
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Dedicated Telegram broadcast endpoint (also aliased at
 * /api/telegram/broadcast — see that file, which re-exports these handlers).
 *
 * GET  → reports how many chat ids are currently registered for broadcast.
 * POST → sends { text, photo_url? } to EVERY registered user chat.
 *
 * The full implementation (recipient query, auth, delivery, error mapping)
 * lives in lib/telegram-broadcast.ts so both routes share ONE code path.
 */

export async function GET() {
  return handleBroadcastGet();
}

export async function POST(request: NextRequest) {
  return handleBroadcastPost(request);
}
