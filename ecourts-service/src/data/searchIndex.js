/* Mock "national case index" backing every non-CNR search mode. Mirrors the
   8 demo matters used by the LegalAI frontend (same CNRs where the frontend
   already tracks one), so a party-name/advocate/FIR/act search here surfaces
   cases the lawyer recognises. This is what the fixture/live source split is
   for real lookups — this index is the equivalent for the *search* modes,
   kept in the same "clearly mocked, structurally realistic" spirit. */

export const CASE_INDEX = [
  {
    cnr: 'MHCC010012342026', caseType: 'Criminal Bail Application', filingNumber: '1234/2026', filingYear: 2026,
    state: 'Maharashtra', district: 'Mumbai', courtComplex: 'Bombay High Court', status: 'pending',
    petitioners: [{ name: 'Rohan Sharma', advocate: 'S. Kamat' }],
    respondents: [{ name: 'State of Maharashtra', advocate: 'Public Prosecutor' }],
    acts: ['Section 438, Code of Criminal Procedure, 1973'],
    fir: { number: '211/2026', year: 2026, policeStation: 'Andheri Police Station' }
  },
  {
    cnr: 'MHCC020045212026', caseType: 'Commercial Suit', filingNumber: '4521/2026', filingYear: 2026,
    state: 'Maharashtra', district: 'Mumbai', courtComplex: 'City Civil Court, Mumbai', status: 'pending',
    petitioners: [{ name: 'Aarohi Estates Pvt. Ltd.', advocate: 'R. Mehta' }],
    respondents: [{ name: 'Suresh Patel', advocate: 'V. Joshi' }],
    acts: ['Section 55, Indian Contract Act, 1872'],
    fir: null
  },
  {
    cnr: 'MHLC030009882026', caseType: 'Employment Claim', filingNumber: '988/2026', filingYear: 2026,
    state: 'Maharashtra', district: 'Pune', courtComplex: 'Labour Court, Pune', status: 'pending',
    petitioners: [{ name: 'Neha Mehra', advocate: 'A. Kulkarni' }],
    respondents: [{ name: 'Virtuoso Tech Pvt. Ltd.', advocate: 'P. Rane' }],
    acts: ['Section 25-F, Industrial Disputes Act, 1947'],
    fir: null
  },
  {
    cnr: 'MHSC040022102025', caseType: 'Criminal Appeal', filingNumber: '2210/2025', filingYear: 2025,
    state: 'Maharashtra', district: 'Pune', courtComplex: 'Sessions Court, Pune', status: 'pending',
    petitioners: [{ name: 'State of Maharashtra', advocate: 'Public Prosecutor' }],
    respondents: [{ name: 'Vikram Kulkarni', advocate: 'S. Bhonsle' }],
    acts: ['Section 420, Indian Penal Code, 1860'],
    fir: { number: '88/2025', year: 2025, policeStation: 'Shivajinagar Police Station' }
  },
  {
    cnr: 'DLHC050132072026', caseType: 'Writ Petition (Civil)', filingNumber: '13207/2026', filingYear: 2026,
    state: 'Delhi', district: 'New Delhi', courtComplex: 'Delhi High Court', status: 'disposed',
    petitioners: [{ name: 'Kapoor Textiles Pvt. Ltd.', advocate: 'G. Sethi' }],
    respondents: [{ name: 'Union of India', advocate: 'ASG' }, { name: 'Commissioner of GST', advocate: 'Standing Counsel' }],
    acts: ['Article 226, Constitution of India'],
    fir: null
  },
  {
    cnr: 'MHFC060033152026', caseType: 'Matrimonial Petition', filingNumber: '3315/2026', filingYear: 2026,
    state: 'Maharashtra', district: 'Mumbai', courtComplex: 'Family Court, Mumbai', status: 'pending',
    petitioners: [{ name: 'Maria Fernandes', advocate: 'L. D’Souza' }],
    respondents: [{ name: 'John Fernandes', advocate: 'N. Pinto' }],
    acts: ['Family Courts Act, 1984'],
    fir: null
  },
  {
    cnr: 'MHHC070118762026', caseType: 'Arbitration Petition', filingNumber: '11876/2026', filingYear: 2026,
    state: 'Maharashtra', district: 'Mumbai', courtComplex: 'Bombay High Court', status: 'pending',
    petitioners: [{ name: 'Rao Constructions', advocate: 'K. Iyer' }],
    respondents: [{ name: 'MSEDCL', advocate: 'Standing Counsel, MSEDCL' }],
    acts: ['Section 9, Arbitration and Conciliation Act, 1996'],
    fir: null
  },
  {
    cnr: 'MHMA080023102026', caseType: 'Motor Accident Claim Petition', filingNumber: '2310/2026', filingYear: 2026,
    state: 'Maharashtra', district: 'Pune', courtComplex: 'MACT, Pune', status: 'pending',
    petitioners: [{ name: 'Sunil Joshi', advocate: 'M. Deshmukh' }],
    respondents: [{ name: 'National Insurance Co.', advocate: 'R. Kale' }],
    acts: ['Section 166, Motor Vehicles Act, 1988'],
    fir: null
  }
];

