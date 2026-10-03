// HEAD-check a random sample of non-mobile HC links and SC links (label|court|pdf_ref).
import { readFileSync, writeFileSync } from 'node:fs';
const SP = process.argv[2];
const HOST = { 'hc-nonmobile': 'https://indian-high-court-judgments.s3.ap-south-1.amazonaws.com/', sc: 'https://indian-supreme-court-judgments.s3.ap-south-1.amazonaws.com/' };
const rows = readFileSync(`${SP}/nonmobile_sample.txt`, 'utf8').split(/\r?\n/).map(l => l.trim().split('|')).filter(p => p.length === 3);
async function head(url) {
  for (let a = 0; a < 3; a++) {
    try { return (await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(30000) })).status; }
    catch { await new Promise(r => setTimeout(r, 500 * (a + 1))); }
  }
  return 0;
}
const out = new Array(rows.length); let i = 0;
await Promise.all(Array.from({ length: 12 }, async () => {
  while (i < rows.length) { const k = i++; const [label, court, ref] = rows[k];
    out[k] = { label, court, ref, status: await head(HOST[label] + ref.split('/').map(encodeURIComponent).join('/')) }; }
}));
const tally = {};
for (const r of out) { tally[r.label] ??= {}; tally[r.label][r.status] = (tally[r.label][r.status] || 0) + 1; }
const byCourt = {};
for (const r of out.filter(r => r.status !== 200)) { byCourt[r.court] = (byCourt[r.court] || 0) + 1; }
console.log(JSON.stringify({ tally, failuresByCourt: byCourt }, null, 1));
console.log('failure examples:', out.filter(r => r.status !== 200).slice(0, 8).map(r => `${r.status} ${r.ref}`).join('\n'));
writeFileSync(`${SP}/head_nonmobile_result.json`, JSON.stringify(out, null, 1));
