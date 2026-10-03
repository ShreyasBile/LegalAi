import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pdfUrl, clampInt, normalizeParams, classifyQuery, buildSearch, buildFuzzy, fuzzyEligible, cleanJudges, groupOrders, isoDate,
  PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX, MAX_PAGE
} from '../api/lib.js';

const sp = obj => new URLSearchParams(obj);

/* ── PDF links ──────────────────────────────────────────────────────────── */
test('pdfUrl builds the public bucket link for SC and HC', () => {
  assert.equal(pdfUrl('aws-sc', 'data/pdf/year=2021/english/2021_6_527_534_EN.pdf'),
    'https://indian-supreme-court-judgments.s3.ap-south-1.amazonaws.com/data/pdf/year%3D2021/english/2021_6_527_534_EN.pdf');
  assert.match(pdfUrl('aws-hc', 'data/pdf/year=2017/court=11_24/bench=sikkimhc_pg/SKHC010000012017_1_2017-05-23.pdf'),
    /^https:\/\/indian-high-court-judgments\.s3\.ap-south-1\.amazonaws\.com\/data\/pdf\/year%3D2017\/court%3D11_24\/bench%3Dsikkimhc_pg\//);
});
test('pdfUrl returns null when there is nothing to link to', () => {
  assert.equal(pdfUrl('aws-sc', 'unknown'), null);
  assert.equal(pdfUrl('aws-sc', null), null);
  assert.equal(pdfUrl('nope', 'x/y.pdf'), null);
});
test('pdfUrl cannot be tricked into another host', () => {
  const u = pdfUrl('aws-hc', '../../evil.com/x.pdf');
  assert.ok(u.startsWith('https://indian-high-court-judgments.s3.ap-south-1.amazonaws.com/'));
});

/* ── parameter parsing ─────────────────────────────────────────────────── */
test('clampInt clamps and defaults', () => {
  assert.equal(clampInt('5', 1, 10, 1), 5);
  assert.equal(clampInt('999', 1, 10, 1), 10);
  assert.equal(clampInt('-4', 1, 10, 1), 1);
  assert.equal(clampInt('abc', 1, 10, 7), 7);
});
test('normalizeParams applies safe defaults', () => {
  const p = normalizeParams(sp({}));
  assert.deepEqual([p.q, p.court, p.yearFrom, p.yearTo, p.page, p.pageSize], ['', '', null, null, 1, PAGE_SIZE_DEFAULT]);
});
test('normalizeParams clamps page size, page and years', () => {
  const p = normalizeParams(sp({ pageSize: '5000', page: '99999', yearFrom: '1', yearTo: '99999' }));
  assert.equal(p.pageSize, PAGE_SIZE_MAX);
  assert.equal(p.page, MAX_PAGE);
  assert.equal(p.yearFrom, 1800);
  assert.equal(p.yearTo, 2100);
});
test('normalizeParams rejects a malformed court code and unknown sort', () => {
  const p = normalizeParams(sp({ court: "27~1'; drop table case_laws;--", sort: 'random' }));
  assert.equal(p.court, '');
  assert.equal(p.sort, '');
  assert.equal(normalizeParams(sp({ court: '27~1' })).court, '27~1');
});
test('normalizeParams trims and caps free text', () => {
  const p = normalizeParams(sp({ q: '  ' + 'x'.repeat(500) + '  ', caseType: 'y'.repeat(200) }));
  assert.equal(p.q.length, 200);
  assert.equal(p.caseType.length, 60);
});

/* ── what the user typed ───────────────────────────────────────────────── */
test('classifyQuery: exact identifiers', () => {
  assert.deepEqual(classifyQuery('mhcc010012342026'), { kind: 'cnr', value: 'MHCC010012342026' });
  assert.deepEqual(classifyQuery('SKHC-010000-222015'), { kind: 'cnr', value: 'SKHC010000222015' });
  assert.deepEqual(classifyQuery('2021insc306'), { kind: 'neutral', value: '2021 INSC 306' });
  assert.deepEqual(classifyQuery('2021 INSC 306'), { kind: 'neutral', value: '2021 INSC 306' });
  assert.deepEqual(classifyQuery('[2021] 6 SCR 527'), { kind: 'citation', value: '[2021] 6 S.C.R. 527' });
  assert.deepEqual(classifyQuery('[2021]6 s.c.r. 527'), { kind: 'citation', value: '[2021] 6 S.C.R. 527' });
});
test('classifyQuery: supplementary S.C.R. citations, with and without the volume number', () => {
  assert.deepEqual(classifyQuery('[1995] SUPP. 2 S.C.R. 359'), { kind: 'citation', value: '[1995] SUPP. 2 S.C.R. 359' });
  assert.deepEqual(classifyQuery('[1995] Supp 2 SCR 359'), { kind: 'citation', value: '[1995] SUPP. 2 S.C.R. 359' });
  const noVol = classifyQuery('[1973] Supp. S.C.R. 1');
  assert.equal(noVol.kind, 'citation');
  assert.equal(noVol.values[0], '[1973] SUPP. 1 S.C.R. 1');
  assert.ok(noVol.values.includes('[1973] SUPP. 10 S.C.R. 1'));
  assert.equal(classifyQuery('[2021] SCR 527').kind, 'text');            // neither a volume nor Supp.: not a citation
});
test('buildSearch: a supplement cited without its volume matches any supplementary volume', () => {
  const s = buildSearch(normalizeParams(sp({ q: '[1973] Supp. S.C.R. 1' })));
  assert.match(s.pageSql, /cl\.citation = any\(\$1\)/);
  assert.ok(Array.isArray(s.pageValues[0]));
});
test('isoDate never shifts a SQL date (text from the driver) and reads Date objects in UTC', () => {
  assert.equal(isoDate('1973-04-24'), '1973-04-24');
  assert.equal(isoDate(new Date('1973-04-24T00:00:00Z')), '1973-04-24');
  assert.equal(isoDate(null), null);
});
test('normalizeParams strips NUL characters, which Postgres text cannot store', () => {
  assert.equal(normalizeParams(sp({ q: 'bail\u0000' })).q, 'bail');
});
test('classifyQuery: ordinary text and empty', () => {
  assert.deepEqual(classifyQuery('anticipatory bail'), { kind: 'text', value: 'anticipatory bail' });
  assert.deepEqual(classifyQuery('   '), { kind: 'none' });
  assert.equal(classifyQuery('State of Sikkim v. Rai').kind, 'text');
});

/* ── SQL building ──────────────────────────────────────────────────────── */
test('buildSearch: text query is parameterised, never concatenated', () => {
  const evil = "x'); drop table case_laws; --";
  const s = buildSearch(normalizeParams(sp({ q: evil })));
  assert.ok(!s.pageSql.includes('drop table'));
  assert.ok(s.pageValues.includes(evil));
  assert.match(s.pageSql, /websearch_to_tsquery\('simple', f_unaccent\(\$1\)\)/);
});
test('buildSearch: default is newest-first browse with no where clause', () => {
  const s = buildSearch(normalizeParams(sp({})));
  assert.equal(s.sort, 'newest');
  assert.ok(!/\bwhere\b/i.test(s.countSql.replace('select 1 from case_laws cl', '')));
  assert.match(s.pageSql, /order by cl\.decision_date desc nulls last/);
});
test('buildSearch: text query defaults to relevance; relevance without text falls back to newest', () => {
  assert.equal(buildSearch(normalizeParams(sp({ q: 'dowry' }))).sort, 'relevance');
  assert.equal(buildSearch(normalizeParams(sp({ sort: 'relevance' }))).sort, 'newest');
  assert.equal(buildSearch(normalizeParams(sp({ q: 'dowry', sort: 'oldest' }))).sort, 'oldest');
});
test('buildSearch: filters become numbered parameters in order', () => {
  const s = buildSearch(normalizeParams(sp({ q: 'bail', court: '27~1', yearFrom: '2015', yearTo: '2020', caseType: 'WP', outcome: 'Allowed' })));
  assert.deepEqual(s.countValues, ['bail', '27~1', 2015, 2020, 'WP', 'Allowed']);
  assert.match(s.pageSql, /cl\.court_code = \$2 and cl\.year >= \$3 and cl\.year <= \$4 and cl\.case_type = \$5 and cl\.disposal_nature = \$6/);
});
test('buildSearch: pagination fetches one extra row and computes offset', () => {
  const s = buildSearch(normalizeParams(sp({ page: '3', pageSize: '20' })));
  assert.deepEqual(s.pageValues.slice(-2), [21, 40]);
});
test('buildSearch: exact identifiers use equality and ignore filters', () => {
  const c = buildSearch(normalizeParams(sp({ q: 'MHCC010012342026', court: '27~1', yearFrom: '2020' })));
  assert.equal(c.kind, 'cnr');
  assert.match(c.pageSql, /cl\.cnr = \$1/);
  assert.deepEqual(c.countValues, ['MHCC010012342026']);
  const n = buildSearch(normalizeParams(sp({ q: '2021 INSC 306' })));
  assert.match(n.pageSql, /cl\.neutral_citation = \$1/);
});
test('buildSearch: the count query is capped so huge result sets stay fast', () => {
  assert.match(buildSearch(normalizeParams(sp({ q: 'union' }))).countSql, /limit 10001\)/);
});
test('buildSearch: a year filter orders by (year, date) so the year-aware indexes can serve it', () => {
  const n = buildSearch(normalizeParams(sp({ court: '27~1', yearFrom: '2019', yearTo: '2021' })));
  assert.match(n.pageSql, /order by cl\.year desc, cl\.decision_date desc nulls last, cl\.id desc limit/);
  const o = buildSearch(normalizeParams(sp({ yearFrom: '2019', sort: 'oldest' })));
  assert.match(o.pageSql, /order by cl\.year asc, cl\.decision_date asc nulls first, cl\.id asc limit/);
  // without a year filter the plain date order (and its indexes) is used
  assert.match(buildSearch(normalizeParams(sp({ court: '27~1' }))).pageSql, /order by cl\.decision_date desc nulls last, cl\.id desc limit/);
});
test('buildFuzzy: parameterised and length-capped', () => {
  const f = buildFuzzy('y'.repeat(500), 10);
  assert.equal(f.values[0].length, 100);
  assert.equal(f.values[1], 10);
  assert.match(f.sql, /\$1 <% cl\.title/);
});

