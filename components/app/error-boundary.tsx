'use client';

import React from 'react';

/**
 * App-wide client error boundary.
 *
 * Next.js already renders a fatal "Application error: a client-side exception
 * has occurred" screen when an uncaught exception happens during hydration or
 * render. This boundary catches those exceptions BEFORE they reach that fatal
 * screen and renders a friendly, branded fallback instead — the visitor can
 * still reload the page, and the rest of the layout (providers, Telegram SDK)
 * stays mounted. In the Telegram Mini App this also prevents a white screen
 * when window.Telegram is unavailable in non-Telegram browsers.
 */
type ErrorBoundaryState = {
  hasError: boolean;
};

export class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, errorInfo: React.ErrorInfo) {
    // Never fatal — log for diagnostics and keep the fallback UI mounted.
    console.error('AppErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#0B141B] p-6 text-white">
          <div className="gold-card max-w-md p-8 text-center">
            <h1 className="text-2xl font-bold">Something went wrong</h1>
            <p className="mt-2 text-sm text-slate-300">
              The app hit an unexpected error while loading. Please try again.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="gold-button mt-4 px-6 py-2"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
