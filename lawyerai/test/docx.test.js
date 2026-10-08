const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const D = require('../drafting.js');
const X = require('../docx.js');

/* a small independent ZIP reader, so the writer is checked against something that did not write it */
function readZip(bytes) {
  const b = Buffer.from(bytes);
  const eocd = b.length - 22;
  assert.equal(b.readUInt32LE(eocd), 0x06054b50, 'end-of-directory record is where it should be');
  const count = b.readUInt16LE(eocd + 10), cdSize = b.readUInt32LE(eocd + 12), cdStart = b.readUInt32LE(eocd + 16);
  assert.equal(cdStart + cdSize, eocd, 'the central directory ends exactly where the end record starts');
  const files = {};
  let o = cdStart;
  for (let i = 0; i < count; i++) {
    assert.equal(b.readUInt32LE(o), 0x02014b50, 'central entry signature');
    const crc = b.readUInt32LE(o + 16), size = b.readUInt32LE(o + 24), nameLen = b.readUInt16LE(o + 28), extraLen = b.readUInt16LE(o + 30), commentLen = b.readUInt16LE(o + 32), local = b.readUInt32LE(o + 42);
    const name = b.toString('utf8', o + 46, o + 46 + nameLen);
    assert.equal(b.readUInt32LE(local), 0x04034b50, 'local header signature');
    const lnLen = b.readUInt16LE(local + 26), leLen = b.readUInt16LE(local + 28);
    const data = b.subarray(local + 30 + lnLen + leLen, local + 30 + lnLen + leLen + size);
    assert.equal(zlib.crc32(data), crc, `crc of ${name}`);
    files[name] = data.toString('utf8');
    o += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

/* every tag opened is closed, in order: enough to catch a broken part without an XML library */
function assertBalanced(xml, name) {
  const stack = [];
  for (const m of xml.replace(/<\?[\s\S]*?\?>/g, '').matchAll(/<(\/?)([A-Za-z][\w:.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g)) {
    const [, close, tag, , self] = m;
    if (self) continue;
    if (close) assert.equal(stack.pop(), tag, `${name}: </${tag}> closes the wrong tag`);
    else stack.push(tag);
  }
  assert.deepEqual(stack, [], `${name}: unclosed tags`);
}

const matter = {
  id: 'm', title: 'Sharma v. State of Maharashtra', court: 'Bombay High Court', caseNo: 'X', area: 'A',
  facts: { objective: 'o', relief: 'Anticipatory bail.', issue: 'Whether custody is needed.' },
  authorities: [{ title: 'A v. B', meta: '2020' }], arguments: [{ point: 'Cooperated.', support: 'Yes.' }], counterArgs: [], documents: [{ name: 'FIR.pdf' }], timeline: [{ date: '07 Feb', title: 'Event', note: '' }]
};
const draftOf = id => D.createDraft(D.BUILTIN_FORMATS.find(f => f.id === id), matter, { extras: { today: '11 September 2026' } });
const A4 = D.BUILTIN_PROFILES[0];

test('the CRC-32 is the standard one', () => {
  assert.equal(X.crc32(new TextEncoder().encode('123456789')), 0xCBF43926);        // the well-known check value
  assert.equal(X.crc32(new Uint8Array(0)), 0);
});

test('the ZIP writer produces a container an independent reader accepts, including non-ASCII names and data', () => {
  const zip = X.zipStore([{ name: 'a.txt', data: 'hello' }, { name: 'dir/b.xml', data: 'आवेदक' }, { name: 'empty', data: '' }]);
  assert.deepEqual(readZip(zip), { 'a.txt': 'hello', 'dir/b.xml': 'आवेदक', empty: '' });
});

test('a .docx has the parts Word needs, in the right order, each well-formed', () => {
  const files = readZip(X.build(draftOf('std-anticipatory-bail'), { page: A4, created: '2026-09-11T10:00:00Z' }));
  assert.deepEqual(Object.keys(files), ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/_rels/document.xml.rels', 'word/styles.xml', 'word/footer1.xml', 'docProps/core.xml']);
  for (const [name, xml] of Object.entries(files)) assertBalanced(xml, name);
  assert.match(files['[Content_Types].xml'], /wordprocessingml\.document\.main\+xml/);
  assert.match(files['_rels/.rels'], /word\/document\.xml/);
  assert.match(files['docProps/core.xml'], /<dcterms:created[^>]*>2026-09-11T10:00:00Z</);
});

test('page size, margins and page numbers follow the court profile', () => {
  const d = draftOf('std-affidavit');
  const a4 = readZip(X.build(d, { page: A4 }))['word/document.xml'];
  assert.match(a4, /<w:pgSz w:w="11906" w:h="16838"\/>/);
  assert.match(a4, /w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/);                 // 2.54 cm
  assert.match(a4, /<w:footerReference/);
  const legal = { ...D.BUILTIN_PROFILES[1], margins: { top: 3, right: 2, bottom: 3, left: 4 }, pageNumbers: false };
  const files = readZip(X.build(d, { page: legal }));
  assert.match(files['word/document.xml'], /<w:pgSz w:w="12240" w:h="20160"\/>/);
  assert.match(files['word/document.xml'], /w:top="1701" w:right="1134" w:bottom="1701" w:left="2268"/);
  assert.ok(!files['word/footer1.xml'] && !/footerReference/.test(files['word/document.xml']) && !/footer1/.test(files['[Content_Types].xml']), 'no footer part when page numbers are off');
});

test('typography comes from the draft: font, size, line spacing', () => {
  const d = draftOf('std-affidavit');
  d.style = { ...d.style, font: 'Arial', size: 14, spacing: 2 };
  const styles = readZip(X.build(d))['word/styles.xml'];
  assert.match(styles, /w:ascii="Arial"/);
  assert.match(styles, /<w:sz w:val="28"\/>/);                                        // half-points
  assert.match(styles, /w:line="480" w:lineRule="auto"/);                             // double
});

test('the Word file numbers paragraphs exactly as the preview does', () => {
  const d = draftOf('std-anticipatory-bail');
  const { blocks } = D.layoutBlocks(d);
  const wanted = blocks.filter(b => b.t === 'para' && b.num).map(b => b.num);
  const xml = readZip(X.build(d))['word/document.xml'];
  const got = [...xml.matchAll(/<w:r><w:t>(\d+\.)<\/w:t><\/w:r><w:r><w:tab\/><\/w:r>/g)].map(m => m[1]);
  assert.deepEqual(got, wanted);
  assert.ok(wanted.length >= 8);
  const html = D.renderDraftHtml(d);
  assert.deepEqual([...html.matchAll(/>(\d+\.)&emsp;/g)].map(m => m[1]), wanted, 'and the preview agrees');
});

test('bold markers become bold runs, text is escaped, control characters are dropped', () => {
  const d = { title: 't', style: {}, sections: [{ heading: 'H & <b>', layout: 'para', body: 'plain **bold & <x>** tail\u0001\u000b' }] };
  const xml = readZip(X.build(d))['word/document.xml'];
  assert.match(xml, /<w:r><w:rPr><w:b\/><\/w:rPr><w:t xml:space="preserve">bold &amp; &lt;x&gt;<\/w:t><\/w:r>/);
  assert.match(xml, />H &amp; &lt;B&gt;</);
  assert.ok(!/[\u0000-\u0008\u000B\u000C]/.test(xml));
  assertBalanced(xml, 'document.xml');
  assert.ok(!xml.includes('**'), 'no stray markers');
});

test('headings, centred blocks, sign-off lines and blank lines map to the right paragraph shapes', () => {
  const d = { title: 't', style: { align: 'justify', headingAlign: 'center' }, sections: [
    { heading: 'Facts', layout: 'numbered', body: 'One.' },
    { heading: '', layout: 'center', body: 'Centred' },
    { heading: '', layout: 'signoff', body: 'Place: __\n\nAdvocate' }] };
  const xml = readZip(X.build(d))['word/document.xml'];
  assert.match(xml, /<w:keepNext\/>[\s\S]*?<w:jc w:val="center"\/>[\s\S]*?FACTS/);          // heading
  assert.match(xml, /<w:ind w:left="567" w:hanging="567"\/><w:jc w:val="both"\/><\/w:pPr><w:r><w:t>1\.<\/w:t>/);   // hanging number, justified
  assert.match(xml, /<w:jc w:val="center"\/><\/w:pPr><w:r><w:t xml:space="preserve">Centred/);
  assert.ok(xml.includes('<w:p/>'), 'a blank line is kept inside a sign-off block');
  assert.match(xml, /<w:jc w:val="left"\/><\/w:pPr><w:r><w:t xml:space="preserve">Advocate/);
});

test('every built-in format makes a valid document', () => {
  for (const f of D.BUILTIN_FORMATS) {
    const files = readZip(X.build(D.createDraft(f, matter, { extras: { today: 'x' } }), { page: A4 }));
    for (const [name, xml] of Object.entries(files)) assertBalanced(xml, `${f.docType}/${name}`);
  }
});

test('an empty draft is still a valid document', () => {
  const files = readZip(X.build({ title: '', style: {}, sections: [] }));
  assertBalanced(files['word/document.xml'], 'document.xml');
  assert.match(files['docProps/core.xml'], /<dc:title>Draft<\/dc:title>/);
});

test('a bad or missing profile falls back to plain A4 rather than failing', () => {
  const xml = readZip(X.build(draftOf('std-affidavit'), { page: { paper: 'Foolscap', margins: { top: 99, right: -1, bottom: 'x' } } }))['word/document.xml'];
  assert.match(xml, /<w:pgSz w:w="11906" w:h="16838"\/>/);
  assert.match(xml, /w:top="3402"/);                                                     // capped at 6 cm
  assert.match(xml, /w:right="284"/);                                                    // floored at 0.5 cm
  assert.match(xml, /w:bottom="1440"/);                                                  // junk falls back to 2.54 cm
});

/* ── court rule profiles ────────────────────────────────────────────────── */
test('built-in profiles are plain layouts: they carry no court’s rules', () => {
  for (const p of D.BUILTIN_PROFILES) {
    assert.equal(p.builtin, true);
    assert.deepEqual(D.profileChecks(draftOf('std-affidavit'), p), [], 'asks nothing of a draft');
    assert.match(p.notes, /not any court’s rule/);
  }
});

test('profile values are clamped and cleaned when read back', () => {
  const p = D.normalizeProfile({ name: ' Bombay HC ', paper: 'Foolscap', margins: { top: 99, left: 0 }, minSize: 400, minSpacing: 3, required: [' Synopsis ', '', 5, 'x'.repeat(300)], notes: 'n'.repeat(900), builtin: true });
  assert.equal(p.name, 'Bombay HC');
  assert.equal(p.builtin, false, 'a stored profile cannot claim to be built-in');
  assert.equal(p.paper, 'A4');
  assert.equal(p.margins.top, 6);
  assert.equal(p.margins.left, 0.5);
  assert.equal(p.minSize, 20);
  assert.equal(p.minSpacing, 0);
  assert.equal(p.required.length, 3);
  assert.equal(p.required[0], 'Synopsis');
  assert.equal(p.required[2].length, 100);
  assert.equal(p.notes.length, 500);
});

test('profile checks compare the draft with what the user said the court asks', () => {
  const profile = D.normalizeProfile({ id: 'p', name: 'Court X', minSize: 14, minSpacing: 1.5, required: ['Synopsis', 'prayer'] });
  const d = draftOf('std-anticipatory-bail');                                          // 12 pt, 1.5 spacing, has a Prayer, no Synopsis
  const by = l => D.profileChecks(d, profile).find(c => c.label === l);
  assert.equal(by('Font size').ok, false);
  assert.match(by('Font size').note, /12 pt, the court asks for at least 14 pt/);
  assert.equal(by('Line spacing').ok, true);
  assert.equal(by('Section: Synopsis').ok, false);
  assert.equal(by('Section: prayer').ok, true, 'matching ignores case');
  d.style.size = 14;
  d.sections.unshift({ id: 's', heading: 'Synopsis and list of dates', layout: 'para', body: 'x' });
  assert.equal(by('Font size').ok, true);
  assert.equal(by('Section: Synopsis').ok, true, 'a heading that contains the required words counts');
});

test('the draft checks include the court rules, just before the review check', () => {
  const profile = D.normalizeProfile({ name: 'Court X', minSize: 14 });
  const d = draftOf('std-anticipatory-bail');
  const labels = D.draftChecks(d, matter, profile).checks.map(c => c.label);
  assert.ok(labels.indexOf('Font size') > labels.indexOf('Annexures listed'));
  assert.equal(labels[labels.length - 1], 'Your review');
  assert.ok(!D.draftChecks(d, matter).checks.some(c => c.label === 'Font size'), 'no profile, no court checks');
});

test('profile names are validated, and unique', () => {
  assert.match(D.validateProfile({ id: 'a', name: ' ' })[0], /name/);
  assert.match(D.validateProfile({ id: 'a', name: 'court x' }, [{ id: 'b', name: 'Court X' }])[0], /already/);
  assert.deepEqual(D.validateProfile({ id: 'b', name: 'Court X' }, [{ id: 'b', name: 'Court X' }]), []);
});

test('a draft remembers its court rules, and the print file uses their paper and margins', () => {
  const d = D.createDraft(D.BUILTIN_FORMATS[0], matter, { profileId: 'p1' });
  assert.equal(d.profileId, 'p1');
  assert.equal(D.normalizeDraft({ profileId: 'q'.repeat(100) }).profileId.length, 40);
  const html = D.exportHtml(d, { paper: 'Legal', margins: { top: 3, right: 2, bottom: 3, left: 4 } });
  assert.match(html, /@page\{size:21\.59cm 35\.56cm;margin:3cm 2cm 3cm 4cm\}/);
  assert.match(D.exportHtml(d), /@page\{size:21cm 29\.7cm;margin:2\.54cm/);
});