test('buildFuzzy: keeps the active filters so similar names do not leak in from other courts', () => {
  const f = buildFuzzy('dowri', 20, normalizeParams(sp({ q: 'dowri', court: '27~1', yearFrom: '2020', outcome: 'Allowed' })));
  assert.deepEqual(f.values, ['dowri', 20, '27~1', 2020, 'Allowed']);
  assert.match(f.sql, /cl\.court_code = \$3 and cl\.year >= \$4 and cl\.disposal_nature = \$5/);
});
test('fuzzyEligible: only short one/two-word queries get typo matching', () => {
  assert.equal(fuzzyEligible('kesavnanda'), true);
  assert.equal(fuzzyEligible('maneka gandi'), true);
  assert.equal(fuzzyEligible('section 498a cruelty'), false);
  assert.equal(fuzzyEligible('x'.repeat(40)), false);
  assert.equal(fuzzyEligible('ab'), false);
});
test('buildSearch: relevance ranks a bounded pool of the newest matches', () => {
  const s = buildSearch(normalizeParams(sp({ q: 'union of india' })));
  assert.equal(s.rankPool, 5000);
  assert.match(s.pageSql, /order by cl\.decision_date desc nulls last, cl\.id desc limit 5000\) cl/);
  assert.equal(buildSearch(normalizeParams(sp({ q: 'union of india', sort: 'newest' }))).rankPool, null);
});

