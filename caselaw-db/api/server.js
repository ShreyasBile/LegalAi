import { createServer } from 'node:http';
import pg from 'pg';
import {
  normalizeParams, buildSearch, buildFuzzy, fuzzyEligible, groupOrders, pdfUrl, cleanJudges, classifyQuery, isoDate,
  PAGE_SIZE_DEFAULT, COUNT_CAP
} from './lib.js';

// Return SQL `date` columns as their yyyy-mm-dd text. By default node-postgres builds a Date at local midnight,
// and toISOString() then moves it to the previous day in any timezone east of UTC (e.g. IST).
pg.types.setTypeParser(pg.types.builtins.DATE, v => v);

const PORT = Number(process.env.PORT || 8090);
const HOST = process.env.HOST || '127.0.0.1';       // this machine only; set HOST=0.0.0.0 to expose the API on your network
// No password in the source: set PGPASSWORD (node-postgres reads it), or override the whole DSN with CASELAW_DB.
const DSN = process.env.CASELAW_DB || 'postgres://postgres@localhost:5433/caselaw';
const SEARCH_TIMEOUT_MS = Number(process.env.SEARCH_TIMEOUT_MS || 10000);
const COUNT_TIMEOUT_MS = Number(process.env.COUNT_TIMEOUT_MS || 4000);
const FUZZY_TIMEOUT_MS = Number(process.env.FUZZY_TIMEOUT_MS || 2500);

export const pool = new pg.Pool({ connectionString: DSN, max: 8 });
pool.on('error', e => log('error', 'pool error', { err: e.message }));

function log(level, msg, f = {}) {
  process.stderr.write(JSON.stringify({ ts: new Date().toISOString(), level, msg, ...f }) + '\n');
}

/* run one query with its own statement_timeout, on a dedicated connection so the
   timeout setting can never leak to another request */
async function timed(sql, values, ms) {
  const client = await pool.connect();
  try {
    await client.query(`set statement_timeout = ${Math.max(200, Math.floor(ms))}`);
    return await client.query(sql, values);
  } finally {
    await client.query('reset statement_timeout').catch(() => {});
    client.release();
  }
}
const isTimeout = e => e && e.code === '57014';

/* ── filter options (courts / case types / outcomes / year range / total) ─────
   Computing these scans 19M rows, so it happens once, is stored in the `facets`
   table, and is served from memory afterwards. */
let facets = null;
let facetsBuilding = false;

async function ensureFacetsTable() {
  await pool.query(`create table if not exists facets (name text primary key, data jsonb not null, computed_at timestamptz not null default now())`);
}

async function loadFacets() {
  await ensureFacetsTable();
  const r = await pool.query(`select data from facets where name = 'main'`);
  if (r.rows[0]) { facets = r.rows[0].data; log('info', 'facets loaded from cache table', { total: facets.total }); return; }
  await buildFacets();
}

export async function buildFacets() {
  if (facetsBuilding) return;
  facetsBuilding = true;
  const t0 = Date.now();
  log('info', 'computing facets (one-off, scans the full table)…');
  try {
    const courts = (await pool.query(
      `select cl.court_code as code, c.name, c.kind, count(*)::int as n
         from case_laws cl join courts c on c.code = cl.court_code group by 1,2,3 order by n desc`)).rows;
    const types = (await pool.query(
      `select case_type as value, count(*)::int as n from case_laws where case_type is not null
        group by 1 order by n desc limit 80`)).rows;
    const outcomes = (await pool.query(
      `select disposal_nature as value, count(*)::int as n from case_laws where disposal_nature is not null
        group by 1 order by n desc limit 25`)).rows;
    const yr = (await pool.query(`select min(year)::int as min, max(year)::int as max from case_laws`)).rows[0];
    const total = courts.reduce((a, c) => a + c.n, 0);
    facets = { total, courts, caseTypes: types, outcomes, years: yr, computedAt: new Date().toISOString() };
    await pool.query(
      `insert into facets(name, data) values ('main', $1) on conflict (name) do update set data = excluded.data, computed_at = now()`,
      [JSON.stringify(facets)]);
    log('info', 'facets ready', { ms: Date.now() - t0, total });
  } catch (e) {
    log('error', 'facets failed', { err: e.message });
  } finally { facetsBuilding = false; }
}

/* ── HTTP ───────────────────────────────────────────────────────────────────── */
function send(res, status, body, extra = {}) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',            // public, read-only data
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'cache-control': 'no-store',
    ...extra
  });
  res.end(JSON.stringify(body));
}

