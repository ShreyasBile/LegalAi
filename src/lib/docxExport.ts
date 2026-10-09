export interface CourtProfile {
  id: string;
  name: string;
  paper: 'A4' | 'Legal' | 'Letter';
  margins: { top: number; right: number; bottom: number; left: number };
  pageNumbers: boolean;
  requiredFont?: string;
  minFontSize?: number;
  requiredSpacing?: number;
}

export const BUILTIN_COURT_PROFILES: CourtProfile[] = [
  {
    id: 'sc-default',
    name: 'Supreme Court of India',
    paper: 'Legal',
    margins: { top: 3.5, right: 2.5, bottom: 3.5, left: 4.0 },
    pageNumbers: true,
    requiredFont: 'Times New Roman',
    minFontSize: 12,
    requiredSpacing: 1.5,
  },
  {
    id: 'bombay-hc',
    name: 'Bombay High Court',
    paper: 'Legal',
    margins: { top: 3.0, right: 2.5, bottom: 3.0, left: 4.5 },
    pageNumbers: true,
    requiredFont: 'Times New Roman',
    minFontSize: 12,
    requiredSpacing: 1.5,
  },
  {
    id: 'delhi-hc',
    name: 'Delhi High Court',
    paper: 'A4',
    margins: { top: 2.54, right: 2.54, bottom: 2.54, left: 3.5 },
    pageNumbers: true,
    requiredFont: 'Times New Roman',
    minFontSize: 12,
    requiredSpacing: 1.5,
  },
];

export interface CourtRuleLintWarning {
  field: string;
  message: string;
  severity: 'warning' | 'error';
}

export function lintAgainstCourtRules(
  draftStyle: { font?: string; size?: number; spacing?: number },
  profile: CourtProfile
): CourtRuleLintWarning[] {
  const warnings: CourtRuleLintWarning[] = [];

  if (profile.requiredFont && draftStyle.font && draftStyle.font !== profile.requiredFont) {
    warnings.push({
      field: 'font',
      message: `Court profile requires ${profile.requiredFont}, but draft uses ${draftStyle.font}.`,
      severity: 'warning',
    });
  }

  if (profile.minFontSize && draftStyle.size && draftStyle.size < profile.minFontSize) {
    warnings.push({
      field: 'fontSize',
      message: `Font size (${draftStyle.size}pt) is smaller than required minimum (${profile.minFontSize}pt).`,
      severity: 'error',
    });
  }

  if (profile.requiredSpacing && draftStyle.spacing && draftStyle.spacing < profile.requiredSpacing) {
    warnings.push({
      field: 'spacing',
      message: `Line spacing (${draftStyle.spacing}) is tighter than recommended (${profile.requiredSpacing}).`,
      severity: 'warning',
    });
  }

  return warnings;
}

const enc = new TextEncoder();
const PAPER_TWIPS = {
  A4: { w: 11906, h: 16838 },
  Legal: { w: 12240, h: 20160 },
  Letter: { w: 12240, h: 15840 },
};
const twips = (cm: number) => Math.round(cm * 567);

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

interface ZipPart {
  name: Uint8Array;
  data: Uint8Array;
  crc?: number;
  offset?: number;
}

