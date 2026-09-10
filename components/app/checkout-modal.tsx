'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Banknote,
  CheckCircle,
  Clock3,
  Copy,
  Landmark,
  Loader2,
  RefreshCw,
  Smartphone,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { getTelegramUser } from '@/lib/tma';
import { resolveAppUserId, readStoredGuestId } from '@/lib/user-identity';
import { fetchUserProfile, type UserProfile } from '@/lib/profile';
import { getErrorMessage } from '@/lib/errors';
import { useLanguage } from '@/components/app/language-provider';
import { useTelegram } from '@/components/app/telegram-provider';
import { cn } from '@/lib/utils';
function toBase64(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}
const DEFAULT_TICKET_PRICE = 2500;

/**
 * True when a payments insert failed because payments.user_id → users.id
 * (Postgres FK violation code 23503). In that case the receipt can still be
 * saved by re-ensuring the public.users row and retrying once.
 */
function isUsersForeignKeyError(error: {
  code?: string | null;
  message: string;
  details?: string | null;
}): boolean {
  const message = `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""}`;
  return (
    error.code === "23503" ||
    /foreign key|references public\.users|payments_user_id|user_id/i.test(message)
  );
}

/**
 * True when an insert/update failed because a column does not exist on the
 * live database yet (Postgres 42703 / PostgREST PGRST204). Used so the brand
 * new payments.telegram_id / payments.phone_number / tickets.buyer_phone
 * fields degrade gracefully on un-migrated databases instead of blocking the
 * whole purchase.
 */
function isMissingColumnError(error: {
  code?: string | null;
  message: string;
  details?: string | null;
}): boolean {
  const message = `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""}`;
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /could not find the .*column|column .* does not exist/i.test(message)
  );
}

export type CheckoutStep = 'accounts' | 'receipt' | 'success';

export interface BankAccount {
  id: string;
  name: string;
  account: string;
  icon: React.ComponentType<{ className?: string }>;
  color?: string;
}

export interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedNumbers: string[];
  onComplete: () => void;
  ticketPrice?: number;
  /**
   * Optional callback fired when a pre-flight check finds one or more of the
   * selected numbers are already pending/sold (taken by another buyer). The
   * parent should drop those numbers from the selection and refresh the grid.
   */
  onSelectionInvalid?: (takenNumbers: string[]) => void;
}

/** Map a dynamic payment_methods row → the BankAccount UI shape. */
function mapPaymentMethodToBankAccount(row: {
  id: string;
  bank_name: string;
  account_name: string;
  account_number: string;
}): BankAccount {
  const nameLower = row.bank_name.toLowerCase();
  let icon = Banknote;
  if (nameLower.includes('cbe') || nameLower.includes('commercial')) {
    icon = Landmark;
  } else if (nameLower.includes('birr')) {
    icon = Banknote;
  } else if (nameLower.includes('tele') || nameLower.includes('telebirr')) {
    icon = Smartphone;
  }

  return {
    id: row.id,
    // "Commercial Bank of Ethiopia — Account Name" gives the user clarity.
    name: row.bank_name,
    account: `${row.account_name}: ${row.account_number}`,
    icon,
  };
}

