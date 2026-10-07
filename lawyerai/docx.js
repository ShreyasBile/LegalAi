/* ============================================================================
   A real Word file (.docx) from a draft — pure, with no libraries.
   A .docx is a ZIP of XML parts, so this has a small ZIP writer (stored, not compressed) and the
   handful of parts Word needs: content types, relationships, styles, the document and, if asked for,
   a footer with page numbers. The layout comes from Drafting.layoutBlocks, the same list the preview
   and the printout are made from, so the numbering and structure always agree.

   Loaded by the browser as a classic script (global `Docx`, after drafting.js) and by Node with require().
   Tested in test/docx.test.js, and opened for real with python-docx and LibreOffice while it was written.
   ============================================================================ */
const Docx = ((D) => {
  const enc = new TextEncoder();
  const MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const PAPER_TWIPS = { A4: { w: 11906, h: 16838 }, Legal: { w: 12240, h: 20160 }, Letter: { w: 12240, h: 15840 } };     // 1 twip = 1/20 point
  const twips = cm => Math.round(cm * 567);

  /* ── ZIP (method 0, "stored") ───────────────────────────────────────────── */
  const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(bytes) { let c = 0xFFFFFFFF; for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

  function zipStore(files) {
    const parts = files.map(f => ({ name: enc.encode(f.name), data: typeof f.data === 'string' ? enc.encode(f.data) : f.data }));
    let size = 22;
    for (const p of parts) { p.crc = crc32(p.data); size += 30 + p.name.length + p.data.length + 46 + p.name.length; }
    const out = new Uint8Array(size), v = new DataView(out.buffer);
    let o = 0;
    const u16 = n => { v.setUint16(o, n, true); o += 2; }, u32 = n => { v.setUint32(o, n, true); o += 4; };
    for (const p of parts) {                                                   // local headers and data
      p.offset = o;
      u32(0x04034b50); u16(20); u16(0x0800); u16(0); u16(0); u16(0x21); u32(p.crc); u32(p.data.length); u32(p.data.length); u16(p.name.length); u16(0);
      out.set(p.name, o); o += p.name.length; out.set(p.data, o); o += p.data.length;
    }
    const cdStart = o;
    for (const p of parts) {                                                   // central directory
      u32(0x02014b50); u16(20); u16(20); u16(0x0800); u16(0); u16(0); u16(0x21); u32(p.crc); u32(p.data.length); u32(p.data.length); u16(p.name.length); u16(0); u16(0); u16(0); u16(0); u32(0); u32(p.offset);
      out.set(p.name, o); o += p.name.length;
    }
    const cdSize = o - cdStart;                                                // measured before the end record moves the cursor
    u32(0x06054b50); u16(0); u16(0); u16(parts.length); u16(parts.length); u32(cdSize); u32(cdStart); u16(0);
    return out;
  }

  /* ── XML ────────────────────────────────────────────────────────────────── */
  const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const x = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');   // control characters are not allowed in XML
  const jc = a => ({ justify: 'both', left: 'left', center: 'center' }[a] || 'left');

  /* **bold** becomes a bold run; everything else is plain text */
  function runs(text) {
    return String(text).split(/(\*\*.+?\*\*)/).filter(Boolean).map(seg => {
      const bold = /^\*\*.+\*\*$/.test(seg);
      return `<w:r>${bold ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${x(bold ? seg.slice(2, -2) : seg)}</w:t></w:r>`;
    }).join('');
  }

  function paragraphs(blocks, st) {
    const em = pt => Math.round(pt * st.size * 20);                              // a fraction of the font size, in twips
    return blocks.map(b => {
      if (b.t === 'blank') return '<w:p/>';
      if (b.t === 'heading') return `<w:p><w:pPr><w:keepNext/><w:spacing w:before="${em(1.2)}" w:after="${em(0.5)}"/><w:jc w:val="${jc(b.align)}"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${x(b.text.replace(/\*\*/g, ''))}</w:t></w:r></w:p>`;
      if (b.t === 'line') return `<w:p><w:pPr><w:spacing w:after="${em(0.3)}"/><w:jc w:val="${jc(b.align)}"/></w:pPr>${runs(b.text)}</w:p>`;
      const hang = b.num ? '<w:ind w:left="567" w:hanging="567"/>' : '';
      return `<w:p><w:pPr><w:spacing w:after="${em(0.6)}"/>${hang}<w:jc w:val="${jc(b.align)}"/></w:pPr>${b.num ? `<w:r><w:t>${x(b.num)}</w:t></w:r><w:r><w:tab/></w:r>` : ''}${runs(b.text)}</w:p>`;
    }).join('');
  }

  const CONTENT_TYPES = footer => `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>${footer ? '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' : ''}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;
  const ROOT_RELS = `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;
  const DOC_RELS = footer => `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${footer ? '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>' : ''}</Relationships>`;
  const STYLES = st => {
    const sz = Math.round(st.size * 2);
    return `${HEAD}<w:styles ${NS}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${x(st.font)}" w:hAnsi="${x(st.font)}" w:eastAsia="${x(st.font)}" w:cs="Mangal"/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/><w:lang w:val="en-IN" w:eastAsia="en-IN" w:bidi="hi-IN"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="${Math.round(st.spacing * 240)}" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>`;
  };
  const FOOTER = `${HEAD}<w:ftr ${NS}><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>`;
  const CORE = (title, created) => `${HEAD}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${x(title)}</dc:title><dc:creator>LegalAI</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${x(created)}</dcterms:created></cp:coreProperties>`;

  /* page: { paper: 'A4'|'Legal'|'Letter', margins: {top,right,bottom,left} in cm, pageNumbers } — a court profile has this shape */
  function build(draft, { page, created } = {}) {
    const prof = D.normalizeProfile(page || D.BUILTIN_PROFILES[0]);
    const { style: st, blocks } = D.layoutBlocks(draft);
    const paper = PAPER_TWIPS[prof.paper], m = prof.margins, footer = prof.pageNumbers;
    const sect = `<w:sectPr>${footer ? '<w:footerReference w:type="default" r:id="rId2"/>' : ''}<w:pgSz w:w="${paper.w}" w:h="${paper.h}"/><w:pgMar w:top="${twips(m.top)}" w:right="${twips(m.right)}" w:bottom="${twips(m.bottom)}" w:left="${twips(m.left)}" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>`;
    const document = `${HEAD}<w:document ${NS}><w:body>${paragraphs(blocks, st)}${sect}</w:body></w:document>`;
    const when = /^\d{4}-\d{2}-\d{2}T/.test(created || '') ? created : new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    return zipStore([
      { name: '[Content_Types].xml', data: CONTENT_TYPES(footer) },
      { name: '_rels/.rels', data: ROOT_RELS },
      { name: 'word/document.xml', data: document },
      { name: 'word/_rels/document.xml.rels', data: DOC_RELS(footer) },
      { name: 'word/styles.xml', data: STYLES(st) },
      ...(footer ? [{ name: 'word/footer1.xml', data: FOOTER }] : []),
      { name: 'docProps/core.xml', data: CORE(draft.title || 'Draft', when) }
    ]);
  }

  return { MIME, PAPER_TWIPS, crc32, zipStore, build };
})(typeof Drafting !== 'undefined' ? Drafting : require('./drafting.js'));

if (typeof module !== 'undefined' && module.exports) module.exports = Docx;
