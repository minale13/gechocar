"use client";
export const dynamic = "force-dynamic";


import { useRouter } from "next/navigation";
import { revalidateHome } from "@/app/actions/revalidate-home";

/**
 * True when a hero_banners write failed because Row Level Security blocked it
 * (SQLSTATE 42501 / PGRST301 / HTTP 403 / "permission denied" / "row-level
 * security"). The Admin dashboard writes with the anon-key client (no Supabase
 * Auth session), so the hero_banners DELETE policy MUST cover the anon role —
 * supabase/migrations/022_hero_banners_delete_rls.sql guarantees that.
 */
function isHeroBannerRlsError(
  err: { code?: string; message?: string; details?: string; hint?: string } | null | undefined,
): boolean {
  const msg = [err?.code, err?.message, err?.details, err?.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return (
    /(^|\D)42501(\D|$)/.test(msg) ||
    /(^|\D)pgrst301(\D|$)/.test(msg) ||
    /(^|\D)403(\D|$)/.test(msg) ||
    msg.includes("row-level security") ||
    msg.includes("permission denied") ||
    msg.includes("violation of row-level")
  );
}
import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Inbox, LayoutDashboard, Loader2, LogOut, Settings, Ticket, Users } from "lucide-react";
import { useLanguage } from "@/components/app/language-provider";
import { languageNames } from "@/lib/translations";
import { supabase } from "@/lib/supabase/client";
import { getErrorMessage } from "@/lib/errors";
import { ToastProvider, useToast } from "@/components/admin/toast";
import { OverviewTab } from "@/components/admin/overview-tab";
import { ReceiptsTab } from "@/components/admin/receipts-tab";
import { TicketsTab } from "@/components/admin/tickets-tab";
import { SettingsTab } from "@/components/admin/settings-tab";
import type {
  AppSettings,
  HeroBanner,
  PaymentMethod,
  Receipt,
  RaffleItem,
  SupportManager,
  TelegramSchedulerSettings,
  TelegramSettings,
} from "@/components/admin/types";
import { AdminRealtimeSync } from "@/components/admin/realtime-sync";
import { UsersTab } from "@/components/admin/users-tab";

// ===== Receipt pagination (SWR) =====
// The initial load fetches ONLY the newest 20 payments rows instead of the
// entire table; "Load more" grows the page size (SWR key change +
// keepPreviousData keeps the current list on screen while the next page loads).
const RECEIPTS_PAGE_SIZE = 20;

type AdminReceiptsPayload = {
  paymentReceipts: Receipt[];
  /** Exact payments-table count across ALL statuses (same query, no extra round-trip). */
  paymentReceiptsTotal: number;
};

/** SWR fetcher for GET /api/admin/receipts — throws so error states surface. */
const adminReceiptsFetcher = async (url: string): Promise<AdminReceiptsPayload> => {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    throw new Error(
      json?.error ? getErrorMessage(json.error) : `Receipts request failed (${res.status})`
    );
  }
  return {
    paymentReceipts: Array.isArray(json.data?.paymentReceipts)
      ? (json.data.paymentReceipts as Receipt[])
      : [],
    paymentReceiptsTotal: Number(json.data?.paymentReceiptsTotal) || 0,
  };
};

export default function AdminPage() {
  return (
    <ToastProvider>
      <AdminDashboard />
    </ToastProvider>
  );
}

