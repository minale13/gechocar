'use client';

import { useMemo, useState } from 'react';
import { AtSign, CalendarDays, Phone, Search, UserCircle } from 'lucide-react';

export type DirectoryUser = {
  id: string;
  telegramId: string | null;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  phoneNumber: string | null;
  createdAt: string | null;
};

const formatDate = (iso: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
};

const fullName = (u: DirectoryUser): string => {
  const parts = [u.firstName, u.lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : '—';
};

export function UsersDirectoryTable({ users }: { users: DirectoryUser[] }) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const name = fullName(u).toLowerCase();
      const username = (u.username ?? '').toLowerCase();
      const tid = (u.telegramId ?? '').toLowerCase();
      const phone = (u.phoneNumber ?? '').toLowerCase();
      return (
        name.includes(q) ||
        username.includes(q) ||
        tid.includes(q) ||
        phone.includes(q)
      );
    });
  }, [users, query]);

  return (
    <main className="lux-shell min-h-screen text-white">
      <div className="relative mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
        <header className="lux-card flex flex-wrap items-center justify-between gap-4 rounded-3xl p-5">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#B8860B] via-[#D4AF37] to-[#F5D061] text-slate-950 shadow-[0_0_28px_rgba(212,175,55,0.45)]">
              <UserCircle className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#D4AF37]">
                GECHO CAR
              </p>
              <h1 className="text-2xl font-black text-white">User Management</h1>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-400">
            <span className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-1.5 font-semibold text-slate-200">
              {users.length} users
            </span>
          </div>
        </header>

        <div className="lux-card rounded-2xl p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by username, Telegram ID, name, or phone…"
              className="lux-input pl-10"
              aria-label="Search users"
            />
          </div>
          {query.trim() && (
            <p className="mt-2 text-xs text-slate-500">
              Showing {filtered.length} of {users.length} registered users.
            </p>
          )}
        </div>

        <div className="lux-card overflow-hidden rounded-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800/60 text-xs uppercase tracking-wider text-slate-400">
                  <th className="px-5 py-4 font-semibold">Full Name</th>
                  <th className="px-5 py-4 font-semibold">Username</th>
                  <th className="px-5 py-4 font-semibold">Telegram ID</th>
                  <th className="px-5 py-4 font-semibold">Phone Number</th>
                  <th className="px-5 py-4 font-semibold">Registered</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-16 text-center text-slate-500">
                      {users.length === 0
                        ? 'No registered users yet.'
                        : 'No users match your search.'}
                    </td>
                  </tr>
                ) : (
                  filtered.map((user) => (
                    <tr
                      key={user.id}
                      className="border-b border-slate-800/40 transition hover:bg-white/[0.03]"
                    >
                      <td className="px-5 py-3.5">
                        <span className="font-semibold text-slate-100">
                          {fullName(user)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center gap-1.5 text-slate-300">
                          <AtSign className="h-3.5 w-3.5 text-slate-600" />
                          {user.username ? `@${user.username}` : '—'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="rounded-md border border-slate-700/60 bg-slate-900/60 px-2 py-0.5 font-mono text-xs text-slate-300">
                          {user.telegramId ?? '—'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center gap-1.5 text-slate-300">
                          <Phone className="h-3.5 w-3.5 text-slate-600" />
                          {user.phoneNumber ?? '—'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center gap-1.5 text-slate-400">
                          <CalendarDays className="h-3.5 w-3.5 text-slate-600" />
                          {formatDate(user.createdAt)}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}

