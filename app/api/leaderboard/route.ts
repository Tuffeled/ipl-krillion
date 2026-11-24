import { NextResponse } from 'next/server';

// Browsers post here and Vercel forwards to Supabase, because some Indian ISPs block *.supabase.co for players.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function POST(request: Request) {
  if (!URL || !KEY) return NextResponse.json({ error: 'Leaderboard not configured' }, { status: 404 });
  const { p_date, p_player, p_points } = await request.json().catch(() => ({}));
  const valid = typeof p_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p_date)
    && typeof p_player === 'string' && /^[0-9a-f-]{36}$/i.test(p_player)
    && Array.isArray(p_points) && p_points.length === 7 && p_points.every(x => Number.isInteger(x) && x >= 0 && x <= 1000);
  if (!valid) return NextResponse.json({ error: 'Invalid score' }, { status: 400 });
  // New sb_publishable_ keys go in apikey only; legacy anon keys (JWTs, "eyJ…") also go in Authorization.
  const headers: Record<string, string> = { apikey: KEY, 'Content-Type': 'application/json', ...(KEY.startsWith('eyJ') ? { Authorization: 'Bearer ' + KEY } : {}) };
  try {
    const response = await fetch(URL + '/rest/v1/rpc/ipl_climb_submit', { method: 'POST', headers, body: JSON.stringify({ p_date, p_player, p_points }), cache: 'no-store' });
    return new NextResponse(await response.text(), { status: response.status, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Leaderboard unreachable' }, { status: 502 });
  }
}