async function handleSearch(url, res) {
  const t0 = Date.now();
  const p = normalizeParams(url.searchParams);
  const s = buildSearch(p);

  let rows, total = null, sortUsed = s.sort, sortFallback = false;
  try {
    const [pageRes, countRes] = await Promise.all([
      timed(s.pageSql, s.pageValues, SEARCH_TIMEOUT_MS).catch(async e => {
        if (!isTimeout(e) || s.sort !== 'relevance') throw e;
        // very common word + relevance sort can be slow: retry newest-first, and say so
        sortFallback = true; sortUsed = 'newest';
        return timed(s.newestSql, s.pageValues, SEARCH_TIMEOUT_MS);
      }),
      timed(s.countSql, s.countValues, COUNT_TIMEOUT_MS).catch(e => (isTimeout(e) ? null : Promise.reject(e)))
    ]);
    rows = pageRes.rows;
    total = countRes ? countRes.rows[0].n : null;     // null = count timed out (page still returned)
  } catch (e) {
    if (isTimeout(e)) return send(res, 504, { error: 'search_timeout', message: 'That search is too broad — add a filter or a more specific word.' });
    log('error', 'search failed', { err: e.message });
    return send(res, 500, { error: 'db_error' });
  }

  let fuzzy = false;
  if (!rows.length && s.kind === 'text' && p.page === 1 && fuzzyEligible(p.q)) {
    // nothing matched exactly: try typo-tolerant title matching, but never let it hang the page
    try {
      const f = buildFuzzy(p.q, p.pageSize, p);
      const fr = await timed(f.sql, f.values, FUZZY_TIMEOUT_MS);
      rows = fr.rows; fuzzy = rows.length > 0; total = rows.length;
    } catch (e) { if (!isTimeout(e)) log('warn', 'fuzzy failed', { err: e.message }); }
  }

  const hasMore = !fuzzy && rows.length > p.pageSize;
  const totalCapped = total != null && total > COUNT_CAP;      // the count query stops at COUNT_CAP + 1
  send(res, 200, {
    query: p.q, page: p.page, pageSize: p.pageSize,
    total: total == null ? null : Math.min(total, COUNT_CAP), totalCapped,
    // set when best-match could only rank the newest RANK_POOL of a larger result set
    rankedAmong: sortUsed === 'relevance' && s.rankPool && total != null && total > s.rankPool ? s.rankPool : null,
    hasMore, sort: sortUsed, sortFallback, fuzzy, tookMs: Date.now() - t0,
    results: groupOrders(rows, p.pageSize)
  });
}

/* every order for one case (a court case = many rows: one per order) */
async function handleCase(url, res) {
  const court = url.searchParams.get('court') || '';
  const cnr = url.searchParams.get('cnr') || '';
  if (!/^[A-Za-z0-9~_-]{1,12}$/.test(court) || !/^[A-Za-z0-9]{8,24}$/.test(cnr)) return send(res, 400, { error: 'court and cnr required' });
  try {
    const r = await timed(
      `select cl.id, cl.source, cl.decision_date, cl.order_number, cl.disposal_nature, cl.pdf_ref
         from case_laws cl where cl.court_code = $1 and cl.cnr = $2 order by cl.decision_date desc nulls last limit 200`,
      [court, cnr], 5000);
    send(res, 200, { court, cnr, orders: r.rows.map(o => ({
      id: String(o.id), date: isoDate(o.decision_date),
      orderNumber: o.order_number || null, outcome: o.disposal_nature || null, pdfUrl: pdfUrl(o.source, o.pdf_ref)
    })) });
  } catch (e) { log('error', 'case failed', { err: e.message }); send(res, 500, { error: 'db_error' }); }
}

export function createApp() {
  return createServer(async (req, res) => {
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { return send(res, 400, { error: 'bad url' }); }
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (req.method === 'OPTIONS') return send(res, 204, {});
    if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' });

    if (path === '/') return send(res, 200, { service: 'caselaw-api', endpoints: ['/health', '/api/caselaw/search', '/api/caselaw/case', '/api/caselaw/facets'] });
    if (path === '/health') {
      try { await pool.query('select 1'); return send(res, 200, { status: 'ok', db: 'up', facetsReady: !!facets }); }
      catch { return send(res, 503, { status: 'degraded', db: 'down' }); }
    }
    if (path === '/api/caselaw/facets') return facets ? send(res, 200, { ready: true, ...facets }) : send(res, 202, { ready: false });
    if (path === '/api/caselaw/search') return handleSearch(url, res);
    if (path === '/api/caselaw/case') return handleCase(url, res);
    return send(res, 404, { error: 'not found', path });
  });
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href;
if (isMain) {
  const server = createApp();
  server.listen(PORT, HOST, () => log('info', 'caselaw-api listening', { host: HOST, port: PORT }));
  loadFacets().catch(e => log('error', 'facets init failed', { err: e.message }));
  const stop = sig => { log('info', 'shutting down', { sig }); server.close(() => pool.end().then(() => process.exit(0))); setTimeout(() => process.exit(0), 3000).unref(); };
  process.on('SIGINT', () => stop('SIGINT')); process.on('SIGTERM', () => stop('SIGTERM'));
}
