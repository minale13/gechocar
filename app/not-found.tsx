export const dynamic = 'force-dynamic';
export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0B141B] text-white">
      <div className="gold-card p-8 text-center">
        <h1 className="text-4xl font-bold">404</h1>
        <p className="mt-2 text-slate-300">This page could not be found.</p>
      </div>
    </main>
  );
}
