/* Pure helpers for the case-law search API — no I/O, so every rule here is
   unit-tested. The server (server.js) only wires these to HTTP + Postgres. */

export const PAGE_SIZE_DEFAULT = 20;
export const PAGE_SIZE_MAX = 50;
export const MAX_PAGE = 200;            // deep OFFSETs get slow; nobody pages past this
export const COUNT_CAP = 10000;         // "10,000+" — exact counts of huge sets are slow and useless
export const RANK_POOL = 5000;          // best-match ranks at most this many (newest) matches: scoring
                                        // 400k+ hits for a common phrase took 10 s; rare terms are still ranked exactly
const SUPP_VOLUMES = 20;                // supplementary S.C.R. volumes per year never exceed this in the corpus (max 10)

/* A SQL `date` as yyyy-mm-dd. server.js makes node-postgres return dates as text, so no timezone can shift them;
   a Date object (unit tests) is read in UTC. */
export function isoDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

export const BUCKETS = {
  'aws-sc': 'indian-supreme-court-judgments',
  'aws-hc': 'indian-high-court-judgments'
};

/* ── links to the ORIGINAL PDF in the public AWS bucket. We never store PDFs. ── */
export function pdfUrl(source, ref) {
  if (!ref || ref === 'unknown') return null;
  const bucket = BUCKETS[source];
  if (!bucket) return null;
  return `https://${bucket}.s3.ap-south-1.amazonaws.com/` + String(ref).split('/').map(encodeURIComponent).join('/');
}

/* ── parameter parsing: every value is clamped/whitelisted before it gets near SQL ── */
export function clampInt(v, min, max, dflt) {
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, n));
}

const COURT_RE = /^[A-Za-z0-9~_-]{1,12}$/;
const SORTS = new Set(['relevance', 'newest', 'oldest']);

export function normalizeParams(sp) {
  const get = k => (sp.get ? sp.get(k) : sp[k]) ?? '';
  const q = String(get('q')).replace(/\u0000/g, '').trim().slice(0, 200);     // Postgres text cannot hold NUL
  const court = COURT_RE.test(get('court')) ? get('court') : '';
  const yf = get('yearFrom') === '' ? null : clampInt(get('yearFrom'), 1800, 2100, null);
  const yt = get('yearTo') === '' ? null : clampInt(get('yearTo'), 1800, 2100, null);
  const clip = s => String(s).trim().slice(0, 60);
  return {
    q,
    court,
    yearFrom: yf,
    yearTo: yt,
    caseType: clip(get('caseType')),
    outcome: clip(get('outcome')),
    sort: SORTS.has(get('sort')) ? get('sort') : '',
    page: clampInt(get('page'), 1, MAX_PAGE, 1),
    pageSize: clampInt(get('pageSize'), 1, PAGE_SIZE_MAX, PAGE_SIZE_DEFAULT)
  };
}

/* ── what did the user type? exact identifiers get an exact-match fast path ── */
export function classifyQuery(raw) {
  const t = String(raw || '').trim();
  if (!t) return { kind: 'none' };
  const squashed = t.replace(/[\s-]/g, '');
  if (/^[A-Za-z]{4}\d{12}$/.test(squashed)) return { kind: 'cnr', value: squashed.toUpperCase() };      // e.g. SKHC010000222015
  const nc = t.match(/^(\d{4})\s*INSC\s*(\d+)$/i);                                                     // neutral citation
  if (nc) return { kind: 'neutral', value: `${nc[1]} INSC ${nc[2]}` };
  // [2021] 6 S.C.R. 527 · [1995] Supp. 2 S.C.R. 359 · [1973] Supp. S.C.R. 1 (supplement cited without its volume)
  const cit = t.match(/^\[(\d{4})\]\s*(SUPP\.?\s*)?(\d+)?\s*S\.?\s*C\.?\s*R\.?\s*(\d+)$/i);
  if (cit && (cit[2] || cit[3])) {
    const [, y, supp, vol, page] = cit;
    if (supp && !vol) return { kind: 'citation', values: Array.from({ length: SUPP_VOLUMES }, (_, i) => `[${y}] SUPP. ${i + 1} S.C.R. ${page}`) };
    return { kind: 'citation', value: `[${y}] ${supp ? 'SUPP. ' : ''}${vol} S.C.R. ${page}` };
  }
  return { kind: 'text', value: t };
}

