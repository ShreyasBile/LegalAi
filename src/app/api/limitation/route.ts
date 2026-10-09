import { NextResponse } from 'next/server';
import { computeLimitation, RULES } from '@/lib/limitation';

export async function GET() {
  return NextResponse.json({
    rules: RULES.map((r) => ({
      id: r.id,
      group: r.group,
      name: r.name,
      trigger: r.trigger,
      source: r.source,
      copy: r.copy,
      s5: r.s5,
    })),
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const result = computeLimitation(body);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'Invalid calculation request' }, { status: 400 });
  }
}
