/* What the workspace's grounding checks remove from a small model's answers, on the worked case.

   For three model actions (compare witness statements, digest an order, chronology from documents) this sends the real prompt
   built by lawyerai/ai-core.mjs to a local open-weight model, keeps the model's raw JSON, and then applies the action's own
   `clean` step, which holds the grounding checks. It counts what the model proposed and what survived. Three runs per action
   (seeds 1 to 3, temperature 0.2 as in the workspace, a context of 8,192 tokens). The raw answers are saved in grounding_results.json.
   Needs Ollama on :11434 with the model. Run:  node paper/final/case_study/run_grounding.mjs   */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..', '..');
const { ACTIONS, extractJson, dateAppears } = await import(new URL('../../../lawyerai/ai-core.mjs', import.meta.url));

const MODEL = process.env.MODEL || 'qwen2.5vl:7b';
const CHAT = process.env.OLLAMA_CHAT || 'http://127.0.0.1:11434/api/chat';
const SEEDS = [1, 2, 3];
const read = name => readFileSync(join(repo, 'sample-case', name), 'utf8');

/* Ollama's own chat endpoint, because it lets us set the context window: its default of 4,096 tokens is filled by the
   chronology prompt (about 4,000 tokens) and the answer is cut off after 100 tokens. We use 8,192, as the benchmark of
   the paper does (section VII). */
const NUM_CTX = 8192;
async function call(messages, seed) {
  const res = await fetch(CHAT, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, messages, stream: false, options: { temperature: 0.2, seed, num_ctx: NUM_CTX, num_predict: 3000 } }),
    signal: AbortSignal.timeout(300_000)
  });
  if (!res.ok) throw new Error(`model answered ${res.status}`);
  const j = await res.json();
  lastDone = j.done_reason;
  return j.message.content;
}
let lastDone = '';

const statements = read('02_witness_statements.txt').trim().split(/\n\s*\n/).map(b => { const i = b.indexOf(':'); return i > 0 ? { witnessName: b.slice(0, i).trim(), statement: b.slice(i + 1).trim() } : null; }).filter(Boolean);
const orders = read('03_supreme_court_orders.txt');
const finalOrder = orders.slice(orders.indexOf('Final order'));
const documents = ['01_judgment_full_text.txt', '02_witness_statements.txt', '03_supreme_court_orders.txt'].map(title => ({ title, text: read(title) }));

const titles = documents.map(d => d.title.toLowerCase());
const isTitle = t => { const k = String(t ?? '').trim().toLowerCase(); return !!k && titles.some(x => k.includes(x)); };

const JOBS = {
  'contradiction-matrix': {
    payload: { statements },
    measure: (o, r) => ({ proposed: (o.points || []).length, kept: r.points.length, dropped: r.left })
  },
  'order-digest': {
    payload: { orderText: finalOrder },
    measure: (o, r) => {
      const raw = String(o.nextDate ?? '');
      const isoRaw = /^\d{4}-\d{2}-\d{2}$/.test(raw);
      return { rawNextDate: raw, stated: isoRaw ? dateAppears(raw, finalOrder) : null, keptNextDate: r.nextDate };
    }
  },
  'timeline-depositions': {
    payload: { documents },
    measure: (o, r) => {
      const tl = o.timeline || [], qs = o.questions || [];
      const isoDates = tl.flatMap(x => String(x?.date ?? '').match(/\d{4}-\d{2}-\d{2}/g) || []);
      const all = documents.map(d => d.text.slice(0, 6000)).join('\n');
      return {
        proposedEvents: tl.length, keptEvents: r.timeline.length, droppedEvents: r.left,
        isoDatesProposed: isoDates.length, isoDatesNotInDocuments: isoDates.filter(d => !dateAppears(d, all)).length,
        sourcesNamed: tl.filter(x => String(x?.source ?? '').trim()).length, sourcesNotADocument: tl.filter(x => String(x?.source ?? '').trim() && !isTitle(x.source)).length,
        questions: qs.length, questionDocsNamed: qs.filter(x => String(x?.document ?? '').trim()).length, questionDocsNotADocument: qs.filter(x => String(x?.document ?? '').trim() && !isTitle(x.document)).length
      };
    }
  }
};

/* ONLY=<action> re-runs one action and keeps the other actions' saved runs */
const only = process.env.ONLY;
const file = join(here, 'grounding_results.json');
const out = only ? JSON.parse(readFileSync(file, 'utf8')) : { model: MODEL, temperature: 0.2, numCtx: NUM_CTX, seeds: SEEDS, runs: {} };
for (const [name, job] of Object.entries(JOBS)) {
  if (only && name !== only) continue;
  out.runs[name] = [];
  for (const seed of SEEDS) {
    const t0 = Date.now();
    let raw = '';
    try {
      const { system, user } = ACTIONS[name].build(job.payload);
      raw = await call([{ role: 'system', content: system }, { role: 'user', content: user }], seed);
      const o = extractJson(raw);
      const cleaned = ACTIONS[name].clean(o, job.payload);
      out.runs[name].push({ seed, seconds: Math.round((Date.now() - t0) / 1000), done: lastDone, ...job.measure(o, cleaned), raw: o, cleaned });
    } catch (e) {
      out.runs[name].push({ seed, error: String(e.message || e), rawText: String(raw).slice(0, 600) });
    }
    console.log(name, 'seed', seed, JSON.stringify({ ...out.runs[name].at(-1), raw: undefined, cleaned: undefined }));
    writeFileSync(join(here, 'grounding_results.json'), JSON.stringify(out, null, 2));
  }
}
console.log('done');
