/* State → District → Court Complex hierarchy. The real eCourts portal requires
   this cascade before every non-CNR search (party name, advocate, FIR, etc.) —
   there are 700+ court complexes nationally. Replicating all of them is a data-
   sourcing project on its own, so this is a small, REAL, representative subset
   covering the courts already used by the LegalAI demo matters. Extending
   coverage later means adding entries here — nothing else changes. */

export const COURT_HIERARCHY = {
  Maharashtra: {
    Mumbai: ['Bombay High Court', 'City Civil Court, Mumbai', 'Family Court, Mumbai'],
    Pune: ['District Court, Pune', 'Labour Court, Pune', 'Sessions Court, Pune', 'MACT, Pune']
  },
  Delhi: {
    'New Delhi': ['Delhi High Court']
  }
};

export function listStates() {
  return Object.keys(COURT_HIERARCHY);
}
export function listDistricts(state) {
  return Object.keys(COURT_HIERARCHY[state] || {});
}
export function listCourtComplexes(state, district) {
  return (COURT_HIERARCHY[state] || {})[district] || [];
}
export function isValidLocation({ state, district, courtComplex }) {
  if (!state) return true; // location filters are optional
  if (!(state in COURT_HIERARCHY)) return false;
  if (!district) return true;
  if (!(district in COURT_HIERARCHY[state])) return false;
  if (!courtComplex) return true;
  return COURT_HIERARCHY[state][district].includes(courtComplex);
}
