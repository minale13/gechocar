import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    ok: true,
    source: 'supabase-api',
    message: 'Supabase integration layer initialized.',
  });
}
