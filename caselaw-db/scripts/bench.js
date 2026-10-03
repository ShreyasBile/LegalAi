/* Latency benchmark for the case-law API — run against a started API and a loaded database:
     npm start            (in one terminal)
     npm run bench        (in another)
   Sequential single-client latency, end to end over HTTP (includes the API's own SQL + JSON).
   Each query class uses several *different* parameter sets so one cached plan can't flatter the
   numbers, and every set is run in two passes: pass 1 (first touch) and pass 2 (immediate repeat).
   Raw timings go to BENCH_OUT (default bench-results.json) so the paper's numbers are reproducible. */
import { writeFileSync } from 'node:fs';

const BASE = process.env.CASELAW_API || 'http://localhost:8090';
const OUT = process.env.BENCH_OUT || 'bench-results.json';
const TIMEOUT_MS = 120_000;

async function get(path) {
  const t0 = performance.now();
  const res = await fetch(BASE + path, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  const body = await res.json();
  return { status: res.status, body, ms: performance.now() - t0 };
}
const search = qs => `/api/caselaw/search?${new URLSearchParams(qs)}`;

// ── setup (not timed): real identifiers so the exact-lookup classes hit rows that exist ──────────
const facets = (await get('/api/caselaw/facets')).body;
const hcCodes = facets.courts.filter(c => c.kind !== 'supreme').map(c => c.code);
const cnrs = [];
for (const code of hcCodes) {
  const r = (await get(search({ court: code }))).body.results.find(x => x.cnr);
  if (r) cnrs.push({ court: code, cnr: r.cnr });
}
const scCites = [];
for (const y of [1955, 1965, 1975, 1985, 1995, 2005, 2010, 2015, 2020, 2023]) {
  const r = (await get(search({ court: 'SC', yearFrom: y, yearTo: y }))).body.results.find(x => x.neutralCitation);
  if (r) scCites.push({ neutral: r.neutralCitation, reporter: r.citation });
}
const scWithReporter = scCites.filter(c => c.reporter);
// The outcome filter matches the *raw* source string (ALLOWED / Allowed / Allowed/Partly Allowed on merits …),
// so probe which values a court really uses instead of assuming — an empty result would time nothing useful.
const outcomeCandidates = ['DISMISSED', 'Dismissed', 'ALLOWED', 'Allowed', 'DISPOSED OF', 'Disposed Off', 'BAIL GRANTED'];
const outcomeTerms = ['bail', 'land acquisition', 'tax', 'service', 'appeal', 'state', 'order', 'petition'];
const outcomePairs = [];
for (const court of ['27~1', '9~13', '3~22', 'SC', '23~23']) {
  let found = 0;
  for (const outcome of outcomeCandidates) {
    if (found === 2) break;
    if ((await get(search({ court, outcome }))).body.total >= 100) { outcomePairs.push({ court, outcome }); found++; }
  }
}

// ── query classes ───────────────────────────────────────────────────────────────────────────────
const classes = {
  'browse (no query)':            [{}, { sort: 'oldest' }, { page: 50 }, { page: 500 }, { pageSize: 50 }, { sort: 'newest', page: 2 }].map(search),
  'filter only (court)':          hcCodes.slice(0, 12).map(c => search({ court: c })),
  'filter only (court+years)':    [['27~1', 2019, 2021], ['9~13', 2015, 2020], ['23~23', 2023, 2024], ['SC', 1990, 2000], ['SC', 2010, 2020], ['2~5', 2005, 2015]]
                                    .map(([court, yearFrom, yearTo]) => search({ court, yearFrom, yearTo })),
  'keyword, selective':           ['dowry', 'sedition', 'habeas corpus', 'bonded labour', 'lottery', 'trademark', 'copyright', 'excise duty', 'pension arrears', 'arbitrator appointment']
                                    .map(q => search({ q })),
  'keyword, common':              ['union of india', 'state of maharashtra', 'bail', 'writ petition', 'criminal appeal', 'land acquisition', 'commissioner of income tax', 'service matter']
                                    .map(q => search({ q })),
  'keyword + filters':            [['bail', '27~1', 2019, 2021], ['land acquisition', '9~13', 2015, 2022], ['dowry', 'SC', 1990, 2023], ['writ petition', '23~23', 2023, 2024],
                                   ['union of india', 'SC', 2000, 2020], ['anticipatory bail', '9~13', 2018, 2023]]
                                    .map(([q, court, yearFrom, yearTo]) => search({ q, court, yearFrom, yearTo })),
  'keyword + outcome filter':     outcomePairs.map((p, i) => search({ q: outcomeTerms[i % outcomeTerms.length], court: p.court, outcome: p.outcome })),
  'exact: CNR':                   cnrs.map(c => search({ q: c.cnr })),
  'exact: neutral citation':      scCites.map(c => search({ q: c.neutral })),
  'exact: reporter citation':     scWithReporter.map(c => search({ q: c.reporter })),
  'fuzzy (typo) fallback':        ['kesavananad', 'manaka ghandi', 'minerva mils', 'sajjan kumer', 'bachan sing', 'shreya singhall'].map(q => search({ q })),
  'case orders (per-case fetch)': cnrs.map(c => `/api/caselaw/case?court=${encodeURIComponent(c.court)}&cnr=${c.cnr}`),
};

// ── run ─────────────────────────────────────────────────────────────────────────────────────────
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.ceil(p / 100 * s.length) - 1)]; };
const fmt = ms => ms < 10 ? ms.toFixed(1) : ms < 1000 ? Math.round(ms) + '' : (ms / 1000).toFixed(2) + 's';
const results = { base: BASE, when: new Date().toISOString(), node: process.version, totalRows: facets.total, classes: {} };

