/* Worked case for the paper: Rajendra Kolhe v. State of Maharashtra, 2024 INSC 422 (Supreme Court of India, 15 May 2024).

   Runs the workspace's own code over the files in sample-case/ and writes case_results.json:
     - reading the text: words, dates and amounts found, and a search, with textmine.js (what the Evidence tab runs);
     - the citation check on 04_draft_to_check.txt, a draft with planted errors, against the case-law API (needs it on :8090);
     - the limitation date for a review petition, with limitation.js.
   Nothing here calls a language model. Run:  node paper/final/case_study/run_case.mjs   */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..', '..');
const require = createRequire(join(repo, 'lawyerai', 'package.json'));
const TextMine = require('./textmine.js');
const Limitation = require('./limitation.js');
const { citationReport } = await import(new URL('../../../lawyerai/ai-core.mjs', import.meta.url));

const API = process.env.CASELAW_API || 'http://127.0.0.1:8090';
const read = name => readFileSync(join(repo, 'sample-case', name), 'utf8');
const lookup = async q => {
  const u = new URL('/api/caselaw/search', API);
  u.searchParams.set('q', q); u.searchParams.set('court', 'SC'); u.searchParams.set('pageSize', '8');
  const r = await fetch(u, { signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`case-law API answered ${r.status}`);
  return (await r.json()).results || [];
};

const files = { judgment: '01_judgment_full_text.txt', statements: '02_witness_statements.txt', orders: '03_supreme_court_orders.txt' };
const reading = {};
const docs = [];
for (const [key, name] of Object.entries(files)) {
  const text = TextMine.cleanText(read(name));
  const mined = TextMine.mine(text);
  reading[key] = { file: name, words: TextMine.wordCount(text), dates: mined.dates.length, amounts: mined.amounts.length, exhibit59: TextMine.search(text, 'Ex. 59', { max: 100000 }).length };
  docs.push({ id: key, name, text });
}
reading.inconsistencies = TextMine.findConflicts(docs).length;

const draft = read('04_draft_to_check.txt');
const report = await citationReport(draft, lookup);
const citations = { summary: report.summary, items: report.items.map(i => ({ cited: i.name || i.raw, citation: i.kind === 'name' ? '' : i.raw, kind: i.kind, status: i.status, matched: i.match?.title || '' })) };

const limitation = Limitation.compute({ ruleId: 'review-sc', start: '2024-05-15' });
const limit = { rule: limitation.rule.name, source: limitation.rule.source, start: limitation.start, lastDate: limitation.lastDate };

const out = { case: 'Rajendra S/o Ramdas Kolhe v. State of Maharashtra, [2024] 6 S.C.R. 740, 2024 INSC 422', reading, citations, limitation: limit };
writeFileSync(join(here, 'case_results.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
