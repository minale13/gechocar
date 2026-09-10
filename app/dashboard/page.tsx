export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-[#0B141B] p-6 text-white">
      <div className="mx-auto max-w-4xl space-y-4">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="gold-card p-5">
            <p className="text-sm text-yellow-400">Total Sales</p>
            <h2 className="mt-2 text-3xl font-bold">42,000 ETB</h2>
          </div>
          <div className="gold-card p-5">
            <p className="text-sm text-yellow-400">Tickets Sold</p>
            <h2 className="mt-2 text-3xl font-bold">14</h2>
          </div>
          <div className="gold-card p-5">
            <p className="text-sm text-yellow-400">Pending</p>
            <h2 className="mt-2 text-3xl font-bold">3</h2>
          </div>
        </div>
      </div>
    </main>
  );
}
