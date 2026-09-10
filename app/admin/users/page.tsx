import { createSupabaseServerClient } from '@/lib/supabase/server';
import { UsersDirectoryTable } from './users-table';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GECHO CAR — User Management Admin Page.
 *
 * Server component that fetches every registered user from public.profiles
 * and renders a searchable, responsive directory table on the client.
 */
export default async function AdminUsersPage() {
  const supabase = createSupabaseServerClient();

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, telegram_id, username, first_name, last_name, phone_number, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch users for admin page:', error);
  }

  const users = (profiles ?? []).map((p) => ({
    id: p.id,
    telegramId: p.telegram_id != null ? String(p.telegram_id) : null,
    username: p.username ?? null,
    firstName: p.first_name ?? null,
    lastName: p.last_name ?? null,
    phoneNumber: p.phone_number ?? null,
    createdAt: p.created_at ?? null,
  }));

  return <UsersDirectoryTable users={users} />;
}
