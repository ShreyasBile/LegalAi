/* Pure eCourts HTML -> structured case-status parser.
   This is the single most fragile part of the whole system: when eCourts changes
   their markup, THIS is what breaks. So it's isolated, pure, and covered by
   fixture tests + a runtime health check. It never returns partial garbage — it
   either returns clean data, a clean not-found, or throws ParseError (drift).

   The SAME function parses fixture HTML and live-scraped HTML, so the fixture
   tests genuinely exercise the production parsing path. */

export class ParseError extends Error {
  constructor(message, detail) {
    super(message);
    this.name = 'ParseError';
    this.detail = detail;
  }
}

/* ── tiny HTML helpers (no dependency) ─────────────────────────────────── */
function decodeEntities(s) {
  return String(s)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}
function stripTags(s) {
  return decodeEntities(String(s).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}
function tablesByClass(html, token) {
  const out = [];
  const re = /<table\b([^>]*)>([\s\S]*?)<\/table>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1] || '';
    if (!token || new RegExp(`class\\s*=\\s*["'][^"']*\\b${token}\\b`, 'i').test(attrs)) {
      out.push(m[2]);
    }
  }
  return out;
}
function rows(tableInner) {
  const out = [];
  const re = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = re.exec(tableInner))) out.push(m[1]);
  return out;
}
function cells(rowInner, tag = 'td') {
  const out = [];
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  let m;
  while ((m = re.exec(rowInner))) out.push(stripTags(m[1]));
  return out;
}

/* ── date normalization ─────────────────────────────────────────────────
   eCourts mixes "03-09-2026" (dd-mm-yyyy) and "11th September 2026". Return a
   plain ISO yyyy-mm-dd, or null if it can't be parsed (never guesses). */
const MONTHS = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
const pad = n => String(n).padStart(2, '0');
export function toIso(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  let m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/); // dd-mm-yyyy
  if (m) { const [_, d, mo, y] = m; if (+mo >= 1 && +mo <= 12 && +d >= 1 && +d <= 31) return `${y}-${pad(+mo)}-${pad(+d)}`; }
  m = s.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})/); // 11th September 2026
  if (m) { const mo = MONTHS[m[2].toLowerCase()]; if (mo) return `${m[3]}-${pad(mo)}-${pad(+m[1])}`; }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/); // already iso
  if (m) return s;
  return null;
}

/* ── not-found detection ────────────────────────────────────────────────── */
const NOT_FOUND_RE = /(does not exist|record not found|no record found|case code does not|invalid case)/i;

/* ── main parse ─────────────────────────────────────────────────────────── */
export function parseCaseStatus(html) {
  if (typeof html !== 'string' || html.length < 20) {
    throw new ParseError('empty or too-short document', { length: html?.length ?? 0 });
  }

  const detailTables = tablesByClass(html, 'case_details_table');
  if (detailTables.length === 0) {
    if (NOT_FOUND_RE.test(stripTags(html))) return { found: false, reason: 'not_found' };
    // No details table AND no not-found marker => the page is not what we expect.
    throw new ParseError('no case_details_table and no not-found marker', { sample: stripTags(html).slice(0, 160) });
  }

  // Build a label->value map from the details + status tables.
  const statusTables = tablesByClass(html, 'case_status_table');
  const label = {};
  for (const t of [...detailTables, ...statusTables]) {
    for (const r of rows(t)) {
      const c = cells(r, 'td');
      if (c.length >= 2 && c[0]) label[c[0].toLowerCase().replace(/\s+/g, ' ').trim()] = c[1];
    }
  }

  // Anchor fields — if the table exists but these moved, that's drift, not "no data".
  const cnrRaw = label['cnr number'] || '';
  const cnrMatch = cnrRaw.match(/[A-Z]{2}[A-Z0-9]{2}\d{12}/i);
  const caseType = label['case type'];
  if (!cnrMatch || !caseType) {
    throw new ParseError('case_details_table present but CNR/Case Type anchors missing', {
      haveCnr: !!cnrMatch, haveCaseType: !!caseType, labels: Object.keys(label)
    });
  }

  const decisionDate = label['decision date'] || null;
  const nextHearing = label['next hearing date'] || label['next hearing / purpose'] || null;

  const status = {
    stage: label['case stage'] || null,
    firstHearingDate: label['first hearing date'] || null,
    firstHearingDateIso: toIso(label['first hearing date']),
    nextHearingDate: nextHearing,
    nextHearingDateIso: toIso(nextHearing),
    decisionDate,
    decisionDateIso: toIso(decisionDate),
    natureOfDisposal: label['nature of disposal'] || null,
    courtAndJudge: label['court number and judge'] || null,
    disposed: !!decisionDate || /disposed|decided/i.test(label['case stage'] || '')
  };

  return {
    found: true,
    cnr: cnrMatch[0].toUpperCase(),
    caseType,
    filingNumber: label['filing number'] || null,
    filingDate: label['filing date'] || null,
    filingDateIso: toIso(label['filing date']),
    registrationNumber: label['registration number'] || null,
    registrationDate: label['registration date'] || null,
    registrationDateIso: toIso(label['registration date']),
    status,
    parties: {
      petitioners: parseParties(tablesByClass(html, 'Petitioner_Advocate_table')),
      respondents: parseParties(tablesByClass(html, 'Respondent_Advocate_table'))
    },
    orders: parseOrders(tablesByClass(html, 'order_table'))
  };
}

function parseParties(tables) {
  const out = [];
  for (const t of tables) {
    for (const r of rows(t)) {
      const text = cells(r, 'td').join(' ').trim();
      if (!text) continue;
      const cleaned = text.replace(/^\s*\d+\)\s*/, '');
      const [namePart, adv] = cleaned.split(/advocate\s*-\s*/i);
      out.push({ name: (namePart || '').trim(), advocate: adv ? adv.trim() : null });
    }
  }
  return out;
}

function parseOrders(tables) {
  const out = [];
  for (const t of tables) {
    for (const r of rows(t)) {
      if (/<th\b/i.test(r)) continue; // skip header
      const c = cells(r, 'td');
      if (c.length < 3) continue;
      out.push({ orderNumber: c[0] || null, date: c[1] || null, dateIso: toIso(c[1]), details: c[2] || null });
    }
  }
  return out;
}
