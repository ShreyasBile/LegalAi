import { NextResponse } from 'next/server';
import { generateDocxBytes, BUILTIN_COURT_PROFILES, CourtProfile } from '@/lib/docxExport';

export async function POST(req: Request) {
  try {
    const { title, sections, profileId, font, fontSize, lineSpacing } = await req.json();

    const selectedProfile: CourtProfile =
      BUILTIN_COURT_PROFILES.find((p) => p.id === profileId) || BUILTIN_COURT_PROFILES[0];

    const bytes = generateDocxBytes(
      title || 'Legal_Draft',
      sections || [{ body: 'Empty document' }],
      selectedProfile,
      font || 'Times New Roman',
      fontSize || 12,
      lineSpacing || 1.5
    );

    const safeFilename = `${(title || 'Legal_Draft').replace(/[^a-zA-Z0-9_-]/g, '_')}.docx`;

    return new Response(Buffer.from(bytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${safeFilename}"`,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Export failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
