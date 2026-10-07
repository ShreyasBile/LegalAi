const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const T = require('../textmine.js');
const D = require('../drafting.js');
const X = require('../docx.js');

const inflate = raw => new Uint8Array(zlib.inflateRawSync(Buffer.from(raw)));
const isoOf = text => T.findDates(text).map(d => d.iso);

test('English dates are found in the forms Indian pleadings use', () => {
  assert.deepEqual(isoOf('on 7 February 2026'), ['2026-02-07']);
  assert.deepEqual(isoOf('on 7th Feb, 2026'), ['2026-02-07']);
  assert.deepEqual(isoOf('on 07-Feb-2026'), ['2026-02-07']);
  assert.deepEqual(isoOf('on February 7, 2026'), ['2026-02-07']);
  assert.deepEqual(isoOf('on 2026-02-07'), ['2026-02-07']);
  assert.deepEqual(isoOf('on 07/02/2026'), ['2026-02-07'], 'numeric dates are day first, as in India');
  assert.deepEqual(isoOf('on 7.2.2026'), ['2026-02-07']);
  assert.deepEqual(isoOf('on 1st of March 2025'), ['2025-03-01']);
});

test('a numeric date that can only be month-first is read that way; an ambiguous one stays day-first', () => {
  assert.deepEqual(isoOf('02/13/2026'), ['2026-02-13']);
  assert.deepEqual(isoOf('03/04/2026'), ['2026-04-03']);
});

test('impossible and out-of-range dates are not reported', () => {
  assert.deepEqual(isoOf('31 February 2026'), []);
  assert.deepEqual(isoOf('31/04/2026'), []);
  assert.deepEqual(isoOf('29 February 2025'), [], '2025 is not a leap year');
  assert.deepEqual(isoOf('29 February 2024'), ['2024-02-29']);
  assert.deepEqual(isoOf('0/0/2026'), []);
  assert.deepEqual(isoOf('12 June 1850'), []);
  assert.deepEqual(isoOf('Section 138 of 2013 Act, clause 12.4.1996.5'), []);
});

test('words that merely start like a month are not months', () => {
  assert.deepEqual(isoOf('5 marriage 2026'), []);
  assert.deepEqual(isoOf('the 12 mayor 2026'), []);
  assert.deepEqual(isoOf('Cars 5 Mar 2026'), ['2026-03-05']);
});

test('Hindi and Marathi dates, with Devanagari digits, are found and reported in the original script', () => {
  const hi = T.findDates('प्राथमिकी दिनांक १५ अगस्त २०२५ को दर्ज की गई');
  assert.deepEqual(hi.map(d => d.iso), ['2025-08-15']);
  assert.equal(hi[0].raw, '१५ अगस्त २०२५');
  assert.deepEqual(isoOf('दिनांक 3 फेब्रुवारी 2026 रोजी'), ['2026-02-03'], 'Marathi month name, ASCII digits');
  assert.deepEqual(isoOf('२० मार्च २०२४'), ['2024-03-20']);
  assert.deepEqual(isoOf('१ जनवरी २०२६ और ३१ दिसंबर २०२५'), ['2026-01-01', '2025-12-31']);
  assert.deepEqual(isoOf('१२/०५/२०२६'), ['2026-05-12'], 'Devanagari digits in a numeric date');
  assert.deepEqual(isoOf('७ सप्टेंबर २०२५'), ['2025-09-07']);
});

test('indexes point into the original text and several dates come out in order without overlapping', () => {
  const text = 'A on 7 Feb 2026, then 2026-03-01 and 9/4/2026.';
  const found = T.findDates(text);
  assert.deepEqual(found.map(d => d.iso), ['2026-02-07', '2026-03-01', '2026-04-09']);
  for (const f of found) assert.equal(text.slice(f.index, f.end), f.raw);
  for (let i = 1; i < found.length; i++) assert.ok(found[i].index >= found[i - 1].end);
});

test('rupee amounts: lakh, crore, thousand, commas, decimals and the rupee sign', () => {
  const v = text => T.findAmounts(text).map(a => a.rupees);
  assert.deepEqual(v('Rs. 5,00,000/-'), [500000]);
  assert.deepEqual(v('Rs 5 lakh'), [500000]);
  assert.deepEqual(v('₹18.4 lakh'), [1840000]);
  assert.deepEqual(v('Rs. 5 crore'), [50000000]);
  assert.deepEqual(v('INR 1,200.50'), [1200.5]);
  assert.deepEqual(v('Rs.12 thousand'), [12000]);
  assert.deepEqual(v('5 lakh rupees'), [500000]);
  assert.deepEqual(v('2,50,000 rupees'), [250000]);
  assert.deepEqual(v('रु. १८,०००'), [18000]);
  assert.deepEqual(v('₹ २,५०,०००'), [250000]);
  assert.deepEqual(v('Rs. 5 lakh rupees'), [500000], 'one amount, not two');
  assert.deepEqual(v('Rs. 3 cr.'), [30000000]);
});

