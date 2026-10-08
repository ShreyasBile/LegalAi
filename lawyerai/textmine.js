/* ============================================================================
   Reading evidence — the pure logic: dates and amounts found in text, reading a .docx, searching, and
   comparing what different documents say. No DOM and no storage, so it is unit-tested (test/textmine.test.js).
   Loaded by the browser as a classic script (global `TextMine`) and by Node with require().

   What it can and cannot do: it finds dates and rupee amounts and the nearest event word next to each
   ("FIR", "notice", "agreement"…), and it points out where two documents give different dates or amounts for
   the same event word. It cannot read meaning, so every "possible inconsistency" is a place to look, never a finding.
   ============================================================================ */
const TextMine = (() => {
  const L = '\\p{L}\\p{M}\\p{N}';                                              // a letter, a combining mark or a digit (so Devanagari counts as part of a word)
  const MONTHS = {
    1: ['january', 'jan', 'जनवरी', 'जानेवारी'], 2: ['february', 'feb', 'फ़रवरी', 'फरवरी', 'फेब्रुवारी'], 3: ['march', 'mar', 'मार्च'], 4: ['april', 'apr', 'अप्रैल', 'एप्रिल'],
    5: ['may', 'मई', 'मे'], 6: ['june', 'jun', 'जून'], 7: ['july', 'jul', 'जुलाई', 'जुलै'], 8: ['august', 'aug', 'अगस्त', 'ऑगस्ट'],
    9: ['september', 'sept', 'sep', 'सितंबर', 'सितम्बर', 'सप्टेंबर'], 10: ['october', 'oct', 'अक्टूबर', 'अक्तूबर', 'ऑक्टोबर'],
    11: ['november', 'nov', 'नवंबर', 'नवम्बर', 'नोव्हेंबर'], 12: ['december', 'dec', 'दिसंबर', 'दिसम्बर', 'डिसेंबर']
  };
  const MONTH_OF = new Map(Object.entries(MONTHS).flatMap(([n, names]) => names.map(x => [x.normalize('NFC').toLowerCase(), Number(n)])));
  const MON = [...MONTH_OF.keys()].sort((a, b) => b.length - a.length).join('|');

  /* Devanagari digits become ASCII ones, one for one, so every position in the result is a position in the original */
  const asciiDigits = t => String(t ?? '').replace(/[०-९]/g, c => String(c.charCodeAt(0) - 0x0966));

  const validIso = (y, m, d) => {
    if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1) return null;
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null;
  };

  /* ── dates ──────────────────────────────────────────────────────────────── */
  const DATE_PATTERNS = [
    { re: new RegExp(`(?<![${L}])(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:of\\s+)?[-./\\s]?\\s*(${MON})\\.?,?\\s*[-./\\s]?\\s*(\\d{4})(?!\\d)`, 'giu'), get: m => [+m[3], MONTH_OF.get(m[2].normalize('NFC').toLowerCase()), +m[1]] },      // 7 Feb 2026, 7th February, 2026, 07-Feb-2026, 7 फेब्रुवारी 2026
    { re: new RegExp(`(?<![${L}])(${MON})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})(?!\\d)`, 'giu'), get: m => [+m[3], MONTH_OF.get(m[1].normalize('NFC').toLowerCase()), +m[2]] },                                  // February 7, 2026
    { re: /(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/g, get: m => [+m[1], +m[2], +m[3]] },                                                                                                                               // 2026-02-07
    { re: /(?<![\d.])(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{4})(?!\d|\.\d)/g, get: m => (+m[2] > 12 && +m[1] <= 12 ? [+m[3], +m[1], +m[2]] : [+m[3], +m[2], +m[1]]) }                                              // 07/02/2026 is day first; 02/13/2026 can only be month first
  ];

  function findDates(text) {
    const orig = String(text ?? '').normalize('NFC'), t = asciiDigits(orig), found = [];
    for (const { re, get } of DATE_PATTERNS) {
      re.lastIndex = 0;
      for (const m of t.matchAll(re)) {
        const [y, mo, d] = get(m), iso = mo ? validIso(y, mo, d) : null;
        if (iso) found.push({ iso, raw: orig.slice(m.index, m.index + m[0].length), index: m.index, end: m.index + m[0].length });
      }
    }
    found.sort((a, b) => a.index - b.index || (b.end - b.index) - (a.end - a.index));
    const out = [];
    for (const f of found) if (!out.length || f.index >= out[out.length - 1].end) out.push(f);        // where two readings overlap, the longer, earlier one wins
    return out;
  }

  /* ── amounts ────────────────────────────────────────────────────────────── */
  const UNIT = { lakh: 1e5, lakhs: 1e5, lac: 1e5, lacs: 1e5, 'लाख': 1e5, crore: 1e7, crores: 1e7, cr: 1e7, 'करोड़': 1e7, 'करोड': 1e7, thousand: 1e3, 'हजार': 1e3, 'हज़ार': 1e3 };
  const NUM = '(\\d{1,3}(?:,\\d{2,3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?)', UNITS = '(lakhs?|lacs?|crores?|cr\\b\\.?|thousand|लाख|करोड़|करोड|हजार|हज़ार)';
  const CUR = '(?:₹|Rs\\.?|INR|रु\\.?|रुपये|रुपए)';
  const AMOUNT_PATTERNS = [
    new RegExp(`(?<![${L}])${CUR}\\s*${NUM}(?:\\s*/-)?(?:\\s*${UNITS})?`, 'giu'),                                      // Rs. 5,00,000   ₹18.4 lakh   Rs 5 crore   INR 1,200.50
    new RegExp(`(?<![${L}.,])${NUM}\\s*(?:${UNITS}\\s*)?(?:rupees|रुपये|रुपए)`, 'giu')                                // 5 lakh rupees   2,50,000 rupees
  ];
  const unitValue = u => UNIT[String(u || '').replace(/\.$/, '').normalize('NFC').toLowerCase()] || 1;

  function findAmounts(text) {
    const orig = String(text ?? '').normalize('NFC'), t = asciiDigits(orig), found = [];
    for (const re of AMOUNT_PATTERNS) {
      re.lastIndex = 0;
      for (const m of t.matchAll(re)) {
        const n = parseFloat(m[1].replace(/,/g, '')), unit = m[2];
        if (!Number.isFinite(n)) continue;
        found.push({ rupees: Math.round(n * unitValue(unit) * 100) / 100, raw: orig.slice(m.index, m.index + m[0].length).trim(), index: m.index, end: m.index + m[0].length });
      }
    }
    found.sort((a, b) => a.index - b.index || (b.end - b.index) - (a.end - a.index));
    const out = [];
    for (const f of found) if (!out.length || f.index >= out[out.length - 1].end) out.push(f);
    return out;
  }

  /* ── the event word nearest a date or an amount ─────────────────────────── */
  const EVENTS = [
    ['fir', 'FIR', /\b(?:F\.?\s?I\.?\s?R\.?|first information report)(?![A-Za-z])|प्राथमिकी|एफ\s?आय\s?आर|एफ\s?आई\s?आर/iu],
    ['notice', 'Notice', /\bnotice\b|नोटिस|नोटीस/iu],
    ['agreement', 'Agreement', /\b(?:agreement|contract|deed|mou)\b|करारनामा|करार|अनुबंध|समझौता/iu],
    ['payment', 'Payment', /\b(?:payment|paid|remittance|transaction|transferred|neft|rtgs|upi)\b|भुगतान|व्यवहार/iu],
    ['termination', 'Termination', /\b(?:terminat\w*|dismiss\w*|discharg\w*|retrench\w*)\b|बर्खास्त|कामावरून|सेवा समाप्त/iu],
    ['hearing', 'Hearing', /\b(?:hearing|listed|adjourn\w*)\b|सुनवाई|सुनावणी/iu],
    ['order', 'Order', /\b(?:order|judg(?:e)?ment|award|decree)\b|आदेश|निकाल|निर्णय/iu],
    ['complaint', 'Complaint', /\bcomplaint\b|तक्रार|शिकायत/iu],
    ['arrest', 'Arrest', /\b(?:arrest\w*|detain\w*)\b|अटक|गिरफ्तार/iu],
    ['letter', 'Letter or email', /\b(?:letter|e-?mail|correspondence)\b|पत्र|ईमेल/iu],
    ['invoice', 'Invoice', /\b(?:invoice|bill)\b|बिल|चलान/iu],
    ['incident', 'Incident', /\b(?:accident|collision|incident)\b|अपघात|दुर्घटना|घटना/iu],
    ['handover', 'Handover', /\b(?:handover|possession|delivery)\b|ताबा|कब्जा/iu]
  ];
  const AMOUNT_WORDS = [
    ['consideration', 'Consideration or price', /\b(?:consideration|price|sale value)\b/iu], ['rent', 'Rent', /\brent\b|किराया|भाडे/iu], ['salary', 'Salary or wages', /\b(?:salary|wages?|remuneration)\b|वेतन|पगार/iu],
    ['loan', 'Loan', /\b(?:loan|borrowed|advance)\b|कर्ज/iu], ['compensation', 'Compensation or damages', /\b(?:compensation|damages)\b|मुआवजा|नुकसान भरपाई/iu], ['claim', 'Claim', /\bclaim(?:ed)?\b/iu],
    ['deposit', 'Deposit', /\bdeposit\b|ठेव/iu], ['penalty', 'Penalty', /\b(?:penalty|fine)\b|दंड/iu], ['dues', 'Dues or balance', /\b(?:dues|outstanding|balance)\b/iu], ['fee', 'Fee', /\b(?:fee|fees)\b/iu]
  ];

  const WINDOW = 90, GLOBALS = new Map();
  const globalOf = re => { if (!GLOBALS.has(re)) GLOBALS.set(re, new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`)); return GLOBALS.get(re); };
  function nearest(text, start, end, words) {
    const from = Math.max(0, start - WINDOW), to = Math.min(text.length, end + WINDOW), slice = text.slice(from, to);
    let best = null;
    for (const [key, label, re] of words) {
      for (const m of slice.matchAll(globalOf(re))) {
        const a = from + m.index, b = a + m[0].length, dist = b <= start ? start - b : a >= end ? a - end : 0;
        if (!best || dist < best.dist) best = { key, label, dist };
      }
    }
    return best;
  }
  const snippet = (text, start, end, radius = 70) => {
    const a = Math.max(0, start - radius), b = Math.min(text.length, end + radius);
    return `${a > 0 ? '…' : ''}${text.slice(a, b).replace(/\s+/g, ' ').trim()}${b < text.length ? '…' : ''}`;
  };

  /* every date and amount in a document, with its nearest event word and the words around it */
  function mine(text) {
    const t = String(text ?? '').normalize('NFC');
    const dates = findDates(t).map(d => { const e = nearest(t, d.index, d.end, EVENTS); return { type: 'date', value: d.iso, raw: d.raw, event: e ? e.key : '', eventLabel: e ? e.label : '', snippet: snippet(t, d.index, d.end), index: d.index }; });
    const amounts = findAmounts(t).map(a => { const e = nearest(t, a.index, a.end, AMOUNT_WORDS); return { type: 'amount', value: a.rupees, raw: a.raw, event: e ? e.key : '', eventLabel: e ? e.label : '', snippet: snippet(t, a.index, a.end), index: a.index }; });
    return { dates, amounts };
  }

  /* ── comparing documents ────────────────────────────────────────────────────
     For each event word (or amount word), each document has a set of values. If two documents each mention it
     and share no value, that is a possible inconsistency: both are listed, with the words around each. */
  function findConflicts(docs) {
    const groups = new Map();
    for (const d of docs) {
      const m = mine(d.text);
      for (const item of [...m.dates, ...m.amounts]) {
        if (!item.event) continue;
        const k = `${item.type}:${item.event}`;
        if (!groups.has(k)) groups.set(k, { type: item.type, key: item.event, label: item.eventLabel, byDoc: new Map() });
        const g = groups.get(k);
        if (!g.byDoc.has(d.id)) g.byDoc.set(d.id, { docId: d.id, docName: d.name, values: new Map() });
        const doc = g.byDoc.get(d.id);
        if (!doc.values.has(item.value)) doc.values.set(item.value, { value: item.value, raw: item.raw, snippet: item.snippet });
      }
    }
    const out = [];
    for (const g of groups.values()) {
      const list = [...g.byDoc.values()];
      let clash = false;
      for (let i = 0; i < list.length && !clash; i++) for (let j = i + 1; j < list.length && !clash; j++) {
        if (![...list[i].values.keys()].some(v => list[j].values.has(v))) clash = true;
      }
      if (clash) out.push({ type: g.type, key: g.key, label: g.label, docs: list.map(d => ({ docId: d.docId, docName: d.docName, items: [...d.values.values()] })) });
    }
    return out.sort((a, b) => (a.type === b.type ? a.label.localeCompare(b.label) : a.type === 'date' ? -1 : 1));
  }

  /* ── search ─────────────────────────────────────────────────────────────── */
  function search(text, query, { max = 20, radius = 60 } = {}) {
    const q = String(query ?? '').trim().normalize('NFC').toLowerCase(), t = String(text ?? '').normalize('NFC'), lower = t.toLowerCase(), hits = [];
    if (q.length < 2) return hits;
    for (let i = lower.indexOf(q); i >= 0 && hits.length < max; i = lower.indexOf(q, i + q.length)) hits.push({ index: i, end: i + q.length, snippet: snippet(t, i, i + q.length, radius) });
    return hits;
  }
  const wordCount = t => (String(t ?? '').match(/[\p{L}\p{M}\p{N}]+/gu) || []).length;
  const cleanText = t => String(t ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').normalize('NFC').trim();

  /* ── reading a .docx ────────────────────────────────────────────────────────
     A .docx is a ZIP. This reads its directory and pulls the text out of word/document.xml. Inflating is passed in,
     because the browser (DecompressionStream) and Node (zlib) do it differently. */
  function zipEntries(bytes) {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('This is not a ZIP-based file.');
    const count = v.getUint16(eocd + 10, true);
    let o = v.getUint32(eocd + 16, true);
    const dec = new TextDecoder(), entries = [];
    for (let n = 0; n < count; n++) {
      if (o + 46 > bytes.length || v.getUint32(o, true) !== 0x02014b50) throw new Error('The file’s directory is damaged.');
      const nameLen = v.getUint16(o + 28, true), extraLen = v.getUint16(o + 30, true), commentLen = v.getUint16(o + 32, true);
      entries.push({ name: dec.decode(bytes.subarray(o + 46, o + 46 + nameLen)), method: v.getUint16(o + 10, true), size: v.getUint32(o + 20, true), uncompressed: v.getUint32(o + 24, true), offset: v.getUint32(o + 42, true) });
      o += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
  }
  async function zipRead(bytes, entry, inflate) {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const start = entry.offset + 30 + v.getUint16(entry.offset + 26, true) + v.getUint16(entry.offset + 28, true);
    const raw = bytes.subarray(start, start + entry.size);
    if (entry.method === 0) return raw;
    if (entry.method === 8) return inflate(raw);
    throw new Error('This file uses a compression method that is not supported.');
  }
  const entityText = s => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (all, e) => {
    if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ''; }
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[e.toLowerCase()];
  });
  const xmlText = xml => entityText(xml.replace(/<w:tab\s*\/>/g, '\t').replace(/<w:(?:br|cr)\s*\/>/g, '\n').replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, ''));
  async function docxText(bytes, inflate) {
    const entry = zipEntries(bytes).find(e => e.name === 'word/document.xml');
    if (!entry) throw new Error('This does not look like a Word document.');
    return cleanText(xmlText(new TextDecoder().decode(await zipRead(bytes, entry, inflate))));
  }

  return { asciiDigits, findDates, findAmounts, mine, findConflicts, search, wordCount, cleanText, zipEntries, zipRead, docxText, xmlText, EVENTS, AMOUNT_WORDS };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = TextMine;
