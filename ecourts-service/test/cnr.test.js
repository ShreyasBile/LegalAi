import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCnr, validateCnr, isValidCnr } from '../src/cnr.js';

test('normalizeCnr strips separators and upcases', () => {
  assert.equal(normalizeCnr('mhcc01-001234-2026'), 'MHCC010012342026');
  assert.equal(normalizeCnr(' MHCC01 0012 342026 '), 'MHCC010012342026');
});

test('valid CNRs pass', () => {
  assert.equal(isValidCnr('MHCC010012342026'), true);
  assert.equal(isValidCnr('MHCC01-001234-2026'), true);
  assert.equal(isValidCnr('dlhc050132072026'), true);
});

test('too-short CNR fails with length reason', () => {
  const r = validateCnr('MHCC0100');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'length');
});

test('non-alphanumeric junk fails', () => {
  assert.equal(validateCnr('!!!@@@###').ok, false);
  assert.equal(validateCnr('').reason, 'empty');
});

test('implausible year fails', () => {
  const r = validateCnr('MHCC010012341800');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'year');
});

test('bad shape (letters where digits expected) fails', () => {
  const r = validateCnr('MHCC01ABCDEF2026');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'shape');
});
