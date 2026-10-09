export const COURT_HIERARCHY: Record<string, Record<string, string[]>> = {
  Maharashtra: {
    Mumbai: ['Bombay High Court', 'City Civil Court, Mumbai', 'Family Court, Mumbai'],
    Pune: ['District Court, Pune', 'Labour Court, Pune', 'Sessions Court, Pune', 'MACT, Pune'],
  },
  Delhi: {
    'New Delhi': ['Delhi High Court'],
  },
};

export function listStates(): string[] {
  return Object.keys(COURT_HIERARCHY);
}

export function listDistricts(state: string): string[] {
  return Object.keys(COURT_HIERARCHY[state] || {});
}

export function listCourtComplexes(state: string, district: string): string[] {
  return (COURT_HIERARCHY[state] || {})[district] || [];
}

export function normalizeCnr(input?: string): string {
  return String(input || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

const SHAPE = /^[A-Z]{2}[A-Z0-9]{4}\d{10}$/;

export function validateCnr(input?: string): {
  ok: boolean;
  cnr: string;
  reason?: string;
  detail?: string;
  year?: number;
} {
  const cnr = normalizeCnr(input);
  if (!cnr) return { ok: false, reason: 'empty', cnr };
  if (cnr.length !== 16) {
    return { ok: false, reason: 'length', cnr, detail: `expected 16 characters, got ${cnr.length}` };
  }
  if (!SHAPE.test(cnr)) {
    return { ok: false, reason: 'shape', cnr, detail: 'does not match the CNR pattern' };
  }
  const year = Number(cnr.slice(12));
  const nowYear = new Date().getFullYear();
  if (year < 1950 || year > nowYear + 2) {
    return { ok: false, reason: 'year', cnr, detail: `implausible year ${year}` };
  }
  return { ok: true, cnr, year };
}

export interface ECourtsIndexedCase {
  cnr: string;
  caseType: string;
  filingNumber: string;
  filingYear: number;
  state: string;
  district: string;
  courtComplex: string;
  status: 'pending' | 'disposed';
  petitioners: Array<{ name: string; advocate: string }>;
  respondents: Array<{ name: string; advocate: string }>;
  acts: string[];
  fir?: { number: string; year: number; policeStation: string } | null;
  registrationNumber?: string;
  registrationDate?: string;
  nextHearingDate?: string;
  purpose?: string;
}

export const CASE_INDEX: ECourtsIndexedCase[] = [
  {
    cnr: 'MHCC010012342026',
    caseType: 'Criminal Bail Application',
    filingNumber: '1234/2026',
    filingYear: 2026,
    state: 'Maharashtra',
    district: 'Mumbai',
    courtComplex: 'Bombay High Court',
    status: 'pending',
    petitioners: [{ name: 'Rohan Sharma', advocate: 'S. Kamat' }],
    respondents: [{ name: 'State of Maharashtra', advocate: 'Public Prosecutor' }],
    acts: ['Section 482, Bharatiya Nagarik Suraksha Sanhita, 2023'],
    fir: { number: '211/2026', year: 2026, policeStation: 'Andheri Police Station' },
    registrationNumber: 'BA-2026-0148',
    registrationDate: '2026-02-14',
    nextHearingDate: '2026-09-11',
    purpose: 'Anticipatory bail hearing',
  },
  {
    cnr: 'MHCC020045212026',
    caseType: 'Commercial Suit',
    filingNumber: '4521/2026',
    filingYear: 2026,
    state: 'Maharashtra',
    district: 'Mumbai',
    courtComplex: 'City Civil Court, Mumbai',
    status: 'pending',
    petitioners: [{ name: 'Aarohi Estates Pvt. Ltd.', advocate: 'R. Mehta' }],
    respondents: [{ name: 'Suresh Patel', advocate: 'V. Joshi' }],
    acts: ['Section 55, Indian Contract Act, 1872'],
    fir: null,
    registrationNumber: 'CS-2026-4521',
    registrationDate: '2026-04-10',
    nextHearingDate: '2026-09-18',
    purpose: 'Hearing on Interim Injunction',
  },
  {
    cnr: 'DLHC050132072026',
    caseType: 'Writ Petition (Civil)',
    filingNumber: '13207/2026',
    filingYear: 2026,
    state: 'Delhi',
    district: 'New Delhi',
    courtComplex: 'Delhi High Court',
    status: 'disposed',
    petitioners: [{ name: 'Kapoor Textiles Pvt. Ltd.', advocate: 'G. Sethi' }],
    respondents: [
      { name: 'Union of India', advocate: 'ASG' },
      { name: 'Commissioner of GST', advocate: 'Standing Counsel' },
    ],
    acts: ['Article 226, Constitution of India'],
    fir: null,
    registrationNumber: 'WPC-13207/2026',
    registrationDate: '2026-01-20',
    nextHearingDate: 'Disposed',
    purpose: 'Final Judgment pronounced on 2026-07-15',
  },
  {
    cnr: 'MHLC030009882026',
    caseType: 'Employment Claim',
    filingNumber: '988/2026',
    filingYear: 2026,
    state: 'Maharashtra',
    district: 'Pune',
    courtComplex: 'Labour Court, Pune',
    status: 'pending',
    petitioners: [{ name: 'Neha Mehra', advocate: 'A. Kulkarni' }],
    respondents: [{ name: 'Virtuoso Tech Pvt. Ltd.', advocate: 'P. Rane' }],
    acts: ['Section 25-F, Industrial Disputes Act, 1947'],
    fir: null,
    registrationNumber: 'LC-988/2026',
    registrationDate: '2026-03-01',
    nextHearingDate: '2026-10-05',
    purpose: 'Evidence of Workman',
  },
  {
    cnr: 'MHSC040022102025',
    caseType: 'Criminal Appeal',
    filingNumber: '2210/2025',
    filingYear: 2025,
    state: 'Maharashtra',
    district: 'Pune',
    courtComplex: 'Sessions Court, Pune',
    status: 'pending',
    petitioners: [{ name: 'State of Maharashtra', advocate: 'Public Prosecutor' }],
    respondents: [{ name: 'Vikram Kulkarni', advocate: 'S. Bhonsle' }],
    acts: ['Section 420, Indian Penal Code, 1860'],
    fir: { number: '88/2025', year: 2025, policeStation: 'Shivajinagar Police Station' },
    registrationNumber: 'CRA-2210/2025',
    registrationDate: '2025-11-12',
    nextHearingDate: '2026-09-24',
    purpose: 'Arguments on Appeal',
  },
];

export interface SearchParams {
  mode: 'party' | 'filing' | 'fir' | 'advocate' | 'act' | 'caseType';
  name?: string;
  filingNumber?: string;
  year?: string;
  firNumber?: string;
  policeStation?: string;
  advocate?: string;
  act?: string;
  caseType?: string;
  state?: string;
  district?: string;
  courtComplex?: string;
  status?: string;
}

export function searchECourtsCases(params: SearchParams): ECourtsIndexedCase[] {
  return CASE_INDEX.filter((c) => {
    if (params.state && c.state.toLowerCase() !== params.state.toLowerCase()) return false;
    if (params.district && c.district.toLowerCase() !== params.district.toLowerCase()) return false;
    if (params.courtComplex && c.courtComplex.toLowerCase() !== params.courtComplex.toLowerCase()) return false;
    if (params.status && c.status.toLowerCase() !== params.status.toLowerCase()) return false;

    if (params.mode === 'party' && params.name) {
      const q = params.name.toLowerCase();
      const pMatch = c.petitioners.some((p) => p.name.toLowerCase().includes(q));
      const rMatch = c.respondents.some((r) => r.name.toLowerCase().includes(q));
      return pMatch || rMatch;
    }

    if (params.mode === 'filing' && params.filingNumber) {
      const fn = params.filingNumber.toLowerCase();
      return c.filingNumber.toLowerCase().includes(fn);
    }

    if (params.mode === 'fir' && params.firNumber) {
      if (!c.fir) return false;
      const matchNum = c.fir.number.toLowerCase().includes(params.firNumber.toLowerCase());
      const matchPs = !params.policeStation || c.fir.policeStation.toLowerCase().includes(params.policeStation.toLowerCase());
      return matchNum && matchPs;
    }

    if (params.mode === 'advocate' && params.advocate) {
      const adv = params.advocate.toLowerCase();
      const pAdv = c.petitioners.some((p) => p.advocate.toLowerCase().includes(adv));
      const rAdv = c.respondents.some((r) => r.advocate.toLowerCase().includes(adv));
      return pAdv || rAdv;
    }

    if (params.mode === 'act' && params.act) {
      const actQ = params.act.toLowerCase();
      return c.acts.some((a) => a.toLowerCase().includes(actQ));
    }

    if (params.mode === 'caseType' && params.caseType) {
      return c.caseType.toLowerCase().includes(params.caseType.toLowerCase());
    }

    return true;
  });
}

export function getCaseByCnr(cnrInput: string): ECourtsIndexedCase | null {
  const norm = normalizeCnr(cnrInput);
  return CASE_INDEX.find((c) => c.cnr === norm) || null;
}
