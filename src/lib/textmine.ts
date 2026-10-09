const L = '\\p{L}\\p{M}\\p{N}';

const MONTHS: Record<number, string[]> = {
  1: ['january', 'jan', 'जनवरी', 'जानेवारी'],
  2: ['february', 'feb', 'फ़रवरी', 'फरवरी', 'फेब्रुवारी'],
  3: ['march', 'mar', 'मार्च'],
  4: ['april', 'apr', 'अप्रैल', 'एप्रिल'],
  5: ['may', 'मई', 'मे'],
  6: ['june', 'jun', 'जून'],
  7: ['july', 'jul', 'जुलाई', 'जुलै'],
  8: ['august', 'aug', 'अगस्त', 'ऑगस्ट'],
  9: ['september', 'sept', 'sep', 'सितंबर', 'सितम्बर', 'सप्टेंबर'],
  10: ['october', 'oct', 'अक्टूबर', 'अक्तूबर', 'ऑक्टोबर'],
  11: ['november', 'nov', 'नवंबर', 'नवम्बर', 'नोव्हेंबर'],
  12: ['december', 'dec', 'दिसंबर', 'दिसम्बर', 'डिसेंबर'],
};

const MONTH_OF = new Map<string, number>(
  Object.entries(MONTHS).flatMap(([n, names]) =>
    names.map((x) => [x.normalize('NFC').toLowerCase(), Number(n)])
  )
);

const MON = [...MONTH_OF.keys()].sort((a, b) => b.length - a.length).join('|');

export const asciiDigits = (t?: string): string =>
  String(t ?? '').replace(/[०-९]/g, (c) => String(c.charCodeAt(0) - 0x0966));

export const validIso = (y: number, m: number, d: number): string | null => {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCMonth() === m - 1 && date.getUTCDate() === d
    ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    : null;
};

interface DateMatchPattern {
  re: RegExp;
  get: (m: RegExpMatchArray) => [number, number | undefined, number];
}

