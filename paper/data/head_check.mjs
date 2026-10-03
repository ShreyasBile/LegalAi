// HEAD-checks (a) a random sample of recovered / unresolved mobile-row links and (b) random colliding-filename pairs.
import { readFileSync, writeFileSync } from 'node:fs';
const SP = process.argv[2];
const HOST = 'https://indian-high-court-judgments.s3.ap-south-1.amazonaws.com/';

async function head(key) {
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(HOST + key.split('/').map(encodeURIComponent).join('/'), { method: 'HEAD', signal: AbortSignal.timeout(30000) });
      return { status: r.status, etag: r.headers.get('etag'), len: r.headers.get('content-length') };
    } catch (e) { await new Promise(r => setTimeout(r, 500 * (a + 1))); }
  }
  return { status: 0 };
}
async function pool(items, fn, n = 12) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}
const lines = f => readFileSync(f, 'utf8').split(/\r?\n/).map(l => l.trim()).filter(l => l.includes('|'));

// (a) link sample: label|court|year|source_id|pdf_ref
const rows = lines(`${SP}/head_sample.txt`).map(l => l.split('|')).filter(p => p.length === 5)
  .map(([label, court, year, sid, ref]) => ({ label, court, year: +year, sid, ref }));
const keyFor = (r, yr) => { const [bench, stem] = r.sid.split('/'); return `data/pdf/year=${yr}/court=${r.court.replace('~', '_')}/bench=${bench}/${stem}.pdf`; };

const tally = {};
const add = (g, k) => { tally[g] ??= {}; tally[g][k] = (tally[g][k] || 0) + 1; };
const resolved = rows.filter(r => r.label === 'resolved'), unres = rows.filter(r => r.label === 'unresolved');

const rRes = await pool(resolved, r => head(r.ref));
resolved.forEach((r, i) => add(`resolved ${r.court}`, rRes[i].status));

// unresolved: probe the decision-year folder and the two neighbouring year folders
const probes = unres.flatMap(r => [0, -1, 1].map(d => ({ r, yr: r.year + d, d })));
const rUn = await pool(probes, p => head(keyFor(p.r, p.yr)));
const byRow = new Map();
probes.forEach((p, i) => { const k = p.r.sid + '|' + p.r.court; byRow.set(k, (byRow.get(k) || false) || rUn[i].status === 200); });
unres.forEach(r => add(`unresolved ${r.court}`, byRow.get(r.sid + '|' + r.court) ? 'FOUND-in-bucket' : 'absent (all 3 year folders 404)'));
const anyNon404 = rUn.filter(x => x.status !== 404 && x.status !== 200).map(x => x.status);

// (b) collision pairs: court|stem|source_id|pdf_ref
const pairRows = lines(`${SP}/collision_pairs.txt`).map(l => l.split('|')).filter(p => p.length === 4);
const groups = new Map();
for (const [court, stem, sid, ref] of pairRows) { const k = court + '|' + stem; (groups.get(k) || groups.set(k, []).get(k)).push({ sid, ref }); }
const pairRes = { same_bytes: 0, different_bytes: 0, unreadable: 0 };
const detail = [];
for (const [k, g] of groups) {
  if (g.length !== 2) continue;
  const [a, b] = await Promise.all(g.map(x => head(x.ref)));
  if (a.status !== 200 || b.status !== 200) { pairRes.unreadable++; continue; }
  const same = a.etag === b.etag && a.len === b.len;
  pairRes[same ? 'same_bytes' : 'different_bytes']++;
  detail.push({ k, same, a: { ...a }, b: { ...b } });
}

console.log('LINK SAMPLE (HTTP status per group):'); console.log(JSON.stringify(tally, null, 1));
console.log('unexpected statuses among unresolved probes:', JSON.stringify(anyNon404));
console.log('COLLISION PAIRS (random sample of stems present in exactly 2 benches, both PDFs published):', JSON.stringify(pairRes));
writeFileSync(`${SP}/head_check_result.json`, JSON.stringify({ tally, pairRes, detail }, null, 1));
