import { NextResponse } from 'next/server';
import { getCaseByCnr, validateCnr } from '@/lib/ecourts';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ cnr: string }> }
) {
  const { cnr } = await params;
  const validation = validateCnr(cnr);
  if (!validation.ok) {
    return NextResponse.json(
      { error: 'invalid_cnr', detail: validation.detail, reason: validation.reason },
      { status: 400 }
    );
  }

  const record = getCaseByCnr(validation.cnr);
  if (!record) {
    return NextResponse.json(
      { found: false, cnr: validation.cnr, message: 'Case not found in database or fixtures' },
      { status: 404 }
    );
  }

  return NextResponse.json({
    found: true,
    data: record,
  });
}