/* ── build the search SQL. Returns the page query and a capped-count query. ── */
const SELECT = `
  cl.id, cl.source, cl.source_id, cl.court_code, c.name as court_name, cl.year, cl.decision_date,
  cl.cnr, cl.order_number, cl.case_number, cl.case_type, cl.citation, cl.neutral_citation,
  cl.title, cl.petitioner, cl.respondent, cl.judges, cl.disposal_nature, cl.snippet, cl.pdf_ref`;

export function buildSearch(p) {
  const kind = classifyQuery(p.q);
  const values = [];
  const where = [];
  const add = v => { values.push(v); return `$${values.length}`; };

  let tsq = null;
  if (kind.kind === 'cnr') where.push(`cl.cnr = ${add(kind.value)}`);
  else if (kind.kind === 'neutral') where.push(`cl.neutral_citation = ${add(kind.value)}`);
  else if (kind.kind === 'citation') where.push(kind.values ? `cl.citation = any(${add(kind.values)})` : `cl.citation = ${add(kind.value)}`);
  else if (kind.kind === 'text') {
    tsq = `websearch_to_tsquery('simple', f_unaccent(${add(kind.value)}))`;
    where.push(`cl.search @@ ${tsq}`);
  }
  // filters apply to browse + keyword searches; exact identifier lookups ignore them
  const exact = ['cnr', 'neutral', 'citation'].includes(kind.kind);
  if (!exact) {
    if (p.court) where.push(`cl.court_code = ${add(p.court)}`);
    if (p.yearFrom != null) where.push(`cl.year >= ${add(p.yearFrom)}`);
    if (p.yearTo != null) where.push(`cl.year <= ${add(p.yearTo)}`);
    if (p.caseType) where.push(`cl.case_type = ${add(p.caseType)}`);
    if (p.outcome) where.push(`cl.disposal_nature = ${add(p.outcome)}`);
  }

  let sort = p.sort;
  if (!sort) sort = tsq ? 'relevance' : 'newest';
  if (sort === 'relevance' && !tsq) sort = 'newest';
  // With a year filter, order by (year, date): that is the order of the (court, year, date) and
  // (year, date) indexes, so "Bombay 2019-2021, newest first" starts at 2021 instead of wading
  // through 2022-2026 first. year is the decision year, so the visible order is the same.
  const hasYear = !exact && (p.yearFrom != null || p.yearTo != null);
  const NEWEST = hasYear ? 'cl.year desc, cl.decision_date desc nulls last, cl.id desc' : 'cl.decision_date desc nulls last, cl.id desc';
  const OLDEST = hasYear ? 'cl.year asc, cl.decision_date asc nulls first, cl.id asc' : 'cl.decision_date asc nulls last, cl.id asc';
  const order = {
    relevance: `ts_rank(cl.search, ${tsq}) desc, ${NEWEST}`,
    newest: NEWEST,
    oldest: OLDEST
  }[sort];

  const whereSql = where.length ? `where ${where.join(' and ')}` : '';
  const offset = (p.page - 1) * p.pageSize;
  const n = values.length;
  // relevance: take the newest RANK_POOL matches (cheap, uses the date index), then score just those
  const pageSql = sort === 'relevance'
    ? `select ${SELECT} from (select cl.* from case_laws cl ${whereSql} order by ${NEWEST} limit ${RANK_POOL}) cl
         join courts c on c.code = cl.court_code order by ${order} limit $${n + 1} offset $${n + 2}`
    : `select ${SELECT} from case_laws cl join courts c on c.code = cl.court_code ${whereSql} order by ${order} limit $${n + 1} offset $${n + 2}`;
  return {
    kind: kind.kind,
    sort,
    rankPool: sort === 'relevance' ? RANK_POOL : null,
    pageSql,
    pageValues: [...values, p.pageSize + 1, offset],          // fetch one extra row to know if there is a next page
    countSql: `select count(*)::int as n from (select 1 from case_laws cl ${whereSql} limit ${COUNT_CAP + 1}) t`,
    countValues: [...values],
    // same query but always newest-first — used when a relevance sort times out
    newestSql: `select ${SELECT} from case_laws cl join courts c on c.code = cl.court_code ${whereSql} order by ${NEWEST} limit $${n + 1} offset $${n + 2}`
  };
}

