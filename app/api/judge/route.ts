import { NextResponse } from 'next/server';
import { judge } from '../../../lib/data';

export async function POST(request: Request) {
  const { promptId, text } = await request.json().catch(() => ({}));
  if (typeof promptId !== 'string' || typeof text !== 'string' || !text.trim() || text.length > 80) return NextResponse.json({ correct: false, reason: 'TYPE A PLAYER NAME' });
  return NextResponse.json(judge(promptId, text));
}