// BENCH_ONLY="outcome,fuzzy" runs just the classes whose name contains one of those words. Note that
// pass 1 is only "first touch" on the first run after a database restart; a re-run is warmer.
const only = (process.env.BENCH_ONLY || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const selected = Object.entries(classes).filter(([name]) => !only.length || only.some(w => name.toLowerCase().includes(w)));

console.log(`Benchmarking ${BASE} — ${facets.total.toLocaleString('en-US')} rows, ${selected.length} classes\n`);
console.log('class'.padEnd(30), 'n'.padStart(3), '| pass1 p50  p95  max'.padEnd(26), '| pass2 p50  p95  max'.padEnd(26), '| results (capped/total)');
for (const [name, paths] of selected) {
  if (!paths.length) { console.log(name.padEnd(30), '  0  (no setup data)'); continue; }
  const rec = { paths, pass1: [], pass2: [], status: [], totals: [], capped: 0, fuzzy: 0, empty: 0, fallback1: 0, fallback2: 0 };
  for (const pass of ['pass1', 'pass2']) {
    for (const p of paths) {
      let r;
      try { r = await get(p); } catch (e) { r = { status: 0, body: {}, ms: TIMEOUT_MS }; }
      rec[pass].push(r.ms);
      if (r.body && r.body.sortFallback) rec[pass === 'pass1' ? 'fallback1' : 'fallback2']++;
      if (pass === 'pass1') {
        rec.status.push(r.status);
        const b = r.body || {};
        if (typeof b.total === 'number') rec.totals.push(b.total);
        if (b.totalCapped) rec.capped++;
        if (b.fuzzy) rec.fuzzy++;
        if (Array.isArray(b.results) ? b.results.length === 0 : (Array.isArray(b.orders) && b.orders.length === 0)) rec.empty++;
      }
    }
  }
  results.classes[name] = rec;
  const s = a => `${fmt(pct(a, 50)).padStart(6)} ${fmt(pct(a, 95)).padStart(6)} ${fmt(Math.max(...a)).padStart(6)}`;
  const bad = rec.status.filter(x => x !== 200).length;
  console.log(name.padEnd(30), String(paths.length).padStart(3), '|', s(rec.pass1), ' |', s(rec.pass2), ' |',
    `${rec.capped}/${paths.length} capped, ${rec.empty} empty${rec.fuzzy ? `, ${rec.fuzzy} fuzzy` : ''}${rec.fallback1 + rec.fallback2 ? `, fallback ${rec.fallback1}/${rec.fallback2}` : ''}${bad ? `, ${bad} NON-200` : ''}`);
}
writeFileSync(OUT, JSON.stringify(results, null, 1));
console.log(`\nraw timings → ${OUT}`);
