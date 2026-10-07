const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../extract.js');

test('files are sorted by what can be done with them, and what cannot is explained', () => {
  const k = (name, mime) => E.kindOf(name, mime);
  assert.equal(k('FIR.pdf').kind, 'pdf');
  assert.equal(k('SCAN.PDF').kind, 'pdf');
  assert.equal(k('x', 'application/pdf').kind, 'pdf');
  assert.equal(k('Notice.docx').kind, 'docx');
  assert.equal(k('notes.txt').kind, 'text');
  assert.equal(k('data.csv').kind, 'text');
  assert.equal(k('x', 'text/plain').kind, 'text');
  assert.equal(k('photo.JPG').kind, 'image');
  assert.equal(k('page.png').kind, 'image');
  assert.equal(k('x', 'image/webp').kind, 'image');
  for (const [name, hint] of [['old.doc', /\.docx or PDF/], ['letter.rtf', /\.docx or PDF/], ['scan.tiff', /PNG or JPG/], ['phone.heic', /PNG or JPG/], ['bundle.zip', /one by one/], ['thing.xyz', /PDF, a Word/], ['noext', /PDF, a Word/]]) {
    const r = k(name);
    assert.equal(r.kind, 'unsupported', name);
    assert.match(r.reason, hint, name);
  }
  assert.equal(k(null).kind, 'unsupported');
});

test('OCR languages: only the known ones, English when none, always in the same order', () => {
  assert.deepEqual(E.normalizeLangs(['hin', 'eng']), ['eng', 'hin']);
  assert.deepEqual(E.normalizeLangs('mar'), ['mar']);
  assert.deepEqual(E.normalizeLangs('eng+hin+mar'), ['eng', 'hin', 'mar']);
  assert.deepEqual(E.normalizeLangs(['xx', 'fra']), ['eng']);
  assert.deepEqual(E.normalizeLangs([]), ['eng']);
  assert.deepEqual(E.normalizeLangs(null), ['eng']);
  assert.deepEqual(E.normalizeLangs(['HIN', ' mar ']), ['hin', 'mar']);
  assert.equal(E.langLabel(['hin', 'eng']), 'English + Hindi');
  assert.equal(E.langLabel('mar'), 'Marathi');
});

test('text files are decoded as UTF-8, with a byte-order mark honoured and an old encoding tolerated', () => {
  const enc = s => new TextEncoder().encode(s);
  assert.equal(E.decodeText(enc('नोटिस दिनांक १ जनवरी')), 'नोटिस दिनांक १ जनवरी');
  assert.equal(E.decodeText(Uint8Array.from([0xEF, 0xBB, 0xBF, ...enc('abc')])), 'abc');
  assert.equal(E.decodeText(Uint8Array.from([0xFF, 0xFE, 0x61, 0x00, 0x62, 0x00])), 'ab', 'UTF-16 little endian');
  assert.equal(E.decodeText(Uint8Array.from([0xFE, 0xFF, 0x00, 0x61, 0x00, 0x62])), 'ab', 'UTF-16 big endian');
  assert.equal(E.decodeText(Uint8Array.from([0x52, 0x73, 0x2E, 0x20, 0xA3, 0x35])), 'Rs. £5', 'a Windows-1252 file is not turned into replacement characters');
  assert.equal(E.decodeText(new Uint8Array(0)), '');
  assert.equal(E.decodeText(null), '');
});

test('PDF text pieces are put back into lines and words', () => {
  const it = (str, x, y, width, extra = {}) => ({ str, transform: [12, 0, 0, 12, x, y], width, ...extra });
  assert.equal(E.joinPdfItems([it('Hello', 10, 700, 30), it('world', 45, 700, 30), it('Next line', 10, 685, 50)]), 'Hello world\nNext line');
  assert.equal(E.joinPdfItems([it('Hel', 10, 700, 18), it('lo', 28, 700, 12)]), 'Hello', 'pieces of one word are not split');
  assert.equal(E.joinPdfItems([it('A', 10, 700, 8, { hasEOL: true }), it('B', 10, 686, 8)]), 'A\nB', 'an end-of-line marker and a new y do not double the newline');
  assert.equal(E.joinPdfItems([it('a', 10, 700, 5), it(' b', 16, 700, 8)]), 'a b', 'existing spaces are kept, not doubled');
  assert.equal(E.joinPdfItems([{ str: 'no position' }, null, 5, { nope: 1 }]), 'no position');
  assert.equal(E.joinPdfItems(null), '');
  assert.equal(E.joinPdfItems([]), '');
});

