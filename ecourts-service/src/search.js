import { CASE_INDEX, CAVEAT_INDEX, IA_INDEX } from './data/searchIndex.js';
import { isValidLocation } from './data/courts.js';
import { ValidationError } from './errors.js';

/* Every non-CNR eCourts search mode. Each function is pure (index in, matches
   out) so it's trivially unit-testable without HTTP. All string matching is
   case-insensitive substring match, mirroring how the real portal's name
   searches behave (they're deliberately fuzzy, not exact). */

const norm = s => String(s || '').trim().toLowerCase();
const includes = (hay, needle) => norm(hay).includes(norm(needle));

function locationMatch(rec, { state, district, courtComplex }) {
  if (state && rec.state !== state) return false;
  if (district && rec.district !== district) return false;
  if (courtComplex && rec.courtComplex !== courtComplex) return false;
  return true;
}

function toSummary(rec) {
  return {
    cnr: rec.cnr, caseType: rec.caseType, filingNumber: rec.filingNumber, filingYear: rec.filingYear,
    status: rec.status, state: rec.state, district: rec.district, courtComplex: rec.courtComplex,
    petitioners: rec.petitioners.map(p => p.name), respondents: rec.respondents.map(p => p.name),
    acts: rec.acts
  };
}

function requireLocation(params) {
  if (!isValidLocation(params)) throw new ValidationError('unknown state/district/courtComplex combination', params);
}

export function searchByPartyName({ name, state, district, courtComplex, status }) {
  if (!name || !name.trim()) throw new ValidationError('party name is required');
  requireLocation({ state, district, courtComplex });
  return CASE_INDEX.filter(rec =>
    locationMatch(rec, { state, district, courtComplex }) &&
    (!status || status === 'both' || rec.status === status) &&
    [...rec.petitioners, ...rec.respondents].some(p => includes(p.name, name))
  ).map(toSummary);
}

export function searchByFilingNumber({ filingNumber, year, state, district, courtComplex }) {
  if (!filingNumber || !filingNumber.trim()) throw new ValidationError('filing number is required');
  requireLocation({ state, district, courtComplex });
  return CASE_INDEX.filter(rec =>
    locationMatch(rec, { state, district, courtComplex }) &&
    rec.filingNumber === String(filingNumber).trim() &&
    (!year || rec.filingYear === Number(year))
  ).map(toSummary);
}

export function searchByFirNumber({ firNumber, year, policeStation, state, district }) {
  if (!firNumber || !firNumber.trim()) throw new ValidationError('FIR number is required');
  return CASE_INDEX.filter(rec =>
    rec.fir &&
    locationMatch(rec, { state, district }) &&
    rec.fir.number === String(firNumber).trim() &&
    (!year || rec.fir.year === Number(year)) &&
    (!policeStation || includes(rec.fir.policeStation, policeStation))
  ).map(toSummary);
}

export function searchByAdvocate({ name, state, district, courtComplex }) {
  if (!name || !name.trim()) throw new ValidationError('advocate name is required');
  requireLocation({ state, district, courtComplex });
  return CASE_INDEX.filter(rec =>
    locationMatch(rec, { state, district, courtComplex }) &&
    [...rec.petitioners, ...rec.respondents].some(p => includes(p.advocate, name))
  ).map(toSummary);
}

export function searchByAct({ act, state, district, courtComplex }) {
  if (!act || !act.trim()) throw new ValidationError('act name is required');
  requireLocation({ state, district, courtComplex });
  return CASE_INDEX.filter(rec =>
    locationMatch(rec, { state, district, courtComplex }) &&
    rec.acts.some(a => includes(a, act))
  ).map(toSummary);
}

export function searchByCaseType({ caseType, year, state, district, courtComplex }) {
  if (!caseType || !caseType.trim()) throw new ValidationError('case type is required');
  requireLocation({ state, district, courtComplex });
  return CASE_INDEX.filter(rec =>
    locationMatch(rec, { state, district, courtComplex }) &&
    includes(rec.caseType, caseType) &&
    (!year || rec.filingYear === Number(year))
  ).map(toSummary);
}

export function searchCaveat({ name, state, district, courtComplex }) {
  if (!name || !name.trim()) throw new ValidationError('a party name is required to search caveats');
  requireLocation({ state, district, courtComplex });
  return CAVEAT_INDEX.filter(rec =>
    locationMatch(rec, { state, district, courtComplex }) &&
    (includes(rec.caveator, name) || includes(rec.against, name))
  );
}

export function searchInterimApplications({ type, status, state, district, courtComplex }) {
  requireLocation({ state, district, courtComplex });
  return IA_INDEX.filter(rec =>
    locationMatch(rec, { state, district, courtComplex }) &&
    (!type || includes(rec.type, type)) &&
    (!status || rec.status.toLowerCase() === norm(status))
  );
}

/* mode -> { fn, requiredFields } used by the HTTP layer for dispatch + 400s. */
export const SEARCH_MODES = {
  party: { fn: searchByPartyName, required: ['name'] },
  filing: { fn: searchByFilingNumber, required: ['filingNumber'] },
  fir: { fn: searchByFirNumber, required: ['firNumber'] },
  advocate: { fn: searchByAdvocate, required: ['name'] },
  act: { fn: searchByAct, required: ['act'] },
  caseType: { fn: searchByCaseType, required: ['caseType'] },
  caveat: { fn: searchCaveat, required: ['name'] },
  pretrial: { fn: searchInterimApplications, required: [] }
};
