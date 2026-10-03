import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseCaseStatus } from '../src/sources/parser.js';
import { validateCaseStatus } from '../src/schema.js';

const dir = dirname(fileURLToPath(import.meta.url));
const fx = name => readFileSync(join(dir, '..', 'fixtures', name), 'utf8');

test('a freshly parsed active case passes shape validation', () => {
  const r = validateCaseStatus(parseCaseStatus(fx('case-active.html')));
  assert.equal(r.ok, true, r.errors.join('; '));
});

test('a disposed case passes shape validation', () => {
  const r = validateCaseStatus(parseCaseStatus(fx('case-disposed.html')));
  assert.equal(r.ok, true, r.errors.join('; '));
});

test('a clean not-found object is a valid shape', () => {
  assert.equal(validateCaseStatus({ found: false, reason: 'not_found' }).ok, true);
});

test('missing CNR is rejected', () => {
  const bad = { ...parseCaseStatus(fx('case-active.html')), cnr: '' };
  const r = validateCaseStatus(bad);
  assert.equal(r.ok, false);
  assert.match(r.errors.join(), /cnr/);
});

test('a status block that lost all hearing/decision/stage info is rejected', () => {
  const p = parseCaseStatus(fx('case-active.html'));
  p.status = { stage: null, nextHearingDateIso: null, firstHearingDateIso: null, decisionDateIso: null, disposed: false };
  const r = validateCaseStatus(p);
  assert.equal(r.ok, false);
  assert.match(r.errors.join(), /parse loss/);
});

test('non-object input is rejected cleanly', () => {
  assert.equal(validateCaseStatus(null).ok, false);
  assert.equal(validateCaseStatus('nope').ok, false);
});
