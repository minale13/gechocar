'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Headset, Sparkles } from 'lucide-react';
import { useLanguage, type Language } from '@/components/app/language-provider';
import { languageNames } from '@/lib/translations';
import { cn } from '@/lib/utils';

const languageOptions: Language[] = ['en', 'am', 'om', 'ti'];

// UK flag shown alongside the current language in the selector trigger.
const languageFlags: Record<Language, string> = {
  en: '🇬🇧',
  am: '🇪🇹',
  om: '🇪🇹',
  ti: '🇪🇹',
};

export function Header({
  appTitle,
  logoUrl,
  supportUrl,
}: {
  appTitle?: string;
  logoUrl?: string;
  /** Telegram support handle (no @) — renders a tappable support button when set. */
  supportUrl?: string;
}) {
  const { language, setLanguage, t } = useLanguage();
  const [languageOpen, setLanguageOpen] = useState(false);
  const languageRef = useRef<HTMLDivElement>(null);
  // Track logo load failure so a broken/removed Supabase Storage file shows a
  // branded placeholder instead of the browser's broken-image icon.
  const [logoFailed, setLogoFailed] = useState(false);

  // Whenever the admin uploads / changes the logo URL (app_settings row id = 1),
  // reset the failure flag. Without this a previously-broken image kept hiding
  // every newly-uploaded logo behind the static monogram placeholder until the
  // whole header remounted.
  useEffect(() => {
    setLogoFailed(false);
  }, [logoUrl]);

  // Close the dropdown when clicking anywhere outside the selector so stray
  // interactions don't leave it hanging open over the content below.
  useEffect(() => {
    if (!languageOpen) return;

    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (languageRef.current && !languageRef.current.contains(e.target as Node)) {
        setLanguageOpen(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [languageOpen]);

  // Dynamic title comes from Admin → App Settings (app_settings.logo_url /
  // app_title). Falls back to a branded default when unset.
  const title = appTitle || 'GECHO CAR';
  const subtitle = 'ጌቾ መኪና';

  return (
    // NOTE: no overflow-hidden here — the language dropdown must be allowed to
    // overlay/escape the header card so its options aren't clipped.
    <header className="relative z-40 sticky top-0 rounded-2xl border border-emerald-500/20 bg-slate-950/80 shadow-[0_0_24px_rgba(16,185,129,0.12)] backdrop-blur-md">
      {/* Luxury top lighting / glow accent */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-emerald-400/50 to-transparent"
      />

      <div className="relative flex items-center justify-between gap-3">
        {/* Brand — dynamic logo (Admin-managed) + gold title/subtitle. The
            logo container ALWAYS renders so the title never shifts and the
            brand always has a dedicated visual slot. When app_settings.
            logo_url (row id = 1) is set we render the <img>; when it is empty
            or the file fails to load, a stylized sparkle monogram fills the
            slot instead of leaving a hole / broken-image icon. */}
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-emerald-500/40 bg-slate-800 shadow-[0_0_16px_rgba(16,185,129,0.25)]">
            {logoUrl && !logoFailed ? (
              <img
                src={logoUrl}
                alt={title}
                className="h-full w-full object-contain"
                onError={() => setLogoFailed(true)}
              />
            ) : (
              // Fallback slot: no logo configured yet, or the uploaded file
              // failed to load (removed from storage / bad URL) — show a
              // branded sparkle instead of the browser's broken-image icon.
              <span
                aria-label={title}
                role="img"
                className="flex h-full w-full items-center justify-center text-emerald-400"
              >
                <Sparkles className="h-5 w-5" />
              </span>
            )}
          </div>

          <div className="min-w-0">
            <p className="truncate bg-gradient-to-r from-emerald-300 via-emerald-400 to-[#00FF87] bg-clip-text text-base font-black uppercase tracking-[0.08em] text-transparent">
              {title}
            </p>
            <p className="mt-0.5 truncate text-xs font-semibold tracking-wider text-gold-light/90">
              {subtitle}
            </p>
          </div>
        </div>

        {/* Support (Admin-configured Telegram handle) + Language selector */}
        <div className="flex flex-shrink-0 items-center gap-2">
          {supportUrl ? (
            <a
              href={`https://t.me/${supportUrl}`}
              target="_blank"
              rel="noopener noreferrer"
              title={`Contact support: @${supportUrl}`}
              aria-label="Contact Telegram support"
              className="flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300 transition hover:border-emerald-400/60 hover:bg-emerald-500/20 hover:shadow-[0_0_16px_rgba(16,185,129,0.25)]"
            >
              <Headset className="h-4 w-4" />
              <span className="hidden whitespace-nowrap sm:inline">Support</span>
            </a>
          ) : null}

          {/* Language selector — gold border, dark blurred backdrop, UK flag */}
          <div ref={languageRef} className="relative flex-shrink-0">
          <button
            onClick={() => setLanguageOpen((open) => !open)}
            aria-haspopup="listbox"
            aria-expanded={languageOpen}
            className={cn(
              'flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-slate-950/60 px-3 py-2 text-xs font-semibold text-emerald-100 backdrop-blur-md transition',
              'hover:border-emerald-500/60 hover:shadow-[0_0_16px_rgba(16,185,129,0.3)]'
            )}
          >
            <span className="text-base leading-none" aria-hidden>
              {languageFlags[language]}
            </span>
            <span className="hidden whitespace-nowrap sm:inline">{languageNames[language]}</span>
            <ChevronDown
              className={cn('h-3.5 w-3.5 text-emerald-300 transition-transform', languageOpen && 'rotate-180')}
            />
          </button>

          {languageOpen && (
            <div
              role="listbox"
              className="absolute right-0 top-full z-[9999] mt-2 w-44 rounded-2xl border border-emerald-500/25 bg-slate-950/95 p-1 shadow-2xl backdrop-blur-md"
            >
              {languageOptions.map((item) => {
                const isActive = language === item;
                return (
                  <button
                    key={item}
                    role="option"
                    aria-selected={isActive}
                    onClick={() => {
                      setLanguage(item);
                      setLanguageOpen(false);
                    }}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition',
                      isActive
                        ? 'bg-emerald-500/15 text-emerald-200'
                        : 'text-slate-200 hover:bg-emerald-500/10 hover:text-emerald-100'
                    )}
                  >
                    <span className="text-base leading-none" aria-hidden>
                      {languageFlags[item]}
                    </span>
                    <span className="flex-1">{languageNames[item]}</span>
                    {isActive && <span className="h-2 w-2 rounded-full bg-emerald-400" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        </div>
      </div>
    </header>
  );
}