/* typo matching is only fast for one or two short words (trigram index); a long phrase would
   compare against millions of titles, so those get "no results" straight away */
export function fuzzyEligible(q) {
  const t = String(q || '').trim();
  return t.length >= 3 && t.length <= 30 && t.split(/\s+/).length <= 2;
}

/* fuzzy fallback for typos — only used when a keyword search finds nothing */
export function buildFuzzy(q, pageSize = PAGE_SIZE_DEFAULT, p = {}) {
  const values = [String(q).slice(0, 100), pageSize];
  const where = ['$1 <% cl.title'];
  const add = v => { values.push(v); return `$${values.length}`; };
  // the user's filters still apply: "similar names" must not leak in from other courts / years
  if (p.court) where.push(`cl.court_code = ${add(p.court)}`);
  if (p.yearFrom != null) where.push(`cl.year >= ${add(p.yearFrom)}`);
  if (p.yearTo != null) where.push(`cl.year <= ${add(p.yearTo)}`);
  if (p.caseType) where.push(`cl.case_type = ${add(p.caseType)}`);
  if (p.outcome) where.push(`cl.disposal_nature = ${add(p.outcome)}`);
  return {
    sql: `select ${SELECT} from case_laws cl join courts c on c.code = cl.court_code
          where ${where.join(' and ')} order by word_similarity($1, cl.title) desc, cl.decision_date desc nulls last limit $2`,
    values
  };
}

/* ── tidy the judge string: "HON'BLE MRS. JUSTICE MEENAKSHI MADAN RAI" -> "Meenakshi Madan Rai" ── */
export function cleanJudges(raw) {
  if (!raw) return null;
  let s = String(raw).replace(/\s+/g, ' ').trim();
  const stripped = s
    .replace(/HON[’']?BLE/gi, ' ')
    .replace(/\bTHE\b/gi, ' ')
    .replace(/\b(MR|MRS|MS|SHRI|SMT|DR)\.?(?=\s)/gi, ' ')
    .replace(/\bJUSTICE\b/gi, ' ')
    .replace(/\bJ\.?\s*$/i, ' ')
    .replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ').replace(/^[,\s]+|[,\s]+$/g, '');
  if (!stripped) return s;
  const letters = stripped.replace(/[^A-Za-z]/g, '');
  const allCaps = letters && letters === letters.toUpperCase();
  const out = allCaps ? stripped.toLowerCase().replace(/\b([a-z])/g, m => m.toUpperCase()) : stripped;
  return out.slice(0, 120);
}

/* ── one court case can have several orders (rows). Collapse them into one card. ── */
export function groupOrders(rows, pageSize) {
  const cards = new Map();
  for (const r of rows.slice(0, pageSize)) {
    const key = `${r.court_code}|${r.cnr || r.source_id}`;
    const order = {
      id: String(r.id),
      date: isoDate(r.decision_date),
      orderNumber: r.order_number || null,
      outcome: r.disposal_nature || null,
      pdfUrl: pdfUrl(r.source, r.pdf_ref)
    };
    const hit = cards.get(key);
    if (hit) { hit.orders.push(order); continue; }
    cards.set(key, {
      key,
      source: r.source,
      courtCode: r.court_code,
      courtName: r.court_name,
      year: r.year,
      title: r.title,
      caseNumber: r.case_number || null,
      caseType: r.case_type || null,
      citation: r.citation || null,
      neutralCitation: r.neutral_citation || null,
      petitioner: r.petitioner || null,
      respondent: r.respondent || null,
      judges: cleanJudges(r.judges),
      outcome: r.disposal_nature || null,
      snippet: r.snippet || null,
      cnr: r.cnr || null,
      decisionDate: order.date,
      pdfUrl: order.pdfUrl,
      orders: [order]
    });
  }
  const out = [...cards.values()];
  for (const c of out) c.orders.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return out;
}
