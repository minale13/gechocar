import { supabase } from '@/lib/supabase/client';

export async function getSettings() {
  // app_settings is a SINGLE-ROW table (always row id = 1) with dedicated
  // columns — never use the legacy key/value shape here.
  const { data, error } = await supabase
    .from('app_settings')
    .select('id, app_title, logo_url, banner_url, ticket_price, total_tickets')
    .eq('id', 1)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

export async function getLotteries() {
  const { data, error } = await supabase
    .from('lotteries')
    .select(`
      *,
      tickets!lottery_id (
        status
      )
    `)
    .eq('is_active', true)
    .order('rank', { ascending: true, nullsFirst: false });

  if (error) throw error;


  return (data ?? []).map((lottery) => {
    const soldTickets = lottery.tickets?.filter((t: any) => t.status === 'sold').length || 0;
    return {
      ...lottery,
      sold_count: soldTickets,
    };
  });
}


export async function getTicketsByUser(userId: number | string) {
  // user_id is TEXT in the live schema — always pass a normalized string.
  const { data, error } = await supabase
    .from('tickets')
    .select('*')
    .eq('user_id', String(userId));
  if (error) throw error;
  return data ?? [];
}

export async function createPayment(payload: {
  user_id: number | string;
  ticket_ids: string[];
  amount: number;
  receipt_url?: string | null;
}) {
  const { data, error } = await supabase.from('payments').insert({
    user_id: String(payload.user_id),
    ticket_ids: payload.ticket_ids,
    amount: payload.amount,
    receipt_url: payload.receipt_url ?? null,
    status: 'pending',
  }).select();

  if (error) throw error;
  return data?.[0] ?? null;
}

export async function uploadReceipt(file: File, path: string) {
  const { data, error } = await supabase.storage.from('receipts').upload(path, file, {
    cacheControl: '3600',
    upsert: true,
  });

  if (error) throw error;
  return data;
}
