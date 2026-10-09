import { NextResponse } from 'next/server';
import { searchECourtsCases, COURT_HIERARCHY } from '@/lib/ecourts';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('mode') as
    | 'party'
    | 'filing'
    | 'fir'
    | 'advocate'
    | 'act'
    | 'caseType'
    | null;

  if (searchParams.get('hierarchy') === 'true') {
    return NextResponse.json({ hierarchy: COURT_HIERARCHY });
  }

  const results = searchECourtsCases({
    mode: mode || 'party',
    name: searchParams.get('name') || undefined,
    filingNumber: searchParams.get('filingNumber') || undefined,
    firNumber: searchParams.get('firNumber') || undefined,
    policeStation: searchParams.get('policeStation') || undefined,
    advocate: searchParams.get('advocate') || undefined,
    act: searchParams.get('act') || undefined,
    caseType: searchParams.get('caseType') || undefined,
    state: searchParams.get('state') || undefined,
    district: searchParams.get('district') || undefined,
    courtComplex: searchParams.get('courtComplex') || undefined,
    status: searchParams.get('status') || undefined,
  });

  return NextResponse.json({
    count: results.length,
    results,
  });
}
