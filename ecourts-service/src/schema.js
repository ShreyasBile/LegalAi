/* Runtime response-shape validation. Every case-status object is checked against
   this before it leaves the service. If the shape is wrong (e.g. the parser was
   half-updated after a markup change and started emitting nulls where strings
   belong), we log an ALERT and return 502 instead of shipping garbage to a law
   firm's dashboard. */

function isNonEmptyString(v) { return typeof v === 'string' && v.trim().length > 0; }
function isStringOrNull(v) { return v === null || typeof v === 'string'; }
function isIsoOrNull(v) { return v === null || (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)); }

export function validateCaseStatus(obj) {
  const errors = [];
  const req = (cond, msg) => { if (!cond) errors.push(msg); };

  if (!obj || typeof obj !== 'object') return { ok: false, errors: ['response is not an object'] };

  if (obj.found === false) {
    // A clean not-found is a valid shape.
    req(isNonEmptyString(obj.reason), 'not-found response missing reason');
    return { ok: errors.length === 0, errors };
  }

  req(obj.found === true, 'found must be true or false');
  req(isNonEmptyString(obj.cnr) && /^[A-Z]{2}[A-Z0-9]{2}\d{12}$/.test(obj.cnr || ''), 'cnr missing or malformed');
  req(isNonEmptyString(obj.caseType), 'caseType missing');
  req(isStringOrNull(obj.filingNumber), 'filingNumber wrong type');
  req(isIsoOrNull(obj.filingDateIso), 'filingDateIso not ISO/null');
  req(isIsoOrNull(obj.registrationDateIso), 'registrationDateIso not ISO/null');

  const s = obj.status;
  req(s && typeof s === 'object', 'status block missing');
  if (s && typeof s === 'object') {
    req(isStringOrNull(s.stage), 'status.stage wrong type');
    req(isIsoOrNull(s.nextHearingDateIso), 'status.nextHearingDateIso not ISO/null');
    req(isIsoOrNull(s.firstHearingDateIso), 'status.firstHearingDateIso not ISO/null');
    req(isIsoOrNull(s.decisionDateIso), 'status.decisionDateIso not ISO/null');
    req(typeof s.disposed === 'boolean', 'status.disposed must be boolean');
    // A live case should expose either a next hearing or a decision date; neither
    // means the parser probably lost the status table.
    req(!!(s.nextHearingDateIso || s.decisionDateIso || s.stage), 'status has no hearing/decision/stage — likely parse loss');
  }

  const p = obj.parties;
  req(p && Array.isArray(p.petitioners) && Array.isArray(p.respondents), 'parties block malformed');
  req(Array.isArray(obj.orders), 'orders must be an array');
  if (Array.isArray(obj.orders)) {
    obj.orders.forEach((o, i) => {
      req(o && isStringOrNull(o.details), `orders[${i}].details wrong type`);
      req(o && isIsoOrNull(o.dateIso), `orders[${i}].dateIso not ISO/null`);
    });
  }

  return { ok: errors.length === 0, errors };
}
