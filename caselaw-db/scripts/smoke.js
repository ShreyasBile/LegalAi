/* Live smoke test — run against a started API and a loaded database:
     npm start          (in one terminal)
     npm run smoke      (in another)
   Unit tests (npm test) cover the pure logic; this checks the real service end-to-end. */
const BASE = process.env.CASELAW_API || 'http://localhost:8090';
const PDF_HOST = /^https:\/\/indian-(supreme|high)-court-judgments\.s3\.ap-south-1\.amazonaws\.com\//;

let pass = 0, fail = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); pass++; console.log(`  ok   ${name}`); }
  catch (e) { fail++; failures.push(name); console.log(`  FAIL ${name}\n         ${e.message}`); }
}
const ok = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };
const get = async (path, init) => {
  const t0 = Date.now();
  const res = await fetch(BASE + path, init);
  let body = null; try { body = await res.json(); } catch { /* empty body */ }
  return { res, body, ms: Date.now() - t0 };
};
const search = qs => get(`/api/caselaw/search?${new URLSearchParams(qs)}`);

console.log(`Smoke-testing ${BASE}\n`);

await check('health: service and database are up', async () => {
  const { res, body } = await get('/health');
  ok(res.status === 200 && body.status === 'ok' && body.db === 'up', JSON.stringify(body));
});

let facets;
await check('facets: courts, case types, outcomes, years, total', async () => {
  const { res, body } = await get('/api/caselaw/facets');
  ok(res.status === 200 && body.ready, 'facets not ready');
  facets = body;
  ok(body.courts.length >= 26, `only ${body.courts.length} courts`);
  ok(body.courts.some(c => c.kind === 'supreme'), 'no Supreme Court');
  ok(body.caseTypes.length > 10 && body.outcomes.length > 5, 'thin filters');
  ok(body.years.min < 1960 && body.years.max >= 2025, 'year range');
  ok(body.total > 10_000_000, `total ${body.total}`);
});

await check('browse: newest-first, one page, fast', async () => {
  const { body, ms } = await search({});
  ok(body.results.length > 0 && body.results.length <= 20, `n=${body.results.length}`);
  ok(body.hasMore === true, 'hasMore');
  ok(ms < 2000, `${ms} ms`);
  const dates = body.results.map(r => r.decisionDate).filter(Boolean);
  ok(dates.every((d, i) => i === 0 || d <= dates[i - 1]), 'not newest-first');
});

await check('keyword: rare word is exact and fast', async () => {
  const { body, ms } = await search({ q: 'dowry' });
  ok(body.total > 0 && body.total < 10000 && !body.totalCapped, `total ${body.total}`);
  ok(ms < 2000, `${ms} ms`);
});

await check('keyword: very common phrase still answers (ranked pool, capped count)', async () => {
  const { body, ms } = await search({ q: 'union of india' });
  ok(body.results.length === 20, `n=${body.results.length}`);
  ok(body.totalCapped === true && body.total === 10000, 'count should be capped');
  ok(body.rankedAmong === 5000, `rankedAmong=${body.rankedAmong} sort=${body.sort} fallback=${body.sortFallback} total=${body.total}`);
  ok(ms < 15000, `${ms} ms`);
});

await check('known case: Kesavananda Bharati (Supreme Court, 1973) with PDF link', async () => {
  const { body } = await search({ q: 'kesavananda bharati' });
  const c = body.results.find(r => r.courtCode === 'SC' && r.year === 1973);
  ok(c, 'not found');
  ok(c.neutralCitation === '1973 INSC 91', c.neutralCitation);
  ok(c.decisionDate === '1973-04-24', `decisionDate ${c.decisionDate} (must not shift a day)`);
  ok(PDF_HOST.test(c.pdfUrl || ''), c.pdfUrl);
});
await check('exact lookup: supplementary S.C.R. citation, with and without its volume number', async () => {
  const a = (await search({ q: '[1973] Supp. 1 S.C.R. 1' })).body;
  ok(a.results.length === 1 && a.results[0].neutralCitation === '1973 INSC 91', JSON.stringify(a.results.map(r => r.citation)));
  const b = (await search({ q: '[1973] Supp. S.C.R. 1' })).body;
  ok(b.results.some(r => r.neutralCitation === '1973 INSC 91'), 'volume-less supplement citation not resolved');
});

await check('exact lookup: neutral citation', async () => {
  const { body } = await search({ q: '2021 INSC 306' });
  ok(body.results.length === 1 && body.results[0].neutralCitation === '2021 INSC 306', JSON.stringify(body.results.map(r => r.neutralCitation)));
});
await check('exact lookup: reporter citation', async () => {
  const { body } = await search({ q: '[2021] 6 S.C.R. 527' });
  ok(body.results.length >= 1 && body.results[0].citation === '[2021] 6 S.C.R. 527', 'not found');
});
await check('exact lookup: CNR number', async () => {
  const first = (await search({ court: '27~1' })).body.results.find(r => r.cnr);
  const { body } = await search({ q: first.cnr });
  ok(body.results.length >= 1 && body.results.every(r => r.cnr === first.cnr), 'CNR not matched');
});

