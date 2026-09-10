'use client';

import { useState } from 'react';
import { ImageOff } from 'lucide-react';

type SafeImageProps = {
  /** Image URL — typically a Supabase Storage public URL (or base64 data URL). */
  src: string;
  alt: string;
  className?: string;
  /** Classes for the fallback wrapper when the image is missing or broken. */
  fallbackClassName?: string;
  /** Short label rendered under the fallback icon. */
  fallbackLabel?: string;
};

/**
 * 🖼️ SafeImage — drop-in <img> replacement with a graceful fallback UI.
 *
 * Admin receipt photos come from user uploads (Supabase Storage public URLs or
 * base64 data-URL fallbacks). Any of those can 404 / expire / fail to decode,
 * so instead of rendering the browser's broken-image icon we show a clear
 * "image unavailable" placeholder the moment loading fails.
 */
export function SafeImage({
  src,
  alt,
  className,
  fallbackClassName,
  fallbackLabel = 'Image unavailable',
}: SafeImageProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <span
        role="img"
        aria-label={alt}
        className={
          fallbackClassName ??
          'flex h-full w-full flex-col items-center justify-center gap-1.5 bg-slate-900 text-slate-500'
        }
      >
        <ImageOff className="h-5 w-5" />
        <span className="px-2 text-center text-[10px] leading-tight">{fallbackLabel}</span>
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
