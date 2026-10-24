import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/* The real case (real-case.js) must say nothing the judgment does not say. These tests read the judgment text that ships
   with the project (sample-case/01_judgment_full_text.txt) and check the matter against it. */
const here = new URL('.', import.meta.url);
const judgment = readFileSync(new URL('../../sample-case/01_judgment_full_text.txt', here), 'utf8').replace(/\s+/g, ' ');
const MATTERS = [];
vm.runInNewContext(readFileSync(new URL('../real-case.js', here), 'utf8'), { MATTERS });
const m = MATTERS.find(x => x.id === 'm9');

test('the matter is there, decided, and has no hearing to prepare for', () => {
  assert.equal(m.title, 'Rajendra Kolhe v. State of Maharashtra');
  assert.equal(m.nextHearing, null);
  assert.equal(m.stage, 4);
  assert.equal(m.documents.length + m.drafts.length, 0);          // so that Add evidence and Auto can be tried
});

test('every date in the chronology appears in the judgment', () => {
  assert.ok(m.timeline.length >= 9);
  for (const t of m.timeline) {
    assert.match(t.iso, /^\d{4}-\d{2}-\d{2}$/);
    const [y, mo, d] = t.iso.split('-');
    const written = `${d}.${mo}.${y}`, long = `${Number(d)} ${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][Number(mo) - 1]} ${y}`;
    assert.ok(judgment.includes(written) || judgment.includes(long), `${t.iso} (${t.title}) is not in the judgment`);
  }
  const isos = m.timeline.map(t => t.iso);
  assert.equal(isos.join(), [...isos].sort().join());           // in order
  assert.equal(m.timeline.filter(t => t.flag).length, 1);                                         // one flagged inconsistency
});

test('every authority the matter pins is one the judgment cites, with the citation the judgment prints', () => {
  const printed = { 'db-878': '[1958] 1 SCR 552', 'db-16180': '[1993] 2 SCR 666', 'db-28276': '[2008] 2 SCR 959', 'db-32911': '[2012] 7 SCR 128',
    'db-15808': '[1992] 2 SCR 197', 'db-28088': '[2008] 8 SCR 956', 'db-30892': '[2010] 9 SCR 705', 'db-33194': '[2013] 1 SCR 115' };
  const keys = m.authorities.map(a => a.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const [key, cite] of Object.entries(printed)) {
    const a = m.authorities.find(x => x.key === key);
    assert.ok(a, key);
    assert.ok(judgment.includes(cite), `${cite} is not in the judgment`);
    const sc = cite.replace(' SCR ', ' S.C.R. ');
    assert.ok(a.meta.includes(sc), `${a.title}: ${a.meta} should carry ${sc}`);
    assert.match(a.pdfUrl, /^https:\/\/indian-supreme-court-judgments\.s3\.ap-south-1\.amazonaws\.com\/data\/pdf\//);
  }
  assert.ok(m.authorities.some(a => /Section 32\(1\)/.test(a.title)));
});

test('the arguments and the other side\'s points cite paragraphs that exist, and the witnesses named are in the judgment', () => {
  const text = JSON.stringify([m.arguments, m.counterArgs, m.timeline]);
  const paras = [...text.matchAll(/paras? (\d+)/g)].map(x => Number(x[1]));
  assert.ok(paras.length > 10);
  assert.ok(Math.max(...paras) <= 37 && Math.min(...paras) >= 2);
  for (const pw of ['PW-2', 'PW-3', 'PW-4', 'PW-7', 'PW-8', 'PW-12', 'PW-13']) assert.ok(judgment.includes(pw), pw);
  for (const phrase of ['11:45 PM', 'Ex. 59', 'Ex. 65', '22.07.2002', 'Ambajogai']) assert.ok(judgment.includes(phrase), phrase);
});

test('the post-judgment record has no invented scores or deadline', () => {
  assert.equal(m.postJudgment.grounds.length, 0);
  assert.equal(m.postJudgment.appealDeadline, '');
  assert.equal(m.postJudgment.outcome, 'dismissed');
  assert.equal(m.strengths.length, 0);
});