const DATE_PATTERNS: DateMatchPattern[] = [
  {
    re: new RegExp(
      `(?<![${L}])(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:of\\s+)?[-./\\s]?\\s*(${MON})\\.?,?\\s*[-./\\s]?\\s*(\\d{4})(?!\\d)`,
      'giu'
    ),
    get: (m) => [+m[3], MONTH_OF.get(m[2].normalize('NFC').toLowerCase()), +m[1]],
  },
  {
    re: new RegExp(
      `(?<![${L}])(${MON})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})(?!\\d)`,
      'giu'
    ),
    get: (m) => [+m[3], MONTH_OF.get(m[1].normalize('NFC').toLowerCase()), +m[2]],
  },
  {
    re: /(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/g,
    get: (m) => [+m[1], +m[2], +m[3]],
  },
  {
    re: /(?<![\d.])(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{4})(?!\d|\.\d)/g,
    get: (m) => (+m[2] > 12 && +m[1] <= 12 ? [+m[3], +m[1], +m[2]] : [+m[3], +m[2], +m[1]]),
  },
];

export interface FoundDate {
  iso: string;
  raw: string;
  index: number;
  end: number;
}

export function findDates(text?: string): FoundDate[] {
  const orig = String(text ?? '').normalize('NFC');
  const t = asciiDigits(orig);
  const found: FoundDate[] = [];

  for (const { re, get } of DATE_PATTERNS) {
    re.lastIndex = 0;
    for (const m of t.matchAll(re)) {
      if (m.index === undefined) continue;
      const [y, mo, d] = get(m);
      const iso = mo ? validIso(y, mo, d) : null;
      if (iso) {
        found.push({
          iso,
          raw: orig.slice(m.index, m.index + m[0].length),
          index: m.index,
          end: m.index + m[0].length,
        });
      }
    }
  }

  found.sort((a, b) => a.index - b.index || b.end - b.index - (a.end - a.index));
  const out: FoundDate[] = [];
  for (const f of found) {
    if (!out.length || f.index >= out[out.length - 1].end) out.push(f);
  }
  return out;
}

const UNIT: Record<string, number> = {
  lakh: 1e5,
  lakhs: 1e5,
  lac: 1e5,
  lacs: 1e5,
  'लाख': 1e5,
  crore: 1e7,
  crores: 1e7,
  cr: 1e7,
  'करोड़': 1e7,
  'करोड': 1e7,
  thousand: 1e3,
  'हजार': 1e3,
  'हज़ार': 1e3,
};

const NUM = '(\\d{1,3}(?:,\\d{2,3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?)';
const UNITS = '(lakhs?|lacs?|crores?|cr\\b\\.?|thousand|लाख|करोड़|करोड|हजार|हज़ार)';
const CUR = '(?:₹|Rs\\.?|INR|रु\\.?|रुपये|रुपए)';

const AMOUNT_PATTERNS: RegExp[] = [
  new RegExp(`(?<![${L}])${CUR}\\s*${NUM}(?:\\s*/-)?(?:\\s*${UNITS})?`, 'giu'),
  new RegExp(`(?<![${L}.,])${NUM}\\s*(?:${UNITS}\\s*)?(?:rupees|रुपये|रुपए)`, 'giu'),
];

const unitValue = (u?: string): number =>
  UNIT[String(u || '').replace(/\.$/, '').normalize('NFC').toLowerCase()] || 1;

export interface FoundAmount {
  rupees: number;
  raw: string;
  index: number;
  end: number;
}

export function findAmounts(text?: string): FoundAmount[] {
  const orig = String(text ?? '').normalize('NFC');
  const t = asciiDigits(orig);
  const found: FoundAmount[] = [];

  for (const re of AMOUNT_PATTERNS) {
    re.lastIndex = 0;
    for (const m of t.matchAll(re)) {
      if (m.index === undefined) continue;
      const n = parseFloat(m[1].replace(/,/g, ''));
      const unit = m[2];
      if (!Number.isFinite(n)) continue;
      found.push({
        rupees: Math.round(n * unitValue(unit) * 100) / 100,
        raw: orig.slice(m.index, m.index + m[0].length).trim(),
        index: m.index,
        end: m.index + m[0].length,
      });
    }
  }

  found.sort((a, b) => a.index - b.index || b.end - b.index - (a.end - a.index));
  const out: FoundAmount[] = [];
  for (const f of found) {
    if (!out.length || f.index >= out[out.length - 1].end) out.push(f);
  }
  return out;
}

export const EVENTS: [string, string, RegExp][] = [
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
  ['handover', 'Handover', /\b(?:handover|possession|delivery)\b|ताबा|कब्जा/iu],
];

export const AMOUNT_WORDS: [string, string, RegExp][] = [
  ['consideration', 'Consideration or price', /\b(?:consideration|price|sale value)\b/iu],
  ['rent', 'Rent', /\brent\b|किराया|भाडे/iu],
  ['salary', 'Salary or wages', /\b(?:salary|wages?|remuneration)\b|वेतन|पगार/iu],
  ['loan', 'Loan', /\b(?:loan|borrowed|advance)\b|कर्ज/iu],
  ['compensation', 'Compensation or damages', /\b(?:compensation|damages)\b|मुआवजा|नुकसान भरपाई/iu],
  ['claim', 'Claim', /\bclaim(?:ed)?\b/iu],
  ['deposit', 'Deposit', /\bdeposit\b|ठेव/iu],
  ['penalty', 'Penalty', /\b(?:penalty|fine)\b|दंड/iu],
  ['dues', 'Dues or balance', /\b(?:dues|outstanding|balance)\b/iu],
  ['fee', 'Fee', /\b(?:fee|fees)\b/iu],
];

const WINDOW = 90;
const GLOBALS = new Map<RegExp, RegExp>();

function globalOf(re: RegExp): RegExp {
  if (!GLOBALS.has(re)) {
    GLOBALS.set(re, new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`));
  }
  return GLOBALS.get(re)!;
}

export function nearest(
  text: string,
  start: number,
  end: number,
  words: [string, string, RegExp][]
): { key: string; label: string; dist: number } | null {
  const from = Math.max(0, start - WINDOW);
  const to = Math.min(text.length, end + WINDOW);
  const slice = text.slice(from, to);
  let best: { key: string; label: string; dist: number } | null = null;

  for (const [key, label, re] of words) {
    for (const m of slice.matchAll(globalOf(re))) {
      if (m.index === undefined) continue;
      const a = from + m.index;
      const b = a + m[0].length;
      const dist = b <= start ? start - b : a >= end ? a - end : 0;
      if (!best || dist < best.dist) best = { key, label, dist };
    }
  }
  return best;
}

export const snippet = (text: string, start: number, end: number, radius = 70): string => {
  const a = Math.max(0, start - radius);
  const b = Math.min(text.length, end + radius);
  return `${a > 0 ? '…' : ''}${text.slice(a, b).replace(/\s+/g, ' ').trim()}${b < text.length ? '…' : ''}`;
};

export interface MinedItem {
  type: 'date' | 'amount';
  value: string | number;
  raw: string;
  event: string;
  eventLabel: string;
  snippet: string;
  index: number;
}

export function mineText(text?: string): { dates: MinedItem[]; amounts: MinedItem[] } {
  const t = String(text ?? '').normalize('NFC');
  const dates: MinedItem[] = findDates(t).map((d) => {
    const e = nearest(t, d.index, d.end, EVENTS);
    return {
      type: 'date',
      value: d.iso,
      raw: d.raw,
      event: e ? e.key : '',
      eventLabel: e ? e.label : '',
      snippet: snippet(t, d.index, d.end),
      index: d.index,
    };
  });
  const amounts: MinedItem[] = findAmounts(t).map((a) => {
    const e = nearest(t, a.index, a.end, AMOUNT_WORDS);
    return {
      type: 'amount',
      value: a.rupees,
      raw: a.raw,
      event: e ? e.key : '',
      eventLabel: e ? e.label : '',
      snippet: snippet(t, a.index, a.end),
      index: a.index,
    };
  });
  return { dates, amounts };
}

export interface DocWithText {
  id: string;
  name: string;
  text?: string;
}

export interface ConflictResult {
  type: 'date' | 'amount';
  key: string;
  label: string;
  docs: Array<{
    docId: string;
    docName: string;
    items: Array<{ value: string | number; raw: string; snippet: string }>;
  }>;
}

export function findConflicts(docs: DocWithText[]): ConflictResult[] {
  const groups = new Map<
    string,
    {
      type: 'date' | 'amount';
      key: string;
      label: string;
      byDoc: Map<
        string,
        {
          docId: string;
          docName: string;
          values: Map<string | number, { value: string | number; raw: string; snippet: string }>;
        }
      >;
    }
  >();

  for (const d of docs) {
    if (!d.text) continue;
    const m = mineText(d.text);
    for (const item of [...m.dates, ...m.amounts]) {
      if (!item.event) continue;
      const k = `${item.type}:${item.event}`;
      if (!groups.has(k)) {
        groups.set(k, { type: item.type, key: item.event, label: item.eventLabel, byDoc: new Map() });
      }
      const g = groups.get(k)!;
      if (!g.byDoc.has(d.id)) {
        g.byDoc.set(d.id, { docId: d.id, docName: d.name, values: new Map() });
      }
      const doc = g.byDoc.get(d.id)!;
      if (!doc.values.has(item.value)) {
        doc.values.set(item.value, { value: item.value, raw: item.raw, snippet: item.snippet });
      }
    }
  }

  const out: ConflictResult[] = [];
  for (const g of groups.values()) {
    const list = [...g.byDoc.values()];
    let clash = false;
    for (let i = 0; i < list.length && !clash; i++) {
      for (let j = i + 1; j < list.length && !clash; j++) {
        if (![...list[i].values.keys()].some((v) => list[j].values.has(v))) {
          clash = true;
        }
      }
    }
    if (clash) {
      out.push({
        type: g.type,
        key: g.key,
        label: g.label,
        docs: list.map((d) => ({
          docId: d.docId,
          docName: d.docName,
          items: [...d.values.values()],
        })),
      });
    }
  }

  return out.sort((a, b) => (a.type === b.type ? a.label.localeCompare(b.label) : a.type === 'date' ? -1 : 1));
}

export const cleanText = (t?: string): string =>
  String(t ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .normalize('NFC')
    .trim();
