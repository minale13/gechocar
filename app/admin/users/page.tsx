'use client';

export const dynamic = 'force-dynamic';

export default function AdminUsersPage() {
  return (
    <div className="p-6 bg-slate-950 text-slate-100 min-h-screen">
      <h1 className="text-2xl font-bold text-amber-400 mb-4">
        GECHO CAR - User Management
      </h1>
      <p className="text-slate-400">Loading users...</p>
    </div>
  );
}