function zipStore(files: { name: string; data: string | Uint8Array }[]): Uint8Array {
  const parts: ZipPart[] = files.map((f) => ({
    name: enc.encode(f.name),
    data: typeof f.data === 'string' ? enc.encode(f.data) : f.data,
  }));

  let size = 22;
  for (const p of parts) {
    p.crc = crc32(p.data);
    size += 30 + p.name.length + p.data.length + 46 + p.name.length;
  }

  const out = new Uint8Array(size);
  const v = new DataView(out.buffer);
  let o = 0;

  const u16 = (n: number) => {
    v.setUint16(o, n, true);
    o += 2;
  };
  const u32 = (n: number) => {
    v.setUint32(o, n, true);
    o += 4;
  };

  for (const p of parts) {
    p.offset = o;
    u32(0x04034b50);
    u16(20);
    u16(0x0800);
    u16(0);
    u16(0);
    u16(0x21);
    u32(p.crc!);
    u32(p.data.length);
    u32(p.data.length);
    u16(p.name.length);
    u16(0);
    out.set(p.name, o);
    o += p.name.length;
    out.set(p.data, o);
    o += p.data.length;
  }

  const cdStart = o;
  for (const p of parts) {
    u32(0x02014b50);
    u16(20);
    u16(20);
    u16(0x0800);
    u16(0);
    u16(0);
    u16(0x21);
    u32(p.crc!);
    u32(p.data.length);
    u32(p.data.length);
    u16(p.name.length);
    u16(0);
    u16(0);
    u16(0);
    u16(0);
    u32(0);
    u32(p.offset!);
    out.set(p.name, o);
    o += p.name.length;
  }

  const cdSize = o - cdStart;
  u32(0x06054b50);
  u16(0);
  u16(0);
  u16(parts.length);
  u16(parts.length);
  u32(cdSize);
  u32(cdStart);
  u16(0);

  return out;
}

const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const x = (s: string) =>
  String(s ?? '')
    .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!))
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

export function generateDocxBytes(
  title: string,
  sections: Array<{ heading?: string; body: string }>,
  profile: CourtProfile = BUILTIN_COURT_PROFILES[0],
  font = 'Times New Roman',
  fontSize = 12,
  lineSpacing = 1.5
): Uint8Array {
  const paper = PAPER_TWIPS[profile.paper] || PAPER_TWIPS.A4;
  const m = profile.margins;
  const sz = Math.round(fontSize * 2);

  const sect = `<w:sectPr>${profile.pageNumbers ? '<w:footerReference w:type="default" r:id="rId2"/>' : ''}<w:pgSz w:w="${paper.w}" w:h="${paper.h}"/><w:pgMar w:top="${twips(m.top)}" w:right="${twips(m.right)}" w:bottom="${twips(m.bottom)}" w:left="${twips(m.left)}" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>`;

  const bodyXml = sections
    .map((s) => {
      const headingXml = s.heading
        ? `<w:p><w:pPr><w:keepNext/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${x(s.heading)}</w:t></w:r></w:p>`
        : '';
      const paragraphs = s.body
        .split('\n\n')
        .map((p) => p.trim())
        .filter(Boolean)
        .map(
          (para) =>
            `<w:p><w:pPr><w:jc w:val="both"/><w:spacing w:line="${Math.round(lineSpacing * 240)}" w:lineRule="auto"/></w:pPr><w:r><w:t xml:space="preserve">${x(para)}</w:t></w:r></w:p>`
        )
        .join('');
      return headingXml + paragraphs;
    })
    .join('');

  const documentXml = `${HEAD}<w:document ${NS}><w:body>${bodyXml}${sect}</w:body></w:document>`;
  const stylesXml = `${HEAD}<w:styles ${NS}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${x(font)}" w:hAnsi="${x(font)}"/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr></w:rPrDefault></w:docDefaults></w:styles>`;
  const footerXml = `${HEAD}<w:ftr ${NS}><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>`;

  const contentTypes = `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>${profile.pageNumbers ? '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' : ''}</Types>`;
  const rootRels = `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
  const docRels = `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${profile.pageNumbers ? '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>' : ''}</Relationships>`;

  return zipStore([
    { name: '[Content_Types].xml', data: contentTypes },
    { name: '_rels/.rels', data: rootRels },
    { name: 'word/document.xml', data: documentXml },
    { name: 'word/_rels/document.xml.rels', data: docRels },
    { name: 'word/styles.xml', data: stylesXml },
    ...(profile.pageNumbers ? [{ name: 'word/footer1.xml', data: footerXml }] : []),
  ]);
}