/* ── judge tidy-up ─────────────────────────────────────────────────────── */
test('cleanJudges strips honorifics and fixes capitalisation', () => {
  assert.equal(cleanJudges("HON'BLE MRS. JUSTICE MEENAKSHI MADAN RAI"), 'Meenakshi Madan Rai');
  assert.equal(cleanJudges("HON'BLE THE CHIEF JUSTICE,HON'BLE MRS. JUSTICE MEENAKSHI MADAN RAI"), 'Chief, Meenakshi Madan Rai');
  assert.equal(cleanJudges('INDIRA BANERJEE'), 'Indira Banerjee');
  assert.equal(cleanJudges('M.R. SHAH, A.S. BOPANNA'), 'M.R. Shah, A.S. Bopanna');
});
test('cleanJudges handles empty and never returns blank', () => {
  assert.equal(cleanJudges(null), null);
  assert.equal(cleanJudges(''), null);
  assert.ok(cleanJudges("HON'BLE JUSTICE").length > 0);
});

/* ── collapsing several orders of one case into one card ───────────────── */
const row = (o = {}) => ({
  id: 1, source: 'aws-hc', source_id: 'A_1_2019-01-01', court_code: '27~1', court_name: 'Bombay High Court',
  year: 2019, decision_date: new Date('2019-01-01'), cnr: 'MHHC010000012019', order_number: '1',
  case_number: 'WP/1/2019', case_type: 'WP', citation: null, neutral_citation: null,
  title: 'WP/1/2019 of A Vs B', petitioner: 'A', respondent: 'B', judges: 'JUSTICE X', disposal_nature: 'Disposed Off',
  snippet: 'snip', pdf_ref: 'data/pdf/year=2019/court=27_1/bench=b/A_1_2019-01-01.pdf', ...o
});
test('groupOrders merges orders of the same case into one card, newest order first', () => {
  const cards = groupOrders([
    row({ id: 1, decision_date: new Date('2019-01-01'), order_number: '1' }),
    row({ id: 2, decision_date: new Date('2019-06-01'), order_number: '2', source_id: 'A_2_2019-06-01' }),
    row({ id: 3, decision_date: new Date('2020-02-02'), order_number: '3', source_id: 'A_3_2020-02-02' })
  ], 20);
  assert.equal(cards.length, 1);
  assert.deepEqual(cards[0].orders.map(o => o.orderNumber), ['3', '2', '1']);
  assert.equal(cards[0].orders[0].date, '2020-02-02');
});
test('groupOrders keeps different cases separate, including same CNR in another court', () => {
  const cards = groupOrders([row({ id: 1 }), row({ id: 2, cnr: 'OTHER000000000001' }), row({ id: 3, court_code: '9~13' })], 20);
  assert.equal(cards.length, 3);
});
test('groupOrders ignores the extra look-ahead row', () => {
  const rows = Array.from({ length: 21 }, (_, i) => row({ id: i, cnr: `C${i}` }));
  assert.equal(groupOrders(rows, 20).length, 20);
});
test('groupOrders falls back to source_id when a row has no CNR', () => {
  const cards = groupOrders([row({ id: 1, cnr: null, source_id: 'a' }), row({ id: 2, cnr: null, source_id: 'b' })], 20);
  assert.equal(cards.length, 2);
});
test('groupOrders tolerates a missing date and a missing pdf ref', () => {
  const [c] = groupOrders([row({ decision_date: null, pdf_ref: 'unknown' })], 20);
  assert.equal(c.pdfUrl, null);
  assert.equal(c.orders[0].date, null);
});
test('groupOrders cleans judges on the card', () => {
  assert.equal(groupOrders([row({ judges: "HON'BLE MR. JUSTICE ABC DEF" })], 20)[0].judges, 'Abc Def');
});
