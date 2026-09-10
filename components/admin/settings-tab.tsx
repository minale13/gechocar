'use client';

import { useState } from 'react';
import {
  CalendarClock,
  Headphones,
  ImagePlus,
  Landmark,
  Loader2,
  Pencil,
  Save,
  Settings as SettingsIcon,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type {
  AppSettings,
  HeroBanner,
  PaymentMethod,
  SupportManager,
  TelegramSchedulerSettings,
  TelegramSettings,
} from '@/components/admin/types';
import { SafeImage } from '@/components/admin/safe-image';

type BannerField = 'title' | 'imageUrl' | 'linkUrl' | 'isActive' | 'sortOrder';

type Props = {
  settings: {
    form: AppSettings;
    onFieldChange: (field: keyof AppSettings, value: string | number) => void;
    onLogoFile: (file: File) => void | Promise<void>;
    uploadingLogo: boolean;
    onRemoveLogo: () => void | Promise<void>;
    onSave: () => void | Promise<void>;
    saving: boolean;
  };
  support: {
    manager: SupportManager;
    editing: SupportManager;
    setEditing: (s: SupportManager) => void;
    showForm: boolean;
    setShowForm: (b: boolean) => void;
    save: () => void | Promise<void>;
    saving: boolean;
  };
  paymentMethods: {
    items: PaymentMethod[];
    form: PaymentMethod;
    setForm: (p: PaymentMethod) => void;
    showForm: boolean;
    setShowForm: (b: boolean) => void;
    edit: (m: PaymentMethod) => void;
    save: () => void | Promise<void>;
    saving: boolean;
    reset: () => void;
    toggle: (m: PaymentMethod) => void | Promise<void>;
    remove: (id: string) => void | Promise<void>;
  };
  telegram: {
    settings: TelegramSettings;
    onChange: (s: TelegramSettings) => void;
    save: () => void | Promise<void>;
    saving: boolean;
    test: () => void | Promise<void>;
    testing: boolean;
  };
  scheduler: {
    form: TelegramSchedulerSettings;
    onChange: (patch: Partial<TelegramSchedulerSettings>) => void;
    save: () => void | Promise<void>;
    saving: boolean;
    postNow: () => void | Promise<void>;
    posting: boolean;
    onImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void | Promise<void>;
    uploadingImage: boolean;
    nextPostInMin: number | null;
  };
  banners: {
    items: HeroBanner[];
    form: HeroBanner;
    onFieldChange: (field: BannerField, value: string | number | boolean) => void;
    save: () => void | Promise<void>;
    saving: boolean;
    /** Pick (or clear) a hero banner image file — previewed locally, uploaded to Supabase Storage on save. */
    onImageFile: (file: File | null) => void | Promise<void>;
    /** True while the banner image is being uploaded to Supabase Storage. */
    uploadingImage: boolean;
    edit: (b: HeroBanner) => void;
    remove: (id: string) => void | Promise<void>;
    reset: () => void;
    selectedId: string | null;
  };
};

const inputClass =
  'w-full rounded-xl border border-slate-700/80 bg-slate-950/70 px-3.5 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20';
const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400';

function toLocalInputValue(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const goldButton =
  'btn-lux-gold';

/** ⚙️ App Settings — logo, lottery configuration, support & bot, payment methods, banners. */
export function SettingsTab({
  settings,
  support,
  paymentMethods,
  telegram,
  scheduler,
  banners,
}: Props) {
  const [dragging, setDragging] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void settings.onLogoFile(file);
  };

  return (
    <div className="space-y-6">
      {/* ── Logo management ── */}
      <section className="glass-card rounded-3xl border border-amber-500/20 p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400">
            <ImagePlus className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-amber-400/70">Branding</p>
            <h3 className="text-lg font-bold text-white">Logo Management</h3>
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto]">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`flex min-h-[120px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center transition ${
              dragging
                ? 'border-amber-400 bg-amber-500/10'
                : 'border-slate-700 bg-slate-950/50 hover:border-amber-500/40'
            }`}
          >
            <Upload className={`h-6 w-6 ${dragging ? 'text-amber-400' : 'text-slate-500'}`} />
            <p className="text-sm font-medium text-slate-300">Drag &amp; drop the logo here, or</p>
            <label className="cursor-pointer rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-1.5 text-xs font-bold text-amber-300 transition hover:bg-amber-500/20">
              Browse files
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void settings.onLogoFile(file);
                  e.target.value = '';
                }}
              />
            </label>
            <p className="text-[11px] text-slate-600">PNG, JPG or SVG — max 2MB</p>
          </div>

          <div className="flex w-full flex-col items-center justify-center gap-3 rounded-2xl border border-slate-800 bg-slate-950/50 p-4 sm:w-48">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Current logo
            </p>
            {settings.form.logoUrl ? (
              <SafeImage
                src={settings.form.logoUrl}
                alt="App logo"
                className="h-20 w-20 rounded-2xl border border-slate-700 bg-slate-900 object-contain p-1.5"
                fallbackClassName="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-2xl border border-red-500/40 bg-red-500/10 text-red-300"
                fallbackLabel="Logo failed to load"
              />
            ) : (
              <span className="flex h-20 w-20 items-center justify-center rounded-2xl border border-dashed border-slate-700 text-2xl text-slate-600">
                ?
              </span>
            )}
            {settings.form.logoUrl && (
              <button
                type="button"
                onClick={() => void settings.onRemoveLogo()}
                className="inline-flex items-center gap-1 rounded-lg border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-xs text-red-300 transition hover:bg-red-500/20"
              >
                <X className="h-3 w-3" />
                Remove
              </button>
            )}
          </div>
        </div>
      </section>


      {/* ── Lottery configuration ── */}
      <section className="glass-card rounded-3xl border border-amber-500/20 p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400">
            <CalendarClock className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-amber-400/70">Configuration</p>
            <h3 className="text-lg font-bold text-white">Lottery Configuration</h3>
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block">
            <span className={labelClass}>App Title</span>
            <input
              value={settings.form.appTitle}
              onChange={(e) => settings.onFieldChange('appTitle', e.target.value)}
              className={inputClass}
              placeholder="Admas Lottery"
            />
          </label>
          <label className="block">
            <span className={labelClass}>Ticket Price (ETB)</span>
            <input
              type="number"
              min={0}
              value={settings.form.ticketPrice}
              onChange={(e) => settings.onFieldChange('ticketPrice', Number(e.target.value))}
              className={inputClass}
              placeholder="2500"
            />
          </label>
          <label className="block">
            <span className={labelClass}>Total Lottery Count</span>
            <input
              type="number"
              min={0}
              value={settings.form.totalTickets}
              onChange={(e) => settings.onFieldChange('totalTickets', Number(e.target.value))}
              className={inputClass}
              placeholder="100"
            />
          </label>
          <label className="block sm:col-span-2 lg:col-span-1">
            <span className={labelClass}>Draw Date &amp; Time</span>
            <input
              type="datetime-local"
              value={toLocalInputValue(settings.form.drawDatetime)}
              onChange={(e) =>
                settings.onFieldChange(
                  'drawDatetime',
                  e.target.value ? new Date(e.target.value).toISOString() : '',
                )
              }
              className={`${inputClass} [color-scheme:dark]`}
            />
          </label>
          <label className="block">
            <span className={labelClass}>Banner Image URL</span>
            <input
              value={settings.form.bannerImage}
              onChange={(e) => settings.onFieldChange('bannerImage', e.target.value)}
              className={inputClass}
              placeholder="https://…"
            />
          </label>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={() => void settings.onSave()}
            disabled={settings.saving}
            className={goldButton}
          >
            {settings.saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save Settings
              </>
            )}
          </button>
          <p className="text-xs text-slate-500">
            Applies globally — the Mini App reads these values on every load.
          </p>
        </div>
      </section>


      {/* ── Support & Bot settings ── */}
      <section className="glass-card rounded-3xl border border-amber-500/20 p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400">
            <Headphones className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-amber-400/70">Channels</p>
            <h3 className="text-lg font-bold text-white">Support &amp; Bot Settings</h3>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {/* Support team */}
          <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-amber-300">Support Team</p>
              <button
                type="button"
                onClick={() => {
                  support.setEditing({ ...support.manager });
                  support.setShowForm(true);
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-300 transition hover:bg-amber-500/20"
              >
                <Pencil className="h-3 w-3" />
                Edit
              </button>
            </div>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Username</dt>
                <dd className="truncate font-semibold text-white">{support.manager.username}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Contact</dt>
                <dd className="truncate font-semibold text-white">{support.manager.contact}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Phone</dt>
                <dd className="truncate font-semibold text-white">
                  {support.manager.phone || '—'}
                </dd>
              </div>
            </dl>

            {support.showForm && (
              <div className="space-y-2.5 border-t border-slate-800 pt-3">
                <input
                  value={support.editing.username}
                  onChange={(e) =>
                    support.setEditing({ ...support.editing, username: e.target.value })
                  }
                  placeholder="@support_username"
                  className={inputClass}
                />
                <input
                  value={support.editing.contact}
                  onChange={(e) =>
                    support.setEditing({ ...support.editing, contact: e.target.value })
                  }
                  placeholder="Support contact handle"
                  className={inputClass}
                />
                <input
                  value={support.editing.phone}
                  onChange={(e) =>
                    support.setEditing({ ...support.editing, phone: e.target.value })
                  }
                  placeholder="Phone number (optional)"
                  className={inputClass}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => support.setShowForm(false)}
                    className="flex-1 rounded-xl border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/5"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void support.save()}
                    disabled={support.saving}
                    className={`flex-1 text-xs ${goldButton}`}
                  >
                    {support.saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Save Support
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Telegram bot + auto-post scheduler */}
          <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
            <p className="text-sm font-bold text-amber-300">Telegram Bot</p>
            <input
              type="password"
              value={telegram.settings.botToken}
              onChange={(e) =>
                telegram.onChange({ ...telegram.settings, botToken: e.target.value })
              }
              placeholder="Bot token"
              className={inputClass}
            />
            <input
              value={telegram.settings.chatId}
              onChange={(e) =>
                telegram.onChange({ ...telegram.settings, chatId: e.target.value })
              }
              placeholder="Chat ID — your personal id (e.g. 123456789), @channel, or blank = broadcast to all users"
              className={inputClass}
            />
            <p className="text-[11px] leading-relaxed text-slate-500">
              Send Test uses this Chat ID — enter your personal numeric Telegram chat id
              (message @userinfobot to find it). Leave it blank to broadcast the auto-post
              to every registered chat.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void telegram.save()}
                disabled={telegram.saving}
                className={`flex-1 text-xs ${goldButton}`}
              >
                {telegram.saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Save Bot
              </button>
              <button
                type="button"
                onClick={() => void telegram.test()}
                disabled={telegram.testing}
                className="flex-1 rounded-xl border border-sky-500/40 bg-sky-500/10 px-4 py-2.5 text-xs font-bold text-sky-300 transition hover:bg-sky-500/20 disabled:opacity-50"
              >
                {telegram.testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Send Test'}
              </button>
            </div>

            {/* Mini App user analytics (fetched live) */}
            {/* Auto-post scheduler (clean posting/scheduling UI only — user
                analytics live on the Overview page). */}
            <div className="space-y-2.5 border-t border-slate-800 pt-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
                  Auto-Post Scheduler
                </p>
                <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={scheduler.form.isActive}
                    onChange={(e) => scheduler.onChange({ isActive: e.target.checked })}
                    className="h-4 w-4 accent-amber-500"
                  />
                  Active
                </label>
              </div>
              <textarea
                value={scheduler.form.caption}
                onChange={(e) => scheduler.onChange({ caption: e.target.value })}
                placeholder="Post caption"
                rows={2}
                className={`${inputClass} resize-none`}
              />

              {/* Post image: upload a file (stored in Supabase Storage) or paste
                  a public image URL. Sent via sendPhoto when present, otherwise
                  the caption is sent as a plain sendMessage. */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="cursor-pointer rounded-xl border border-dashed border-slate-600 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-amber-500/50 hover:text-amber-300">
                    {scheduler.uploadingImage ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Uploading…
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5">
                        <Upload className="h-3.5 w-3.5" />
                        Upload Photo
                      </span>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => void scheduler.onImageUpload(e)}
                      disabled={scheduler.uploadingImage}
                    />
                  </label>
                  <span className="text-[11px] text-slate-600">or paste an image URL below</span>
                </div>
                <input
                  value={scheduler.form.imageUrl ?? ''}
                  onChange={(e) => scheduler.onChange({ imageUrl: e.target.value })}
                  placeholder="Image URL (https://…)"
                  className={inputClass}
                />
                {scheduler.form.imageUrl ? (
                  <div className="relative overflow-hidden rounded-xl border border-slate-800 bg-slate-950/70">
                    <SafeImage
                      src={scheduler.form.imageUrl}
                      alt="Scheduler post preview"
                      className="h-36 w-full object-cover"
                      fallbackClassName="flex h-36 w-full items-center justify-center rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 text-xs"
                      fallbackLabel="Preview unavailable"
                    />
                    <button
                      type="button"
                      onClick={() => scheduler.onChange({ imageUrl: '' })}
                      className="absolute right-2 top-2 rounded-lg border border-red-500/40 bg-slate-950/80 p-1.5 text-red-300 transition hover:bg-red-500/20"
                      aria-label="Remove image"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                    <span className="absolute bottom-2 left-2 rounded-md bg-slate-950/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
                      Photo will be sent with the caption
                    </span>
                  </div>
                ) : (
                  <p className="flex items-center gap-1.5 rounded-xl border border-dashed border-slate-800 px-3 py-2.5 text-[11px] text-slate-500">
                    <ImagePlus className="h-3.5 w-3.5" />
                    No photo attached — the post will be sent as a text message.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-[11px] text-slate-500">Interval (hours)</span>
                  <input
                    type="number"
                    min={0}
                    value={scheduler.form.intervalHours}
                    onChange={(e) => scheduler.onChange({ intervalHours: Number(e.target.value) })}
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] text-slate-500">Interval (minutes)</span>
                  <input
                    type="number"
                    min={0}
                    value={scheduler.form.intervalMinutes}
                    onChange={(e) =>
                      scheduler.onChange({ intervalMinutes: Number(e.target.value) })
                    }
                    className={inputClass}
                  />
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void scheduler.save()}
                  disabled={scheduler.saving}
                  className={`flex-1 text-xs ${goldButton}`}
                >
                  {scheduler.saving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    'Save Scheduler'
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => void scheduler.postNow()}
                  disabled={scheduler.posting}
                  className="flex-1 rounded-xl border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/5 disabled:opacity-50"
                >
                  {scheduler.posting ? 'Posting…' : 'Post Now'}
                </button>
              </div>
              {scheduler.nextPostInMin !== null && (
                <p className="text-xs text-emerald-300">
                  Next auto-post in ~{scheduler.nextPostInMin} min
                </p>
              )}
            </div>
          </div>

        </div>
      </section>


      {/* ── Payment methods (bank accounts) ── */}
      <section className="glass-card rounded-3xl border border-amber-500/20 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400">
              <Landmark className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-amber-400/70">Checkout</p>
              <h3 className="text-lg font-bold text-white">Payment Methods</h3>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              paymentMethods.reset();
              paymentMethods.setShowForm(true);
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-amber-400"
          >
            <Landmark className="h-4 w-4" />
            Add Account
          </button>
        </div>

        {paymentMethods.showForm && (
          <div className="mt-4 grid gap-3 rounded-2xl border border-slate-800 bg-slate-950/50 p-4 sm:grid-cols-2">
            <input
              value={paymentMethods.form.bank_name}
              onChange={(e) =>
                paymentMethods.setForm({ ...paymentMethods.form, bank_name: e.target.value })
              }
              placeholder="Bank name (e.g. Commercial Bank of Ethiopia)"
              className={inputClass}
            />
            <input
              value={paymentMethods.form.account_name}
              onChange={(e) =>
                paymentMethods.setForm({ ...paymentMethods.form, account_name: e.target.value })
              }
              placeholder="Account name"
              className={inputClass}
            />
            <input
              value={paymentMethods.form.account_number}
              onChange={(e) =>
                paymentMethods.setForm({ ...paymentMethods.form, account_number: e.target.value })
              }
              placeholder="Account number"
              className={inputClass}
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void paymentMethods.save()}
                disabled={paymentMethods.saving}
                className={`flex-1 text-xs ${goldButton}`}
              >
                {paymentMethods.saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Save Account
              </button>
              <button
                type="button"
                onClick={() => paymentMethods.reset()}
                className="flex-1 rounded-xl border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/5"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="mt-4 space-y-2">
          {paymentMethods.items.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">
              No payment accounts yet — add one so players can pay.
            </p>
          ) : (
            paymentMethods.items.map((method) => (
              <div
                key={method.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-800 bg-slate-950/50 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{method.bank_name}</p>
                  <p className="truncate text-xs text-slate-500">
                    {method.account_name} · {method.account_number}
                  </p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void paymentMethods.toggle(method)}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-bold transition ${
                      method.is_active
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                        : 'border-slate-600 bg-slate-800 text-slate-400'
                    }`}
                  >
                    {method.is_active ? 'Active' : 'Inactive'}
                  </button>
                  <button
                    type="button"
                    onClick={() => paymentMethods.edit(method)}
                    className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-1.5 text-amber-300 transition hover:bg-amber-500/20"
                    aria-label="Edit"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void paymentMethods.remove(method.id)}
                    className="rounded-lg border border-red-500/40 bg-red-500/10 p-1.5 text-red-300 transition hover:bg-red-500/20"
                    aria-label="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>


      {/* ── Hero banner carousel ── */}
      <section className="glass-card rounded-3xl border border-amber-500/20 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400">
              <SettingsIcon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-amber-400/70">Content</p>
              <h3 className="text-lg font-bold text-white">Hero Banner Carousel</h3>
            </div>
          </div>
          <button
            type="button"
            onClick={banners.reset}
            className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-amber-400"
          >
            Add New Banner
          </button>
        </div>

        <div className="mt-4 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
            <p className="text-sm font-bold text-amber-300">
              {banners.selectedId ? 'Update Hero Banner' : 'Add Hero Banner'}
            </p>
            <input
              value={banners.form.title}
              onChange={(e) => banners.onFieldChange('title', e.target.value)}
              placeholder="Banner title"
              className={inputClass}
            />
            <input
              value={banners.form.linkUrl}
              onChange={(e) => banners.onFieldChange('linkUrl', e.target.value)}
              placeholder="Link URL (optional)"
              className={inputClass}
            />
            <div>
              <span className={labelClass}>Banner Image</span>
              {/* Live preview of the selected/stored image (SafeImage handles
                  storage URLs AND base64 data-URL previews). */}
              {banners.form.imageUrl && (
                <div className="relative mb-2 overflow-hidden rounded-2xl border border-slate-800">
                  <SafeImage
                    src={banners.form.imageUrl}
                    alt="Banner image preview"
                    className="h-36 w-full object-cover"
                    fallbackClassName="flex h-36 w-full items-center justify-center bg-slate-900 text-slate-500"
                    fallbackLabel="Preview unavailable"
                  />
                  <button
                    type="button"
                    onClick={() => void banners.onImageFile(null)}
                    disabled={banners.saving || banners.uploadingImage}
                    title="Remove the selected image"
                    className="absolute right-2 top-2 rounded-lg border border-red-500/40 bg-slate-950/80 px-2 py-1 text-xs font-bold text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
                  >
                    ✕ Remove
                  </button>
                </div>
              )}
              {/* File upload — replaces the old plain URL text input. The file
                  is uploaded to Supabase Storage ("hero-banners" bucket) when
                  Save Banner is clicked. */}
              <label
                className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed p-4 text-center transition ${
                  banners.uploadingImage
                    ? 'border-amber-500/60 bg-amber-500/10'
                    : 'border-slate-700 bg-slate-950/50 hover:border-amber-500/40'
                }`}
              >
                {banners.uploadingImage ? (
                  <Loader2 className="h-5 w-5 animate-spin text-amber-400" />
                ) : (
                  <Upload className="h-5 w-5 text-slate-500" />
                )}
                <span className="text-sm font-medium text-slate-300">
                  {banners.uploadingImage
                    ? 'Uploading image...'
                    : banners.form.imageUrl
                      ? 'Change image — click to select a new file'
                      : 'Click to select a banner image'}
                </span>
                <span className="text-[10px] text-slate-600">
                  PNG / JPG / WEBP — uploaded to Supabase Storage on save
                </span>
                <input
                  type="file"
                  accept="image/*"
                  disabled={banners.saving || banners.uploadingImage}
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    void banners.onImageFile(file);
                    // Reset the native input so re-selecting the SAME file
                    // still fires onChange.
                    e.target.value = '';
                  }}
                  className="hidden"
                />
              </label>
            </div>
            <label className="block w-24">
              <span className={labelClass}>Order</span>
              <input
                type="number"
                value={banners.form.sortOrder}
                onChange={(e) => banners.onFieldChange('sortOrder', Number(e.target.value))}
                className={inputClass}
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={banners.form.isActive}
                onChange={(e) => banners.onFieldChange('isActive', e.target.checked)}
                className="h-4 w-4 accent-amber-500"
              />
              Visible on the Mini App home page
            </label>
            <button
              type="button"
              onClick={() => void banners.save()}
              disabled={banners.saving || banners.uploadingImage}
              className={`w-full ${goldButton}`}
            >
              {(banners.saving || banners.uploadingImage) && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              {banners.uploadingImage
                ? 'Uploading image...'
                : banners.saving
                  ? 'Saving…'
                  : banners.selectedId
                    ? 'Update Banner'
                    : 'Save Banner'}
            </button>
          </div>

          <div className="space-y-2">
            {banners.items.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">
                No hero banners yet.
              </p>
            ) : (
              banners.items.map((banner) => (
                <div
                  key={banner.id}
                  className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-950/50 p-3"
                >
                  {banner.imageUrl ? (
                    <SafeImage
                      src={banner.imageUrl}
                      alt=""
                      className="h-12 w-20 flex-shrink-0 rounded-xl border border-slate-700 object-cover"
                      fallbackClassName="flex h-12 w-20 flex-shrink-0 items-center justify-center rounded-xl border border-red-500/30 bg-red-500/10 text-red-300"
                      fallbackLabel=""
                    />
                  ) : (
                    <span className="flex h-12 w-20 flex-shrink-0 items-center justify-center rounded-xl bg-slate-800 text-slate-500">
                      <ImagePlus className="h-4 w-4" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white">{banner.title}</p>
                    <p className="text-xs text-slate-500">
                      Order {banner.sortOrder} · {banner.isActive ? 'visible' : 'hidden'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => banners.edit(banner)}
                    className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-1.5 text-amber-300 transition hover:bg-amber-500/20"
                    aria-label="Edit banner"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void banners.remove(banner.id)}
                    className="rounded-lg border border-red-500/40 bg-red-500/10 p-1.5 text-red-300 transition hover:bg-red-500/20"
                    aria-label="Delete banner"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

    </div>
  );
}
