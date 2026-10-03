import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  searchByPartyName, searchByFilingNumber, searchByFirNumber, searchByAdvocate,
  searchByAct, searchByCaseType, searchCaveat, searchInterimApplications
} from '../src/search.js';
import { ValidationError } from '../src/errors.js';

test('party name: case-insensitive substring match across petitioners and respondents', () => {
  const r = searchByPartyName({ name: 'sharma' });
  assert.equal(r.length, 1);
  assert.equal(r[0].cnr, 'MHCC010012342026');
});

test('party name: matches a respondent too', () => {
  const r = searchByPartyName({ name: 'msedcl' });
  assert.equal(r.length, 1);
  assert.equal(r[0].respondents.some(n => /MSEDCL/i.test(n)), true);
});

test('party name: filtered by court complex', () => {
  const all = searchByPartyName({ name: 'a' }); // broad match
  const scoped = searchByPartyName({ name: 'a', courtComplex: 'Bombay High Court' });
  assert.ok(scoped.length < all.length);
  assert.ok(scoped.every(r => r.courtComplex === 'Bombay High Court'));
});

test('party name: status filter (pending vs disposed)', () => {
  const disposed = searchByPartyName({ name: 'kapoor', status: 'disposed' });
  assert.equal(disposed.length, 1);
  const pending = searchByPartyName({ name: 'kapoor', status: 'pending' });
  assert.equal(pending.length, 0);
});

test('party name: requires a name', () => {
  assert.throws(() => searchByPartyName({}), ValidationError);
  assert.throws(() => searchByPartyName({ name: '  ' }), ValidationError);
});

test('party name: unknown location combination rejected', () => {
  assert.throws(() => searchByPartyName({ name: 'sharma', state: 'Narnia' }), ValidationError);
  assert.throws(() => searchByPartyName({ name: 'sharma', state: 'Maharashtra', district: 'Nowhere' }), ValidationError);
});

test('filing number: exact number + optional year', () => {
  const r = searchByFilingNumber({ filingNumber: '4521/2026' });
  assert.equal(r.length, 1);
  assert.equal(r[0].cnr, 'MHCC020045212026');
  assert.equal(searchByFilingNumber({ filingNumber: '4521/2026', year: 2099 }).length, 0);
});

test('FIR number: matches only criminal cases and respects police station', () => {
  const r = searchByFirNumber({ firNumber: '211/2026' });
  assert.equal(r.length, 1);
  assert.equal(r[0].cnr, 'MHCC010012342026');
  assert.equal(searchByFirNumber({ firNumber: '211/2026', policeStation: 'wrong station' }).length, 0);
  assert.equal(searchByFirNumber({ firNumber: '999/2026' }).length, 0); // no such FIR
});

test('advocate: matches by counsel name on either side', () => {
  const r = searchByAdvocate({ name: 'Kamat' });
  assert.equal(r.length, 1);
  assert.equal(r[0].cnr, 'MHCC010012342026');
});

test('act: substring match against the acts array', () => {
  const r = searchByAct({ act: 'Arbitration and Conciliation' });
  assert.equal(r.length, 1);
  assert.equal(r[0].cnr, 'MHHC070118762026');
});

test('case type: substring + year', () => {
  const r = searchByCaseType({ caseType: 'motor accident' });
  assert.equal(r.length, 1);
  assert.equal(r[0].caseType, 'Motor Accident Claim Petition');
});

test('caveat: matches caveator or the party caveated against', () => {
  const asCaveator = searchCaveat({ name: 'Aarohi Estates' });
  assert.equal(asCaveator.length, 1);
  const asAgainst = searchCaveat({ name: 'Patel' });
  assert.equal(asAgainst.length, 1);
  assert.equal(asAgainst[0].caveatNumber, 'CAV/482/2026');
});

test('caveat: requires a name', () => {
  assert.throws(() => searchCaveat({}), ValidationError);
});

test('interim applications: filter by type substring and status, no required field', () => {
  assert.equal(searchInterimApplications({}).length, 4);
  const injunctions = searchInterimApplications({ type: 'injunction' });
  assert.equal(injunctions.length, 1);
  const allowed = searchInterimApplications({ status: 'Allowed' });
  assert.equal(allowed.length, 1);
  assert.equal(allowed[0].iaNumber, 'IA/0765/2026');
});

test('interim applications: scoped by court complex', () => {
  const r = searchInterimApplications({ courtComplex: 'Family Court, Mumbai' });
  assert.equal(r.length, 1);
  assert.equal(r[0].iaNumber, 'IA/1240/2026');
});

test('no matches returns an empty array, not an error', () => {
  assert.deepEqual(searchByPartyName({ name: 'nobody-with-this-name' }), []);
  assert.deepEqual(searchByAct({ act: 'Nonexistent Act, 1999' }), []);
});