export function CheckoutModal({
  isOpen,
  onClose,
  selectedNumbers,
  onComplete,
  ticketPrice,
  onSelectionInvalid,
}: CheckoutModalProps) {
  const { t } = useLanguage();
  const { user: telegramUser } = useTelegram();
  const price = ticketPrice && ticketPrice > 0 ? ticketPrice : DEFAULT_TICKET_PRICE;
  const grandTotal = selectedNumbers.length * price;

  const [step, setStep] = useState<CheckoutStep>('accounts');
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [showAccountWarning, setShowAccountWarning] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  // Bot-registered profile (public.profiles) for the logged-in Telegram user:
  // carries the verified phone_number + telegram_id attached to purchases.
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileChecked, setProfileChecked] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Resolve the submitting user's id (bigint, must match public.users.id).
  // Resolution order: Telegram Mini App user → Supabase auth session →
  // persistent guest id. Never throws (see lib/user-identity.ts).
  const resolveUserId = () => resolveAppUserId(telegramUser ?? getTelegramUser());

  // Re-fetch the bot-registered profile (used by the "check again" button).
  const reloadProfile = async () => {
    setProfileChecked(false);
    const found = await fetchUserProfile(telegramUser ?? getTelegramUser());
    setProfile(found);
    setProfileChecked(true);
    return found;
  };

  // Load the bot-registered profile when the modal opens so checkout can
  // (a) attach phone_number/telegram_id to the purchase and (b) prompt users
  // who have not yet pressed «ስልክ አጋራ» in the Telegram bot.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    void (async () => {
      const found = await fetchUserProfile(telegramUser ?? getTelegramUser());
      if (!cancelled) {
        setProfile(found);
        setProfileChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, telegramUser]);

  // Load dynamic bank accounts / payment methods from Supabase when modal opens.
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;

    const loadBankAccounts = async () => {
      setLoadingAccounts(true);

      const { data, error } = await supabase
        .from('payment_methods')
        .select('id, bank_name, account_name, account_number')
        .eq('is_active', true)
        .order('sort_order', { ascending: true, nullsFirst: false });

      if (!cancelled) {
        if (!error && data && data.length > 0) {
          setBankAccounts(data.map(mapPaymentMethodToBankAccount));
        }
        setLoadingAccounts(false);
      }
    };

    loadBankAccounts();

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // Phone-registration gate (requirement 4): a Telegram Mini App user who has
  // NOT yet registered a phone number (no public.profiles row with a
  // phone_number, i.e. never pressed «ስልክ አጋራ» in the bot) is prompted
  // instead of being allowed straight through checkout. Guests / browser
  // sessions without a Telegram identity are never blocked (existing guest
  // checkout flow must keep working).
  const phoneRegistered = !telegramUser || Boolean(profile?.phone_number);
  const showPhoneGate = Boolean(telegramUser) && profileChecked && !phoneRegistered;

  // Mandatory account selection: users MUST pick a bank payment account
  // before they can continue to the receipt step.
  const canContinueToReceipt =
    !loadingAccounts &&
    bankAccounts.length > 0 &&
    selectedAccountId !== null &&
    phoneRegistered;

  const handleSelectAccount = (accountId: string) => {
    setSelectedAccountId(accountId);
    setShowAccountWarning(false);
    setError(null);
  };

  const handleContinueToReceipt = () => {
    // Strict validation: block progression and show a clear warning when no
    // bank payment account has been selected.
    if (!canContinueToReceipt) {
      setShowAccountWarning(true);
      setError(
        showPhoneGate
          ? t('registerPhonePrompt')
          : t('selectBankAccountWarning'),
      );
      return;
    }

    setShowAccountWarning(false);
    setError(null);
    setStep('receipt');
  };

  const handleCopy = async (id: string, account: string) => {
    try {
      await navigator.clipboard.writeText(account);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = account;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

    // Allowed receipt document types. Validation is extension-based (the source of
  // truth used by the upload itself) because many mobile browsers report a
  // captured JPG/PNG as "application/octet-stream", which would wrongly reject
  // perfectly valid receipts if we relied on the (unreliable) file.type MIME.
  const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'pdf'];
  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Derive extension reliably: handle names with no dot, leading dots, and
    // uppercase extensions (e.g. photo_2026-08-02_14-30-00.JPG -> "jpg").
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setError(t('invalidFileType'));
      e.target.value = '';
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError(t('fileTooLarge'));
      e.target.value = '';
      return;
    }

    setReceiptFile(file);
    setError(null);
  };

  const removeFile = () => {
    setReceiptFile(null);
    setReceiptUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async () => {
    // Only the receipt image is required: submission is blocked until a
    // receipt file has been chosen. No transaction reference is requested
    // or validated anymore.
    if (!receiptFile) {
      setError(t('receiptRequired'));
      return;
    }

    setError(null);

    try {
      setIsSubmitting(true);

      // ---- Step 1: upload the receipt file (decoupled from user verification) ----
      // The file is uploaded to the Supabase `receipts` bucket FIRST, and the
      // returned public URL is attached to the form state. Guest / anonymous
      // users are never blocked: if no Telegram user exists we fall back to the
      // persistent guest id — it is only used as a storage path prefix.
      let receiptUrl: string | null = null;

      if (receiptFile) {
        setIsUploading(true);
        setError(null);

        // Normalize the extension reliably: lowercase, guard against
        // extensionless files (fallback to 'jpg'). This prevents upload errors
        // caused by case-sensitive storage paths for e.g. photo_...JPG.
        const rawExt = receiptFile.name.split('.').pop() ?? '';
        const fileExt = rawExt ? rawExt.toLowerCase() : 'jpg';
        // Storage path owner: Telegram id when present, otherwise the
        // persistent guest id (or a throwaway timestamped guest prefix).
        // A missing user id must NEVER block the upload.
        const pathOwner =
          telegramUser?.id ?? readStoredGuestId() ?? `guest_${Date.now()}`;
        const fileName = `receipt_${pathOwner}_${Date.now()}.${fileExt}`;

        // Many mobile browsers report captured images as
        // "application/octet-stream"; map the extension to a real MIME type so
        // the upload is not rejected by storage MIME validation.
        const MIME_BY_EXT: Record<string, string> = {
          jpg: 'image/jpeg',
          jpeg: 'image/jpeg',
          png: 'image/png',
          pdf: 'application/pdf',
        };
        const contentType = MIME_BY_EXT[fileExt] ?? receiptFile.type ?? undefined;

        try {
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('receipts')
            .upload(fileName, receiptFile, {
              cacheControl: '3600',
              ...(contentType ? { contentType } : {}),
              upsert: false,
            });

          if (uploadError) {
            console.error('=== Supabase Storage upload failed ===');
            console.error('Bucket: receipts | Path:', fileName);
            console.error('File:', receiptFile.name, '| type:', receiptFile.type, '| size:', receiptFile.size, 'bytes');
            console.error('Error message:', uploadError.message);
            console.error('Error name:', uploadError.name ?? '(n/a)');
            console.error('Full error object:', uploadError);
            console.error(
              'Hint: "new row violates row-level security policy" means the receipts bucket ' +
                'policies still require auth.role() = \'authenticated\'. Run ' +
                'supabase/migrations/007_guest_receipt_uploads.sql in the Supabase SQL editor.',
            );

            // GRACEFUL FALLBACK: Supabase Storage is configured but may be
            // offline / RLS-blocked at the moment. Attach the receipt as a
            // base64 data-URL so the transaction can still complete and be
            // reviewed by an admin. The payment record's receipt_url will hold it.
            receiptUrl = (await toBase64(receiptFile)) ?? null;
            console.warn('Using base64 fallback for receipt preview.');
          } else {
            const { data: publicUrlData } = supabase.storage
              .from('receipts')
              .getPublicUrl(fileName);

            receiptUrl = publicUrlData?.publicUrl ?? null;
            if (!receiptUrl) {
              console.error(
                'Supabase storage returned no public URL for path:',
                fileName,
                '| upload data:',
                uploadData,
              );
            }
            // Attach the uploaded image's public URL to the form state.
            setReceiptUrl(receiptUrl);
            console.log('Receipt uploaded to Supabase Storage:', receiptUrl);
          }
        } catch (uploadErr) {
          console.error('=== Receipt upload threw ===');
          console.error('Bucket: receipts | Path:', fileName);
          console.error('Thrown value:', uploadErr);
          console.error(
            'This is usually a network failure or an unconfigured/misnamed bucket. ' +
              'Verify the "receipts" bucket exists in Supabase Storage.',
          );
          // Even if the storage call itself throws, keep the flow going with
          // a base64 preview so the user can still submit.
          receiptUrl = (await toBase64(receiptFile)) ?? null;
        } finally {
          setIsUploading(false);
        }
      }

      // Determine the user ID — payments.user_id is TEXT referencing
      // public.users(id). Resolution order: Telegram Mini App user →
      // Supabase auth session → persistent guest id (never throws).
      const userId = await resolveUserId();

      // ---- Pre-flight double-booking lock ----
      // Re-check the live pending/sold pool immediately BEFORE creating the
      // payment. Prevents a user from submitting a receipt for numbers another
      // buyer grabbed (or locked into pending review) while their selection was
      // open. Any taken numbers are dropped from the parent's selection and the
      // submission is aborted without creating a payment row.
      try {
        const { data: takenRows, error: takenError } = await supabase
          .from('tickets')
          .select('ticket_number')
          .in('ticket_number', selectedNumbers)
          .in('status', ['sold', 'pending']);
        if (takenError) {
          console.warn('Pre-flight ticket lock check unavailable, proceeding:', takenError.message);
        } else if ((takenRows ?? []).length > 0) {
          const taken = Array.from(
            new Set(
              (takenRows as Array<{ ticket_number?: unknown }>)
                .map((r) => String(r.ticket_number ?? '').trim())
                .filter(Boolean),
            ),
          );
          onSelectionInvalid?.(taken);
          setError(
            `Some selected numbers were just taken: ${taken.join(', ')}. They've been removed — please review your remaining selection and try again.`,
          );
          return; // `finally` below resets the busy flags
        }
      } catch (lockErr) {
        // A failed lock check never blocks checkout — the reservation step below
        // is still the safety net.
        console.warn('Pre-flight ticket lock check threw (non-fatal):', lockErr);
      }

      // Insert payment record with status 'pending'.
      // Column mapping (public.payments): user_id text → public.users(id),
      // ticket_ids jsonb, amount numeric, receipt_url text, status enum
      // ('pending'|'approved'|'rejected'). No transaction reference is sent:
      // the column (transaction_reference) is nullable in the schema, so
      // omitting it safely stores NULL.
      //
      // Buyer attribution (migration 024): the bot-registered phone_number and
      // telegram_id are attached to EVERY purchase transaction so admins can
      // reconcile receipts against the Telegram account. telegram_id is stored
      // as its canonical numeric string (matches profiles.telegram_id).
      const insertPayload = {
        user_id: userId,
        ticket_ids: selectedNumbers,
        amount: grandTotal,
        receipt_url: receiptUrl,
        status: 'pending' as const,
        ...(profile?.telegram_id
          ? { telegram_id: String(profile.telegram_id) }
          : {}),
        ...(profile?.phone_number ? { phone_number: profile.phone_number } : {}),
      };
      // Same payload without the new contact columns — the fallback retry if
      // the live payments table has not received migration 024 yet.
      const baseInsertPayload = {
        user_id: insertPayload.user_id,
        ticket_ids: insertPayload.ticket_ids,
        amount: insertPayload.amount,
        receipt_url: insertPayload.receipt_url,
        status: insertPayload.status,
      };

      // Wrap the insert in its own try-catch: supabase-js usually returns
      // errors in-band, but network failures / malformed payloads can throw.
      type InsertErrorShape = {
        message: string;
        code?: string | null;
        details?: string | null;
        hint?: string | null;
      };
      let insertError: InsertErrorShape | null = null;
      try {
        const { error } = await supabase.from('payments').insert(insertPayload);
        insertError = error;
      } catch (insertThrew) {
        console.error('DEBUG SUBMIT ERROR (insert threw — network/offline?):', insertThrew);
        // Show the exact thrown error in the UI error box.
        setError(getErrorMessage(insertThrew));
        return; // `finally` below resets the busy flags
      }

      // One automatic retry when the insert fails on the public.users FK
      // (23503): the submitter row may not exist yet (the ensure-row upsert can
      // race with the insert or be silently blocked by a policy). Re-resolving
      // the user id re-runs the upsert, then we retry exactly once so the
      // receipt still lands in the payments table with status 'pending'.
      if (insertError && isUsersForeignKeyError(insertError)) {
        console.warn(
          'payments insert hit a users FK error — re-ensuring the user row and retrying once:',
          insertError.message
        );
        try {
          const retriedUserId = await resolveUserId();
          const { error: retryError } = await supabase
            .from('payments')
            .insert({ ...insertPayload, user_id: retriedUserId });
          if (!retryError) {
            insertError = null;
          } else {
            insertError = retryError;
          }
        } catch (retryThrew) {
          console.error('payments insert retry threw (non-fatal):', retryThrew);
        }
      }

      // Graceful degradation: if the live payments table does not have the
      // telegram_id / phone_number columns yet (migration 024 not applied),
      // retry once WITHOUT them so the purchase still goes through — the
      // columns are an attribution upgrade, never a purchase blocker.
      if (insertError && isMissingColumnError(insertError)) {
        console.warn(
          'payments insert hit a missing-column error — retrying without the ' +
            'telegram_id/phone_number attribution fields (run ' +
            'supabase/migrations/024_payments_contact_fields.sql to enable them):',
          insertError.message
        );
        try {
          const { error: retryError } = await supabase
            .from('payments')
            .insert(baseInsertPayload);
          if (!retryError) {
            insertError = null;
          } else {
            insertError = retryError;
          }
        } catch (retryThrew) {
          console.error('payments insert column-fallback retry threw (non-fatal):', retryThrew);
        }
      }

      if (insertError) {
        console.error('DEBUG SUBMIT ERROR:', insertError);
        console.error('=== Supabase payments insert failed ===');
        console.error('Insert payload:', insertPayload);
        console.error('Error message:', insertError.message);
        console.error('Error code:', insertError.code ?? '(n/a)');
        console.error('Error details:', insertError.details ?? '(n/a)');
        console.error('Error hint:', insertError.hint ?? '(n/a)');
        console.error(
          'Hints: 23503 = FK violation (the users row for user_id was not created — ' +
            'ensure RLS allows inserts on public.users); ' +
            '42501 / "row-level security" = RLS blocked the payments insert — run ' +
            'supabase/migrations/006_guest_checkout_rls.sql; ' +
            '42703 / "could not find the column" = a payments column is missing — run ' +
            'supabase/migrations/003_payment_transaction_reference.sql; ' +
            'PGRST205 / "Could not find the table \'public.payments\' in the schema cache" = ' +
            'the payments table is missing on the database or the schema cache is stale — run ' +
            'supabase/migrations/010_ensure_payments_table.sql.',
        );
        // Show the exact Supabase error message in the UI error box instead of
        // a generic "Failed to submit receipt" string.
        throw new Error(insertError.message || t('submitFailed'));
      }

      // ---- Step 2b: LOCK/reserve the selected ticket numbers IMMEDIATELY ----
      // Each chosen number gets a public.tickets row flipped to status
      // 'pending' so no other buyer can pick it while the payment is verified.
      // Admin approval flips 'pending' → 'sold'; rejection releases them back
      // to 'available' (see lib/admin/management.ts).
      //
      // Conflict resolution: a released number may already have an 'available'
      // row left over from an earlier rejected check-out. We REUSE that row
      // (update it to pending + this user) instead of inserting a duplicate, so
      // one number never maps to two rows. Numbers already pending/sold are
      // skipped (the pre-flight check above should have caught them).
      try {
        const { data: existingRows, error: existingError } = await supabase
          .from('tickets')
          .select('ticket_number, status')
          .in('ticket_number', selectedNumbers);

        if (existingError) {
          console.warn('Ticket reservation lookup unavailable, proceeding:', existingError.message);
        } else {
          const existingByNumber = new Map<string, string>(
            (existingRows as Array<{ ticket_number?: unknown; status?: unknown }>).map((r) => [
              String(r.ticket_number ?? ''),
              String(r.status ?? ''),
            ]),
          );
          const toInsert = selectedNumbers.filter((number) => !existingByNumber.has(number));
          const toReuse = selectedNumbers.filter(
            (number) => existingByNumber.get(number) === 'available',
          );

          if (toReuse.length > 0) {
            // buyer_phone (migration 018) attributes the reservation to the
            // bot-registered phone; retry without it if the column is missing.
            const reuseUpdate = {
              status: 'pending' as const,
              user_id: userId,
              ...(profile?.phone_number ? { buyer_phone: profile.phone_number } : {}),
            };
            let reuse = await supabase
              .from('tickets')
              .update(reuseUpdate)
              .in('ticket_number', toReuse)
              .eq('status', 'available');
            if (reuse.error && isMissingColumnError(reuse.error)) {
              reuse = await supabase
                .from('tickets')
                .update({ status: 'pending' as const, user_id: userId })
                .in('ticket_number', toReuse)
                .eq('status', 'available');
            }
            if (reuse.error) {
              console.warn('Ticket reservation reuse update skipped:', reuse.error.message);
            }
          }

          if (toInsert.length > 0) {
            let reservation = await supabase.from('tickets').insert(
              toInsert.map((number) => ({
                ticket_number: number,
                user_id: userId,
                status: 'pending' as const,
                ...(profile?.phone_number ? { buyer_phone: profile.phone_number } : {}),
              })),
            );
            if (reservation.error && isMissingColumnError(reservation.error)) {
              reservation = await supabase.from('tickets').insert(
                toInsert.map((number) => ({
                  ticket_number: number,
                  user_id: userId,
                  status: 'pending' as const,
                })),
              );
            }
            if (reservation.error) {
              console.warn('Ticket reservation insert skipped:', reservation.error.message);
            }
          }
        }
      } catch (reserveThrew) {
        console.warn('Ticket reservation threw (non-fatal):', reserveThrew);
      }

      // Step 3: Notify the user via success confirmation screen
      setStep('success');
    } catch (err) {
      console.error('DEBUG SUBMIT ERROR:', err);
      // Surface the exact error message in the UI error box so the real issue
      // (RLS, FK, missing column, network) is readable instead of a generic
      // "Failed to submit receipt" or "[object Object]".
      setError(getErrorMessage(err));
    } finally {
      setIsUploading(false);
      setIsSubmitting(false);
    }
  };

  const handleComplete = () => {
    try {
      onComplete();
    } catch (err) {
      console.error('DEBUG COMPLETE ERROR:', err);
    }
    setStep('accounts');
    setSelectedAccountId(null);
    setShowAccountWarning(false);
    setReceiptFile(null);
    setReceiptUrl(null);
    setError(null);
    onClose();
  };

  const handleClose = () => {
    setStep('accounts');
    setSelectedAccountId(null);
    setShowAccountWarning(false);
    setReceiptFile(null);
    setReceiptUrl(null);
    setError(null);
    onClose();
  };

  const progressSteps: CheckoutStep[] = ['accounts', 'receipt', 'success'];
  const currentStepIndex = progressSteps.indexOf(step);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-4 overflow-y-auto">
      <div className="relative w-full max-w-lg rounded-3xl border border-cyan/30 bg-card shadow-cyan-glow-soft">
        {/* Modal Header */}
        <div className="flex items-center justify-between rounded-t-3xl border-b border-cyan/30 bg-card-dark p-4">
          <h2 className="text-xl font-bold text-white">
            {step === 'success' ? t('successTitle') : t('checkoutTitle')}
          </h2>
          <button
            onClick={handleClose}
            className="rounded-full border border-slate-700 p-1 text-slate-300 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Stepper Indicator */}
        {step !== 'success' && (
          <div className="flex items-center justify-between px-6 py-3">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold',
                  currentStepIndex >= 0
                    ? 'bg-cyan-gradient text-background shadow-cyan-glow-strong'
                    : 'bg-card-dark text-text-secondary',
                )}
              >
                1
              </div>
              <span className="text-xs font-medium text-text-secondary">{t('paymentOptions')}</span>
            </div>
            <div className="h-0.5 w-12 bg-card-border" />
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold',
                  currentStepIndex >= 1
                    ? 'bg-cyan-gradient text-background shadow-cyan-glow-strong'
                    : 'bg-card-dark text-text-secondary',
                )}
              >
                2
              </div>
              <span className="text-xs font-medium text-text-secondary">{t('receiptUpload')}</span>
            </div>
          </div>
        )}

        {/* Modal Body */}
        <div className="max-h-[60vh] overflow-y-auto p-6">
          {step === 'accounts' && (
            <div className="space-y-5">
              {/* Phone-registration gate (ስልክ አጋራ prompt): shown when a
                  Telegram user has no registered phone number in
                  public.profiles. Checkout is blocked until they register. */}
              {showPhoneGate && (
                <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
                  <p className="text-sm font-bold text-amber-300">
                    📱 {t('phoneRequiredTitle')}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-amber-200">
                    {t('registerPhonePrompt')}
                  </p>
                  <button
                    onClick={() => void reloadProfile()}
                    className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs font-semibold text-amber-200 transition hover:bg-amber-500/20"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    {t('recheckPhone')}
                  </button>
                </div>
              )}

              {/* Selection Summary */}
              <div className="rounded-2xl border border-cyan/20 bg-card-dark p-4">
                <h3 className="text-sm font-bold text-cyan">{t('selectedTicketNumbers')}</h3>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {selectedNumbers.map((number) => (
                    <span
                      key={number}
                      className="flex items-center gap-1 rounded-lg border border-cyan/30 bg-cyan/10 px-2 py-1 text-xs font-bold text-cyan-light"
                    >
                      {number}
                    </span>
                  ))}
                </div>
                <div className="mt-3 border-t border-cyan/20 pt-3 space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text-secondary">{t('quantity')}</span>
                    <span className="font-semibold text-white">{selectedNumbers.length}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text-secondary">{t('pricePerTicket')}</span>
                    <span className="font-semibold text-white">
                      {price.toLocaleString()} {t('etb')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-cyan/20 pt-2">
                    <span className="font-bold text-white">{t('grandTotal')}</span>
                    <span className="text-xl font-black text-cyan">
                      {grandTotal.toLocaleString()} {t('etb')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Bank Accounts Section — Step 1 (dynamic from Supabase) */}
              <div>
                <h3 className="mb-3 text-sm font-bold text-white">{t('bankAccounts')}</h3>

                {loadingAccounts ? (
                  <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-cyan/20 bg-card-dark p-6 text-sm text-text-secondary">
                    <Loader2 className="h-5 w-5 animate-spin text-cyan" />
                    {t('bankAccountsLoading')}
                  </div>
                ) : bankAccounts.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-card-border bg-card-dark p-4 text-center text-xs text-text-secondary">
                    {t('bankAccountsError')}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {bankAccounts.map((account) => {
                      const Icon = account.icon;
                      const isSelected = selectedAccountId === account.id;
                      return (
                        <button
                          key={account.id}
                          type="button"
                          onClick={() => handleSelectAccount(account.id)}
                          aria-pressed={isSelected}
                          className={cn(
                            'block w-full rounded-xl border p-3 text-left transition',
                            isSelected
                              ? 'border-cyan bg-cyan/10 shadow-cyan-glow-soft'
                              : 'border-cyan/20 bg-card-dark hover:border-cyan/50'
                          )}
                        >
                          <div className="flex items-center gap-3">
                            {/* Selection radio indicator */}
                            <span
                              className={cn(
                                'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 transition',
                                isSelected ? 'border-cyan bg-cyan' : 'border-slate-500'
                              )}
                            >
                              {isSelected && <CheckCircle className="h-3.5 w-3.5 text-background" />}
                            </span>
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan/40 bg-card text-cyan">
                              <Icon className="h-5 w-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-bold text-white">{account.name}</p>
                              <p className="font-mono text-xs text-cyan-light break-all">
                                {account.account}
                              </p>
                            </div>
                            {/* Copy action nested as a span to avoid a
                                button-inside-button hydration error. */}
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleCopy(account.id, account.account);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.stopPropagation();
                                  void handleCopy(account.id, account.account);
                                }
                              }}
                              className="rounded-lg border border-cyan/30 bg-cyan/10 p-2 text-cyan-light transition hover:bg-cyan/20"
                              aria-label={t('copyAccountNumber')}
                            >
                              {copiedId === account.id ? (
                                <CheckCircle className="h-4 w-4 text-green-400" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                            </span>
                          </div>
                          {copiedId === account.id && (
                            <p className="mt-1 text-xs text-green-400">{t('copied')}</p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Mandatory selection hint / warning */}
                {!loadingAccounts && bankAccounts.length > 0 && (
                  <p
                    className={cn(
                      'flex items-center gap-1.5 text-xs font-medium',
                      showAccountWarning || error ? 'text-red-300' : 'text-text-secondary'
                    )}
                    role={showAccountWarning ? 'alert' : undefined}
                  >
                    <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                    {t('selectBankAccountHint')}
                  </p>
                )}
              </div>

              {/* Instructions */}
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" />
                  <p className="text-xs text-amber-300">
                    {t('receiptUploadPrompt')}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Receipt Upload */}
          {step === 'receipt' && (
            <div className="space-y-5">
              <div>
                <h3 className="mb-3 text-sm font-bold text-white">{t('receiptUpload')}</h3>
                <div className="space-y-4">
                  {/* File Upload */}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-text-secondary">
                      {t('uploadReceiptBtn')}
                    </label>
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept="image/*,.pdf"
                      onChange={handleFileChange}
                      className="w-full rounded-xl border border-cyan/30 bg-card-dark py-2.5 px-4 text-sm text-gray-300 file:mr-3 file:rounded-lg file:border-0 file:bg-cyan file:px-3 file:py-1.5 file:font-semibold file:text-background cursor-pointer hover:border-cyan/60 focus:outline-none"
                    />
                    <p className="mt-1 text-xs text-text-secondary">
                      JPG, PNG, PDF (max 5MB)
                    </p>
                  </div>

                  {/* File Preview */}
                  {receiptFile && (
                    <div className="flex items-center justify-between rounded-xl border border-cyan/20 bg-card-dark p-3">
                      <div className="flex items-center gap-2">
                        <Upload className="h-4 w-4 text-cyan" />
                        <span className="text-sm text-white">{receiptFile.name}</span>
                        <span className="text-xs text-text-secondary">
                          ({(receiptFile.size / 1024 / 1024).toFixed(1)} MB)
                        </span>
                      </div>
                      <button
                        onClick={removeFile}
                        className="rounded-lg p-1 text-red-300 hover:bg-red-500/10"
                        aria-label={t('removeFile')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Success Confirmation */}
          {step === 'success' && (
            <div className="flex flex-col items-center text-center py-8">
              <div className="flex h-20 w-20 items-center justify-center rounded-full border border-green-500/30 bg-green-500/10 shadow-[0_0_15px_rgba(34,197,94,0.5)]">
                <CheckCircle className="h-10 w-10 text-green-400" />
              </div>
              <h3 className="mt-5 text-xl font-bold text-white">{t('successTitle')}</h3>
              <p className="mt-3 text-sm text-text-secondary">
                {t('successMessage')}
              </p>
              <div className="mt-4 flex items-center gap-2 rounded-full border border-cyan/30 bg-cyan/10 px-3 py-1.5 text-xs font-semibold text-cyan-light">
                <Clock3 className="h-3 w-3" />
                {t('pendingStatusAm')}
              </div>
              <p className="mt-2 text-xs text-text-secondary">
                {t('waitingApproval')}
              </p>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
              {error}
            </div>
          )}
        </div>

        {/* Modal Footer / Actions */}
        <div className="border-t border-cyan/30 bg-card-dark p-4">
          {step === 'accounts' && (
            <div className="flex gap-3">
              <button
                onClick={handleClose}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-cyan/30 bg-card px-4 py-3 text-sm font-semibold text-white transition hover:bg-cyan/10"
              >
                <X className="h-4 w-4" />
                {t('back')}
              </button>
              <button
                onClick={handleContinueToReceipt}
                disabled={!canContinueToReceipt}
                title={
                  canContinueToReceipt
                    ? undefined
                    : t('selectBankAccountWarning')
                }
                className="cyan-glow-button flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t('next')}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {step === 'receipt' && (
            <div className="flex gap-3">
              <button
                onClick={() => setStep('accounts')}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-cyan/30 bg-card px-4 py-3 text-sm font-semibold text-white transition hover:bg-cyan/10"
              >
                <ArrowLeft className="h-4 w-4" />
                {t('back')}
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || isUploading}
                className="cyan-glow-button flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting || isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {isUploading ? t('uploading') : t('submitting')}
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    {t('submitReceipt')}
                  </>
                )}
              </button>
            </div>
          )}

          {step === 'success' && (
            <button
              onClick={handleComplete}
              className="cyan-glow-button w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-base font-black"
            >
              <Clock3 className="h-4 w-4" />
              {t('goToPending')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}