export const CAVEAT_INDEX = [
  {
    caveatNumber: 'CAV/482/2026', filedDate: '2026-09-05', state: 'Maharashtra', district: 'Mumbai', courtComplex: 'City Civil Court, Mumbai',
    caveator: 'Aarohi Estates Pvt. Ltd.', against: 'Suresh Patel', relatedCnr: 'MHCC020045212026',
    note: 'Caveat lodged anticipating an application for interim injunction.'
  },
  {
    caveatNumber: 'CAV/510/2026', filedDate: '2026-09-10', state: 'Maharashtra', district: 'Mumbai', courtComplex: 'Bombay High Court',
    caveator: 'MSEDCL', against: 'Rao Constructions', relatedCnr: 'MHHC070118762026',
    note: 'Caveat lodged anticipating a stay application in the arbitration matter.'
  },
  {
    caveatNumber: 'CAV/399/2026', filedDate: '2026-08-28', state: 'Delhi', district: 'New Delhi', courtComplex: 'Delhi High Court',
    caveator: 'Union of India', against: 'Kapoor Textiles Pvt. Ltd.', relatedCnr: 'DLHC050132072026',
    note: 'Caveat lodged anticipating a further writ or SLP after the writ petition disposal.'
  }
];

export const IA_INDEX = [
  {
    iaNumber: 'IA/1102/2026', type: 'Application for Interim Injunction', filedDate: '2026-09-06', status: 'Pending',
    cnr: 'MHCC020045212026', caseTitle: 'Aarohi Estates Pvt. Ltd. v. Suresh Patel',
    state: 'Maharashtra', district: 'Mumbai', courtComplex: 'City Civil Court, Mumbai'
  },
  {
    iaNumber: 'IA/0987/2026', type: 'Application under Section 9 — Interim Measures', filedDate: '2026-08-14', status: 'Pending',
    cnr: 'MHHC070118762026', caseTitle: 'Rao Constructions v. MSEDCL',
    state: 'Maharashtra', district: 'Mumbai', courtComplex: 'Bombay High Court'
  },
  {
    iaNumber: 'IA/0765/2026', type: 'Application for Condonation of Delay', filedDate: '2025-11-02', status: 'Allowed',
    cnr: 'MHSC040022102025', caseTitle: 'State of Maharashtra v. Vikram Kulkarni',
    state: 'Maharashtra', district: 'Pune', courtComplex: 'Sessions Court, Pune'
  },
  {
    iaNumber: 'IA/1240/2026', type: 'Application for Interim Maintenance', filedDate: '2026-09-08', status: 'Pending',
    cnr: 'MHFC060033152026', caseTitle: 'Maria Fernandes v. John Fernandes',
    state: 'Maharashtra', district: 'Mumbai', courtComplex: 'Family Court, Mumbai'
  }
];
