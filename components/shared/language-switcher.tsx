'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { useLanguage, type Language } from '@/components/app/language-provider';
import { languageNames } from '@/lib/translations';
import { cn } from '@/lib/utils';

/**
 * Supported languages with their flags.
 * Amharic, English, Tigrinya and Afaan Oromoo — matching the translations
 * available in lib/translations.ts.
 */
const languageOptions: { code: Language; flag: string }[] = [
  { code: 'en', flag: '🇬🇧' },
  { code: 'am', flag: '🇪🇹' },
  { code: 'ti', flag: '🇪🇹' },
  { code: 'om', flag: '🇪🇹' },
];

/**
 * Fully functional language dropdown switcher.
 *
 * Uses the shared LanguageProvider, so switching here updates the whole app:
 * the provider re-renders every consumer, so keys rendered with t() (e.g.
 * t('activeDraw') → "Active draw" / "ንቁ ውድድር" / …) reflect the change
 * immediately, and the selection persists to localStorage.
 */
export function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close the dropdown when clicking anywhere outside so it never lingers open
  // over the lottery card / content below.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [open]);

  const current = languageOptions.find((o) => o.code === language) ?? languageOptions[0];

  const select = (code: Language) => {
    setLanguage(code);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative inline-block text-left">
      {/* Trigger — displays the current language flag + name + chevron */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Select language"
        className={cn(
          'flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-slate-950/60 px-3 py-2 text-xs font-semibold text-emerald-100 backdrop-blur-md transition',
          'hover:border-emerald-500/60 hover:shadow-[0_0_16px_rgba(16,185,129,0.3)] active:scale-95'
        )}
      >
        <span className="text-base leading-none" aria-hidden>
          {current.flag}
        </span>
        <span className="hidden whitespace-nowrap sm:inline">{languageNames[current.code]}</span>
        <ChevronDown
          className={cn('h-3.5 w-3.5 text-emerald-300 transition-transform', open && 'rotate-180')}
        />
      </button>

      {/* Dropdown menu */}
      {open && (
        <div
          role="listbox"
          aria-label="Select language"
          className="absolute right-0 top-full z-[9999] mt-2 w-44 rounded-2xl border border-emerald-500/25 bg-slate-950/95 p-1 shadow-2xl backdrop-blur-md"
        >
          {languageOptions.map(({ code, flag }) => {
            const isActive = code === language;
            return (
              <button
                key={code}
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={() => select(code)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition',
                  isActive
                    ? 'bg-emerald-500/15 text-emerald-200'
                    : 'text-slate-200 hover:bg-emerald-500/10 hover:text-emerald-100'
                )}
              >
                <span className="text-base leading-none" aria-hidden>
                  {flag}
                </span>
                <span className="flex-1">{languageNames[code]}</span>
                {isActive && <Check className="h-4 w-4 text-emerald-400" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}