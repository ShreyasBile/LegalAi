export interface CaseLawItem {
  id: string;
  title: string;
  court: string;
  year: number;
  decisionDate: string;
  cnr?: string;
  neutralCitation?: string;
  scrCitation?: string;
  judges?: string[];
  headnote: string;
  outcome?: string;
  citingCount?: number;
}

export const SAMPLE_CASELAW_CATALOGUE: CaseLawItem[] = [
  {
    id: 'sc-1978-01',
    title: 'Maneka Gandhi v. Union of India',
    court: 'Supreme Court of India',
    year: 1978,
    decisionDate: '1978-01-25',
    neutralCitation: '1978 INSC 16',
    scrCitation: '(1978) 2 SCR 621',
    judges: ['M.H. Beg, C.J.', 'Y.V. Chandrachud', 'P.N. Bhagwati', 'V.R. Krishna Iyer'],
    headnote:
      'Article 21 procedure established by law must be just, fair and reasonable; interrelationship of Articles 14, 19 and 21 (golden triangle of fundamental rights). Passports Act impounding of passport without hearing violates natural justice.',
    outcome: 'Allowed',
    citingCount: 261,
  },
  {
    id: 'sc-2020-05',
    title: 'Sushila Aggarwal and Others v. State (NCT of Delhi)',
    court: 'Supreme Court of India',
    year: 2020,
    decisionDate: '2020-01-29',
    neutralCitation: '2020 INSC 106',
    scrCitation: '(2020) 5 SCC 1',
    judges: ['Arun Mishra', 'Indira Banerjee', 'Vineet Saran', 'M.R. Shah', 'S. Ravindra Bhat'],
    headnote:
      'Anticipatory bail under Section 438 CrPC (now Section 482 BNSS) should not be restricted to a fixed period or time limit automatically. Personal liberty protection continues till conclusion of trial unless special circumstances warrant limitation.',
    outcome: 'Answered in favour of applicant',
    citingCount: 184,
  },
  {
    id: 'sc-2011-01',
    title: 'Siddharam Satlingappa Mhetre v. State of Maharashtra',
    court: 'Supreme Court of India',
    year: 2011,
    decisionDate: '2010-12-02',
    neutralCitation: '2010 INSC 1002',
    scrCitation: '(2011) 1 SCC 694',
    judges: ['Dalveer Bhandari', 'K.S. Radhakrishnan'],
    headnote:
      'Parameters for grant of anticipatory bail: nature and gravity of accusation, role of accused, antecedents, and possibility of flight. Custodial interrogation is not required as a matter of routine when cooperation is evident.',
    outcome: 'Allowed',
    citingCount: 142,
  },
  {
    id: 'sc-2018-09',
    title: 'Navtej Singh Johar & Ors. v. Union of India',
    court: 'Supreme Court of India',
    year: 2018,
    decisionDate: '2018-09-06',
    neutralCitation: '2018 INSC 790',
    scrCitation: '(2018) 10 SCC 1',
    judges: ['Dipak Misra, C.J.', 'R.F. Nariman', 'A.M. Khanwilkar', 'D.Y. Chandrachud', 'Indu Malhotra'],
    headnote:
      'Constitutional morality over popular morality. Section 377 IPC read down to exclude consensual adult relationships; dignity and autonomy protected under Articles 14, 15, 19, and 21.',
    outcome: 'Allowed',
    citingCount: 95,
  },
  {
    id: 'sc-2017-08',
    title: 'K.S. Puttaswamy (Retd.) v. Union of India',
    court: 'Supreme Court of India',
    year: 2017,
    decisionDate: '2017-08-24',
    neutralCitation: '2017 INSC 652',
    scrCitation: '(2017) 10 SCC 1',
    judges: ['J.S. Khehar, C.J.', 'J. Chelameswar', 'S.A. Bobde', 'D.Y. Chandrachud'],
    headnote:
      'Right to privacy is a fundamental right emanating from Article 21 and the entirety of Part III. Informational privacy, bodily autonomy, and proportionality standard established.',
    outcome: 'Allowed',
    citingCount: 210,
  },
  {
    id: 'bom-2025-01',
    title: 'Aarohi Estates Pvt. Ltd. v. Suresh Patel',
    court: 'Bombay High Court',
    year: 2025,
    decisionDate: '2025-06-18',
    neutralCitation: '2025 BHC-OS 210',
    scrCitation: '',
    judges: ['G.S. Kulkarni, J.'],
    headnote:
      'Commercial Courts Act 2015 strict time limit for written statement. Order VIII Rule 1 CPC 120-day outer limit cannot be extended even by inherent powers under Section 151 CPC.',
    outcome: 'Dismissed',
    citingCount: 14,
  },
];

