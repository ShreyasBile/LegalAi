/* CNR (Case Number Record) = the 16-character national unique id for a case.
   Layout: <2 state><2 district><2 establishment><6 sequence><4 year>, e.g.
   "MHCC01" + "001234" + "2026" -> "MHCC010012342026".
   Users paste it in many shapes (hyphens, spaces, lower case), so we normalize
   first, then validate. */

export function normalizeCnr(input) {
  return String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

const SHAPE = /^[A-Z]{2}[A-Z0-9]{4}\d{10}$/; // 2 alpha + 4 alnum estab + 6 seq + 4 year = 16

export function validateCnr(input) {
  const cnr = normalizeCnr(input);
  if (!cnr) return { ok: false, reason: 'empty', cnr };
  if (cnr.length !== 16) return { ok: false, reason: 'length', cnr, detail: `expected 16 characters, got ${cnr.length}` };
  if (!SHAPE.test(cnr)) return { ok: false, reason: 'shape', cnr, detail: 'does not match the CNR pattern' };
  const year = Number(cnr.slice(12));
  const nowYear = new Date().getFullYear();
  if (year < 1950 || year > nowYear + 1) return { ok: false, reason: 'year', cnr, detail: `implausible year ${year}` };
  return { ok: true, cnr, year };
}

export function isValidCnr(input) {
  return validateCnr(input).ok;
}
