import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import {
  getAppSettings,
  getLotteries,
  saveAppSettings,
  saveLotteryItem,
  deleteLotteryItem,
  getSupportSettings,
  saveSupportSettings,
  getPaymentMethods,
  savePaymentMethod,
  togglePaymentMethod,
  deletePaymentMethod,
  getTelegramSettings,
  saveTelegramSettings,
  testTelegramConnection,
  postLotteryToTelegram,
  updatePaymentReceiptStatus,
  getTelegramScheduler,
  saveTelegramScheduler,
  postSchedulerNow,
} from "@/lib/admin/management";

// Admin mutations and reads must always run fresh — never serve cached
// responses for settings management. (The payment receipt queue lives on
// GET /api/admin/receipts — paginated, .limit(20) initial page — see
// app/api/admin/receipts/route.ts.)
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Mock data for fallback when Supabase is unavailable (GET only).
const MOCK_LOTTERIES = [
  {
    id: "00000000-0000-0000-0000-000000000001",
    name: "Gold Reserve Draw",
    description: "Exclusive golden ticket draw",
    image_url: "https://via.placeholder.com/300x200?text=Gold+Draw",
    status: "active",
    created_at: new Date().toISOString(),
  },
  {
    id: "00000000-0000-0000-0000-000000000002",
    name: "Luxury Prize Pool",
    description: "Premium raffle collection",
    image_url: "https://via.placeholder.com/300x200?text=Luxury",
    status: "active",
    created_at: new Date().toISOString(),
  },
];

const MOCK_SETTINGS = {
  app_title: "Admas Lottery",
  logo_url: "",
  banner_image: "",
  ticket_price: 2500,
  total_tickets: 100,
};

/** Extract a readable message + code/details/hint from any thrown error. */
function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message?: unknown }).message);
  }
  return String(error ?? "Unknown error");
}

