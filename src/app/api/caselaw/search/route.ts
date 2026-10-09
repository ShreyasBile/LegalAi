import { NextResponse } from 'next/server';
import { searchCaseLaw } from '@/lib/caselaw';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q') || undefined;
  const court = searchParams.get('court') || undefined;
  const year = searchParams.get('year') ? Number(searchParams.get('year')) : undefined;
  const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : 20;
  const offset = searchParams.get('offset') ? Number(searchParams.get('offset')) : 0;

  const result = await searchCaseLaw({ query: q, court, year, limit, offset });
  return NextResponse.json(result);
}
