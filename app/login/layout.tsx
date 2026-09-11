// Route-segment config lives in a SERVER layout because the page itself is a
// "use client" component — Next.js ignores route-config exports on client
// components, which caused /login to be statically prerendered (and crash the
// build when Supabase env vars were absent). force-dynamic here applies to the
// whole /login segment.
export const dynamic = 'force-dynamic';

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