/* Search runs against the case-law API (caselaw-db/api, port 8090), which owns the SQL, the timeouts and the typo fallback
   over the 19.3 million-row database. If it cannot be reached, the built-in sample catalogue answers and the result says so. */
const CASELAW_API = (process.env.CASELAW_API_URL || 'http://127.0.0.1:8090').replace(/\/+$/, '');

/* The page's court names -> the database's court codes */
const COURT_CODES: Record<string, string> = { 'supreme court': 'SC', 'supreme court of india': 'SC', 'bombay high court': '27~1' };

export interface CaseLawSearchParams {
  query?: string;
  court?: string;
  year?: number;
  limit?: number;
  offset?: number;
}

export interface CaseLawSearchResult {
  total: number;
  results: CaseLawItem[];
  source: 'database' | 'catalogue';
  note?: string;
}

interface ApiCard {
  key: string;
  courtCode: string;
  courtName: string;
  year: number;
  title: string;
  cnr: string | null;
  citation: string | null;
  neutralCitation: string | null;
  judges: string | null;
  outcome: string | null;
  snippet: string | null;
  decisionDate: string | null;
}

async function searchDatabase(params: CaseLawSearchParams): Promise<CaseLawSearchResult> {
  const limit = Math.min(Math.max(params.limit || 20, 1), 50);
  const url = new URL(`${CASELAW_API}/api/caselaw/search`);
  if (params.query) url.searchParams.set('q', params.query);
  const code = params.court ? COURT_CODES[params.court.toLowerCase()] : undefined;
  if (code) url.searchParams.set('court', code);
  if (params.year) { url.searchParams.set('yearFrom', String(params.year)); url.searchParams.set('yearTo', String(params.year)); }
  url.searchParams.set('pageSize', String(limit));
  url.searchParams.set('page', String(Math.floor((params.offset || 0) / limit) + 1));
  const res = await fetch(url, { signal: AbortSignal.timeout(30000), cache: 'no-store' });
  if (!res.ok) throw new Error(`case-law API answered ${res.status}`);
  const data = (await res.json()) as { total: number | null; totalCapped?: boolean; results: ApiCard[] };
  return {
    total: data.total ?? data.results.length,
    source: 'database',
    note: data.totalCapped ? `${data.total}+ matches` : undefined,
    results: data.results.map((c) => ({
      id: c.key,
      title: c.title,
      court: c.courtName,
      year: c.year,
      decisionDate: c.decisionDate || '',
      cnr: c.cnr || undefined,
      neutralCitation: c.neutralCitation || undefined,
      scrCitation: c.citation || undefined,
      judges: c.judges ? [c.judges] : undefined,
      headnote: c.snippet || '',
      outcome: c.outcome || undefined,
    })),
  };
}

export async function searchCaseLaw(params: CaseLawSearchParams): Promise<CaseLawSearchResult> {
  let note: string | undefined;
  try {
    return await searchDatabase(params);
  } catch (e) {
    note = `The case-law database is not reachable (${e instanceof Error ? e.message : 'error'}); showing the built-in sample catalogue.`;
  }

  let filtered = [...SAMPLE_CASELAW_CATALOGUE];
  if (params.query) {
    const q = params.query.toLowerCase();
    filtered = filtered.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.headnote.toLowerCase().includes(q) ||
        (c.neutralCitation && c.neutralCitation.toLowerCase().includes(q)) ||
        (c.scrCitation && c.scrCitation.toLowerCase().includes(q))
    );
  }

  if (params.court) {
    filtered = filtered.filter((c) => c.court.toLowerCase().includes(params.court!.toLowerCase()));
  }

  if (params.year) {
    filtered = filtered.filter((c) => c.year === params.year);
  }

  return {
    total: filtered.length,
    results: filtered.slice(params.offset || 0, (params.offset || 0) + (params.limit || 20)),
    source: 'catalogue',
    note,
  };
}