export async function GET() {
  // PARALLEL FETCH CONTRACT: every bootstrap data source (lotteries, settings,
  // support, payment methods, telegram config, scheduler) runs inside ONE
  // Promise.all — total wait equals the slowest single request instead of the
  // sum of six sequential round-trips.
  //
  // RECEIPTS: the payment receipt queue is NOT part of this payload anymore.
  // It previously forced this route to query the ENTIRE payments table on
  // every dashboard load AND every 30s poll. Receipts now load through
  // GET /api/admin/receipts (SWR-cached, .limit(20) initial page, "Load more"
  // pagination, realtime revalidation), keeping this bootstrap small and fast.
  try {
    const [lotteries, settings, supportSettings, paymentMethods, telegramSettings, telegramScheduler] =
      await Promise.all([
        getLotteries(),
        getAppSettings(),
        getSupportSettings(),
        getPaymentMethods(),
        getTelegramSettings(),
        getTelegramScheduler(),
      ]);

    return NextResponse.json({
      success: true,
      data: {
        lotteries,
        settings: {
          appTitle: settings.app_title || "Admas Lottery",
          logoUrl: settings.logo_url || "",
          bannerImage: settings.banner_image || "",
          ticketPrice: settings.ticket_price || "",
          totalTickets: settings.total_tickets || "",
          drawDatetime: settings.draw_datetime || "",
        },
        supportSettings,
        paymentMethods,
        telegramSettings,
        telegramScheduler,
      },
    });
  } catch (error) {
    // Log the error for debugging
    const errorMessage = describeError(error);
    console.error("Admin API GET error:", errorMessage, error);

    // Return mock data with 200 status regardless of error (auth, Supabase, etc.)
    // This allows local development to work even without proper auth setup.
    return NextResponse.json({
      success: true,
      data: {
        lotteries: MOCK_LOTTERIES,
        settings: {
          appTitle: MOCK_SETTINGS.app_title,
          logoUrl: MOCK_SETTINGS.logo_url,
          bannerImage: MOCK_SETTINGS.banner_image,
          ticketPrice: MOCK_SETTINGS.ticket_price,
          totalTickets: MOCK_SETTINGS.total_tickets,
        },
        supportSettings: {
          supportUsername: "@admas_support",
          supportContact: "@admas_support",
          supportPhone: "",
        },
        paymentMethods: [],
        telegramSettings: { botToken: "", chatId: "" },
        telegramScheduler: null,
      },
      _notice: "Using mock data (authorization or Supabase unavailable)",
    }, { status: 200 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { type, payload } = body ?? {};

    if (!type || !payload) {
      return NextResponse.json({ error: "Missing request type or payload." }, { status: 400 });
    }

    if (type === "lottery-item") {
      const result = await saveLotteryItem(payload);
      // Invalidate the cached Host page so the saved lottery item shows up
      // immediately on the next visit.
      revalidatePath("/");
      return NextResponse.json({ success: true, data: result });
    }

    if (type === "app-settings") {
      const result = await saveAppSettings(payload);
      // Invalidate the Host page so updated ticket price / total tickets /
      // app title / logo are reflected immediately.
      revalidatePath("/");
      return NextResponse.json({ success: true, data: result });
    }

    if (type === "delete-lottery-item") {
      const { id } = payload;
      if (!id) return NextResponse.json({ error: "Missing lottery item id." }, { status: 400 });

      // deleteLotteryItem verifies the row actually existed and was removed
      // (guards against RLS silently filtering deletes). Throws on failure.
      const result = await deleteLotteryItem(String(id));
      // Invalidate the Host page so the deleted lottery item disappears
      // immediately on the next visit.
      revalidatePath("/");
      return NextResponse.json({ success: true, data: result });
    }

    if (type === "support-settings") {
      const result = await saveSupportSettings({
        supportUsername: String(payload.supportUsername ?? ""),
        supportContact: String(payload.supportContact ?? ""),
        supportPhone: String(payload.supportPhone ?? ""),
      });
      return NextResponse.json({ success: true, data: result });
    }

    if (type === "payment-method") {
      const result = await savePaymentMethod(payload);
      return NextResponse.json({ success: true, data: result });
    }

    if (type === "toggle-payment-method") {
      const { id, isActive } = payload;
      if (!id) return NextResponse.json({ error: "Missing payment method id." }, { status: 400 });
      const result = await togglePaymentMethod(id, Boolean(isActive));
      return NextResponse.json({ success: true, data: result });
    }

    if (type === "delete-payment-method") {
      const { id } = payload;
      if (!id) return NextResponse.json({ error: "Missing payment method id." }, { status: 400 });
      const result = await deletePaymentMethod(id);
      return NextResponse.json({ success: true, data: result });
    }

    if (type === "telegram-settings") {
      const result = await saveTelegramSettings({
        botToken: String(payload.botToken ?? ""),
        chatId: String(payload.chatId ?? ""),
      });
      return NextResponse.json({ success: true, data: result });
    }

    if (type === "test-telegram") {
      const result = await testTelegramConnection();
      return NextResponse.json({ success: true, data: result });
    }

    if (type === "post-to-telegram") {
      const { id } = payload;
      if (!id) return NextResponse.json({ error: "Missing lottery item id." }, { status: 400 });
      const result = await postLotteryToTelegram(String(id));
      return NextResponse.json({ success: true, data: result });
    }

    if (type === "update-receipt-status") {
      const { id, status, note, rejectionReason } = payload;
      if (!id) return NextResponse.json({ error: "Missing receipt id." }, { status: 400 });
      if (status !== "approved" && status !== "rejected") {
        return NextResponse.json({ error: "Invalid receipt status." }, { status: 400 });
      }
      const result = await updatePaymentReceiptStatus(
        String(id),
        status,
        typeof note === "string" && note.trim() ? note.trim() : null,
        typeof rejectionReason === "string" && rejectionReason.trim()
          ? rejectionReason.trim()
          : null,
      );
      // Ticket availability changed (sold / released) and the receipt queue
      // changed — revalidate the Mini App home page and the admin dashboard
      // so server-rendered content picks up the new state immediately.
      revalidatePath("/");
      revalidatePath("/admin");
      return NextResponse.json({ success: true, data: result });
    }

    if (type === "telegram-scheduler") {
      const result = await saveTelegramScheduler({
        id: payload.id ? String(payload.id) : undefined,
        caption: String(payload.caption ?? ""),
        imageUrl: String(payload.imageUrl ?? ""),
        intervalHours: Number(payload.intervalHours) || 0,
        intervalMinutes: Number(payload.intervalMinutes) || 0,
        isActive: Boolean(payload.isActive),
        botToken: String(payload.botToken ?? ""),
        chatId: String(payload.chatId ?? ""),
      });
      return NextResponse.json({ success: true, data: result });
    }

    if (type === "post-scheduler-now") {
      const result = await postSchedulerNow();
      return NextResponse.json({ success: true, data: result });
    }

    return NextResponse.json({ error: "Unsupported action type." }, { status: 400 });
  } catch (error) {
    // IMPORTANT: mutations must NEVER report fake success. Previously this
    // catch returned { success: true } which masked every failure (RLS,
    // auth, schema mismatch) — e.g. settings saves appeared to work but
    // never persisted, breaking price updates and navigation state.
    const errorMessage = describeError(error);
    console.error("Admin API POST error:", errorMessage, error);

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}