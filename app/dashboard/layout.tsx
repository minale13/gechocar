// Route-segment config lives in a SERVER layout because the page itself is a
// "use client" component — Next.js ignores route-config exports on client
// components, so the page-level `export const dynamic` in dashboard/page.tsx
// never took effect. force-dynamic here applies to the whole /dashboard segment.
export const dynamic = 'force-dynamic';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