test('a page with next to no text is treated as a scan; a real page is not', () => {
  assert.equal(E.looksScanned(''), true);
  assert.equal(E.looksScanned(' \n 12 \n'), true);
  assert.equal(E.looksScanned(null), true);
  assert.equal(E.looksScanned('IN THE HIGH COURT OF JUDICATURE AT BOMBAY'), false);
  assert.equal(E.looksScanned('प्राथमिकी दर्ज की गई और जांच शुरू हुई'), false, 'Devanagari text counts as text');
});

test('library addresses are pinned versions of jsDelivr unless the page says otherwise', () => {
  const u = E.libUrls();
  assert.match(u.pdfjs, /^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfjs-dist@\d+\.\d+\.\d+\/build\/pdf\.min\.mjs$/);
  assert.match(u.pdfjsWorker, /pdf\.worker\.min\.mjs$/);
  assert.match(u.tesseract, /tesseract\.js@\d+\.\d+\.\d+\/dist\/tesseract\.min\.js$/);
  assert.ok(u.pdfjs.includes(E.VERSIONS.pdfjs) && u.tesseract.includes(E.VERSIONS.tesseract));
  assert.equal(u.tesseractCore, '');
  assert.equal(u.langPath, '');
});

test('the text store keeps, lists and deletes texts; with no IndexedDB it falls back to memory and says so', async () => {
  const s = E.store;
  await s.put('m1:doc-a', { text: 'alpha' });
  await s.put('m1:doc-b', { text: 'beta' });
  await s.put('m2:doc-c', { text: 'gamma' });
  assert.deepEqual(await s.get('m1:doc-a'), { text: 'alpha' });
  assert.equal(await s.get('m1:none'), undefined);
  assert.deepEqual((await s.keys('m1:')).sort(), ['m1:doc-a', 'm1:doc-b']);
  assert.equal((await s.keys()).length, 3);
  await s.del('m1:doc-a');
  assert.equal(await s.get('m1:doc-a'), undefined);
  await s.del('m1:never-there');
  await s.clear();
  assert.deepEqual(await s.keys(), []);
  assert.equal(s.persistent, false, 'Node has no IndexedDB, so nothing here survives a reload');
});

test('reading a file that cannot be read says why, and a huge file is refused before it is opened', async () => {
  const f = (name, size, type = '') => ({ name, size, type, arrayBuffer: async () => new ArrayBuffer(size) });
  await assert.rejects(E.readFile(f('old.doc', 10)), /\.docx or PDF/);
  await assert.rejects(E.readFile(f('big.pdf', E.MAX_FILE_BYTES + 1)), /limit is 80 MB/);
});

test('a plain text file is read straight away, cleaned, and truncated only at the limit', async () => {
  const mk = (name, s) => { const bytes = new TextEncoder().encode(s); return { name, size: bytes.length, type: 'text/plain', arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }; };
  const ticks = [];
  const r = await E.readFile(mk('a.txt', 'Line one\r\n\r\n\r\n\r\nलाइन दो'), { onProgress: p => ticks.push(p) });
  assert.equal(r.text, 'Line one\n\nलाइन दो');
  assert.equal(r.method, 'text');
  assert.deepEqual(r.langs, ['eng']);
  assert.deepEqual(r.notes, []);
  assert.ok(ticks.length >= 1 && ticks.every(p => p.fraction >= 0 && p.fraction <= 1 && typeof p.label === 'string'));
  const big = await E.readFile(mk('big.txt', 'x'.repeat(E.MAX_CHARS + 50)));
  assert.equal(big.text.length, E.MAX_CHARS);
  assert.match(big.notes[0], /first 10,00,000 characters/);
});
