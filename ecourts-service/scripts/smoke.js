/* Human-readable end-to-end walkthrough. Boots the real server on an ephemeral
   port and exercises every scenario over HTTP, printing a pass/fail table.
   Run: npm run smoke */
import { buildServer } from '../src/server.js';

const KEY = { 'x-api-key': 'demo-key-firm-a' };
const ADMIN = { 'x-admin-key': 'demo-admin-key' };

const built = buildServer({ rateLimitPerMin: 100 });
await new Promise(r => built.server.listen(0, r));
const base = `http://127.0.0.1:${built.server.address().port}`;

async function call(method, path, headers = {}, origin = base) {
  const res = await fetch(origin + path, { method, headers });
  let body; try { body = await res.json(); } catch { body = null; }
  return { status: res.status, body };
}

const rows = [];
function check(name, cond, note = '') { rows.push({ name, pass: !!cond, note }); }

// 1. Discovery + health
check('GET / info', (await call('GET', '/')).body?.service === 'ecourts-service');
check('GET /health ok', (await call('GET', '/health')).body?.status === 'ok');
check('GET /health/source ok', (await call('GET', '/health/source')).status === 200);

// 2. Auth
check('no key -> 401', (await call('GET', '/api/case-status/MHCC010012342026')).status === 401);
check('bad key -> 401', (await call('GET', '/api/case-status/MHCC010012342026', { 'x-api-key': 'x' })).status === 401);

// 3. Active case (uncached then cached)
const a1 = await call('GET', '/api/case-status/MHCC010012342026', KEY);
check('active case 200', a1.status === 200 && a1.body.found === true, `${a1.body?.caseType} · next ${a1.body?.status?.nextHearingDateIso}`);
check('first call uncached', a1.body?.meta?.cached === false);
const a2 = await call('GET', '/api/case-status/MHCC010012342026', KEY);
check('second call cached', a2.body?.meta?.cached === true, `ageMs=${a2.body?.meta?.cacheAgeMs}`);

// 4. Disposed + hyphenated normalization
const d = await call('GET', '/api/case-status/DLHC05-013207-2026', KEY);
check('disposed case (hyphenated input)', d.status === 200 && d.body.status.disposed === true, d.body?.status?.natureOfDisposal);

// 5. Error paths
check('unknown CNR -> 404', (await call('GET', '/api/case-status/MHCC010099992026', KEY)).status === 404);
check('malformed CNR -> 400', (await call('GET', '/api/case-status/ABC', KEY)).status === 400);
check('markup drift -> 502', (await call('GET', '/api/case-status/MHCC019999992026', KEY)).status === 502);
check('outage -> 502', (await call('GET', '/api/case-status/MHER000000002026', KEY)).status === 502);

// 6. Rate limit — on a dedicated server with a low cap so it doesn't interfere
const rlServer = buildServer({ rateLimitPerMin: 3 });
await new Promise(r => rlServer.server.listen(0, r));
const rlBase = `http://127.0.0.1:${rlServer.server.address().port}`;
let got429 = false;
for (let i = 0; i < 6; i++) { const r = await call('GET', `/api/case-status/MHCC0100${2000 + i}2026`, KEY, rlBase); if (r.status === 429) got429 = true; }
check('rate limit -> 429 (cap 3)', got429);
rlServer.server.close();

// 7. Admin usage
const u = await call('GET', '/admin/usage', ADMIN);
check('admin usage 200', u.status === 200, `tenants: ${Object.keys(u.body?.usage || {}).join(', ')}`);
check('admin without key -> 401', (await call('GET', '/admin/usage')).status === 401);

// ── report ──
console.log('\n  eCourts service — end-to-end smoke test\n  ' + '─'.repeat(60));
let failed = 0;
for (const r of rows) {
  if (!r.pass) failed++;
  console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name.padEnd(34)} ${r.note}`);
}
console.log('  ' + '─'.repeat(60));
console.log(`  ${rows.length - failed}/${rows.length} passed\n`);
if (u.body?.usage) console.log('  usage snapshot:', JSON.stringify(u.body.usage), '\n  cache:', JSON.stringify(u.body.cache), '\n');

built.server.close();
process.exit(failed ? 1 : 0);