function AdminDashboard() {

// Payment method, support, receipt, telegram & scheduler types are shared
// via @/components/admin/types.

const MOCK_SETTINGS: AppSettings = {
  appTitle: "Admas Lottery",
  logoUrl: "",
  bannerImage: "",
  ticketPrice: 2500,
  totalTickets: 100,
  drawDatetime: "",
};

// Hardcoded mock data for local development.
// NOTE: IDs MUST be valid UUIDs — the Supabase lottery_items.id column is a
// uuid type, so a value like "mock-1" causes
// "invalid input syntax for type uuid" on any DELETE/UPDATE/INSERT attempt.
const MOCK_ITEM_IDS = [
  "00000000-0000-0000-0000-000000000001",
  "00000000-0000-0000-0000-000000000002",
];

const isMockItemId = (id: string) => MOCK_ITEM_IDS.includes(id);

// Postgres uuid column format — anything else must never reach a
// .delete()/.update()/.eq("id", ...) query, otherwise Supabase crashes with
// "invalid input syntax for type uuid".
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MOCK_ITEMS: RaffleItem[] = [
  {
    id: MOCK_ITEM_IDS[0],
    title: "Gold Reserve Draw",
    description: "Exclusive golden ticket draw",
    price: 5000,
    imageUrl: "https://via.placeholder.com/300x200?text=Gold+Draw",
    location: "Addis Ababa",
    tickets: 100,
    rank: 1,
    drawDate: "",
  },
  {
    id: MOCK_ITEM_IDS[1],
    title: "Luxury Prize Pool",
    description: "Premium raffle collection",
    price: 3000,
    imageUrl: "https://via.placeholder.com/300x200?text=Luxury",
    location: "Dire Dawa",
    tickets: 50,
    rank: 2,
    drawDate: "",
  },
];

const MOCK_SUPPORT: SupportManager = {
  username: "@admas_support",
  contact: "@admas_support",
  phone: "",
};

const MOCK_TELEGRAM_SETTINGS: TelegramSettings = {
  botToken: "",
  chatId: "",
};

const blankSchedulerForm = (): TelegramSchedulerSettings => ({
  id: undefined,
  caption: "",
  imageUrl: "",
  intervalHours: 24,
  intervalMinutes: 0,
  isActive: true,
  botToken: "",
  chatId: "",
  lastPostedAt: null,
});

// The Raffle Item form NEVER collects Ticket Price / Total Tickets.
// Price & Total Tickets are strictly inherited from the global app_settings
// values (Admin → App Settings) and applied to every item at save time. The
// prize rank (1-5 + መጽናኛ consolation) IS collected from the rank dropdown and
// written straight into lottery_items.rank. The form keeps: Title,
// Description, Location, Prize Rank, Draw Date & Time, and the Image Upload.
const blankItemForm = () => ({
  title: "",
  description: "",
  imageUrl: "",
  location: "",
  rank: 1,
  drawDatetime: "",
});

const blankBannerForm = () => ({
  id: "",
  title: "",
  imageUrl: "",
  linkUrl: "",
  isActive: true,
  sortOrder: 0,
});

const blankSettingsForm = (): AppSettings => ({
  appTitle: "Admas Lottery",
  logoUrl: "",
  bannerImage: "",
  ticketPrice: 2500,
  totalTickets: 100,
  drawDatetime: "",
});

const blankPaymentMethod = () => ({
  id: "",
  bank_name: "",
  account_name: "",
  account_number: "",
  is_active: true,
  sort_order: 0,
});

const hasAdminSession = () => {
  if (typeof document !== "undefined") {
    const cookieMatch = document.cookie
      .split("; ")
      .some((cookie) => cookie.startsWith("admas-admin-auth="));

    if (cookieMatch) {
      return true;
    }
  }

  if (typeof window !== "undefined") {
    return window.localStorage.getItem("admas-admin-auth") === "admin";
  }

  return false;
};

const inputClass =
  "w-full rounded-xl border border-slate-700 bg-[#0B141B] px-3 py-2.5 text-sm text-white outline-none ring-0 transition placeholder:text-slate-500 focus:border-yellow-500/50 focus:ring-2 focus:ring-yellow-500/20";

const labelClass = "mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-400";

/** Human-friendly label for the Hours/Minutes interval timer. */
const formatIntervalLabel = (hours: number, minutes: number) => {
  const h = Math.max(0, Number(hours) || 0);
  const m = Math.max(0, Number(minutes) || 0);
  if (h > 0 && m > 0) return `Every ${h}h ${m}m`;
  if (h > 0) return `Every ${h} hour${h === 1 ? "" : "s"}`;
  if (m > 0) return `Every ${m} minute${m === 1 ? "" : "s"}`;
  return "Not set";
};

  const router = useRouter();
  const { language, setLanguage, t } = useLanguage();

  const [itemForm, setItemForm] = useState(blankItemForm());
  const [bannerForm, setBannerForm] = useState(blankBannerForm());
  const [savedBanners, setSavedBanners] = useState<HeroBanner[]>([]);
  const [selectedBannerId, setSelectedBannerId] = useState<string | null>(null);
  // Hero banner image FILE upload: the picked file is held here and uploaded
  // to Supabase Storage when "Save Banner" is clicked (base64 data-URL
  // preview is written into bannerForm.imageUrl in the meantime).
  const [bannerImageFile, setBannerImageFile] = useState<File | null>(null);
  const [uploadingBannerImage, setUploadingBannerImage] = useState(false);
  const [savingBanner, setSavingBanner] = useState(false);
  const [settingsForm, setSettingsForm] = useState<AppSettings>(blankSettingsForm());
  const [supportManager, setSupportManager] = useState<SupportManager>(MOCK_SUPPORT);
  const [editingSupportManager, setEditingSupportManager] = useState<SupportManager>(MOCK_SUPPORT);
  const [showSupportManagerForm, setShowSupportManagerForm] = useState(false);

  // Payment methods CRUD state
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [paymentMethodForm, setPaymentMethodForm] = useState(blankPaymentMethod());
  const [savingPaymentMethod, setSavingPaymentMethod] = useState(false);
  const [showPaymentMethodForm, setShowPaymentMethodForm] = useState(false);

  const [receiptTab, setReceiptTab] = useState<"pending" | "approved">("pending");
  // Authorization gate — declared here (BEFORE the SWR hook below) because the
  // receipts SWR key stays null (no fetching) until the local admin session
  // exists. The duplicate declaration further down was removed.
  const [isAuthorized, setIsAuthorized] = useState(false);

  // ===== Receipts — SWR cached, paginated, realtime-revalidatable =====
  // Replaces the old full-table useState + 30s setInterval poll with SWR:
  //   • request de-duplication + in-memory cache across mounts (fast re-entry)
  //   • 30s refreshInterval + revalidateOnFocus (same cadence as the old poll)
  //   • mutate() from the Supabase Realtime subscription → instant updates
  //   • optimistic approve/decline via mutate without revalidation
  //   • pagination via the SWR key: only RECEIPTS_PAGE_SIZE rows load
  //     initially; "Load more" grows the limit while keepPreviousData holds
  //     the current list on screen.
  const [receiptsPageSize, setReceiptsPageSize] = useState(RECEIPTS_PAGE_SIZE);
  const {
    data: receiptsPage,
    mutate: mutateReceipts,
    isLoading: receiptsInitialLoading,
    isValidating: receiptsValidating,
  } = useSWR<AdminReceiptsPayload>(
    isAuthorized ? `/api/admin/receipts?limit=${receiptsPageSize}` : null,
    adminReceiptsFetcher,
    {
      refreshInterval: 30_000,
      revalidateOnFocus: true,
      keepPreviousData: true,
      dedupingInterval: 5_000,
    },
  );
  const loadedReceipts = useMemo<Receipt[]>(
    () => receiptsPage?.paymentReceipts ?? [],
    [receiptsPage],
  );
  const receiptsTotal = Number(receiptsPage?.paymentReceiptsTotal) || 0;
  const hasMoreReceipts = loadedReceipts.length < receiptsTotal;
  // Split by status: pending under "Pending Approval" / approved under
  // "Approved Submissions" (memoized so every consumer recomputes once).
  const pendingReceipts = useMemo(
    () => loadedReceipts.filter((r) => r.status === "pending"),
    [loadedReceipts]
  );
  const approvedReceipts = useMemo(
    () => loadedReceipts.filter((r) => r.status === "approved"),
    [loadedReceipts]
  );
  // Full-page spinner only on the very first load; background revalidations
  // (SWR interval, realtime mutate, "Load more") never blank the queue.
  const receiptsLoading = receiptsInitialLoading || (receiptsValidating && !receiptsPage);
  // Receipt verification modal (full-resolution preview + approve/reject).
  const [previewReceipt, setPreviewReceipt] = useState<Receipt | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  // Optional note written when rejecting — stored on payments.admin_note and
  // shown to the user in the Mini App "Pending" tab.
  const [rejectNote, setRejectNote] = useState("");

  /** Open the verification modal with a clean rejection note. */
  const openReceiptPreview = (receipt: Receipt) => {
    setRejectNote("");
    setPreviewReceipt(receipt);
  };

  /** Close the verification modal and clear the rejection note. */
  const closeReceiptPreview = () => {
    setPreviewReceipt(null);
    setRejectNote("");
  };

  // Telegram bot auto-posting state
  const [telegramSettings, setTelegramSettings] = useState<TelegramSettings>(MOCK_TELEGRAM_SETTINGS);
  const [savingTelegramSettings, setSavingTelegramSettings] = useState(false);
  const [testingTelegram, setTestingTelegram] = useState(false);
  const [postingToTelegramId, setPostingToTelegramId] = useState<string | null>(null);

  // Telegram scheduler state
  const [schedulerForm, setSchedulerForm] = useState<TelegramSchedulerSettings>(blankSchedulerForm());
  const [savingScheduler, setSavingScheduler] = useState(false);
  const [postingSchedulerNow, setPostingSchedulerNow] = useState(false);
  const [uploadingSchedulerImage, setUploadingSchedulerImage] = useState(false);
  const [nextPostInMin, setNextPostInMin] = useState<number | null>(null);
  const [manualTicketsSold, setManualTicketsSold] = useState(0);
  const [savedItems, setSavedItems] = useState<RaffleItem[]>(MOCK_ITEMS);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [loading, setLoading] = useState(false);

  const [savingItem, setSavingItem] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingSupportManager, setSavingSupportManager] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<
    "overview" | "receipts" | "tickets" | "users" | "settings"
  >("overview");

  // Toast bridge — every admin action reports through setStatus; surface each
  // report as an animated toast (replaces the old inline status pill).
  useEffect(() => {
    if (status) {
      toast.push(status.type, status.text);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const loadSavedData = useCallback(async () => {
    setLoading(true);

    try {
      // PARALLEL FETCH CONTRACT: lottery items, hero banners, payment methods
      // and the /api/admin bootstrap (settings, support, telegram, scheduler)
      // previously loaded as four SEQUENTIAL awaits — each round-trip added its
      // full latency to the initial dashboard render. All four now run inside
      // ONE Promise.all, so the wait equals the slowest request, not the sum.
      //
      // RECEIPTS are intentionally NOT fetched here: they stream through the
      // SWR /api/admin/receipts hook above (paginated .limit(20) initial page,
      // realtime-mutated) — keeping this bootstrap fast and small.
      const [itemsResult, bannersResult, paymentMethodsResult, result] = await Promise.all([
        supabase
          .from("lottery_items")
          .select("*")
          .order("rank", { ascending: true, nullsFirst: false }),
        supabase
          .from("hero_banners")
          .select("*")
          .order("sort_order", { ascending: true, nullsFirst: false }),
        supabase
          .from("payment_methods")
          .select("*")
          .order("sort_order", { ascending: true, nullsFirst: false }),
        fetch("/api/admin", { method: "GET", cache: "no-store" })
          .then((res) => res.json())
          .catch(() => null),
      ]);

      // Non-fatal: a failed items query must NOT skip the bootstrap hydration
      // below (previously any early throw left Pending Receipts permanently empty).
      const { data: items, error: itemsError } = itemsResult;
      if (itemsError) {
        console.error("loadSavedData: lottery_items failed:", getErrorMessage(itemsError));
      }

      if (items && items.length > 0) {
        setSavedItems(
          items.map((item) => ({
            id: item.id,
            title: item.title,
            description: item.description ?? "",
            price: Number(item.price) || 0,
            imageUrl: item.image_url ?? "",
            location: item.location ?? "",
            tickets: Number(item.tickets) || 0,
            rank: Number(item.rank) || 0,
            drawDate: item.draw_datetime ?? "",
          }))
        );
      } else {
        setSavedItems([]);
      }

      const { data: banners, error: bannersError } = bannersResult;
      // Non-fatal — see note above.
      if (bannersError) {
        console.error("loadSavedData: hero_banners failed:", getErrorMessage(bannersError));
      }

      setSavedBanners(
        (banners ?? []).map((banner) => ({
          id: banner.id,
          title: banner.title,
          imageUrl: banner.image_url ?? "",
          linkUrl: banner.link_url ?? "",
          isActive: banner.is_active,
          sortOrder: Number(banner.sort_order) || 0,
        }))
      );

      const { data: paymentMethodsData, error: paymentMethodsError } = paymentMethodsResult;
      // Non-fatal — see note above.
      if (paymentMethodsError) {
        console.error(
          "loadSavedData: payment_methods failed:",
          getErrorMessage(paymentMethodsError)
        );
      }

      setPaymentMethods(paymentMethodsData ?? []);

      // Bootstrap hydration — settings / support / telegram / scheduler from
      // the (now receipt-free) GET /api/admin payload.
      if (result?.success) {
        const { settings, supportSettings, telegramSettings: loadedTelegram } = result.data ?? {};
        if (settings) {
          setSettingsForm({
            appTitle: settings.appTitle || "Admas Lottery",
            logoUrl: settings.logoUrl || "",
            bannerImage: settings.bannerImage || "",
            ticketPrice: Number(settings.ticketPrice) || 2500,
            totalTickets: Number(settings.totalTickets) || 10000,
            drawDatetime: settings.drawDatetime || "",
          });
        }
        // Dynamic support team info loaded from app_settings ('support' key).
        if (supportSettings) {
          const loadedSupport: SupportManager = {
            username: supportSettings.supportUsername || "@admas_support",
            contact: supportSettings.supportContact || "@admas_support",
            phone: supportSettings.supportPhone || "",
          };
          setSupportManager(loadedSupport);
          setEditingSupportManager(loadedSupport);
        }
        // Telegram bot settings loaded from app_settings.
        if (loadedTelegram) {
          setTelegramSettings({
            botToken: loadedTelegram.botToken || "",
            chatId: loadedTelegram.chatId || "",
          });
        }
        // Telegram scheduler config loaded from telegram_scheduler table.
        const { telegramScheduler } = result.data ?? {};
        if (telegramScheduler) {
          setSchedulerForm({
            id: telegramScheduler.id ?? undefined,
            caption: telegramScheduler.caption || "",
            imageUrl: telegramScheduler.imageUrl || "",
            intervalHours: Number(telegramScheduler.intervalHours) || 0,
            intervalMinutes: Number(telegramScheduler.intervalMinutes) || 0,
            isActive: telegramScheduler.isActive === true,
            botToken: telegramScheduler.botToken || "",
            chatId: telegramScheduler.chatId || "",
            lastPostedAt: telegramScheduler.lastPostedAt ?? null,
          });
        }
      }
    } catch (error) {
      // Network error or parse error - use mock data silently. Receipts live
      // in the SWR hook above and are never overwritten here.
      console.warn("Failed to fetch admin data using mock defaults:", error);
      setSavedItems(MOCK_ITEMS);
      setSettingsForm(MOCK_SETTINGS);
    } finally {
      setLoading(false);
    }
  }, []);

  // Mount effect — gate on the local admin session, then hydrate all
  // dashboard data (items, banners, payment methods, settings, receipts).
  useEffect(() => {
    setIsClient(true);
    // Check if user has local admin session
    if (!hasAdminSession()) {
      // Not authorized - redirect to login
      router.replace("/login");
      return;
    }

    // User is authorized locally, load data
    setIsAuthorized(true);
    loadSavedData();
  }, [router, loadSavedData]);

  // ===== Supabase Realtime handlers (mounted via <AdminRealtimeSync />) =====
  // postgres_changes events from payments / telegram_scheduler / lottery_items
  // land here and refresh ONLY the affected slice of dashboard state — the UI
  // updates instantly without a manual browser reload, without waiting for the
  // SWR 30s interval, and without a full loadSavedData() re-fetch.

  /** payments INSERT/UPDATE/DELETE → revalidate the cached SWR receipts page. */
  const handleRealtimePaymentsChange = useCallback(() => {
    void mutateReceipts();
  }, [mutateReceipts]);

  /**
   * telegram_scheduler INSERT/UPDATE → the telegram-bot/cron service stamps
   * last_posted_at after every delivered auto-post. Patch ONLY that form field
   * so the "Last Posted" display updates live WITHOUT clobbering the caption/
   * image/interval values the admin may be editing right now.
   */
  const handleRealtimeSchedulerChange = useCallback(
    (patch: { lastPostedAt?: string | null }) => {
      setSchedulerForm((prev) => ({
        ...prev,
        ...(patch.lastPostedAt !== undefined ? { lastPostedAt: patch.lastPostedAt } : {}),
      }));
    },
    []
  );

  /** lottery_items INSERT/UPDATE/DELETE → re-fetch just the saved items list. */
  const refreshSavedItems = useCallback(async () => {
    try {
      const { data: items, error: itemsError } = await supabase
        .from("lottery_items")
        .select("*")
        .order("rank", { ascending: true, nullsFirst: false });

      if (itemsError) {
        console.error("refreshSavedItems: lottery_items failed:", getErrorMessage(itemsError));
        return;
      }

      setSavedItems(
        (items ?? []).map((item) => ({
          id: item.id,
          title: item.title,
          description: item.description ?? "",
          price: Number(item.price) || 0,
          imageUrl: item.image_url ?? "",
          location: item.location ?? "",
          tickets: Number(item.tickets) || 0,
          rank: Number(item.rank) || 0,
          drawDate: item.draw_datetime ?? "",
        })),
      );
    } catch (itemsCatch) {
      // Non-fatal — the SWR 30s interval and the next loadSavedData() retry.
      console.warn("refreshSavedItems skipped:", itemsCatch);
    }
  }, []);

  /** "Load more" — grow the SWR page size (keepPreviousData holds the list). */
  const handleLoadMoreReceipts = useCallback(() => {
    setReceiptsPageSize((prev) => prev + RECEIPTS_PAGE_SIZE);
  }, []);

  // ===== Telegram Auto-Post — in-page ping (display + instant trigger) =====
  // SERVER-SIDE CRON now owns auto-post execution: Vercel Cron hits
  // GET /api/cron/auto-post every 15 minutes (vercel.json → "crons") and
  // dispatches scheduled image + caption posts to the configured Telegram
  // chat — or broadcasts to every registered user's chat — EVEN WHEN the
  // admin dashboard is closed. This in-page ping remains purely as a UI
  // refresher (the "Next Post" countdown) plus an instant trigger while an
  // admin happens to have the dashboard open. The runner is interval-guarded
  // and idempotent, so both callers can never double-post.
  useEffect(() => {
    if (!schedulerForm.isActive) {
      setNextPostInMin(null);
      return;
    }

    const tick = async () => {
      try {
        const res = await fetch("/api/cron/telegram", { cache: "no-store" });
        const result = await res.json().catch(() => null);
        if (result?.success && !result?.skipped && result?.messageId) {
          // A post just went out — refresh Last Posted locally.
          setSchedulerForm((prev) => ({
            ...prev,
            lastPostedAt: new Date().toISOString(),
          }));
        }
        setNextPostInMin(
          typeof result?.nextInMin === "number" ? Number(result.nextInMin) : null
        );
      } catch {
        // Network hiccup — the next tick retries automatically.
      }
    };

    void tick();
    const timer = setInterval(() => void tick(), 60_000);
    return () => clearInterval(timer);
  }, [schedulerForm.isActive]);

  const handleItemChange = (field: keyof typeof itemForm, value: string | number) => {
    setItemForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSettingsChange = (field: keyof typeof settingsForm, value: string | number) => {
    setSettingsForm((prev) => ({ ...prev, [field]: value }));
  };

  // Convert a File to a base64 data URL — used as a graceful fallback when
  // Supabase Storage is unavailable (missing bucket, RLS, network error).
  const fileToBase64 = (file: File): Promise<string | null> =>
    new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });

  /**
   * Compress & resize an image on the client side so the upload payload stays
   * small (< 1 MB) — this prevents HTTP 520 / "payload too large" errors from
   * Supabase Storage or Vercel Edge. The file is drawn onto a canvas capped at
   * MAX_DIMENSION px on its longest side, then re-encoded as JPEG (quality
   * JPEG_QUALITY). Non-drawables resolve to the original file.
   */
  const compressImage = async (file: File): Promise<File> => {
    const MAX_DIMENSION = 1200;
    const JPEG_QUALITY = 0.8;

    return new Promise((resolve) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const { width, height } = img;
        // If the image is already small enough, keep the original File to avoid
        // re-encoding artifacts.
        if (width <= MAX_DIMENSION && height <= MAX_DIMENSION) {
          resolve(file);
          return;
        }
        const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height, 1);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(file);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            // Wrap the Blob in a File so it stays compatible with the
            // Supabase upload API and the fileToBase64 helper.
            resolve(
              blob
                ? new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
                    type: "image/jpeg",
                    lastModified: Date.now(),
                  })
                : file,
            );
          },
          "image/jpeg",
          JPEG_QUALITY,
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(file);
      };
      img.src = objectUrl;
    });
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Basic client-side validation
    if (!file.type.startsWith("image/")) {
      setStatus({ type: "error", text: "Please select a valid image file for the logo." });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setStatus({ type: "error", text: "Logo image must be smaller than 2MB." });
      return;
    }

    setUploadingLogo(true);
    setStatus(null);

    // The URL that will be persisted to app_settings.logo_url — either a
    // Supabase Storage public URL OR a base64 data URL fallback.
    let logoUrlToSave: string | null = null;
    let storageUploadSucceeded = false;

    try {
      const fileExt = (file.name.split(".").pop() || "png").toLowerCase();
      // Fixed path + upsert keeps a single logo object inside the "logos"
      // bucket; the timestamp query param busts the CDN/browser cache so the
      // new logo shows immediately.
      const filePath = `app-logo.${fileExt}`;

      // a) Try uploading the file to the Supabase Storage "logos" bucket.
      const { error: uploadError } = await supabase.storage
        .from("logos")
        .upload(filePath, file, { upsert: true, contentType: file.type });

      if (!uploadError) {
        // Storage upload succeeded — use the public URL.
        const { data } = supabase.storage.from("logos").getPublicUrl(filePath);
        logoUrlToSave = `${data.publicUrl}?v=${Date.now()}`;
        storageUploadSucceeded = true;
      } else {
        // Log the FULL Supabase error so bucket/RLS/policy problems are
        // visible in the console instead of a generic failure message.
        console.error("=== Logo storage upload failed — falling back to base64 ===");
        console.error("Bucket:", "logos", "| Path:", filePath);
        console.error("Full error object:", uploadError);

        // GRACEFUL FALLBACK: Supabase Storage is configured but may be
        // offline / RLS-blocked / bucket-missing at the moment. Convert the
        // file to a base64 data URL and store it directly in app_settings.logo_url
        // so the logo upload NEVER fails for the admin.
        const base64 = await fileToBase64(file);
        if (base64) {
          logoUrlToSave = base64;
          console.warn("Logo upload: using base64 data URL fallback (storage unavailable).");
        } else {
          setStatus({
            type: "error",
            text: "Failed to read the logo file. Please try a different image.",
          });
          return;
        }
      }

      // b) Persist the new URL (storage public URL OR base64 data URL) in the
      //    app_settings table. Single-row table: update ONLY the logo_url column
      //    of row id = 1 so every other column keeps its value.
      const { error: settingsError } = await supabase
        .from("app_settings")
        .upsert(
          { id: 1, logo_url: logoUrlToSave, updated_at: new Date().toISOString() },
          { onConflict: "id" }
        );

      if (settingsError) {
        console.error("=== app_settings logo_url upsert failed ===");
        console.error("Payload:", { id: 1, logo_url: logoUrlToSave });
        console.error("Full error object:", settingsError);
        setStatus({
          type: "error",
          text: `Logo processed, but saving it to app settings failed. ${settingsError.message}`,
        });
        return;
      }

      // c) Live preview: updating state re-renders the logo <img> instantly
      //    on BOTH the Admin App Settings preview AND the Host page header.
      setSettingsForm((prev) => ({ ...prev, logoUrl: logoUrlToSave! }));
      setStatus({
        type: "success",
        text: storageUploadSucceeded
          ? "Logo uploaded and saved successfully!"
          : "Logo saved (embedded — storage unavailable).",
      });
    } catch (error) {
      console.error("Error uploading logo:", error);

      // Last-resort fallback: if we haven't managed to save anything yet,
      // try base64 one more time so the upload still succeeds.
      if (!logoUrlToSave) {
        const base64 = await fileToBase64(file);
        if (base64) {
          const { error: settingsError } = await supabase
            .from("app_settings")
            .upsert(
              { id: 1, logo_url: base64, updated_at: new Date().toISOString() },
              { onConflict: "id" }
            );
          if (!settingsError) {
            setSettingsForm((prev) => ({ ...prev, logoUrl: base64 }));
            setStatus({
              type: "success",
              text: "Logo saved (embedded — storage unavailable).",
            });
            return;
          }
        }
      }

      setStatus({ type: "error", text: "Failed to upload logo image." });
    } finally {
      setUploadingLogo(false);
      // Reset the input so the same file can be re-selected if needed.
      e.target.value = "";
    }
  };

  const handleRemoveLogo = async () => {
    try {
      const { error } = await supabase
        .from("app_settings")
        .upsert(
          { id: 1, logo_url: "", updated_at: new Date().toISOString() },
          { onConflict: "id" }
        );

      if (error) throw error;

      setSettingsForm((prev) => ({ ...prev, logoUrl: "" }));
      setStatus({ type: "success", text: "Logo removed successfully." });
    } catch (error) {
      console.error("Failed to remove logo (full error object):", error);
      setStatus({
        type: "error",
        text:
          error instanceof Error
            ? `Failed to remove logo. ${error.message}`
            : "Failed to remove logo.",
      });
    }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    setStatus(null);

    try {
      const payload = {
        appTitle: (settingsForm.appTitle || "").trim() || "Admas Lottery",
        logoUrl: (settingsForm.logoUrl || "").trim(),
        bannerImage: (settingsForm.bannerImage || "").trim(),
        ticketPrice: Number(settingsForm.ticketPrice) || 2500,
        totalTickets: Number(settingsForm.totalTickets) || 10000,
        drawDatetime: settingsForm.drawDatetime || "",
      };

      const response = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "app-settings",
          payload,
        }),
      });

      const result = await response.json();

      if (result?.success) {
        setSettingsForm({
          appTitle: payload.appTitle,
          logoUrl: payload.logoUrl,
          bannerImage: payload.bannerImage,
          ticketPrice: payload.ticketPrice,
          totalTickets: payload.totalTickets,
          drawDatetime: payload.drawDatetime,
        });
        setStatus({ type: "success", text: t("settingsSavedSuccess") });
      } else {
        throw new Error(result?.error || t("settingsSaveFailed"));
      }
    } catch (error) {
      console.error("Settings save failed:", error);
      setStatus({
        type: "error",
        text: error instanceof Error ? error.message : t("settingsSaveFailed"),
      });
    } finally {
      setSavingSettings(false);
    }
  };

  /* ===== Payment Method CRUD ===== */

  const resetPaymentMethodForm = () => {
    setPaymentMethodForm(blankPaymentMethod());
    setShowPaymentMethodForm(false);
  };

  const handleEditPaymentMethod = (method: PaymentMethod) => {
    setPaymentMethodForm({
      id: method.id,
      bank_name: method.bank_name,
      account_name: method.account_name,
      account_number: method.account_number,
      is_active: method.is_active,
      sort_order: method.sort_order,
    });
    setShowPaymentMethodForm(true);
    setStatus(null);
  };

  const handleSavePaymentMethod = async () => {
    setSavingPaymentMethod(true);
    setStatus(null);

    try {
      // Only well-formed UUIDs can exist in payment_methods.id (uuid column).
      // Anything else (stale/corrupted local state) is treated as a brand-new
      // row and omitted from the payload so the server generates a fresh UUID.
      const editId =
        paymentMethodForm.id && UUID_PATTERN.test(paymentMethodForm.id)
          ? paymentMethodForm.id
          : undefined;

      // Field names MUST exactly match the payment_methods columns:
      // bank_name, account_name, account_number, is_active (+ sort_order).
      const payload = {
        id: editId,
        bank_name: paymentMethodForm.bank_name.trim(),
        account_name: paymentMethodForm.account_name.trim(),
        account_number: paymentMethodForm.account_number.trim(),
        is_active: paymentMethodForm.is_active === true,
        sort_order: Number(paymentMethodForm.sort_order) || 0,
      };

      if (!payload.bank_name) throw new Error("Bank name is required.");
      if (!payload.account_name) throw new Error("Account name is required.");
      if (!payload.account_number) throw new Error("Account number is required.");

      // Persist through the authenticated server API (requireAdminAccess +
      // createSupabaseServerClient), which upserts into public.payment_methods.
      // This is the same path App Settings uses, so writes survive refresh.
      const response = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "payment-method", payload }),
      });

      const result = await response.json();

      if (!result?.success) {
        throw new Error(result?.error || "Failed to save payment method.");
      }

      const data = result.data as PaymentMethod;

      setPaymentMethods((prev) => {
        const filtered = prev.filter((p) => p.id !== data.id);
        return [...filtered, data].sort((a, b) => a.sort_order - b.sort_order);
      });

      resetPaymentMethodForm();
      setStatus({ type: "success", text: "Payment method saved successfully!" });
    } catch (error) {
      console.error("Payment method save failed:", error);
      setStatus({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to save payment method.",
      });
    } finally {
      setSavingPaymentMethod(false);
    }
  };

  const handleTogglePaymentMethod = async (method: PaymentMethod) => {
    setStatus(null);

    // Guard against stale/non-UUID ids reaching PostgREST ("invalid input
    // syntax for type uuid"). Rows with such ids exist only in local state,
    // so remove them from the UI and skip the database entirely.
    if (!UUID_PATTERN.test(method.id)) {
      setPaymentMethods((prev) => prev.filter((p) => p.id !== method.id));
      setStatus({
        type: "error",
        text: "Removed an invalid local payment method — its id is not a valid database UUID.",
      });
      return;
    }

    try {
      const { data, error } = await supabase
        .from("payment_methods")
        .update({ is_active: !method.is_active })
        .eq("id", method.id)
        .select()
        .single();

      if (error) throw error;

      setPaymentMethods((prev) => prev.map((p) => (p.id === data.id ? data : p)));
      setStatus({ type: "success", text: data.is_active ? "Payment method activated." : "Payment method deactivated." });
    } catch (error) {
      console.error("Payment method toggle failed:", error);
      setStatus({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to toggle payment method.",
      });
    }
  };

  const handleDeletePaymentMethod = async (methodId: string) => {
    if (!window.confirm("Delete this payment method? This cannot be undone.")) return;

    setStatus(null);

    // Only well-formed UUIDs can exist in payment_methods.id. Anything else
    // is removed from UI state only instead of crashing Supabase with
    // "invalid input syntax for type uuid".
    if (!UUID_PATTERN.test(methodId)) {
      setPaymentMethods((prev) => prev.filter((p) => p.id !== methodId));
      setStatus({
        type: "error",
        text: "Removed an invalid local payment method — its id is not a valid database UUID.",
      });
      return;
    }

    try {
      const { error } = await supabase
        .from("payment_methods")
        .delete()
        .eq("id", methodId);

      if (error) throw error;

      setPaymentMethods((prev) => prev.filter((p) => p.id !== methodId));
      setStatus({ type: "success", text: "Payment method deleted successfully!" });
    } catch (error) {
      console.error("Payment method delete failed:", error);
      setStatus({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to delete payment method.",
      });
    }
  };

  const resetItemForm = () => {
    setItemForm(blankItemForm());
    setSelectedItemId(null);
    setStatus(null);
  };

  const handleSaveItem = async () => {
    setSavingItem(true);
    setStatus(null);

    try {
      const title = (itemForm.title || "").trim();
      const description = (itemForm.description || "").trim() || null;
      // Prize rank comes from the rank dropdown (1-5 main draws, 6 = መጽናኛ
      // consolation) and is persisted directly into lottery_items.rank.
      const rank = Number(itemForm.rank) || 1;
      const location = (itemForm.location || "").trim() || null;
      const imageUrl = (itemForm.imageUrl || "").trim() || null;
      const drawDatetime = (itemForm.drawDatetime || "").trim() || null;

      if (!title) {
        throw new Error(t("requiredFieldsMissing"));
      }

      // Single source of truth: the Raffle Item form NEVER collects Ticket Price
      // or Total Tickets. Both are strictly read from the global app_settings
      // row id = 1 (Admin → App Settings) and applied to every item on save,
      // so a prize can never carry its own price or ticket count.
      const { data: settingsRow, error: settingsError } = await supabase
        .from("app_settings")
        .select("ticket_price, total_tickets")
        .eq("id", 1)
        .maybeSingle();

      if (settingsError) throw settingsError;

      const globalPrice = Number(settingsRow?.ticket_price) || 0;
      const globalTotalTickets = Number(settingsRow?.total_tickets) || 0;

      if (globalPrice <= 0 || globalTotalTickets <= 0) {
        throw new Error(t("globalTicketSettingsRequired"));
      }

      const payload = {
        title,
        description,
        price: globalPrice,
        tickets: globalTotalTickets,
        location,
        image_url: imageUrl,
        rank,
        ...(drawDatetime ? { draw_datetime: drawDatetime } : {}),
      };

      let newItem: RaffleItem;

      if (selectedItemId) {
        const { data, error } = await supabase
          .from("lottery_items")
          .update(payload)
          .eq("id", selectedItemId)
          .select()
          .single();

        if (error) throw error;
        if (!data) throw new Error(t("itemSaveFailed"));

        newItem = {
          id: data.id,
          title: data.title,
          description: data.description ?? "",
          price: Number(data.price) || 0,
          imageUrl: data.image_url ?? "",
          location: data.location ?? "",
          tickets: Number(data.tickets) || 0,
          rank: Number(data.rank) || 0,
          drawDate: data.draw_datetime ?? "",
        };
      } else {
        const { data, error } = await supabase
          .from("lottery_items")
          .insert({ ...payload, is_active: true })
          .select()
          .single();

        if (error) throw error;
        if (!data) throw new Error(t("itemSaveFailed"));

        newItem = {
          id: data.id,
          title: data.title,
          description: data.description ?? "",
          price: Number(data.price) || 0,
          imageUrl: data.image_url ?? "",
          location: data.location ?? "",
          tickets: Number(data.tickets) || 0,
          rank: Number(data.rank) || 0,
          drawDate: data.draw_datetime ?? "",
        };
      }

      setSavedItems((prev) => {
        const existing = prev.filter((item) => item.id !== newItem.id);
        return [...existing, newItem];
      });

      const isNewItem = !selectedItemId;

      resetItemForm();

      // Auto-post new lottery items to Telegram (if bot is configured).
      if (isNewItem) {
        try {
          const tgResponse = await fetch("/api/admin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "post-to-telegram",
              payload: { id: newItem.id },
            }),
          });
          const tgResult = await tgResponse.json();
          if (tgResult?.success) {
            setStatus({
              type: "success",
              text: `${t("itemSavedSuccess")} — Posted to Telegram ✓`,
            });
          } else {
            // Item saved fine, but Telegram posting failed (e.g. bot not configured).
            setStatus({
              type: "success",
              text: `${t("itemSavedSuccess")} (Telegram auto-post skipped: ${
                tgResult?.error || "unknown"
              })`,
            });
          }
        } catch (tgError) {
          console.error("Auto-post to Telegram failed:", tgError);
          setStatus({ type: "success", text: t("itemSavedSuccess") });
        }
      } else {
        setStatus({ type: "success", text: t("itemSavedSuccess") });
      }
    } catch (error) {
      console.error("Item save failed:", error);
      setStatus({
        type: "error",
        text: error instanceof Error ? error.message : t("itemSaveFailed"),
      });
    } finally {
      setSavingItem(false);
    }
  };

  const handleEditItem = (item: RaffleItem) => {
    setSelectedItemId(item.id);
    // Only the editable fields are restored — price / total tickets always
    // come from the global App Settings; rank comes from the dropdown.
    setItemForm({
      title: item.title,
      description: item.description,
      imageUrl: item.imageUrl,
      location: item.location,
      rank: item.rank || 1,
      drawDatetime: item.drawDate ?? "",
    });
    setStatus(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDeleteItem = async (itemId: string) => {
    // Confirmation dialog guards against accidental deletions.
    if (!window.confirm(t("deleteLotteryConfirm"))) return;

    setStatus(null);

    // Mock/fallback items only exist in local UI state — there is no real
    // Supabase row to delete. Sending "mock-1" (or any non-UUID) to the
    // lottery_items delete endpoint crashes with
    //   invalid input syntax for type uuid: "mock-1"
    // so remove them from local state directly and skip the database.
    if (isMockItemId(itemId)) {
      setSavedItems((prev) => prev.filter((item) => item.id !== itemId));

      // Clear the form if the deleted item was being edited.
      if (selectedItemId === itemId) {
        resetItemForm();
      }

      setStatus({ type: "success", text: t("itemDeletedSuccess") });
      return;
    }

    // Only well-formed UUIDs can exist in the lottery_items table. Anything
    // else (e.g. a stale local row) is removed from UI state only instead of
    // crashing Supabase with "invalid input syntax for type uuid".
    if (!UUID_PATTERN.test(itemId)) {
      setSavedItems((prev) => prev.filter((item) => item.id !== itemId));
      setStatus({
        type: "error",
        text: "Removed an invalid local item — its id is not a valid database UUID.",
      });
      return;
    }

    try {
      // Persist through the authenticated server API. deleteLotteryItem runs
      // .from("lottery_items").delete().eq("id", itemId).select() server-side
      // (verifying a row was actually removed) and the route calls
      // revalidatePath("/") so the Host page drops the item on its next render.
      const response = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "delete-lottery-item", payload: { id: itemId } }),
      });

      const result = await response.json();

      if (!result?.success) {
        throw new Error(result?.error || t("itemDeleteFailed"));
      }

      setSavedItems((prev) => prev.filter((item) => item.id !== itemId));

      // Clear the form if the deleted item was being edited.
      if (selectedItemId === itemId) {
        resetItemForm();
      }

      setStatus({ type: "success", text: t("itemDeletedSuccess") });
    } catch (error) {
      console.error("Lottery delete failed:", error);
      setStatus({
        type: "error",
        text: error instanceof Error ? error.message : t("itemDeleteFailed"),
      });
    }
  };

  /**
   * Upload the picked Raffle Item (or banner) image and write the resulting
   * URL into the live form so the admin sees an instant preview.
   *
   * Storage resilience contract (mirrors the logo & hero-banner uploads):
   *   1) Try the dedicated "lottery-images" bucket first.
   *   2) Try the generic "public-assets" and "hero-banners" buckets next —
   *      a missing bucket / RLS-blocked upload is logged and skipped, not fatal.
   *   3) When NO bucket succeeds, fall back to a base64 data URL stored
   *      directly in image_url, so "Failed to upload image" can never block
   *      an admin from adding a prize.
   */
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, isBanner = false) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Basic client-side validation
    if (!file.type.startsWith("image/")) {
      setStatus({ type: "error", text: "Please select a valid image file." });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setStatus({ type: "error", text: "Image must be smaller than 5MB." });
      return;
    }

    setUploadingImage(true);
    setStatus(null);
    // Reset the input so the same file can be re-selected if needed.
    e.target.value = "";

    try {
      const fileExt = (file.name.split(".").pop() || "png").toLowerCase();
      const baseName =
        file.name
          .replace(/\.[^.]+$/, "")
          .replace(/[^\w-]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 60) || "prize";
      const folder = isBanner ? "banners" : "lotteries";
      // Date.now() prefix guarantees a unique object name (no collisions).
      const fileName = `${folder}/${Date.now()}-${baseName}.${fileExt}`;

      // a) Try the configured Storage buckets in order.
      let imageUrl: string | null = null;
      const buckets = ["lottery-images", "public-assets", "hero-banners"];

      for (const bucket of buckets) {
        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(fileName, file, { contentType: file.type, upsert: false });

        if (!uploadError) {
          const { data } = supabase.storage.from(bucket).getPublicUrl(fileName);
          if (data?.publicUrl) {
            // Cache-bust so the new image shows immediately after updates.
            imageUrl = `${data.publicUrl}?v=${Date.now()}`;
            break;
          }
          // Fall through: a bucket that returned no public URL is unusable.
          console.warn(`Image upload to "${bucket}" returned no public URL — trying next option.`);
        } else {
          console.warn(
            `=== Image upload to "${bucket}" failed — trying next option ===`,
            `| Bucket: ${bucket} | Path: ${fileName} |`,
            `| Error: ${uploadError.message} |`
          );
        }
      }

      // b) GRACEFUL FALLBACK: no usable bucket / permissions — embed the file
      //    as a base64 data URL so the item still saves and previews locally.
      if (!imageUrl) {
        console.warn(
          "=== All Storage buckets failed — falling back to base64 data URL ===",
          "Check the lottery-images / public-assets / hero-banners buckets and their RLS policies."
        );
        const base64 = await fileToBase64(file);
        if (base64) imageUrl = base64;
      }

      if (!imageUrl) {
        setStatus({
          type: "error",
          text: "Failed to read the image file. Please try a different image.",
        });
        return;
      }

      // c) Live preview: updating state re-renders the form's thumbnail right
      //    away, before the item is even saved.
      const usedBase64 = imageUrl.startsWith("data:");
      if (isBanner) {
        setSettingsForm((prev) => ({ ...prev, bannerImage: imageUrl }));
      } else {
        setItemForm((prev) => ({ ...prev, imageUrl }));
      }

      setStatus({
        type: "success",
        text: usedBase64
          ? "Image selected — preview ready (storage unavailable, embedded locally)."
          : "Image uploaded successfully!",
      });
    } catch (error) {
      console.error("Error uploading image:", error);
      setStatus({ type: "error", text: "Failed to upload image." });
    } finally {
      setUploadingImage(false);
    }
  };

  const handleBannerChange = (field: keyof typeof bannerForm, value: string | number | boolean) => {
    setBannerForm((prev) => ({ ...prev, [field]: value }));
  };

  const resetBannerForm = () => {
    setBannerForm(blankBannerForm());
    setBannerImageFile(null);
    setSelectedBannerId(null);
    setStatus(null);
  };

  /**
   * Pick (or clear) a hero banner image file from the Admin form.
   * The file itself is NOT uploaded here — it is held in local state and
   * uploaded to Supabase Storage when "Save Banner" is clicked, while an
   * instant local preview (base64 data URL) is written into
   * bannerForm.imageUrl so the admin sees the image before saving.
   */
  const handleBannerImageFile = async (file: File | null) => {
    if (!file) {
      setBannerImageFile(null);
      setBannerForm((prev) => ({ ...prev, imageUrl: "" }));
      return;
    }

    if (!file.type.startsWith("image/")) {
      setStatus({ type: "error", text: "Please select a valid image file for the banner." });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setStatus({ type: "error", text: "Banner image must be smaller than 5MB." });
      return;
    }

    setBannerImageFile(file);
    const preview = await fileToBase64(file);
    if (preview) {
      setBannerForm((prev) => ({ ...prev, imageUrl: preview }));
      setStatus(null);
    } else {
      setStatus({
        type: "error",
        text: "Failed to read the image file. Please try another image.",
      });
    }
  };

  /**
   * Upload the picked banner image to Supabase Storage and return its public
   * URL. The unique object name `Date.now()_<sanitized-name>` avoids file
   * collisions. The dedicated "hero-banners" bucket is tried first, then
   * "public-assets" and "lottery-images" (a missing bucket or denied RLS
   * policy is handled gracefully), and finally a base64 data URL is used —
   * the same fallback contract as the logo upload — so a Storage
   * misconfiguration can never break saving a banner.
   */
  const uploadHeroBannerImage = async (file: File): Promise<string> => {
    const fileExt = (file.name.split(".").pop() || "png").toLowerCase();
    const baseName =
      file.name
        .replace(/\.[^.]+$/, "")
        .replace(/[^\w-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60) || "banner";
    // Unique file name — the Date.now() prefix guarantees no object collisions.
    const fileName = `${Date.now()}_${baseName}.${fileExt}`;
    const buckets = ["hero-banners", "public-assets", "lottery-images"];

    for (const bucket of buckets) {
      const { error } = await supabase.storage
        .from(bucket)
        .upload(fileName, file, { contentType: file.type });

      if (!error) {
        const { data } = supabase.storage.from(bucket).getPublicUrl(fileName);
        if (data?.publicUrl) {
          return data.publicUrl;
        }
        break;
      }
      console.warn(
        `Hero banner image upload to "${bucket}" failed — trying next option:`,
        error.message
      );
    }

    // Graceful fallback: no usable bucket / permissions — store a base64 data
    // URL directly in hero_banners.image_url so the banner still saves.
    const base64 = await fileToBase64(file);
    if (base64) {
      console.warn("Hero banner image: using base64 data URL fallback (storage unavailable).");
      return base64;
    }
    throw new Error(
      "Failed to upload the banner image — no usable Storage bucket. Check the Supabase Storage configuration."
    );
  };

  const handleSaveBanner = async () => {
    setSavingBanner(true);
    setStatus(null);

    try {
      const title = (bannerForm.title || "").trim();
      const linkUrl = (bannerForm.linkUrl || "").trim() || null;
      const isActive = bannerForm.isActive;
      const sortOrder = Number(bannerForm.sortOrder) || 0;

      if (!title) throw new Error("Banner title is required.");

      // Image source: a freshly picked FILE is uploaded to Supabase Storage
      // NOW (on Save click) and the resulting public URL is what gets stored
      // in hero_banners.image_url. Without a new file, the existing
      // form.imageUrl (stored URL of an edited banner) is kept as-is.
      let imageUrl = (bannerForm.imageUrl || "").trim();
      if (bannerImageFile) {
        setUploadingBannerImage(true);
        try {
          imageUrl = await uploadHeroBannerImage(bannerImageFile);
        } finally {
          setUploadingBannerImage(false);
        }
      }
      if (!imageUrl) {
        throw new Error("Banner image is required — select an image file.");
      }

      const payload = {
        title,
        image_url: imageUrl,
        link_url: linkUrl,
        is_active: isActive,
        sort_order: sortOrder,
      };

      let newBanner: HeroBanner;

      if (selectedBannerId) {
        const { data, error } = await supabase
          .from("hero_banners")
          .update(payload)
          .eq("id", selectedBannerId)
          .select()
          .single();

        if (error) throw error;
        if (!data) throw new Error("Failed to update banner.");

        newBanner = {
          id: data.id,
          title: data.title,
          imageUrl: data.image_url ?? "",
          linkUrl: data.link_url ?? "",
          isActive: data.is_active,
          sortOrder: Number(data.sort_order) || 0,
        };
      } else {
        const { data, error } = await supabase
          .from("hero_banners")
          .insert(payload)
          .select()
          .single();

        if (error) throw error;
        if (!data) throw new Error("Failed to save banner.");

        newBanner = {
          id: data.id,
          title: data.title,
          imageUrl: data.image_url ?? "",
          linkUrl: data.link_url ?? "",
          isActive: data.is_active,
          sortOrder: Number(data.sort_order) || 0,
        };
      }

      setSavedBanners((prev) => {
        const existing = prev.filter((banner) => banner.id !== newBanner.id);
        return [...existing, newBanner].sort((a, b) => a.sortOrder - b.sortOrder);
      });

      resetBannerForm();
      // INSTANT HOME-PAGE SYNC — same contract as delete: saved/updated
      // banners appear on open landing pages without a manual reload.
      try {
        await revalidateHome();
      } catch (revalidateError) {
        console.warn("revalidateHome after banner save failed (non-fatal):", revalidateError);
      }
      router.refresh();
      setStatus({ type: "success", text: "Hero banner saved successfully!" });
    } catch (error) {
      console.error("Banner save failed:", error);
      setStatus({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to save hero banner.",
      });
    } finally {
      setSavingBanner(false);
    }
  };

  const handleEditBanner = (banner: HeroBanner) => {
    setSelectedBannerId(banner.id);
    // Editing loads the STORED image URL into the form — a previously picked
    // file (if any) is dropped so the stored image stays untouched unless a
    // new file is explicitly selected.
    setBannerImageFile(null);
    setBannerForm({
      id: banner.id,
      title: banner.title,
      imageUrl: banner.imageUrl,
      linkUrl: banner.linkUrl,
      isActive: banner.isActive,
      sortOrder: banner.sortOrder,
    });
    setStatus(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDeleteBanner = async (bannerId: string) => {
    if (!window.confirm("Delete this hero banner?")) return;

    setStatus(null);

    try {
      // .select("id") makes PostgREST return the deleted rows so we can detect
      // the RLS silent no-op case: when the DELETE policy filters the row out,
      // Supabase returns NO error but ALSO deletes nothing. Without .select()
      // that case looks like a fake success.
      const { data: deletedRows, error } = await supabase
        .from("hero_banners")
        .delete()
        .eq("id", bannerId)
        .select("id");

      if (error) {
        // Never silently ignored — full error (code/details/hint) is logged and
        // the admin gets an actionable message.
        console.error("hero_banners delete error:", {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        });
        if (isHeroBannerRlsError(error)) {
          throw new Error(
            `Delete blocked by database permissions (${error.code ?? "RLS"}): ${error.message} ` +
              `— run supabase/migrations/022_hero_banners_delete_rls.sql to allow admin (anon-key) deletes.`,
          );
        }
        throw error;
      }

      // Zero rows deleted = the row was RLS-filtered or already gone. Treat as
      // a failure so the admin is never told "deleted successfully!" wrongly.
      if (!deletedRows || deletedRows.length === 0) {
        console.error("hero_banners delete affected 0 rows — possible missing DELETE RLS policy.", {
          bannerId,
        });
        throw new Error(
          "Delete had no effect — the banner row was not removed. This usually means the " +
            "hero_banners DELETE policy is missing or restricts the anon role: run " +
            "supabase/migrations/022_hero_banners_delete_rls.sql.",
        );
      }

      // INSTANT UI STATE UPDATE: drop the banner from local admin state so the
      // list/form reflect the deletion without waiting on any refetch.
      setSavedBanners((prev) => prev.filter((banner) => banner.id !== bannerId));

      if (selectedBannerId === bannerId) {
        resetBannerForm();
      }

      // INSTANT HOME-PAGE SYNC: the landing page (/) must drop the deleted
      // banner immediately. revalidateHome() invalidates the cached Host page
      // server-side; router.refresh() additionally clears the Next.js client
      // router cache so this dashboard's previews reflect the new state.
      try {
        await revalidateHome();
      } catch (revalidateError) {
        console.warn("revalidateHome after banner delete failed (non-fatal):", revalidateError);
      }
      router.refresh();

      setStatus({ type: "success", text: "Hero banner deleted successfully!" });
    } catch (error) {
      console.error("Banner delete failed:", error);
      setStatus({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to delete hero banner.",
      });
    }
  };

  const handleApproveReceipt = async (receiptId: string): Promise<boolean> => {
    const receipt = pendingReceipts.find((r) => r.id === receiptId);
    if (!receipt) return false;

    setStatus(null);

    // OPTIMISTIC UI via SWR: flip the receipt to approved inside the cached
    // page so the queue updates without waiting on the network. Rolled back on
    // failure below by revalidating (mutate) straight from the database.
    const optimistic = { ...receipt, status: "approved" as const };
    void mutateReceipts(
      (current) =>
        current
          ? {
              ...current,
              paymentReceipts: current.paymentReceipts.map((r) =>
                r.id === receiptId ? optimistic : r
              ),
            }
          : current,
      { revalidate: false }
    );

    try {
      const response = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "update-receipt-status",
          payload: { id: receiptId, status: "approved" },
        }),
      });

      const result = await response.json();

      if (!result?.success) {
        // getErrorMessage handles string OR object error payloads from the
        // API — never renders "[object Object]".
        throw new Error(
          result?.error ? getErrorMessage(result.error) : "Failed to approve receipt."
        );
      }

      // Single clean success message — the payment status update is the source
      // of truth. Any ticket-sync issues are logged server-side and never
      // surfaced here, so the admin always sees a clear confirmation.
      setStatus({ type: "success", text: t("approve") + " ✓" });

      // IMMEDIATE UI SYNC: revalidate the SWR receipts cache so the
      // Pending/Approved lists and their counter badges reflect the database
      // state right away — the optimistic move above is confirmed/reconciled
      // by real data.
      await mutateReceipts();

      // revalidatePath("/admin") already ran server-side; router.refresh()
      // additionally clears the Next.js client router cache so the dashboard
      // server components (stats, previews) reflect the new state immediately.
      router.refresh();
      return true;
    } catch (error) {
      // ROLLBACK the optimistic move — revalidate from the database so the
      // receipt returns to the Pending row exactly as the server sees it.
      void mutateReceipts();

      const message =
        error instanceof Error ? error.message : "Failed to approve receipt.";
      console.error("Receipt approve failed:", error);
      setStatus({ type: "error", text: message });
      return false;
    }
  };

  const handleDeclineReceipt = async (receiptId: string, note?: string): Promise<boolean> => {
    const receipt = pendingReceipts.find((r) => r.id === receiptId);

    // The rejection reason is REQUIRED — refuse to reject without an exact
    // explanation so the Mini App can always surface why a receipt was declined.
    if (!note?.trim()) {
      setStatus({ type: "error", text: "Please enter a rejection reason." });
      return false;
    }

    setStatus(null);

    // OPTIMISTIC UI via SWR: remove the receipt from the cached page immediately.
    if (receipt) {
      void mutateReceipts(
        (current) =>
          current
            ? {
                ...current,
                paymentReceipts: current.paymentReceipts.filter((r) => r.id !== receiptId),
              }
            : current,
        { revalidate: false }
      );
    }

    try {
      const response = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "update-receipt-status",
          payload: {
            id: receiptId,
            status: "rejected",
            note: note.trim(),
            rejectionReason: note.trim(),
          },
        }),
      });

      const result = await response.json();

      if (!result?.success) {
        // getErrorMessage handles string OR object error payloads from the
        // API — never renders "[object Object]".
        throw new Error(
          result?.error ? getErrorMessage(result.error) : "Failed to decline receipt."
        );
      }

      // Single clean success message — the payment status update is the source
      // of truth. Any ticket-release issues are logged server-side and never
      // surfaced here, so the admin always sees a clear confirmation.
      setStatus({ type: "success", text: t("decline") + " ✓" });

      // IMMEDIATE UI SYNC: revalidate the SWR receipts cache so the Pending
      // list and its counter badge reflect the database state right away (the
      // optimistic removal above is confirmed/reconciled by real data).
      await mutateReceipts();

      // See handleApproveReceipt — clear the Next.js router cache.
      router.refresh();
      return true;
    } catch (error) {
      // ROLLBACK — revalidate from the database so the receipt is restored
      // into the Pending list exactly as the server sees it.
      if (receipt) {
        void mutateReceipts();
      }

      const message =
        error instanceof Error ? error.message : "Failed to decline receipt.";
      console.error("Receipt decline failed:", error);
      setStatus({ type: "error", text: message });
      return false;
    }
  };

  /** Approve/reject from inside the receipt verification modal. Closes on success. */
  const handlePreviewDecision = async (decision: "approved" | "rejected") => {
    if (!previewReceipt || previewBusy) return;
    setPreviewBusy(true);
    try {
      const ok =
        decision === "approved"
          ? await handleApproveReceipt(previewReceipt.id)
          : await handleDeclineReceipt(previewReceipt.id, rejectNote);
      if (ok) closeReceiptPreview();
    } finally {
      setPreviewBusy(false);
    }
  };

  /**
   * Offline (manual) sales are validated + persisted inside TicketsTab — the
   * dashboard only keeps the running session total for the Overview stats.
   */
  const handleManualSaleRecorded = (count: number) => {
    setManualTicketsSold((prev) => prev + count);
  };

  const handleSaveTelegramSettings = async () => {
    setSavingTelegramSettings(true);
    setStatus(null);

    try {
      const payload = {
        botToken: (telegramSettings.botToken || "").trim(),
        chatId: (telegramSettings.chatId || "").trim(),
      };

      const response = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "telegram-settings",
          payload,
        }),
      });

      const result = await response.json();

      if (result?.success) {
        setTelegramSettings(payload);
        setStatus({ type: "success", text: "Telegram bot settings saved successfully!" });
      } else {
        throw new Error(result?.error || "Failed to save Telegram bot settings.");
      }
    } catch (error) {
      console.error("Telegram settings save failed:", error);
      setStatus({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to save Telegram bot settings.",
      });
    } finally {
      setSavingTelegramSettings(false);
    }
  };

  const handleTestTelegram = async () => {
    setTestingTelegram(true);
    setStatus(null);

    try {
      const response = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "test-telegram", payload: {} }),
      });

      const result = await response.json();

      if (result?.success) {
        // The server returns a descriptive message — direct-mode confirms the
        // chat delivery, broadcast-mode confirms the bot token (getMe).
        setStatus({
          type: "success",
          text: result.data?.message || "Telegram test message sent successfully ✓",
        });
      } else {
        throw new Error(result?.error || "Telegram test message failed.");
      }
    } catch (error) {
      console.error("Telegram test failed:", error);
      setStatus({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to send Telegram test message.",
      });
    } finally {
      setTestingTelegram(false);
    }
  };

  const handlePostItemToTelegram = async (itemId: string) => {
    setPostingToTelegramId(itemId);
    setStatus(null);

    try {
      const response = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "post-to-telegram",
          payload: { id: itemId },
        }),
      });

      const result = await response.json();

      if (result?.success) {
        setStatus({ type: "success", text: "Lottery posted to Telegram successfully!" });
      } else {
        throw new Error(result?.error || "Failed to post lottery to Telegram.");
      }
    } catch (error) {
      console.error("Post to Telegram failed:", error);
      setStatus({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to post lottery to Telegram.",
      });
    } finally {
      setPostingToTelegramId(null);
    }
  };

  const handleSaveScheduler = async () => {
    setSavingScheduler(true);
    setStatus(null);

    try {
      const payload = {
        id: schedulerForm.id ?? undefined,
        caption: (schedulerForm.caption || "").trim(),
        imageUrl: (schedulerForm.imageUrl || "").trim(),
        intervalHours: Math.max(0, Math.floor(Number(schedulerForm.intervalHours) || 0)),
        intervalMinutes: Math.min(
          59,
          Math.max(0, Math.floor(Number(schedulerForm.intervalMinutes) || 0))
        ),
        isActive: schedulerForm.isActive === true,
        botToken: (schedulerForm.botToken || "").trim(),
        chatId: (schedulerForm.chatId || "").trim(),
      };

      const response = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "telegram-scheduler",
          payload,
        }),
      });

      const result = await response.json();

      if (result?.success) {
        const saved = result.data;
        setSchedulerForm({
          id: saved.id ?? schedulerForm.id,
          caption: saved.caption || "",
          imageUrl: saved.imageUrl || "",
          intervalHours: Number(saved.intervalHours) || 0,
          intervalMinutes: Number(saved.intervalMinutes) || 0,
          isActive: saved.isActive === true,
          botToken: saved.botToken || "",
          chatId: saved.chatId || "",
          lastPostedAt: saved.lastPostedAt ?? null,
        });
        setStatus({ type: "success", text: "Telegram scheduler settings saved successfully!" });
      } else {
        throw new Error(result?.error || "Failed to save Telegram scheduler settings.");
      }
    } catch (error) {
      console.error("Telegram scheduler save failed:", error);
      setStatus({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to save Telegram scheduler settings.",
      });
    } finally {
      setSavingScheduler(false);
    }
  };

  const handlePostSchedulerNow = async () => {
    setPostingSchedulerNow(true);
    setStatus(null);

    try {
      // Ensure the latest form values are persisted before posting.
      await handleSaveScheduler();

      const response = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "post-scheduler-now", payload: {} }),
      });

      const result = await response.json();

      if (result?.success) {
        // Clean success feedback — delivery counts / recipient analytics are
        // intentionally NOT shown here (they live on the Overview page).
        const text =
          result?.data?.broadcast === true
            ? "Auto-post broadcast sent to all registered users ✓"
            : "Scheduled post sent to Telegram now ✓";
        setStatus({ type: "success", text });
      } else {
        throw new Error(result?.error || "Failed to post scheduled Telegram message.");
      }
    } catch (error) {
      console.error("Post scheduler now failed:", error);
      setStatus({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to post scheduled Telegram message.",
      });
    } finally {
      setPostingSchedulerNow(false);
    }
  };

  /**
   * Upload a scheduler post image with client-side compression + resilient
   * storage fallback. Prevents HTTP 520 / "payload too large" errors by
   * compressing the image BEFORE any upload attempt, and guarantees the
   * field is never left empty: storage failure → base64 data-URL fallback.
   */
  const handleSchedulerImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Basic client-side validation
    if (!file.type.startsWith("image/")) {
      setStatus({ type: "error", text: "Please select a valid image file for the scheduler post." });
      return;
    }

    setUploadingSchedulerImage(true);
    setStatus(null);
    e.target.value = "";

    try {
      // 1) Compress & resize first — keeps the payload well under 1 MB so
      //    neither Supabase Storage nor Vercel Edge returns HTTP 520.
      const compressed = await compressImage(file);

      // 2) Try the configured Storage buckets in order — a missing bucket /
      //    RLS-blocked / 520 upload is logged and skipped, NOT fatal.
      //    (compressImage re-encodes to JPEG, so the path always uses .jpg.)
      const filePath = `telegram-scheduler/${Date.now()}.jpg`;
      let imageUrl: string | null = null;
      const buckets = ["public-assets", "hero-banners", "lottery-images"];

      for (const bucket of buckets) {
        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(filePath, compressed, {
            contentType: "image/jpeg",
            upsert: false,
          });

        if (!uploadError) {
          const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
          if (data?.publicUrl) {
            // Cache-bust so the fresh preview replaces any stale CDN copy.
            imageUrl = `${data.publicUrl}?v=${Date.now()}`;
            break;
          }
          console.warn(`Scheduler image upload to "${bucket}" returned no public URL — trying next option.`);
        } else {
          // HTTP 520 manifests as an error here — log and continue to the next
          // bucket instead of crashing or surfacing an unhandled toast.
          console.warn(
            `=== Scheduler image upload to "${bucket}" failed — trying next option ===`,
            `| Path: ${filePath} | Error: ${uploadError.message || uploadError} |`
          );
        }
      }

      // 3) GRACEFUL FALLBACK: no usable bucket — embed as a base64 data URL so
      //    the scheduler post still has a photo.
      if (!imageUrl) {
        console.warn(
          "=== All Storage buckets failed for scheduler image — falling back to base64 data URL ==="
        );
        const base64 = await fileToBase64(compressed);
        if (base64) imageUrl = base64;
      }

      if (!imageUrl) {
        setStatus({
          type: "error",
          text: "Failed to read the image file. Please try a different image.",
        });
        return;
      }

      // 4) Update state for the live thumbnail preview.
      const usedBase64 = imageUrl.startsWith("data:");
      setSchedulerForm((prev) => ({ ...prev, imageUrl }));
      setStatus({
        type: "success",
        text: usedBase64
          ? "Image selected — preview ready (storage unavailable, embedded locally)."
          : "Scheduler image uploaded successfully!",
      });
    } catch (error) {
      // Catch-all safety net so an unexpected exception never surfaces an
      // unhandled error to the user — still try the base64 fallback.
      console.error("Scheduler image upload failed:", error);
      try {
        // Compress here too so even the emergency fallback stays small.
        const fallbackCompressed = await compressImage(file);
        const base64 = await fileToBase64(fallbackCompressed);
        if (base64) {
          setSchedulerForm((prev) => ({ ...prev, imageUrl: base64 }));
          setStatus({
            type: "success",
            text: "Image selected — preview ready (storage unavailable, embedded locally).",
          });
          return;
        }
      } catch (fallbackError) {
        console.error("Scheduler base64 fallback failed:", fallbackError);
      }
      setStatus({
        type: "error",
        text: "Failed to upload scheduler image. Please try a different image.",
      });
    } finally {
      setUploadingSchedulerImage(false);
    }
  };

  const handleSaveSupportManager = async () => {
    setSavingSupportManager(true);
    setStatus(null);

    try {
      const username = editingSupportManager.username.trim();
      const contact = editingSupportManager.contact.trim();
      const phone = editingSupportManager.phone.trim();

      if (!username) throw new Error(t("supportUsernameRequired"));
      if (!contact) throw new Error(t("supportContactRequired"));

      // Persist to the `support` JSONB column of app_settings row id = 1 so
      // support info is a dynamic database-driven setting instead of hardcoded
      // constants. Merge with the existing value so unknown fields survive.
      const { data: existing } = await supabase
        .from("app_settings")
        .select("support")
        .eq("id", 1)
        .maybeSingle();

      const mergedValue = {
        ...((existing?.support as Record<string, unknown>) ?? {}),
        support_username: username,
        support_contact: contact,
        support_phone: phone,
      };

      const { error } = await supabase
        .from("app_settings")
        .upsert(
          { id: 1, support: mergedValue, updated_at: new Date().toISOString() },
          { onConflict: "id" }
        );

      if (error) throw error;

      setSupportManager({ username, contact, phone });
      setShowSupportManagerForm(false);
      setStatus({ type: "success", text: t("supportManagerSavedSuccess") });
    } catch (error) {
      console.error("Support manager save failed:", error);
      setStatus({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to save support manager.",
      });
    } finally {
      setSavingSupportManager(false);
    }
  };

  const handleSignOut = () => {
    document.cookie = "admas-admin-auth=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    window.localStorage.removeItem("admas-admin-auth");
    router.replace("/login");
  };

  if (!isClient || !isAuthorized) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950">
        <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
      </main>
    );
  }

  // ── Derived overview stats ──
  const approvedRevenue = approvedReceipts.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const approvedTicketCount = approvedReceipts.reduce(
    (sum, r) => sum + (r.ticket_ids?.length ?? 0),
    0,
  );
  const pendingTicketCount = pendingReceipts.reduce(
    (sum, r) => sum + (r.ticket_ids?.length ?? 0),
    0,
  );

  const tabs = [
    { id: 'overview' as const, label: 'Overview & Stats', icon: LayoutDashboard, badge: 0 },
    {
      id: 'receipts' as const,
      label: 'Pending Receipts',
      icon: Inbox,
      badge: pendingReceipts.length,
    },
    { id: 'tickets' as const, label: 'Ticket Matrix & Sales', icon: Ticket, badge: 0 },
    {
      id: 'users' as const,
      label: 'Users List',
      icon: Users,
      badge: 0,
    },
    { id: 'settings' as const, label: 'App Settings', icon: Settings, badge: 0 },
  ];

  return (
    <main className="lux-shell min-h-screen text-white">
      {/* Ambient gold + cyan glow is baked into .lux-shell */}
      <div className="relative mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
        {/* ── Header ── */}
        <header className="lux-card flex flex-wrap items-center justify-between gap-4 rounded-3xl p-5">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#B8860B] via-[#D4AF37] to-[#F5D061] text-slate-950 shadow-[0_0_28px_rgba(212,175,55,0.45)]">
              <LayoutDashboard className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#D4AF37]">
                {t('admin')}
              </p>
              <h1 className="text-2xl font-black text-white">Admas Lottery — Admin</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="group relative">
              <button
                type="button"
                className="lux-cyan-live rounded-xl px-4 py-2 text-sm font-semibold transition hover:brightness-125"
              >
                {languageNames[language]} 🌐
              </button>
              <div className="absolute right-0 z-20 mt-2 hidden w-44 rounded-xl border border-amber-500/20 bg-[#0B0F19]/95 shadow-2xl shadow-black/60 backdrop-blur-xl group-hover:block">
                {(['en', 'am', 'om', 'ti'] as const).map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => setLanguage(lang)}
                    className={`block w-full rounded-lg px-4 py-2 text-left text-sm transition ${
                      language === lang
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'text-slate-300 hover:bg-white/5'
                    }`}
                  >
                    {languageNames[lang]}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:border-red-500/40 hover:text-red-300"
            >
              <LogOut className="h-4 w-4" />
              {t('signOut')}
            </button>
          </div>
        </header>

        {/* ── Tab navigation ── */}
        <nav className="lux-card flex flex-wrap gap-2 rounded-2xl p-2">
          {tabs.map(({ id, label, icon: Icon, badge }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                data-testid={`admin-tab-${id}`}
                aria-current={active ? 'page' : undefined}
                onClick={() => setActiveTab(id)}
                className={`relative flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
                  active
                    ? 'lux-nav-active'
                    : 'text-slate-400 hover:bg-white/5 hover:text-cyan-200'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
                {badge > 0 && (
                  <span
                    className={`ml-1 rounded-full px-2 py-0.5 text-[10px] font-black ${
                      active
                        ? 'bg-slate-950/20 text-slate-950'
                        : 'bg-amber-400 text-slate-950 shadow-[0_0_10px_rgba(212,175,55,0.5)]'
                    }`}
                  >
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* ── Tab panels ── */}
        {activeTab === 'overview' && (
          <OverviewTab
            stats={{
              pendingCount: pendingReceipts.length,
              approvedCount: approvedReceipts.length,
              approvedRevenue,
              approvedTickets: approvedTicketCount,
              pendingTickets: pendingTicketCount,
              totalTickets: Number(settingsForm.totalTickets) || 0,
              manualTicketsSold,
              supportContact: supportManager.contact || supportManager.username,
            }}
            pendingPreview={pendingReceipts.slice(0, 4)}
            loading={loading}
            onGoToReceipts={() => setActiveTab('receipts')}
          />
        )}

        {activeTab === 'receipts' && (
          <ReceiptsTab
            pendingReceipts={pendingReceipts}
            approvedReceipts={approvedReceipts}
            approve={handleApproveReceipt}
            decline={handleDeclineReceipt}
            loading={receiptsLoading}
            hasMoreReceipts={hasMoreReceipts}
            loadingMoreReceipts={receiptsValidating}
            onLoadMoreReceipts={handleLoadMoreReceipts}
            receiptsLoadedCount={loadedReceipts.length}
            receiptsTotalCount={receiptsTotal}
          />
        )}

        {activeTab === 'tickets' && (
          <TicketsTab
            totalTickets={Number(settingsForm.totalTickets) || 0}
            ticketPrice={Number(settingsForm.ticketPrice) || 0}
            savedItems={savedItems}
            itemForm={itemForm}
            onItemChange={handleItemChange}
            saveItem={handleSaveItem}
            resetItemForm={resetItemForm}
            editItem={handleEditItem}
            deleteItem={handleDeleteItem}
            uploadingImage={uploadingImage}
            onImageUpload={(e) => handleImageUpload(e, false)}
            postingToTelegramId={postingToTelegramId}
            postItemToTelegram={handlePostItemToTelegram}
            savingItem={savingItem}
            selectedItemId={selectedItemId}
            onManualSaleRecorded={handleManualSaleRecorded}
            manualTicketsSold={manualTicketsSold}
          />
        )}

        {activeTab === 'users' && (
          <div data-testid="admin-users-panel">
            <UsersTab />
          </div>
        )}

        {activeTab === 'settings' && (
          <SettingsTab
            settings={{
              form: settingsForm,
              onFieldChange: handleSettingsChange,
              onLogoFile: async (file) => {
                await handleLogoUpload({
                  target: { files: [file] },
                } as unknown as React.ChangeEvent<HTMLInputElement>);
              },
              uploadingLogo,
              onRemoveLogo: handleRemoveLogo,
              onSave: handleSaveSettings,
              saving: savingSettings,
            }}
            support={{
              manager: supportManager,
              editing: editingSupportManager,
              setEditing: setEditingSupportManager,
              showForm: showSupportManagerForm,
              setShowForm: setShowSupportManagerForm,
              save: handleSaveSupportManager,
              saving: savingSupportManager,
            }}
            paymentMethods={{
              items: paymentMethods,
              form: paymentMethodForm,
              setForm: setPaymentMethodForm,
              showForm: showPaymentMethodForm,
              setShowForm: setShowPaymentMethodForm,
              edit: handleEditPaymentMethod,
              save: handleSavePaymentMethod,
              saving: savingPaymentMethod,
              reset: resetPaymentMethodForm,
              toggle: handleTogglePaymentMethod,
              remove: handleDeletePaymentMethod,
            }}
            telegram={{
              settings: telegramSettings,
              onChange: setTelegramSettings,
              save: handleSaveTelegramSettings,
              saving: savingTelegramSettings,
              test: handleTestTelegram,
              testing: testingTelegram,
            }}
            scheduler={{
              form: schedulerForm,
              onChange: (patch) => setSchedulerForm((prev) => ({ ...prev, ...patch })),
              save: handleSaveScheduler,
              saving: savingScheduler,
              postNow: handlePostSchedulerNow,
              posting: postingSchedulerNow,
              onImageUpload: handleSchedulerImageUpload,
              uploadingImage: uploadingSchedulerImage,
              nextPostInMin,
            }}
            banners={{
              items: savedBanners,
              form: bannerForm,
              onFieldChange: handleBannerChange,
              save: handleSaveBanner,
              saving: savingBanner,
              onImageFile: handleBannerImageFile,
              uploadingImage: uploadingBannerImage,
              edit: handleEditBanner,
              remove: handleDeleteBanner,
              reset: resetBannerForm,
              selectedId: selectedBannerId,
            }}
          />
        )}

        {/* Supabase Realtime — instant dashboard updates for payments,
            telegram_scheduler and lottery_items changes. No manual reload. */}
        <AdminRealtimeSync
          onPaymentsChange={handleRealtimePaymentsChange}
          onSchedulerChange={handleRealtimeSchedulerChange}
          onItemsChange={refreshSavedItems}
        />
      </div>
    </main>
  );
}