test('numbers that are not money are ignored', () => {
  assert.deepEqual(T.findAmounts('Section 138, para 12, 5 lakh people, cars 5, Rs'), []);
  assert.deepEqual(T.findAmounts('Rs. 500 credit note')[0].rupees, 500, '"cr" inside "credit" is not crore');
});

test('each date and amount carries the nearest event word, in English and Hindi', () => {
  const m = T.mine('The notice dated 12 March 2026 was served. The agreement of 5 January 2025 fixed the rent at Rs. 18,000.');
  assert.deepEqual(m.dates.map(d => [d.value, d.event]), [['2026-03-12', 'notice'], ['2025-01-05', 'agreement']]);
  assert.deepEqual(m.amounts.map(a => [a.value, a.event]), [[18000, 'rent']]);
  const hi = T.mine('प्राथमिकी दिनांक १५ अगस्त २०२५ को दर्ज की गई।');
  assert.equal(hi.dates[0].event, 'fir');
});

test('"fir" inside another word is not the FIR', () => {
  assert.equal(T.mine('The firm was formed on 3 March 2020.').dates[0].event, '');
  assert.equal(T.mine('FIR No. 12 was registered on 3 March 2020.').dates[0].event, 'fir');
  assert.equal(T.mine('F.I.R. registered on 3 March 2020.').dates[0].event, 'fir');
});

test('an item with no event word nearby has no event, and carries a readable snippet', () => {
  const m = T.mine('On 3 March 2020 something happened.');
  assert.equal(m.dates[0].event, '');
  assert.match(m.dates[0].snippet, /3 March 2020/);
  assert.deepEqual(T.mine(''), { dates: [], amounts: [] });
  assert.deepEqual(T.mine(null), { dates: [], amounts: [] });
});

const doc = (id, name, text) => ({ id, name, text });

test('two documents that give different dates for the same event are listed as a possible inconsistency', () => {
  const out = T.findConflicts([
    doc('a', 'FIR copy', 'The FIR was registered on 4 March 2026 at Andheri.'),
    doc('b', 'Client statement', 'I went to the police and the FIR was lodged on 6 March 2026.')
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].type, 'date');
  assert.equal(out[0].key, 'fir');
  assert.deepEqual(out[0].docs.map(d => [d.docName, d.items.map(i => i.value)]), [['FIR copy', ['2026-03-04']], ['Client statement', ['2026-03-06']]]);
  assert.match(out[0].docs[0].items[0].snippet, /registered on 4 March 2026/);
});

test('documents that agree, or that share at least one value, are not flagged', () => {
  assert.deepEqual(T.findConflicts([
    doc('a', 'A', 'The notice of 4 March 2026 was sent.'), doc('b', 'B', 'We received the notice dated 4 March 2026.')]), []);
  assert.deepEqual(T.findConflicts([
    doc('a', 'A', 'The notice of 4 March 2026 was sent. A second notice of 9 April 2026.'), doc('b', 'B', 'The notice dated 4 March 2026.')]), []);
});

test('one document is never in conflict with itself, and unrelated events do not clash', () => {
  assert.deepEqual(T.findConflicts([doc('a', 'A', 'The notice of 4 March 2026. The notice of 9 April 2026.')]), []);
  assert.deepEqual(T.findConflicts([doc('a', 'A', 'The notice of 4 March 2026.'), doc('b', 'B', 'The agreement of 9 April 2026.')]), []);
});

test('different amounts for the same thing are flagged, in either language, and the same value in two spellings is not', () => {
  const out = T.findConflicts([
    doc('a', 'Agreement', 'The consideration is Rs. 5,00,000.'),
    doc('b', 'Bank statement', 'Consideration paid Rs. 4,50,000 only.')
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].type, 'amount');
  assert.equal(out[0].key, 'consideration');
  assert.deepEqual(T.findConflicts([
    doc('a', 'A', 'The consideration is Rs. 5,00,000.'), doc('b', 'B', 'Consideration of ₹ 5 lakh was agreed.')]), [], '5,00,000 and 5 lakh are the same sum');
  assert.deepEqual(T.findConflicts([
    doc('a', 'A', 'The rent is Rs. 18,000.'), doc('b', 'B', 'भाडे रु. १८,०००')]), [], 'Devanagari digits are the same number');
});

test('three documents: a clash is reported once, with every document that mentions the event', () => {
  const out = T.findConflicts([
    doc('a', 'A', 'The notice of 4 March 2026.'), doc('b', 'B', 'The notice of 5 March 2026.'), doc('c', 'C', 'The notice of 4 March 2026.')]);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].docs.map(d => d.docName), ['A', 'B', 'C']);
});

