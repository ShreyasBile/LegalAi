import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseCaseStatus, toIso, ParseError } from '../src/sources/parser.js';

const dir = dirname(fileURLToPath(import.meta.url));
const fx = name => readFileSync(join(dir, '..', 'fixtures', name), 'utf8');

test('parses an active case fully', () => {
  const c = parseCaseStatus(fx('case-active.html'));
  assert.equal(c.found, true);
  assert.equal(c.cnr, 'MHCC010012342026');
  assert.equal(c.caseType, 'CRIMINAL BAIL APPLICATION');
  assert.equal(c.filingNumber, '1234/2026');
  assert.equal(c.filingDateIso, '2026-09-03');
  assert.equal(c.status.stage, 'Pending — Anticipatory Bail');
  assert.equal(c.status.firstHearingDateIso, '2026-09-08');
  assert.equal(c.status.nextHearingDateIso, '2026-09-11');
  assert.equal(c.status.disposed, false);
  assert.match(c.status.courtAndJudge, /Deshpande/);
  assert.equal(c.parties.petitioners[0].name, 'Rohan Sharma');
  assert.equal(c.parties.petitioners[0].advocate, 'S. Kamat');
  assert.equal(c.parties.respondents[0].name, 'State of Maharashtra');
  assert.equal(c.orders.length, 2);
  assert.equal(c.orders[0].dateIso, '2026-09-04');
  assert.match(c.orders[0].details, /registered/);
});

test('parses a disposed case with decision date', () => {
  const c = parseCaseStatus(fx('case-disposed.html'));
  assert.equal(c.found, true);
  assert.equal(c.status.disposed, true);
  assert.equal(c.status.decisionDateIso, '2026-09-29');
  assert.equal(c.status.natureOfDisposal, 'Dismissed - Contested');
  assert.equal(c.status.nextHearingDate, null);
  assert.equal(c.parties.respondents.length, 2);
  assert.equal(c.orders.length, 3);
});

test('detects not-found without throwing', () => {
  const c = parseCaseStatus(fx('case-notfound.html'));
  assert.equal(c.found, false);
  assert.equal(c.reason, 'not_found');
});

test('DRIFT: restructured markup throws ParseError (this is the CI tripwire)', () => {
  assert.throws(() => parseCaseStatus(fx('case-drifted.html')), ParseError);
});

test('DRIFT: details table present but CNR label renamed -> ParseError', () => {
  const mutated = fx('case-active.html').replace('CNR Number', 'Case Number Record');
  assert.throws(() => parseCaseStatus(mutated), ParseError);
});

test('DRIFT: case_details_table class removed -> ParseError', () => {
  const mutated = fx('case-active.html').replace(/case_details_table/g, 'renamed_table');
  assert.throws(() => parseCaseStatus(mutated), ParseError);
});

test('empty/garbage input throws ParseError', () => {
  assert.throws(() => parseCaseStatus(''), ParseError);
  assert.throws(() => parseCaseStatus('<html></html>'), ParseError);
});

test('toIso handles the eCourts date formats', () => {
  assert.equal(toIso('03-09-2026'), '2026-09-03');
  assert.equal(toIso('11th September 2026'), '2026-09-11');
  assert.equal(toIso('2026-09-11'), '2026-09-11');
  assert.equal(toIso('not a date'), null);
  assert.equal(toIso(''), null);
});
