import { GET, POST, dynamic, revalidate } from "../../admin/broadcast/route";

// ============================================================================
// /api/telegram/broadcast — alias of /api/admin/broadcast.
//
// Kept as a separate path so the documented Telegram broadcast URL works while
// the implementation lives in ONE place (app/api/admin/broadcast/route.ts):
//
//   • Recipients: getTelegramBroadcastChatIds() over the SERVICE-ROLE client
//     selects from profiles using OR-based filtering:
//     `telegram_chat_id IS NOT NULL OR telegram_id IS NOT NULL`, resolving
//     each row's effective chat id as COALESCE(telegram_chat_id, telegram_id::text).
//     It is NOT filtered by is_registered or any other Mini App onboarding
//     flag — every profile with a Telegram identity receives the broadcast.
//   • Delivery: one sendMessage/sendPhoto per chat id (~20 msg/s, per-recipient
//     failures tolerated) so "Post Now"-style broadcasts reach ALL stored
//     users without blocking on any single send.
//   • Auth: admin session required (the chat-id registry is user data).
//
// See app/api/admin/broadcast/route.ts for the full GET/POST contract.
// ============================================================================
export { dynamic, revalidate, GET, POST };
