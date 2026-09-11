// Route-segment config lives in a SERVER layout because the page itself is a
// "use client" component — Next.js ignores route-config exports on client
// components, which caused /profile to be statically prerendered (and crash
// the build when Supabase env vars were absent). force-dynamic here applies
// to the whole /profile segment.
export const dynamic = 'force-dynamic';

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
