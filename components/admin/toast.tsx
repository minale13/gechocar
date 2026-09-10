'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';
type ToastItem = { id: number; type: ToastType; text: string };

type ToastContextValue = {
  /** Push a toast — auto-dismisses after ~4.5s. */
  push: (type: ToastType, text: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_STYLES: Record<ToastType, { border: string; icon: JSX.Element; accent: string }> = {
  success: {
    border: 'border-emerald-500/40',
    accent: 'text-emerald-300',
    icon: <CheckCircle2 className="h-5 w-5 text-emerald-400" />,
  },
  error: {
    border: 'border-red-500/40',
    accent: 'text-red-300',
    icon: <XCircle className="h-5 w-5 text-red-400" />,
  },
  info: {
    border: 'border-amber-500/40',
    accent: 'text-amber-200',
    icon: <Info className="h-5 w-5 text-amber-400" />,
  },
};

/**
 * Lightweight animated toast system for the admin dashboard.
 * All admin actions (approve, reject, save settings, ...) report through
 * this instead of inline status pills.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (type: ToastType, text: string) => {
      counter.current += 1;
      const id = counter.current;
      setToasts((prev) => [...prev.slice(-4), { id, type, text }]);
      window.setTimeout(() => dismiss(id), 4500);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      {/* Toast viewport */}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[300] flex w-[calc(100%-2.5rem)] max-w-sm flex-col gap-2">
        {toasts.map((toast) => {
          const style = TOAST_STYLES[toast.type];
          return (
            <div
              key={toast.id}
              className={`toast-in pointer-events-auto flex items-start gap-3 rounded-2xl border bg-slate-900/95 p-4 shadow-2xl shadow-black/50 backdrop-blur ${style.border}`}
              role="status"
            >
              <span className="mt-0.5 flex-shrink-0">{style.icon}</span>
              <p className={`min-w-0 flex-1 break-words text-sm font-medium ${style.accent}`}>
                {toast.text}
              </p>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="flex-shrink-0 rounded-lg p-1 text-slate-500 transition hover:bg-white/5 hover:text-white"
                aria-label="Dismiss notification"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
      {/* Shared animations + luxury utilities */}
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(10px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .toast-in { animation: toast-in 0.25s ease-out both; }
        @keyframes lightbox-in {
          from { opacity: 0; transform: scale(0.95); }
          to   { opacity: 1; transform: scale(1); }
        }
        .lightbox-in { animation: lightbox-in 0.2s ease-out both; }
        .glass-card {
          background: linear-gradient(160deg, rgba(17, 24, 39, 0.72), rgba(11, 15, 25, 0.8));
          backdrop-filter: blur(16px) saturate(140%);
          -webkit-backdrop-filter: blur(16px) saturate(140%);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.05),
            0 0 0 1px rgba(34, 211, 238, 0.04),
            0 14px 44px rgba(0, 0, 0, 0.45);
        }
      `}</style>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
