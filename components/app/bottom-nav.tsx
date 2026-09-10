'use client';

import { Home, ShieldCheck, Ticket, Trophy, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';

// Each nav tab gets a distinct vibrant active color so all five buttons are
// visually separated and instantly recognizable. Inactive tabs stay muted.
const navItems = [
  { id: 'home', icon: Home, active: 'text-blue-400', activeBg: 'bg-blue-500/15 border-blue-500/50', top: 'bg-blue-500' },
  { id: 'pending', icon: ShieldCheck, active: 'text-amber-400', activeBg: 'bg-amber-500/15 border-amber-500/50', top: 'bg-amber-500' },
  { id: 'tickets', icon: Ticket, active: 'text-cyan-400', activeBg: 'bg-cyan-500/15 border-cyan-500/50', top: 'bg-cyan-400' },
  { id: 'winners', icon: Trophy, active: 'text-yellow-400', activeBg: 'bg-yellow-500/15 border-yellow-500/50', top: 'bg-yellow-400' },
  { id: 'profile', icon: UserRound, active: 'text-fuchsia-400', activeBg: 'bg-fuchsia-500/15 border-fuchsia-500/50', top: 'bg-fuchsia-500' },
] as const;

export function BottomNav({
  activeTab,
  onChange,
  labels,
}: {
  activeTab: string;
  onChange: (value: string) => void;
  labels: Record<string, string>;
}) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-700/50 bg-slate-900/95 backdrop-blur-md shadow-[0_-4px_24px_rgba(0,0,0,0.45)]">
      <div className="mx-auto grid max-w-lg grid-cols-5 items-stretch gap-1 px-2 pt-1.5">
        {navItems.map(({ id, icon: Icon, active, activeBg, top }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              aria-current={isActive ? 'page' : undefined}
              aria-label={labels[id]}
              className={cn(
                'relative flex flex-col items-center justify-center gap-1 rounded-t-xl border-b-2 px-2 pb-2 pt-2 text-[10px] font-medium transition-all active:scale-95',
                'min-h-[56px]',
                isActive
                  ? cn('border-transparent', activeBg, active)
                  : 'border-transparent text-slate-400 hover:bg-card/60 hover:text-slate-200'
              )}
            >
              {/* Active top indicator dot */}
              <span
                className={cn(
                  'absolute left-1/2 top-0 h-1 w-8 -translate-x-1/2 rounded-b-full transition-opacity',
                  top,
                  isActive ? 'opacity-100' : 'opacity-0'
                )}
              />
              <Icon
                className={cn(
                  'h-5 w-5 transition-colors',
                  isActive ? active : 'text-slate-400'
                )}
                strokeWidth={isActive ? 2.5 : 2}
              />
              <span className={cn('whitespace-nowrap', isActive && 'font-bold')}>
                {labels[id]}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}