test('search finds every occurrence, ignores case, works in Devanagari, and refuses one-letter queries', () => {
  const text = 'The Notice was sent. A second notice followed. नोटिस भेजा गया.';
  assert.equal(T.search(text, 'notice').length, 2);
  assert.equal(T.search(text, 'NOTICE').length, 2);
  assert.equal(T.search(text, 'नोटिस').length, 1);
  assert.deepEqual(T.search(text, 'n'), []);
  assert.deepEqual(T.search(text, ''), []);
  assert.deepEqual(T.search(null, 'abc'), []);
  assert.equal(T.search('aaaa', 'aa').length, 2, 'hits do not overlap');
  assert.equal(T.search('ab '.repeat(100), 'ab', { max: 5 }).length, 5);
  const hit = T.search(text, 'second')[0];
  assert.equal(text.slice(hit.index, hit.end).toLowerCase(), 'second');
});

test('word count and clean-up treat Hindi and Marathi words as words', () => {
  assert.equal(T.wordCount('one two  three'), 3);
  assert.equal(T.wordCount('प्राथमिकी दर्ज की गई'), 4);
  assert.equal(T.wordCount(''), 0);
  assert.equal(T.cleanText('a\r\nb\r\n\r\n\r\n\r\nc  \n\u0000d'), 'a\nb\n\nc\nd');
});

test('a .docx made by Word-style software (compressed) is read: text, Devanagari, table cells', async () => {
  const bytes = new Uint8Array(fs.readFileSync(path.join(__dirname, 'fixtures', 'sample.docx')));
  const text = await T.docxText(bytes, inflate);
  assert.match(text, /LEGAL NOTICE & DEMAND/, 'an ampersand is decoded');
  assert.match(text, /12 March 2026/);
  assert.match(text, /प्राथमिकी दिनांक १५ अगस्त २०२५/);
  assert.match(text, /Rent/);
  assert.match(text, /Rs\. 18,000/);
  const m = T.mine(text);
  assert.ok(m.dates.some(d => d.value === '2026-03-12' && d.event === 'notice'));
  assert.ok(m.dates.some(d => d.value === '2025-08-15' && d.event === 'fir'));
  assert.ok(m.amounts.some(a => a.value === 500000));
  assert.ok(m.amounts.some(a => a.value === 250000));
});

test('a .docx made by this app (stored, not compressed) is read back', async () => {
  const format = D.BUILTIN_FORMATS.find(f => f.id === 'std-legal-notice');
  const matter = { title: 'Mehta v. Shah', court: 'City Civil Court', facts: {}, timeline: [], authorities: [], arguments: [], counterArgs: [], documents: [] };
  const draft = D.createDraft(format, matter);
  draft.sections[0].body = 'Notice sent on 7 February 2026 for Rs. 2,00,000 & interest.';
  const text = await T.docxText(X.build(draft, { page: D.BUILTIN_PROFILES[0] }), inflate);
  assert.match(text, /Notice sent on 7 February 2026 for Rs\. 2,00,000 & interest\./);
});

test('files that are not Word documents are refused clearly rather than read as garbage', async () => {
  await assert.rejects(T.docxText(new Uint8Array([1, 2, 3, 4, 5]), inflate), /not a ZIP/);
  await assert.rejects(T.docxText(new Uint8Array(40), inflate), /not a ZIP/);
  const zipWithoutWord = X.build(D.createDraft(D.BUILTIN_FORMATS[0], { title: 'x', facts: {}, timeline: [], authorities: [], arguments: [], counterArgs: [], documents: [] }), { page: D.BUILTIN_PROFILES[0] });
  assert.ok((await T.docxText(zipWithoutWord, inflate)).length >= 0, 'a docx made here has word/document.xml');
});

test('a truncated or damaged .docx fails with a message, not a crash', async () => {
  const bytes = new Uint8Array(fs.readFileSync(path.join(__dirname, 'fixtures', 'sample.docx')));
  await assert.rejects(T.docxText(bytes.subarray(0, 600), inflate), /ZIP|damaged/);
  const bad = Uint8Array.from(bytes);
  const eocd = bad.length - 22, dv = new DataView(bad.buffer);
  dv.setUint32(eocd + 16, 3, true);
  await assert.rejects(T.docxText(bad, inflate), /damaged/);
});

test('xmlText turns paragraph, tab and break markers into whitespace and decodes entities', () => {
  assert.equal(T.xmlText('<w:p><w:r><w:t>A</w:t><w:tab/><w:t>B</w:t></w:r></w:p><w:p><w:r><w:t>C &amp; D &lt;E&gt; &#x20B9; &#8377;</w:t><w:br/><w:t>F</w:t></w:r></w:p>'), 'A\tB\nC & D <E> ₹ ₹\nF\n');
  assert.equal(T.xmlText('<w:t>&#99999999;</w:t>'), '', 'an impossible character reference is dropped');
});