await check('typo: one-word misspelling falls back to similar names', async () => {
  const { body } = await search({ q: 'kesavananad' });
  ok(body.fuzzy === true && body.results.length > 0, `fuzzy=${body.fuzzy} n=${body.results.length}`);
});
await check('typo fallback respects filters (no leakage from other courts)', async () => {
  const { body } = await search({ q: 'kesavananad', court: '27~1' });
  ok(body.results.every(r => r.courtCode === '27~1'), 'leaked another court');
});
await check('no match: long phrase returns empty quickly, not a hang', async () => {
  const { body, ms } = await search({ q: 'zzzqxvjk wwwppl mmmnnb' });
  ok(body.results.length === 0 && ms < 3000, `${ms} ms`);
});

await check('filters: court + year range + outcome are all honoured', async () => {
  const { body } = await search({ court: '27~1', yearFrom: '2019', yearTo: '2021', outcome: 'ALLOWED' });
  ok(body.results.length > 0, 'no results');
  ok(body.results.every(r => r.courtCode === '27~1' && r.year >= 2019 && r.year <= 2021 && (r.outcome || '').toUpperCase() === 'ALLOWED'), 'a result broke a filter');
});
await check('sort: oldest-first puts an early year first', async () => {
  const { body } = await search({ sort: 'oldest' });
  ok(body.results[0].year <= 1955, `first year ${body.results[0].year}`);
});
await check('pagination: page 2 differs from page 1 and has no overlap', async () => {
  const a = (await search({ court: '9~13', pageSize: 10 })).body, b = (await search({ court: '9~13', pageSize: 10, page: 2 })).body;
  const ka = new Set(a.results.map(r => r.key));
  ok(b.page === 2 && b.results.length > 0 && b.results.every(r => !ka.has(r.key)), 'overlap or empty');
});
await check('deep page stays fast', async () => {
  const { body, ms } = await search({ page: 50 });
  ok(body.page === 50 && ms < 3000, `${ms} ms`);
});

await check('bad input is clamped, never a 500', async () => {
  for (const qs of [{ page: '-5' }, { pageSize: '99999' }, { yearFrom: 'abc', yearTo: '99999' }, { sort: 'bogus' }, { page: '1e9' }]) {
    const { res, body } = await search(qs);
    ok(res.status === 200, `${JSON.stringify(qs)} -> ${res.status}`);
    ok(body.results.length <= 50, 'pageSize not clamped');
  }
});
await check('injection strings are inert', async () => {
  const evil = ["'; drop table case_laws; --", '" or 1=1 --', '\\', '%00', "x') union select 1 --", '<script>alert(1)</script>', '& | ! ( ) :*'];
  for (const q of evil) {
    const { res } = await search({ q, court: q, caseType: q, outcome: q });
    ok(res.status === 200, `${JSON.stringify(q)} -> ${res.status}`);
  }
  const { body } = await get('/health'); ok(body.db === 'up', 'db gone?!');
  const { body: s } = await search({});
  ok(s.results.length > 0, 'table damaged?!');
});
await check('very long and empty queries are fine', async () => {
  ok((await search({ q: 'a'.repeat(5000) })).res.status === 200, 'long');
  ok((await search({ q: '   ' })).res.status === 200, 'blank');
});

await check('every PDF link points at the public archive host', async () => {
  const { body } = await search({ q: 'state' });
  for (const c of body.results) for (const o of c.orders) ok(o.pdfUrl === null || PDF_HOST.test(o.pdfUrl), o.pdfUrl);
});

await check('case orders: all orders of a High Court case, newest first', async () => {
  const c = (await search({ court: '27~1' })).body.results.find(r => r.cnr);
  const { res, body } = await get(`/api/caselaw/case?court=${encodeURIComponent(c.courtCode)}&cnr=${c.cnr}`);
  ok(res.status === 200 && body.orders.length >= 1, 'no orders');
  const d = body.orders.map(o => o.date).filter(Boolean);
  ok(d.every((x, i) => i === 0 || x <= d[i - 1]), 'not newest-first');
});
await check('case orders: rejects malformed ids', async () => {
  ok((await get('/api/caselaw/case?court=%27%3Bdrop&cnr=x')).res.status === 400, 'bad court');
  ok((await get('/api/caselaw/case')).res.status === 400, 'missing params');
});

await check('HTTP: CORS preflight, method guard, 404', async () => {
  const o = await get('/api/caselaw/search', { method: 'OPTIONS' });
  ok(o.res.status === 204 && o.res.headers.get('access-control-allow-origin') === '*', 'preflight');
  ok((await get('/api/caselaw/search', { method: 'POST' })).res.status === 405, 'POST allowed?');
  ok((await get('/nope')).res.status === 404, '404');
});

console.log(`\n${pass} passed, ${fail} failed${fail ? `: ${failures.join(' | ')}` : ''}`);
process.exit(fail ? 1 : 0);
