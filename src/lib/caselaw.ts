import { Pool } from 'pg';

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

let pgPool: Pool | null = null;

function getPgPool(): Pool | null {
  const dsn = process.env.CASELAW_DB;
  if (!dsn) return null;
  if (!pgPool) {
    pgPool = new Pool({ connectionString: dsn, max: 4 });
  }
  return pgPool;
}

export interface CaseLawSearchParams {
  query?: string;
  court?: string;
  year?: number;
  limit?: number;
  offset?: number;
}

export async function searchCaseLaw(params: CaseLawSearchParams): Promise<{
  total: number;
  results: CaseLawItem[];
  source: 'postgres' | 'catalogue';
}> {
  const pool = getPgPool();
  if (pool) {
    try {
      const q = params.query ? `%${params.query}%` : '%';
      const sql = `
        SELECT id, title, court_code as court, decision_date, year, cnr, neutral_citation, scr_citation, headnote
        FROM case_laws
        WHERE (title ILIKE $1 OR headnote ILIKE $1)
        ORDER BY decision_date DESC NULLS LAST
        LIMIT $2 OFFSET $3
      `;
      const res = await pool.query(sql, [q, params.limit || 20, params.offset || 0]);
      return {
        total: res.rowCount || 0,
        results: res.rows.map((r) => ({
          id: String(r.id),
          title: r.title,
          court: r.court,
          year: r.year,
          decisionDate: r.decision_date ? r.decision_date.toISOString().slice(0, 10) : '',
          cnr: r.cnr,
          neutralCitation: r.neutral_citation,
          scrCitation: r.scr_citation,
          headnote: r.headnote || '',
        })),
        source: 'postgres',
      };
    } catch {
      // Fallback to built-in catalogue
    }
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
  };
}
