/* ============================================================================
   LegalAI — Litigation Workspace
   Vanilla JS hash-router SPA. No frameworks, no build step.
   ============================================================================ */

/* ---------------------------------------------------------------------------
   Helpers
   ------------------------------------------------------------------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = (p = 'id') => `${p}-${Math.random().toString(36).slice(2, 9)}`;

let toastTimer;
function showToast(message) {
  const toast = $('#toast');
  $('#toastText').textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3400);
}

/* ---------------------------------------------------------------------------
   Mock data model
   ------------------------------------------------------------------------- */
const STAGE_LABELS = ['Intake', 'Research', 'Drafting', 'Arguments', 'Final review'];

const MATTERS = [
  {
    id: 'm1', title: 'Sharma v. State of Maharashtra', court: 'Bombay High Court', caseNo: 'MAT-2026-0148',
    area: 'Criminal · Anticipatory Bail', stage: 2, lead: 'Shreyas A.', leadInitials: 'SA', updated: '18 min ago',
    nextHearing: { date: '11 Sep 2026', dateISO: '2026-09-11', time: '10:30 AM', purpose: 'Anticipatory bail hearing', court2: 'Courtroom 52' },
    tags: ['Economic offence', 'Bail', 'High priority'],
    facts: {
      objective: 'Secure interim protection for the applicant and place the documented cooperation record before the court.',
      relief: 'Anticipatory bail under Section 482, Bharatiya Nagarik Suraksha Sanhita, 2023 (formerly Section 438, CrPC).',
      issue: 'Whether custodial interrogation is necessary given the applicant’s complete cooperation and the commercial (not violent) nature of the alleged offence.'
    },
    authorities: [
      { key: 'sushila', title: 'Sushila Aggarwal v. State (NCT of Delhi)', meta: '2020 · 5 SCC 1 · Supreme Court' },
      { key: 'siddharam', title: 'Siddharam Satlingappa Mhetre v. State of Maharashtra', meta: '2011 · 1 SCC 694 · Supreme Court' },
      { key: 's438', title: 'Section 482, Bharatiya Nagarik Suraksha Sanhita, 2023 (formerly CrPC s.438)', meta: 'Statute · Bare Act' }
    ],
    arguments: [
      { point: 'The applicant has cooperated at every stage of the investigation.', support: 'Supported by the cooperation email chain and two recorded statements before the investigating officer.', strength: 84,
        stressTest: 'Checked against opposing precedent: in some economic-offence matters, courts have held that documented cooperation before arrest does not by itself rule out custodial interrogation if new material later emerges. No directly opposing judgment was found in this matter’s fact pattern, but the point is not absolute — keep the affidavit specific to what has already been produced.' },
      { point: 'The alleged offence is commercial in nature, with no risk of violence or tampering.', support: 'FIR discloses a financial dispute only; no allegation of threat or evidence tampering.', strength: 76,
        stressTest: 'Checked against opposing precedent: the State could argue economic offences are treated as a class apart given their impact, per some Supreme Court observations distinguishing them from ordinary offences. This is a real counter-line — the brief should pre-empt it by stressing the individual (not systemic) nature of this allegation.' },
      { point: 'Custodial interrogation serves no investigative purpose here.', support: 'All documents the State could seek have already been produced voluntarily.', strength: 61,
        stressTest: 'No opposing precedent found directly on point in the indexed corpus for this specific argument.' }
    ],
    counterArgs: [
      { point: 'The State may emphasise the quantum of the alleged financial loss.', rebuttal: 'Quantum of loss does not by itself establish need for custody — courts have held liberty is the default absent a specific custodial requirement.' },
      { point: 'The State may argue the document trail could still be tampered with.', rebuttal: 'All originals are already with the investigating officer; nothing remains in the applicant’s custody to tamper with.' },
      { point: 'The complainant may allege a risk of the applicant fleeing.', rebuttal: 'The applicant has a fixed residence, valid passport with no travel history abroad, and offers to surrender it as a condition.' }
    ],
    tasks: [
      { label: 'Confirm investigating officer’s notice date', done: false },
      { label: 'Attach cooperation email chain as Annexure C', done: false },
      { label: 'Verify applicant’s current address on affidavit', done: true }
    ],
    strengths: [
      { label: 'Personal liberty', score: 82, tone: 'good', note: 'Strong authority support and a documented cooperation record.' },
      { label: 'Need for custody', score: 64, tone: 'mid', note: 'The State’s allegation needs a precise answer in the hearing affidavit.' },
      { label: 'Financial trail', score: 47, tone: 'low', note: 'One transaction needs a bank confirmation before the next listing.' }
    ],
    documents: [
      { name: 'FIR_No_211_2026.pdf', type: 'pdf', added: '9 Sep', size: '1.8 MB', status: 'Key document' },
      { name: 'Applicant_statement.docx', type: 'doc', added: '9 Sep', size: '64 KB', status: 'Reviewed' },
      { name: 'Bank_transaction_summary.pdf', type: 'pdf', added: '10 Sep', size: '512 KB', status: 'Needs review' },
      { name: 'Cooperation_email_chain.pdf', type: 'pdf', added: '10 Sep', size: '220 KB', status: 'Reviewed' }
    ],
    timeline: [
      { date: '07 Feb', title: 'Commercial transaction recorded', note: 'Bank summary links to the applicant’s statement.', flag: false },
      { date: '18 Feb', title: 'First contact alleged by complainant', note: 'An 11-day gap against the financial record.', flag: true },
      { date: '03 Sep', title: 'FIR registered', note: 'FIR No. 211/2026 indexed with its annexures.', flag: false },
      { date: '11 Sep', title: 'Hearing preparation complete', note: 'Brief includes evidence, precedent and open issues.', flag: false, omitFromDrafts: true }
    ],
    drafts: [{ title: 'Anticipatory bail application', docType: 'Anticipatory bail application' }],      // workbench.js builds it from the format on load
    postJudgment: null
  },
  {
    id: 'm2', title: 'Aarohi Estates Pvt. Ltd. v. Patel', court: 'Bombay High Court', caseNo: 'MAT-2026-0142',
    area: 'Commercial Dispute', stage: 1, lead: 'Gargee S.', leadInitials: 'GS', updated: '2 hr ago',
    nextHearing: { date: '11 Sep 2026', dateISO: '2026-09-11', time: '02:15 PM', purpose: 'Evidence hearing', court2: 'City Civil Court' },
    tags: ['Contract dispute', 'Evidence review'],
    facts: {
      objective: 'Establish breach of the development agreement and quantify resulting loss.',
      relief: 'Specific performance, or in the alternative, damages under the Indian Contract Act, 1872.',
      issue: 'Whether the delay in handover constitutes a fundamental breach entitling rescission.'
    },
    authorities: [{ key: 's55', title: 'Section 55, Indian Contract Act, 1872', meta: 'Statute · Bare Act' }],
    arguments: [
      { point: 'Time was of the essence in the development agreement.', support: 'Clause 9 expressly ties handover to a fixed date, with liquidated damages for delay already agreed.', strength: 70 }
    ],
    counterArgs: [
      { point: 'Respondent may plead force majeure due to regulatory delay.', rebuttal: 'No force majeure notice was issued within the contractual window — the clause requires notice within 15 days of the event.' }
    ],
    tasks: [{ label: 'Obtain certified copy of the development agreement', done: true }, { label: 'Compute liquidated damages under Clause 14', done: false }],
    strengths: [{ label: 'Breach established', score: 71, tone: 'good', note: 'Delay is documented across three notices.' }],
    documents: [
      { name: 'Development_agreement.pdf', type: 'pdf', added: '2 Sep', size: '3.1 MB', status: 'Key document' },
      { name: 'Notice_of_delay_1.pdf', type: 'pdf', added: '4 Sep', size: '210 KB', status: 'Reviewed' },
      { name: 'Site_photographs.zip', type: 'zip', added: '10 Sep', size: '18 MB', status: 'Needs review' }
    ],
    timeline: [
      { date: '12 Jun', title: 'Agreement executed', note: 'Handover committed for 30 November.', flag: false },
      { date: '02 Dec', title: 'First delay notice sent', note: 'Formal notice recorded via registered post.', flag: false }
    ],
    drafts: [],
    postJudgment: null
  },
  {
    id: 'm3', title: 'Mehra v. Virtuoso Tech', court: 'Labour Court, Pune', caseNo: 'MAT-2026-0139',
    area: 'Employment Claim', stage: 1, lead: 'Janhavi D.', leadInitials: 'JD', updated: 'Yesterday',
    nextHearing: { date: '11 Sep 2026', dateISO: '2026-09-11', time: '04:00 PM', purpose: 'First listing', court2: 'Labour Court' },
    tags: ['Wrongful termination'],
    facts: { objective: 'Establish that termination was without due enquiry.', relief: 'Reinstatement with back wages, or compensation in lieu.', issue: 'Whether principles of natural justice were followed before termination.' },
    authorities: [{ key: 's25f', title: 'Section 25-F, Industrial Disputes Act, 1947', meta: 'Statute · Bare Act' }],
    arguments: [
      { point: 'No enquiry was conducted before termination.', support: 'No enquiry notice or show-cause letter appears in the file preceding the termination letter.', strength: 66 }
    ],
    counterArgs: [
      { point: 'Employer may cite a documented performance record.', rebuttal: 'A poor performance record, even if real, does not dispense with the requirement of a fair enquiry before termination.' }
    ],
    tasks: [{ label: 'Collect appraisal history for the last 3 years', done: false }],
    strengths: [{ label: 'Procedural fairness', score: 58, tone: 'mid', note: 'No enquiry notice found in the file yet.' }],
    documents: [{ name: 'Termination_letter.pdf', type: 'pdf', added: '6 Sep', size: '140 KB', status: 'Key document' }],
    timeline: [{ date: '30 Aug', title: 'Termination communicated', note: 'No enquiry notice preceding this letter.', flag: true }],
    drafts: [],
    postJudgment: null
  },
  {
    id: 'm4', title: 'State v. Kulkarni', court: 'Sessions Court, Pune', caseNo: 'MAT-2026-0132',
    area: 'Criminal Appeal', stage: 0, lead: 'Shreyas A.', leadInitials: 'SA', updated: 'Yesterday',
    nextHearing: null, tags: ['Appeal'],
    facts: { objective: 'Intake in progress — facts being structured from the client conference.', relief: 'To be determined after intake.', issue: 'To be determined.' },
    authorities: [], arguments: [], counterArgs: [], tasks: [{ label: 'Complete client intake interview', done: false }],
    strengths: [], documents: [], timeline: [{ date: '10 Sep', title: 'Matter opened', note: 'Awaiting case file from client.', flag: false }], drafts: [],
    postJudgment: null
  },
  { id: 'm5', title: 'Kapoor Textiles v. Union of India', court: 'High Court, Delhi', caseNo: 'MAT-2026-0128', area: 'Tax / Writ', stage: 1, lead: 'Gargee S.', leadInitials: 'GS', updated: '2 days ago', nextHearing: null, tags: ['GST'], facts: {}, authorities: [], arguments: [], counterArgs: [], tasks: [], strengths: [], documents: [], timeline: [], drafts: [], postJudgment: null },
  { id: 'm6', title: 'Fernandes v. Fernandes', court: 'Family Court, Mumbai', caseNo: 'MAT-2026-0121', area: 'Family Law', stage: 3, lead: 'Janhavi D.', leadInitials: 'JD', updated: '3 days ago', nextHearing: null, tags: ['Divorce'], facts: {}, authorities: [], arguments: [], counterArgs: [], tasks: [], strengths: [], documents: [], timeline: [], drafts: [], postJudgment: null },
  { id: 'm7', title: 'Rao Constructions v. MSEDCL', court: 'Bombay High Court', caseNo: 'MAT-2026-0117', area: 'Arbitration', stage: 2, lead: 'Shreyas A.', leadInitials: 'SA', updated: '4 days ago', nextHearing: null, tags: ['Arbitration'], facts: {}, authorities: [], arguments: [], counterArgs: [], tasks: [], strengths: [], documents: [], timeline: [], drafts: [], postJudgment: null },
  {
    id: 'm8', title: 'Joshi v. National Insurance Co.', court: 'MACT, Pune', caseNo: 'MAT-2026-0109', area: 'Motor Accident Claim', stage: 4,
    lead: 'Gargee S.', leadInitials: 'GS', updated: '1 week ago', nextHearing: null, tags: ['Compensation', 'Award delivered'],
    facts: {
      objective: 'Secure fair compensation for permanent disability arising from the accident.',
      relief: 'Compensation under the Motor Vehicles Act, 1988 for loss of earning capacity and medical expense.',
      issue: 'Whether the Tribunal correctly assessed loss of future earning capacity.'
    },
    authorities: [], arguments: [], counterArgs: [],
    tasks: [{ label: 'Review award computation before advising on appeal', done: false }],
    strengths: [], documents: [{ name: 'MACT_Award_Order.pdf', type: 'pdf', added: '4 Sep', size: '380 KB', status: 'Key document' }],
    timeline: [
      { date: '2 Sep', title: 'Award pronounced', note: 'Tribunal awarded ₹18.4L against the ₹32L claimed.', flag: false },
      { date: '4 Sep', title: 'Certified copy received', note: 'Award order indexed and appeal window calculated.', flag: false }
    ],
    drafts: [],
    postJudgment: {
      outcome: 'partial', outcomeLabel: 'Partially allowed', judgmentDate: '2 September 2026',
      summary: 'The Tribunal awarded ₹18.4 lakh against the ₹32 lakh claimed, accepting permanent disability at 40% but applying a lower multiplier for future earning loss than sought, and disallowing the claimed attendant-care component for want of medical evidence.',
      appealDeadline: '2026-10-02', appealWindowDays: 90,
      grounds: [
        { label: 'Multiplier applied', score: 74, tone: 'good', note: 'Tribunal used age-38 multiplier of 15; settled precedent supports 16 for this age band — a correctable error.' },
        { label: 'Attendant-care disallowance', score: 55, tone: 'mid', note: 'Medical evidence for attendant care exists but was not formally proved at trial — needs a fresh affidavit on appeal.' },
        { label: 'Contributory negligence finding', score: 30, tone: 'low', note: 'Tribunal’s 10% contributory negligence finding is fact-based and difficult to disturb in appeal.' }
      ],
      nextSteps: [
        { label: 'Advise client on appeal prospects and likely additional recovery', done: false },
        { label: 'File appeal within the limitation window if instructed', done: false },
        { label: 'Close the matter file if no appeal is instructed', done: false }
      ]
    }
  }
];

/* ---------------------------------------------------------------------------
   Calendar — the single home for every date (hearings, deadlines, notes)
   ------------------------------------------------------------------------- */
const TODAY_ISO = '2026-09-11';

const HEARINGS = [
  { date: '2026-09-11', time: '10:30 AM', matterId: 'm1', court: 'Bombay High Court · Courtroom 52', purpose: 'Anticipatory bail hearing', status: 'ready' },
  { date: '2026-09-11', time: '02:15 PM', matterId: 'm2', court: 'City Civil Court', purpose: 'Evidence hearing', status: 'prep' },
  { date: '2026-09-11', time: '04:00 PM', matterId: 'm3', court: 'Labour Court, Pune', purpose: 'First listing', status: 'risk' },
  { date: '2026-09-12', time: '11:00 AM', matterId: 'm7', court: 'Bombay High Court', purpose: 'Arbitration — interim application', status: 'prep' },
  { date: '2026-09-15', time: '03:00 PM', matterId: 'm5', court: 'High Court, Delhi', purpose: 'Writ admission hearing', status: 'risk' },
  { date: '2026-09-18', time: '10:00 AM', matterId: 'm1', court: 'Bombay High Court · Courtroom 52', purpose: 'Bail hearing — compliance affidavit taken on record', status: 'prep' },
  { date: '2026-09-24', time: '12:30 PM', matterId: 'm8', court: 'MACT, Pune', purpose: 'Compensation — final arguments', status: 'prep' }
];

const DEADLINES = [
  { date: '2026-09-12', title: 'File rejoinder in Aarohi Estates matter', matterId: 'm2', type: 'Filing' },
  { date: '2026-09-15', title: 'Limitation expires — Kapoor Textiles writ', matterId: 'm5', type: 'Limitation' },
  { date: '2026-09-18', title: 'Compliance affidavit due — Sharma matter', matterId: 'm1', type: 'Compliance' },
  { date: '2026-09-22', title: 'Reply to legal notice — Mehra matter', matterId: 'm3', type: 'Filing' }
];

const NOTES = {
  '2026-09-11': [{ id: uid('note'), text: 'Carry originals of the cooperation email chain to court — registry asked for hard copies.', createdAt: 'Yesterday' }]
};

const pad2 = n => String(n).padStart(2, '0');
const isoDate = (y, m, d) => `${y}-${pad2(m + 1)}-${pad2(d)}`;
const parseISODateStr = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const hearingsOn = iso => HEARINGS.filter(h => h.date === iso);
const deadlinesOn = iso => DEADLINES.filter(d => d.date === iso);
const notesOn = iso => NOTES[iso] || [];
function dayBadge(iso) { const d = parseISODateStr(iso); return { num: d.getDate(), mon: d.toLocaleDateString('en-IN', { month: 'short' }).toUpperCase() }; }
function to24h(t) {
  const m = String(t).match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return t;
  let h = Number(m[1]) % 12;
  if (m[3].toUpperCase() === 'PM') h += 12;
  return `${pad2(h)}:${m[2]}`;
}
function fmtDate(iso, short = false) { if (!iso) return '—'; const d = parseISODateStr(iso); return d.toLocaleDateString('en-IN', { day: 'numeric', month: short ? 'short' : 'long', year: 'numeric' }); }

const AUDIT_LOG = [
  { time: '11 Sep · 09:42', agent: 'Review & Critique Agent', action: 'Re-verified 18 citations in anticipatory bail draft against the knowledge graph — 0 unresolved.', matter: 'Sharma v. State', status: 'ok',
    trace: ['Pulled every citation referenced in the draft (18 total).', 'Resolved each one against a real node in the Neo4j knowledge graph.', 'Flagged 0 unresolved — nothing was surfaced without a matching source.', 'Handed the draft to the lawyer for final review.'] },
  { time: '11 Sep · 09:12', agent: 'Drafting Agent', action: 'Produced first draft of anticipatory bail application from verified research.', matter: 'Sharma v. State', status: 'ok',
    trace: ['Read the verified research findings approved earlier by the lawyer.', 'Selected the Bombay High Court application template.', 'Drafted numbered paragraphs, citing only sources already retrieved and verified.', 'Sent the draft to the Review & Critique Agent before showing it to the lawyer.'] },
  { time: '10 Sep · 17:03', agent: 'Evidence Agent', action: 'Flagged an 11-day timeline inconsistency between FIR and bank record.', matter: 'Sharma v. State', status: 'warn',
    trace: ['Cross-referenced dates mentioned in the FIR against the bank transaction summary.', 'Found the FIR’s alleged first-contact date is 11 days after the transaction it describes.', 'Flagged this as a potential inconsistency rather than resolving it automatically.', 'Surfaced the flag on the Evidence tab for the lawyer to assess.'] },
  { time: '10 Sep · 14:20', agent: 'Shreyas A. (lawyer)', action: 'Approved research findings for use in drafting.', matter: 'Sharma v. State', status: 'approve' },
  { time: '10 Sep · 11:47', agent: 'Research Agent', action: 'Retrieved 14 judgments and 2 statutes for Section 482 BNSS query; self-assessed as sufficient.', matter: 'Sharma v. State', status: 'ok',
    trace: ['Classified the query as anticipatory bail · criminal law.', 'Ran dense retrieval over the vector store and traversed the knowledge graph.', 'Retrieved 14 judgments and 2 statutes; checked coverage against the query.', 'Self-assessed retrieval as sufficient and stopped iterating.'] },
  { time: '09 Sep · 16:05', agent: 'Intake Agent', action: 'Structured client narrative into facts, parties and relief sought.', matter: 'Sharma v. State', status: 'ok' }
];

const GRAPH_INTERPRETS = [
  { precedent: 'sushila', statute: 's438' },
  { precedent: 'siddharam', statute: 's438' },
  { precedent: 'saradamani', statute: 's55' }
];

const KNOWLEDGE = {
  statutes: [
    { key: 's438', title: 'Section 482 — Bharatiya Nagarik Suraksha Sanhita, 2023 (formerly CrPC s.438)', body: 'Direction for grant of bail to person apprehending arrest.', used: 6 },
    { key: 's55', title: 'Section 55 — Indian Contract Act, 1872', body: 'Effect of failure to perform at fixed time, in contract in which time is essential.', used: 2 },
    { key: 's25f', title: 'Section 25-F — Industrial Disputes Act, 1947', body: 'Conditions precedent to retrenchment of workmen.', used: 1 },
    { key: 'art113', title: 'Article 113 — Limitation Act, 1963', body: 'Limitation period for suits with no specific provision: three years.', used: 1 }
  ],
  precedents: [
    { key: 'sushila', title: 'Sushila Aggarwal v. State (NCT of Delhi)', body: '2020 · 5 SCC 1 · Constitution Bench on the scope and duration of anticipatory bail.', used: 4 },
    { key: 'siddharam', title: 'Siddharam Satlingappa Mhetre v. State of Maharashtra', body: '2011 · 1 SCC 694 · Anticipatory bail should not be limited by a fixed time period.', used: 3 },
    { key: 'saradamani', title: 'M/s Saradamani Kandappan v. S. Rajalakshmi', body: '2011 · 12 SCC 18 · On time being of the essence in property contracts.', used: 1 }
  ]
};

/* ---------------------------------------------------------------------------
   eCourts — case status synced from the national eCourts services. Keyed by
   matter. Matters without a record simply haven't been synced yet.

   These are the last-known values shown instantly; the live values come from the
   ecourts-service microservice (sibling repo) when the user hits "Re-sync". If
   that service is offline, the UI falls back to what's here — the demo never
   breaks. In production this fetch would run on the LegalAI backend, not the
   browser, so the API key never ships to the client.
   ------------------------------------------------------------------------- */
const ECOURTS_SERVICE = { url: 'http://localhost:8080', key: 'demo-key-firm-a' };

const ECOURTS = {
  m1: {
    cnr: 'MHCC01-001234-2026', filed: '2026-09-03', regDate: '2026-09-04', stage: 'Pending — Anticipatory bail',
    nextDate: '2026-09-11', nextPurpose: 'Anticipatory bail hearing', bench: 'Coram: Justice A. R. Deshpande', status: 'Listed',
    orders: [
      { date: '2026-09-04', text: 'Application registered. Listed for hearing on 11.09.2026 before the appropriate bench.' },
      { date: '2026-09-03', text: 'Anticipatory bail application filed. Registry defects cleared the same day.' }
    ]
  },
  m2: {
    cnr: 'MHCC02-004521-2026', filed: '2026-08-20', regDate: '2026-08-22', stage: 'Evidence',
    nextDate: '2026-09-11', nextPurpose: 'Evidence hearing', bench: 'Coram: Judge, City Civil Court', status: 'Listed',
    orders: [
      { date: '2026-08-28', text: 'Issues framed. Matter posted for recording of evidence.' },
      { date: '2026-08-22', text: 'Suit registered; summons issued to the respondent.' }
    ]
  },
  m3: {
    cnr: 'MHLC03-000988-2026', filed: '2026-09-01', regDate: '2026-09-02', stage: 'Fresh — First listing',
    nextDate: '2026-09-11', nextPurpose: 'First listing', bench: 'Coram: Presiding Officer, Labour Court', status: 'Listed',
    orders: [{ date: '2026-09-02', text: 'Reference registered and posted for first listing.' }]
  },
  m5: {
    cnr: 'DLHC05-013207-2026', filed: '2026-08-30', regDate: '2026-09-01', stage: 'Writ — Admission',
    nextDate: '2026-09-15', nextPurpose: 'Writ admission hearing', bench: 'Coram: Division Bench', status: 'Listed',
    orders: [{ date: '2026-09-01', text: 'Writ petition registered; listed for admission on 15.09.2026.' }]
  },
  m7: {
    cnr: 'MHHC07-011876-2026', filed: '2026-08-12', regDate: '2026-08-14', stage: 'Arbitration — Interim',
    nextDate: '2026-09-12', nextPurpose: 'Interim application under Section 9', bench: 'Coram: Justice S. M. Kulkarni', status: 'Adjourned',
    orders: [
      { date: '2026-09-05', text: 'On request of parties, matter adjourned to 12.09.2026 for interim application.' },
      { date: '2026-08-14', text: 'Section 9 petition registered.' }
    ]
  },
  m8: {
    cnr: 'MHMA08-002310-2026', filed: '2026-07-18', regDate: '2026-07-20', stage: 'Final arguments',
    nextDate: '2026-09-24', nextPurpose: 'Compensation — final arguments', bench: 'Coram: Member, MACT', status: 'Reserved for arguments',
    orders: [{ date: '2026-09-02', text: 'Evidence closed. Matter posted for final arguments.' }]
  }
};

/* ---------------------------------------------------------------------------
   Sample judgments — shown only when the case-law service is offline.
   ------------------------------------------------------------------------- */
const CASELAW = [
  { key: 'sushila', title: 'Sushila Aggarwal v. State (NCT of Delhi)', cite: '(2020) 5 SCC 1', court: 'Supreme Court of India', year: 2020, area: 'Criminal · Anticipatory bail', bench: '5-Judge Constitution Bench',
    snippet: 'Anticipatory bail granted under Section 438 CrPC need not invariably be limited to a fixed period; it may, in the facts of a case, enure till the end of trial.' },
  { key: 'gurbaksh', title: 'Gurbaksh Singh Sibbia v. State of Punjab', cite: '(1980) 2 SCC 565', court: 'Supreme Court of India', year: 1980, area: 'Criminal · Anticipatory bail', bench: '5-Judge Constitution Bench',
    snippet: 'Section 438 is a procedural provision concerned with personal liberty; its scope cannot be read down by imposing conditions not found in the statute.' },
  { key: 'siddharam', title: 'Siddharam Satlingappa Mhetre v. State of Maharashtra', cite: '(2011) 1 SCC 694', court: 'Supreme Court of India', year: 2011, area: 'Criminal · Anticipatory bail', bench: '2-Judge Bench',
    snippet: 'A blanket time limit on anticipatory bail is contrary to the legislative intent; relief should ordinarily continue until the conclusion of the trial.' },
  { key: 'arnesh', title: 'Arnesh Kumar v. State of Bihar', cite: '(2014) 8 SCC 273', court: 'Supreme Court of India', year: 2014, area: 'Criminal · Arrest', bench: '2-Judge Bench',
    snippet: 'Automatic arrest on registration of an offence is impermissible; officers must record reasons and satisfy the Section 41 CrPC checklist before arrest.' },
  { key: 'satender', title: 'Satender Kumar Antil v. CBI', cite: '(2022) 10 SCC 51', court: 'Supreme Court of India', year: 2022, area: 'Criminal · Bail', bench: '2-Judge Bench',
    snippet: 'Bail is the rule and jail the exception; courts must guard against unnecessary arrest and mechanical remand, particularly in economic offences.' },
  { key: 'balchand', title: 'State of Rajasthan v. Balchand', cite: '(1977) 4 SCC 308', court: 'Supreme Court of India', year: 1977, area: 'Criminal · Bail', bench: '3-Judge Bench',
    snippet: 'The basic rule may perhaps be tersely put as bail, not jail, except where there are circumstances suggestive of fleeing from justice or tampering.' },
  { key: 'saradamani', title: 'M/s Saradamani Kandappan v. S. Rajalakshmi', cite: '(2011) 12 SCC 18', court: 'Supreme Court of India', year: 2011, area: 'Civil · Contract', bench: '2-Judge Bench',
    snippet: 'The general rule that time is not of the essence in immovable-property contracts requires reconsideration given present-day escalation in prices.' },
  { key: 'olga', title: 'Olga Tellis v. Bombay Municipal Corporation', cite: '(1985) 3 SCC 545', court: 'Supreme Court of India', year: 1985, area: 'Constitutional · Article 21', bench: '5-Judge Constitution Bench',
    snippet: 'The right to livelihood is an integral facet of the right to life under Article 21 and cannot be extinguished without a just and fair procedure.' },
  { key: 'excel', title: 'Excel Crop Care Ltd. v. Competition Commission of India', cite: '(2017) 8 SCC 47', court: 'Supreme Court of India', year: 2017, area: 'Commercial · Competition', bench: '2-Judge Bench',
    snippet: 'Penalty for anti-competitive conduct is to be computed on relevant turnover, not total turnover, to keep the sanction proportionate.' },
  { key: 'vishaka', title: 'Vishaka v. State of Rajasthan', cite: '(1997) 6 SCC 241', court: 'Supreme Court of India', year: 1997, area: 'Service · Workplace', bench: '3-Judge Bench',
    snippet: 'In the absence of enacted law, guidelines are laid down to prevent sexual harassment at the workplace, binding until suitable legislation is made.' }
];

/* Client contacts for WhatsApp reminders (phone numbers partly masked). */
const CLIENTS = {
  m1: { name: 'Rohan Sharma', phone: '+91 98••• ••012' },
  m2: { name: 'Aarohi Estates — Mr. Desai', phone: '+91 99••• ••140' },
  m3: { name: 'Neha Mehra', phone: '+91 90••• ••077' },
  m5: { name: 'Kapoor Textiles — Ms. Kapoor', phone: '+91 98••• ••005' },
  m7: { name: 'Rao Constructions', phone: '+91 97••• ••318' },
  m8: { name: 'Sunil Joshi', phone: '+91 96••• ••433' }
};

/* ---------------------------------------------------------------------------
   Conversations (Ask LegalAI)
   ------------------------------------------------------------------------- */
const CONVERSATIONS = [
  {
    id: 'c1', title: 'Anticipatory bail — Section 482 BNSS considerations', matterId: 'm1', updated: '18 min ago',
    messages: [
      { role: 'user', text: 'What are the key considerations for anticipatory bail under Section 482 BNSS (formerly Section 438 CrPC) in a case alleging breach of trust?' },
      {
        role: 'ai',
        text: 'Section 482 BNSS (formerly Section 438 CrPC) asks the court to balance personal liberty against the needs of the investigation.<p>Courts weigh the nature and gravity of the allegation, the applicant’s prior conduct, the likelihood of cooperation, and whether custodial interrogation is genuinely necessary <cite>1</cite><cite>2</cite>. In economic-offence matters such as this one, a clear, documented record of cooperation and a focused, point-by-point response to the FIR are especially persuasive <cite>3</cite>.</p>',
        citations: [
          { n: 1, title: 'Sushila Aggarwal v. State (NCT of Delhi)', meta: '2020 · 5 SCC 1 · Supreme Court' },
          { n: 2, title: 'Siddharam Satlingappa Mhetre v. State of Maharashtra', meta: '2011 · 1 SCC 694 · Supreme Court' },
          { n: 3, title: 'Section 482, Bharatiya Nagarik Suraksha Sanhita, 2023 (formerly CrPC s.438)', meta: 'Statute · Bare Act' }
        ]
      }
    ]
  },
  {
    id: 'c2', title: 'Timeline inconsistency in the FIR', matterId: 'm1', updated: '1 hr ago',
    messages: [
      { role: 'user', text: 'Is there anything in the evidence that contradicts the FIR’s account?' },
      {
        role: 'ai',
        text: 'Yes — one material inconsistency.<p>The FIR places the complainant’s first contact with the applicant on <b>18 February</b>. The bank transaction summary you uploaded shows the transaction referenced in the FIR occurred on <b>07 February</b> — eleven days earlier <cite>1</cite>. This is worth raising in the hearing affidavit, since it weakens the alleged sequence of events.</p>',
        citations: [{ n: 1, title: 'Bank_transaction_summary.pdf', meta: 'Evidence · Sharma v. State · p. 2' }]
      }
    ]
  },
  {
    id: 'c3', title: 'Limitation period for a commercial suit', matterId: null, updated: 'Yesterday',
    messages: [
      { role: 'user', text: 'What is the limitation period for filing a suit for breach of a commercial contract with no specific limitation clause?' },
      {
        role: 'ai',
        text: 'Three years from the date the breach occurs, under the residuary provision.<p>Article 113 of the Limitation Act, 1963 applies to suits for which no specific period is provided elsewhere in the Schedule, and prescribes three years running from the date the right to sue accrues <cite>1</cite>. Courts have read “right to sue accrues” as the date of breach, not the date of discovery, unless fraud is pleaded <cite>2</cite>.</p>',
        citations: [
          { n: 1, title: 'Article 113, Limitation Act, 1963', meta: 'Statute · Bare Act' },
          { n: 2, title: 'M/s Saradamani Kandappan v. S. Rajalakshmi', meta: '2011 · 12 SCC 18 · Supreme Court' }
        ]
      }
    ]
  }
];

/* ---------------------------------------------------------------------------
   Response generation for Ask LegalAI (simulated agent pipeline)
   ------------------------------------------------------------------------- */
function generateResponse(text, matter) {
  const t = text.toLowerCase();
  const who = matter ? matter.title : 'your query';
  if (/bail|438|482|custody|arrest/.test(t)) {
    return {
      text: 'Courts assessing anticipatory bail weigh four factors together.<p>The nature and gravity of the accusation, the applicant’s antecedents, the likelihood of the applicant fleeing, and whether the accusation appears intended to injure or humiliate <cite>1</cite>. The Supreme Court has clarified that protection under the former Section 438 CrPC, now Section 482 BNSS, need not be time-limited and can continue until the end of trial, absent special circumstances <cite>2</cite>.</p>',
      citations: [
        { n: 1, title: 'Siddharam Satlingappa Mhetre v. State of Maharashtra', meta: '2011 · 1 SCC 694 · Supreme Court' },
        { n: 2, title: 'Sushila Aggarwal v. State (NCT of Delhi)', meta: '2020 · 5 SCC 1 · Supreme Court' }
      ]
    };
  }
  if (/evidence|contradict|fir|timeline|exhibit/.test(t)) {
    return {
      text: `I checked the indexed evidence for ${esc(who)}.<p>One inconsistency stands out: the FIR’s narrative timeline does not align with the dated bank record already in the file <cite>1</cite>. I’d recommend addressing this directly in the affidavit rather than leaving it for the State to raise first.</p>`,
      citations: [{ n: 1, title: 'Bank_transaction_summary.pdf', meta: 'Evidence · indexed document, p. 2' }]
    };
  }
  if (/draft|notice|application|petition|written statement|affidavit/.test(t)) {
    return {
      text: 'I can prepare a first draft in the correct court format.<p>A standard structure covers: (1) the cause title and parties, (2) a numbered statement of facts, (3) the specific relief sought with the governing provision, and (4) an undertaking where relevant <cite>1</cite>. I’ll cite only sources retrieved and verified for this matter — open the <b>Drafting</b> tab on the matter to review the generated draft before it is used.</p>',
      citations: [{ n: 1, title: 'Bombay High Court (Original Side) Rules, 2018', meta: 'Procedural rules · format reference' }]
    };
  }
  if (/limitation|deadline|time.?barred|prescription/.test(t)) {
    return {
      text: 'The residuary limitation period is three years.<p>Where no specific article of the Limitation Act, 1963 applies, Article 113 prescribes three years from the date the right to sue accrues — ordinarily the date of breach <cite>1</cite>. I’d recommend confirming the accrual date against the case file before relying on this.</p>',
      citations: [{ n: 1, title: 'Article 113, Limitation Act, 1963', meta: 'Statute · Bare Act' }]
    };
  }
  return {
    text: `I searched Indian statutes and reported judgments relevant to ${esc(who)}.<p>Based on what’s indexed so far, I found related material but would narrow this further with more specifics — the applicable section, the court, or the exact relief you’re considering. I’ll only use sources I can verify against the knowledge graph <cite>1</cite>.</p>`,
    citations: [{ n: 1, title: 'Case-law index · Supreme Court & High Courts', meta: 'General primary-law corpus' }]
  };
}

/* ---------------------------------------------------------------------------
   Small data lookups
   ------------------------------------------------------------------------- */
const matterById = id => MATTERS.find(m => m.id === id);
const initialsColor = i => ['#0D7A63', '#9c4a54', '#3d7a52', '#5B4FA8'][i % 4];

/* ---------------------------------------------------------------------------
   Router
   ------------------------------------------------------------------------- */
const state = { sidebarOpen: false, threadsOpen: false, activeConversation: null, caseChatScope: null };

function parseHash() {
  const raw = (location.hash || '#/today').slice(1);
  const [pathPart, queryPart] = raw.split('?');
  const parts = pathPart.split('/').filter(Boolean);
  const query = new URLSearchParams(queryPart || '');
  return { parts, query };
}

function navigate(hash) { location.hash = hash; }

function route() {
  const { parts, query } = parseHash();
  const key = parts[0] || 'today';
  let content = '', flush = false, crumb = '', matterCtx = null, matterTab = null;

  if (key === 'today') { content = pageToday(); crumb = 'Today'; }
  else if (key === 'ask') { content = pageAsk(parts[1], query); flush = true; crumb = 'Ask LegalAI'; }
  else if (key === 'case-chat') { content = pageCaseChat(parts[1], query); flush = true; crumb = 'Case Chat'; }
  else if (key === 'caselaw') { content = pageCaseLaw(query); crumb = 'Case law'; }
  else if (key === 'ecourts') { content = pageECourts(); crumb = 'eCourts'; }
  else if (key === 'reminders') { content = pageReminders(); crumb = 'Reminders'; }
  else if (key === 'deadlines') { content = pageDeadlines(query); crumb = 'Limitation & deadlines'; }
  else if (key === 'matters' && parts[1]) {
    matterCtx = matterById(parts[1]);
    matterTab = parts[2] || 'overview';
    if (matterCtx && matterTab === 'chat') { content = pageMatterChat(matterCtx, parts[3], query); flush = true; }
    else content = pageMatterDetail(parts[1], matterTab);
    crumb = matterCtx ? matterCtx.title : 'Matters';
  }
  else if (key === 'matters') { content = pageMattersList(); crumb = 'Matters'; }
  else if (key === 'calendar') { content = pageCalendar(parts[1]); crumb = 'Calendar'; }
  else if (key === 'documents') { content = pageDocuments(); crumb = 'Documents'; }
  else if (key === 'knowledge') { content = pageKnowledge(); crumb = 'Knowledge base'; }
  else if (key === 'audit') { content = pageAudit(); crumb = 'Audit trail'; }
  else if (key === 'settings') { content = pageSettings(); crumb = 'Settings'; }
  else { content = pageToday(); crumb = 'Today'; }

  $('#app').innerHTML = shell({ activeKey: key, crumb, content, flush, matterCtx, matterTab, pageClass: key === 'calendar' ? 'cal-page' : '' });
  bindShell();
  bindPage(key, parts, query);
  if (!flush) window.scrollTo({ top: 0 });
}

/* ---------------------------------------------------------------------------
   Shell (sidebar + topbar)
   ------------------------------------------------------------------------- */
function navItem(href, active, icon, label, badge) {
  return `<a class="nav-item${active ? ' active' : ''}" href="${href}"><svg class="ic"><use href="#i-${icon}"/></svg><span>${label}</span>${badge ? `<em>${badge}</em>` : ''}</a>`;
}

function globalSidebar(activeKey) {
  const calCount = hearingsOn(TODAY_ISO).length + deadlinesOn(TODAY_ISO).length;
  return `
    <a class="ask-launch" href="#/ask"><svg class="ic"><use href="#i-spark"/></svg><span class="ask-launch-copy"><strong>Ask LegalAI</strong><small>General research &amp; drafting chat</small></span></a>
    <div class="side-scroll">
      <div class="side-section">
        <p class="side-label">Workspace</p>
        <nav class="nav-list">
          ${navItem('#/today', activeKey === 'today', 'today', 'Today')}
          ${navItem('#/matters', activeKey === 'matters', 'matters', 'Matters', MATTERS.length)}
          ${navItem('#/calendar', activeKey === 'calendar', 'calendar', 'Calendar', calCount)}
          ${navItem('#/documents', activeKey === 'documents', 'docs', 'Documents')}
        </nav>
      </div>
      <div class="side-section">
        <p class="side-label">Research</p>
        <nav class="nav-list">
          ${navItem('#/caselaw', activeKey === 'caselaw', 'book', 'Case law')}
          ${navItem('#/case-chat', activeKey === 'case-chat', 'chat', 'Case chat')}
          ${navItem('#/knowledge', activeKey === 'knowledge', 'network', 'Knowledge base')}
        </nav>
      </div>
      <div class="side-section">
        <p class="side-label">Court &amp; clients</p>
        <nav class="nav-list">
          ${navItem('#/ecourts', activeKey === 'ecourts', 'court', 'eCourts')}
          ${navItem('#/deadlines', activeKey === 'deadlines', 'clock', 'Limitation')}
          ${navItem('#/reminders', activeKey === 'reminders', 'whatsapp', 'Reminders', rmDueCount() || '')}
        </nav>
      </div>
      <div class="side-section">
        <p class="side-label">Trust</p>
        <nav class="nav-list">
          ${navItem('#/audit', activeKey === 'audit', 'shield', 'Audit trail')}
        </nav>
      </div>
    </div>`;
}

/* Case nav grouped by the litigation lifecycle so the ten sections read as a
   workflow (build → court → outcome) rather than a flat list. */
const CASE_NAV_GROUPS = [
  { label: '', items: [['overview', 'Overview', 'matters'], ['chat', 'Ask AI', 'spark']] },
  { label: 'Build the case', items: [['research', 'Research', 'research'], ['evidence', 'Evidence', 'docs'], ['drafting', 'Drafting', 'draft'], ['arguments', 'Arguments', 'scale']] },
  { label: 'In court', items: [['hearing', 'Hearing prep', 'gavel'], ['status', 'Case status', 'court']] },
  { label: 'Outcome', items: [['postjudgment', 'Post-judgment', 'flag'], ['timeline', 'Timeline', 'timeline']] }
];

function caseSidebar(m, tab) {
  return `
    <a class="side-back" href="#/matters"><svg class="ic" style="transform:rotate(180deg)"><use href="#i-arrow"/></svg>All matters</a>
    <div class="side-case-head">
      <p class="side-case-eyebrow">Current case</p>
      <strong class="side-case-title">${esc(m.title)}</strong>
      <small class="side-case-meta">${esc(m.area)}</small>
      <div class="side-case-stage"><span>Stage ${Math.min(m.stage + 1, STAGE_LABELS.length)} of ${STAGE_LABELS.length} · ${esc(STAGE_LABELS[m.stage] || 'Intake')}</span>
        <span class="stage-track">${STAGE_LABELS.map((_, i) => `<i class="${i < m.stage ? 'done' : i === m.stage ? 'now' : ''}"></i>`).join('')}</span></div>
    </div>
    <div class="side-scroll">
      ${CASE_NAV_GROUPS.map(g => `<div class="side-section">
        ${g.label ? `<p class="side-label">${g.label}</p>` : ''}
        <nav class="nav-list">${g.items.map(([key, label, icon]) => navItem(`#/matters/${m.id}/${key}`, tab === key, icon, label)).join('')}</nav>
      </div>`).join('')}
    </div>`;
}

function shell({ activeKey, crumb, content, flush, matterCtx, matterTab, pageClass = '' }) {
  const sidebarInner = matterCtx ? caseSidebar(matterCtx, matterTab) : globalSidebar(activeKey);
  return `
  <div class="app-shell">
    <aside class="sidebar${matterCtx ? ' sidebar-case' : ''}" id="sidebar">
      <div class="brand"><span class="brand-mark">L</span><span class="brand-word">Legal<em>AI</em></span></div>
      <div class="brand-sub">Litigation workspace</div>
      ${sidebarInner}
      <div class="sidebar-foot">
        <nav class="nav-list">${navItem('#/settings', activeKey === 'settings', 'settings', 'Settings')}</nav>
        <div class="user-card">
          <div class="avatar">SA</div>
          <div class="user-copy"><strong>Shreyas A.</strong><small>Senior associate</small></div>
        </div>
      </div>
    </aside>

    <div class="main">
      <header class="topbar">
        <button class="menu-toggle" id="menuToggle" aria-label="Open navigation"><svg class="ic"><use href="#i-menu"/></svg></button>
        <div class="crumb"><a href="#/today"><b>LegalAI</b></a>${matterCtx
          ? `<svg class="ic"><use href="#i-chevron"/></svg><a href="#/matters">Matters</a><svg class="ic"><use href="#i-chevron"/></svg><a href="#/matters/${matterCtx.id}/overview">${esc(matterCtx.title)}</a><svg class="ic"><use href="#i-chevron"/></svg><span>${esc(TAB_LABELS[matterTab] || 'Overview')}</span>`
          : `<svg class="ic"><use href="#i-chevron"/></svg><span>${esc(crumb)}</span>`}</div>
        <button class="topbar-search" id="openCmdk"><svg class="ic"><use href="#i-research"/></svg><span>Search or jump to anything…</span><kbd>⌘K</kbd></button>
        <div class="top-actions">
          <span class="demo-badge" title="Sample data. Nothing here is sent to a court, a client or a model.">Demo · sample data</span>
          <button class="icon-btn has-dot" data-action="open-reminders" aria-label="Notifications"><svg class="ic"><use href="#i-bell"/></svg><i></i></button>
        </div>
      </header>
      <div class="page${flush ? ' flush' : ''}${pageClass ? ' ' + pageClass : ''}">${content}</div>
    </div>
  </div>

  <div class="modal-backdrop" id="modalBackdrop"></div>
  <section class="modal intake-modal" id="matterModal" role="dialog" aria-modal="true">
    <header><div><p class="eyebrow">Guided intake</p><h2>Create a matter</h2></div><button class="icon-btn" data-action="close-modal" aria-label="Close"><svg class="ic"><use href="#i-close"/></svg></button></header>
    <div class="intake-progress">${INTAKE_STEPS.map((_, i) => `<i class="intake-dot" id="intakeDot${i}"></i>`).join('')}<i class="intake-dot" id="intakeDot${INTAKE_STEPS.length}"></i></div>
    <div id="intakeBody" class="intake-body">${renderIntakeBody()}</div>
  </section>

  <section class="modal cmdk" id="cmdkModal" role="dialog" aria-modal="true">
    <div class="cmdk-input"><svg class="ic"><use href="#i-research"/></svg><input id="cmdkInput" placeholder="Search or jump to anything — a case, a section, a judgment…" /><kbd>ESC</kbd></div>
    <div id="cmdkResults"></div>
  </section>

  <section class="modal wb-modal" id="wbModal" role="dialog" aria-modal="true"></section>`;
}

function bindShell() {
  $('#menuToggle')?.addEventListener('click', () => $('#sidebar').classList.toggle('open'));
  $('#openCmdk')?.addEventListener('click', openCmdk);
  $('[data-action="open-reminders"]')?.addEventListener('click', () => navigate('#/reminders'));
  $('#modalBackdrop').addEventListener('click', closeModals);
  $$('[data-action="close-modal"]').forEach(b => b.addEventListener('click', closeModals));
  bindIntakeModal();
  document.addEventListener('keydown', onGlobalKeydown);
  $('#cmdkInput')?.addEventListener('input', renderCmdkResults);
}

function onGlobalKeydown(e) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openCmdk(); }
  if (e.key === 'Escape') closeModals();
}
document.removeEventListener?.('keydown', onGlobalKeydown);

function openModal(id) { $('#modalBackdrop').classList.add('open'); $(id).classList.add('open'); }
function closeModals() { $('#modalBackdrop').classList.remove('open'); $$('.modal.open').forEach(m => m.classList.remove('open')); }
function openCmdk() { openModal('#cmdkModal'); renderCmdkResults(); setTimeout(() => $('#cmdkInput')?.focus(), 60); }

const CMDK_NAV = [
  { href: '#/today', icon: 'today', label: 'Today', sub: 'Dashboard' },
  { href: '#/matters', icon: 'matters', label: 'Matters', sub: 'All cases' },
  { href: '#/calendar', icon: 'calendar', label: 'Calendar', sub: 'Hearings & deadlines' },
  { href: '#/documents', icon: 'docs', label: 'Documents', sub: 'File library' },
  { href: '#/caselaw', icon: 'book', label: 'Case law', sub: 'Search judgments' },
  { href: '#/case-chat', icon: 'chat', label: 'Case chat', sub: 'Chat by case' },
  { href: '#/knowledge', icon: 'network', label: 'Knowledge base', sub: 'Statutes & precedents' },
  { href: '#/ecourts', icon: 'court', label: 'eCourts', sub: 'Case status & cause lists' },
  { href: '#/deadlines', icon: 'clock', label: 'Limitation', sub: 'Work out a last date' },
  { href: '#/reminders', icon: 'whatsapp', label: 'Reminders', sub: 'WhatsApp reminders' },
  { href: '#/audit', icon: 'shield', label: 'Audit trail', sub: 'Agent & lawyer log' },
  { href: '#/settings', icon: 'settings', label: 'Settings', sub: 'Profile & AI behaviour' }
];

function renderCmdkResults() {
  const raw = $('#cmdkInput')?.value || '';
  const q = raw.toLowerCase();
  const results = $('#cmdkResults'); if (!results) return;
  const item = (href, icon, strong, sub) => `<a class="cmdk-item" href="${href}"><span class="cmdk-icon"><svg class="ic"><use href="#i-${icon}"/></svg></span><span class="cmdk-item-copy"><strong>${strong}</strong><small>${sub}</small></span></a>`;

  const navHits = CMDK_NAV.filter(n => !q || (n.label + n.sub).toLowerCase().includes(q)).slice(0, 6);
  const matterHits = MATTERS.filter(m => !q || (m.title + m.area + m.caseNo).toLowerCase().includes(q)).slice(0, 4);
  const docHits = MATTERS.flatMap(m => m.documents.map(d => ({ ...d, matter: m.title, matterId: m.id }))).filter(d => !q || d.name.toLowerCase().includes(q)).slice(0, 3);

  results.innerHTML = `
    ${navHits.length ? `<p class="cmdk-label">Go to</p>${navHits.map(n => item(n.href, n.icon, esc(n.label), esc(n.sub))).join('')}` : ''}
    ${matterHits.length ? `<p class="cmdk-label">Matters</p>${matterHits.map(m => item(`#/matters/${m.id}`, 'matters', esc(m.title), `${esc(m.area)} · ${esc(m.caseNo)}`)).join('')}` : ''}
    ${docHits.length ? `<p class="cmdk-label">Documents</p>${docHits.map(d => item(`#/matters/${d.matterId}/evidence`, 'docs', esc(d.name), esc(d.matter))).join('')}` : ''}
    ${q ? `<p class="cmdk-label">Case law</p>${item(`#/caselaw?q=${encodeURIComponent(raw.trim())}`, 'book', `Search case law for “${esc(raw.trim())}”`, 'Supreme Court &amp; every High Court')}` : ''}
    <p class="cmdk-label">Ask LegalAI</p>
    ${item(`#/ask?q=${encodeURIComponent(raw)}`, 'spark', q ? `Ask: “${esc(raw)}”` : 'Start a new conversation', 'Grounded research &amp; drafting')}
  `;
  $$('.cmdk-item', results).forEach(a => a.addEventListener('click', closeModals));
}

/* ---------------------------------------------------------------------------
   Guided intake — the Intake Agent as an actual multi-turn conversation
   instead of a static form. Asks one question at a time, remembers your
   answers, and ends with a structured summary before creating the matter.
   ------------------------------------------------------------------------- */
const INTAKE_STEPS = [
  { key: 'facts', q: 'Let’s start with the facts. What happened, and when?', type: 'textarea', placeholder: 'Describe the facts in your own words — I’ll structure them.' },
  { key: 'parties', q: 'Who are the parties involved?', type: 'parties' },
  { key: 'relief', q: 'What relief or outcome are you seeking?', type: 'text', placeholder: 'e.g. Anticipatory bail, damages, reinstatement…' },
  { key: 'courtarea', q: 'Which court, and what area of practice?', type: 'courtarea' }
];
const intakeState = { step: 0, answers: {} };

function resetIntake() { intakeState.step = 0; intakeState.answers = {}; }

function suggestCategory(text) {
  const t = (text || '').toLowerCase();
  if (/bail|arrest|custody|fir|criminal|accused/.test(t)) return 'Criminal law';
  if (/contract|agreement|breach|payment|delay|vendor|supply/.test(t)) return 'Commercial dispute';
  if (/terminat|employ|salary|workman|dismissal/.test(t)) return 'Employment claim';
  if (/property|lease|tenant|possession|land/.test(t)) return 'Property law';
  return 'General matter';
}

function intakeAnswerSummary(step) {
  const a = intakeState.answers;
  if (step.key === 'parties') return `${a.applicant || 'Applicant'} vs. ${a.respondent || 'Respondent'}`;
  if (step.key === 'courtarea') return `${a.court || ''} · ${a.area || ''}`;
  return a[step.key] || '—';
}

function renderIntakeBody() {
  const { step, answers } = intakeState;
  let history = '';
  for (let i = 0; i < step && i < INTAKE_STEPS.length; i++) {
    const s = INTAKE_STEPS[i];
    history += `<div class="msg ai"><div class="msg-avatar"><svg class="ic" style="width:15px"><use href="#i-spark"/></svg></div><div class="msg-body"><div class="msg-bubble">${esc(s.q)}</div></div></div>`;
    history += `<div class="msg user"><div class="msg-avatar">SA</div><div class="msg-body"><div class="msg-bubble">${esc(intakeAnswerSummary(s))}</div></div></div>`;
  }
  const historyHtml = history ? `<div class="intake-history">${history}</div>` : '';

  if (step < INTAKE_STEPS.length) {
    const s = INTAKE_STEPS[step];
    let inputHtml = '';
    if (s.type === 'textarea') inputHtml = `<textarea id="intakeInput" rows="3" placeholder="${esc(s.placeholder)}">${esc(answers[s.key] || '')}</textarea>`;
    else if (s.type === 'text') inputHtml = `<input id="intakeInput" type="text" placeholder="${esc(s.placeholder)}" value="${esc(answers[s.key] || '')}" />`;
    else if (s.type === 'parties') inputHtml = `<div class="form-grid"><input id="intakeApplicant" placeholder="Applicant / Petitioner" value="${esc(answers.applicant || '')}" /><input id="intakeRespondent" placeholder="Respondent" value="${esc(answers.respondent || '')}" /></div>`;
    else if (s.type === 'courtarea') inputHtml = `<div class="form-grid">
        <select id="intakeArea">${['Criminal law', 'Commercial disputes', 'Employment law', 'Property law'].map(o => `<option ${answers.area === o ? 'selected' : ''}>${o}</option>`).join('')}</select>
        <select id="intakeCourt">${['Bombay High Court', 'Sessions Court', 'District Court', 'Labour Court'].map(o => `<option ${answers.court === o ? 'selected' : ''}>${o}</option>`).join('')}</select>
      </div>`;
    return `${historyHtml}
      <div class="msg ai"><div class="msg-avatar"><svg class="ic" style="width:15px"><use href="#i-spark"/></svg></div><div class="msg-body"><div class="msg-bubble">${esc(s.q)}</div></div></div>
      <div class="intake-input">${inputHtml}</div>
      <div class="modal-actions">${step > 0 ? `<button class="btn btn-ghost" type="button" data-action="intake-back">Back</button>` : `<button class="btn btn-ghost" type="button" data-action="close-modal">Cancel</button>`}<button class="btn btn-primary" type="button" data-action="intake-next">${step === INTAKE_STEPS.length - 1 ? 'Review' : 'Next'}<svg class="ic"><use href="#i-arrow"/></svg></button></div>`;
  }

  const cat = suggestCategory(answers.facts);
  return `${historyHtml}
    <div class="msg ai"><div class="msg-avatar"><svg class="ic" style="width:15px"><use href="#i-spark"/></svg></div><div class="msg-body"><div class="msg-bubble">Here’s what I’ve structured from our conversation. Review it, then create the matter.</div><div class="msg-verify"><svg class="ic"><use href="#i-shield"/></svg>Nothing is saved until you confirm</div></div></div>
    <div class="intake-summary">
      <div class="fact-item"><div class="fact-label">Parties</div><div class="fact-value">${esc(answers.applicant || 'Applicant')} v. ${esc(answers.respondent || 'Respondent')}</div></div>
      <div class="fact-item"><div class="fact-label">Facts</div><div class="fact-value">${esc(answers.facts || '—')}</div></div>
      <div class="fact-item"><div class="fact-label">Relief sought</div><div class="fact-value">${esc(answers.relief || '—')}</div></div>
      <div class="fact-item"><div class="fact-label">Court</div><div class="fact-value">${esc(answers.court || '—')}</div></div>
      <div class="fact-item"><div class="fact-label">Suggested category</div><div class="fact-value"><span class="chip chip-teal">${esc(cat)}</span></div></div>
    </div>
    <div class="modal-actions"><button class="btn btn-ghost" type="button" data-action="intake-back">Back</button><button class="btn btn-primary" type="button" data-action="intake-create"><svg class="ic"><use href="#i-plus"/></svg>Create matter</button></div>`;
}

function updateIntakeProgress() {
  $$('.intake-dot').forEach((d, i) => d.classList.toggle('active', i <= intakeState.step));
}

function refreshIntake() {
  const body = $('#intakeBody');
  if (!body) return;
  body.innerHTML = renderIntakeBody();
  bindIntakeModal();
  updateIntakeProgress();
  const input = $('#intakeInput') || $('#intakeApplicant');
  input?.focus();
  const scroller = $('.intake-history', body);
  if (scroller) scroller.scrollTop = scroller.scrollHeight;
}

function captureCurrentStep() {
  const s = INTAKE_STEPS[intakeState.step];
  if (!s) return true;
  if (s.type === 'textarea' || s.type === 'text') {
    const v = ($('#intakeInput')?.value || '').trim();
    if (!v) return false;
    intakeState.answers[s.key] = v;
  } else if (s.type === 'parties') {
    intakeState.answers.applicant = ($('#intakeApplicant')?.value || '').trim() || 'Applicant';
    intakeState.answers.respondent = ($('#intakeRespondent')?.value || '').trim() || 'Respondent';
  } else if (s.type === 'courtarea') {
    intakeState.answers.area = $('#intakeArea')?.value;
    intakeState.answers.court = $('#intakeCourt')?.value;
  }
  return true;
}

function advanceIntake() {
  if (!captureCurrentStep()) { showToast('Add a bit more detail before continuing.'); return; }
  intakeState.step++;
  refreshIntake();
}

function finalizeIntake() {
  const a = intakeState.answers;
  const id = uid('m');
  const title = `${a.applicant || 'New Applicant'} v. ${a.respondent || 'Respondent'}`;
  MATTERS.unshift({
    id, title, court: a.court || 'Bombay High Court', caseNo: `MAT-2026-0${150 + MATTERS.length}`,
    area: a.area || 'Criminal law', stage: 0, lead: 'Shreyas A.', leadInitials: 'SA', updated: 'Just now', nextHearing: null,
    tags: [], facts: { objective: a.facts || 'Awaiting intake detail.', relief: a.relief || 'To be determined.', issue: 'To be determined.' },
    authorities: [], arguments: [], counterArgs: [],
    tasks: [{ label: 'Confirm facts and relief with client', done: true }, { label: 'Begin legal research', done: false }],
    strengths: [], documents: [], timeline: [{ date: 'Today', title: 'Matter opened via guided intake', note: 'Facts, parties and relief captured by the Intake Agent.', flag: false }], drafts: [], postJudgment: null
  });
  closeModals();
  showToast('New matter created from guided intake. Research can begin.');
  navigate(`#/matters/${id}`);
}

function bindIntakeModal() {
  $('[data-action="intake-next"]')?.addEventListener('click', advanceIntake);
  $('[data-action="intake-back"]')?.addEventListener('click', () => { intakeState.step = Math.max(0, intakeState.step - 1); refreshIntake(); });
  $('[data-action="intake-create"]')?.addEventListener('click', finalizeIntake);
  $('#intakeInput')?.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); advanceIntake(); } });
}

/* =============================================================================
   PAGE: TODAY
   ============================================================================= */
function pageToday() {
  const today = hearingsOn(TODAY_ISO);
  const primary = matterById('m1');
  return `
  <div class="page-head">
    <div class="page-head-text"><p class="eyebrow">Friday, 11 September</p><h1>Good afternoon, Shreyas.</h1>
      <p class="lede">Three items need your review today. Everything below was prepared by an agent and is waiting for your approval — nothing is filed or sent without you.</p></div>
    <button class="btn btn-primary" data-action="open-new-matter"><svg class="ic"><use href="#i-plus"/></svg>New matter</button>
  </div>

  <section class="brief-banner">
    <span class="brief-eyebrow"><svg class="ic"><use href="#i-spark"/></svg>Recommended next step</span>
    <h2>Prepare the Sharma hearing brief</h2>
    <p>Your hearing is at <b>10:30 AM</b> in Bombay High Court. The brief is written and 18 sources are verified — one evidence check is still open.</p>
    <div class="brief-meta">
      <span><svg class="ic"><use href="#i-clock"/></svg>~8 min to review</span>
      <span><svg class="ic"><use href="#i-shield"/></svg>18 verified sources</span>
      <span><svg class="ic"><use href="#i-alert"/></svg>1 open task</span>
    </div>
    <div class="brief-actions">
      <a class="brief-btn" href="#/matters/m1/hearing"><svg class="ic"><use href="#i-gavel"/></svg>Open hearing prep</a>
      <a class="brief-btn ghost2" href="#/matters/m1/chat"><svg class="ic"><use href="#i-spark"/></svg>Ask about this matter</a>
    </div>
  </section>

  <div class="grid-3 section">
    <div class="stat-card"><div class="stat-top"><span>Active matters</span><svg class="ic"><use href="#i-matters"/></svg></div><div class="stat-num">8</div><div class="stat-note"><b>+2</b> added this month</div></div>
    <div class="stat-card"><div class="stat-top"><span>Waiting for your review</span><svg class="ic"><use href="#i-docs"/></svg></div><div class="stat-num">3</div><div class="stat-note">Drafts &amp; findings to approve</div></div>
    <div class="stat-card"><div class="stat-top"><span>Research time saved</span><svg class="ic"><use href="#i-clock"/></svg></div><div class="stat-num">14.5<em>h</em></div><div class="stat-note"><b>+3.2h</b> this week</div></div>
  </div>

  <div class="dash-grid section">
    <div class="card card-pad">
      <div class="card-head"><div><p class="eyebrow">Today’s court list</p><h2>Where you need to be</h2></div><a class="btn-text" href="#/calendar/${TODAY_ISO}">Full calendar<svg class="ic"><use href="#i-arrow"/></svg></a></div>
      ${today.length ? today.map(h => {
        const m = matterById(h.matterId);
        const statusCopy = { ready: ['check', 'Brief ready'], prep: ['spark', 'Preparing'], risk: ['clock', 'Needs review'] }[h.status];
        return `<a class="hearing-item" href="#/matters/${m.id}/hearing" style="text-decoration:none;color:inherit">
          <div class="hearing-time mono">${h.time}</div>
          <div><div class="hearing-court">${esc(h.court)}</div><div class="hearing-title">${esc(m.title)}</div><div class="hearing-sub">${esc(h.purpose)}</div></div>
          <span class="hearing-status ${h.status}"><svg class="ic"><use href="#i-${statusCopy[0]}"/></svg>${statusCopy[1]}</span>
        </a>`;
      }).join('') : '<p class="empty-note">Nothing on the cause list today.</p>'}
    </div>

    <div class="card card-pad">
      <div class="card-head"><div><p class="eyebrow">Review queue</p><h2>Awaiting your approval</h2></div><span class="chip chip-amber">3</span></div>
      <div class="review-item"><div class="review-icon"><svg class="ic"><use href="#i-draft"/></svg></div><div class="review-text"><strong>Anticipatory bail application</strong><small>Sharma v. State · 18 citations verified</small></div><a class="btn btn-ghost btn-sm" href="#/matters/m1/drafting">Review</a></div>
      <div class="review-item"><div class="review-icon amber"><svg class="ic"><use href="#i-timeline"/></svg></div><div class="review-text"><strong>Evidence chronology</strong><small>Aarohi Estates · agent still processing</small></div><a class="btn btn-ghost btn-sm" href="#/matters/m2/evidence">View</a></div>
      <div class="review-item"><div class="review-icon"><svg class="ic"><use href="#i-research"/></svg></div><div class="review-text"><strong>Limitation research note</strong><small>General · ready for review</small></div><a class="btn btn-ghost btn-sm" href="#/ask/c3">View</a></div>
    </div>
  </div>

  <div class="dash-grid">
    <div class="card card-pad">
      <div class="card-head"><div><p class="eyebrow">Upcoming deadlines</p><h2>This month</h2></div><a class="btn-text" href="#/calendar">Open calendar<svg class="ic"><use href="#i-arrow"/></svg></a></div>
      ${DEADLINES.map(d => {
        const b = dayBadge(d.date);
        return `<a class="deadline-row" href="#/calendar/${d.date}" style="text-decoration:none;color:inherit"><div class="deadline-date"><b>${b.num}</b><span>${b.mon}</span></div><div class="deadline-copy"><strong>${esc(d.title)}</strong><small>${esc(matterById(d.matterId)?.title || '')} · ${esc(d.type)}</small></div></a>`;
      }).join('')}
    </div>
    <div class="card card-pad">
      <div class="card-head"><div><p class="eyebrow">Ask LegalAI</p><h2>Quick question?</h2></div></div>
      <p class="hint">Get a grounded answer with sources in seconds, without leaving your dashboard.</p>
      <form id="quickAskForm">
        <div class="search-box" style="height:44px"><svg class="ic"><use href="#i-spark"/></svg><input id="quickAskInput" placeholder="e.g. What’s the limitation period for…" /></div>
        <button class="btn btn-primary btn-block" style="margin-top:10px" type="submit">Ask LegalAI<svg class="ic"><use href="#i-arrow"/></svg></button>
      </form>
    </div>
  </div>`;
}

function bindToday() {
  $('#quickAskForm')?.addEventListener('submit', e => {
    e.preventDefault();
    const q = $('#quickAskInput').value.trim();
    navigate(`#/ask${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  });
}

/* =============================================================================
   PAGE: ASK LEGALAI  (dedicated chat page — centerpiece)
   ============================================================================= */
function caseScopePickerHtml(idAttr) {
  return `<select class="ask-scope-select" id="${idAttr}">
    ${MATTERS.map(m => `<option value="${m.id}"${state.caseChatScope === m.id ? ' selected' : ''}>${esc(m.title)}</option>`).join('')}
  </select>`;
}

function groupedCaseThreads() {
  const groups = [];
  MATTERS.forEach(m => {
    const convos = CONVERSATIONS.filter(c => c.matterId === m.id);
    if (convos.length) groups.push({ label: m.title, convos });
  });
  return groups;
}

function askMainHtml(convo, basePath) {
  const matter = convo.matterId ? matterById(convo.matterId) : null;
  const lastAi = [...convo.messages].reverse().find(m => m.role === 'ai');

  return `
    <div class="ask-main">
      <div class="ask-context-bar">
        <button class="icon-btn" id="toggleThreads" style="display:none" aria-label="Conversations"><svg class="ic"><use href="#i-menu"/></svg></button>
        <span class="scope-pill">${matter ? `<span class="dot dot-teal"></span>${esc(matter.title)}` : `<svg class="ic"><use href="#i-research"/></svg>General research`}</span>
        ${matter ? `<a class="btn-text" href="#/matters/${matter.id}">Open matter<svg class="ic"><use href="#i-arrow"/></svg></a>` : ''}
      </div>
      <div class="ask-thread-scroll" id="askScroll"><div class="ask-thread-inner" id="askThreadInner">
        ${convo.messages.map(renderMsg).join('')}
      </div></div>
      ${composer()}
    </div>
    <aside class="ask-sources">
      <p class="eyebrow">How this answer was built</p>
      <div class="trace-step done"><span><svg class="ic"><use href="#i-check"/></svg></span><div class="trace-copy"><strong>Query classified</strong><small>${matter ? esc(matter.area) : 'General legal research'}</small></div></div>
      <div class="trace-step done"><span><svg class="ic"><use href="#i-check"/></svg></span><div class="trace-copy"><strong>Sources retrieved</strong><small>${lastAi ? lastAi.citations.length : 0} sources from statutes &amp; case law</small></div></div>
      <div class="trace-step done"><span><svg class="ic"><use href="#i-check"/></svg></span><div class="trace-copy"><strong>Citations verified</strong><small>Checked against the knowledge graph</small></div></div>
      <div class="trace-step"><span>4</span><div class="trace-copy"><strong>Your review</strong><small>Required before use in a filing</small></div></div>

      ${lastAi ? `<p class="eyebrow" style="margin-top:20px">Sources for this answer</p>${lastAi.citations.map(c => `
        <div class="source-card" data-source="${c.n}"><div class="source-top"><span class="source-num mono">${c.n}</span><strong>${esc(c.title)}</strong></div><small>${esc(c.meta)}</small></div>`).join('')}` : ''}
    </aside>`;
}

const ASK_PROMPT_CARDS = `
  <button class="prompt-card" data-action="use-prompt" data-prompt="What are the key considerations for anticipatory bail under Section 482 BNSS?"><svg class="ic"><use href="#i-scale"/></svg><strong>Research a legal question</strong><small>Get a cited answer from statutes &amp; precedent</small></button>
  <button class="prompt-card" data-action="use-prompt" data-prompt="Summarise the FIR and flag anything unusual."><svg class="ic"><use href="#i-docs"/></svg><strong>Summarise a document</strong><small>Pull the key facts out of a filing</small></button>
  <button class="prompt-card" data-action="use-prompt" data-prompt="Draft a reply to the legal notice we received."><svg class="ic"><use href="#i-draft"/></svg><strong>Draft a first version</strong><small>Court-format drafts, citing verified sources</small></button>
  <button class="prompt-card" data-action="use-prompt" data-prompt="What is the limitation period for a suit with no specific limitation clause?"><svg class="ic"><use href="#i-clock"/></svg><strong>Check a deadline</strong><small>Limitation periods &amp; procedural timelines</small></button>`;

/* Ask LegalAI — general research, not tied to any one matter */
function pageAsk(threadId, query) {
  let convo = threadId ? CONVERSATIONS.find(c => c.id === threadId && !c.matterId) : null;
  const presetQ = query.get('q');

  if (!convo && presetQ && !threadId) {
    convo = { id: uid('c'), title: presetQ.slice(0, 48), matterId: null, updated: 'Just now', messages: [{ role: 'user', text: presetQ }] };
    CONVERSATIONS.unshift(convo);
    location.hash = `#/ask/${convo.id}`;
  }

  const generalConvos = CONVERSATIONS.filter(c => !c.matterId);
  const threadsHtml = generalConvos.length ? generalConvos.map(c => `
    <a class="thread-item${convo && c.id === convo.id ? ' active' : ''}" href="#/ask/${c.id}">
      <div class="thread-item-top"><strong>${esc(c.title)}</strong><time>${esc(c.updated)}</time></div>
    </a>`).join('') : '<p class="empty-note">No conversations yet — ask something below.</p>';

  const threadsPane = `
    <aside class="ask-threads" id="askThreads">
      <div class="ask-threads-head"><h1>Ask LegalAI</h1>
        <p class="ask-threads-sub">General research, not tied to a specific case.</p>
        <button class="new-chat-btn" data-action="new-chat"><svg class="ic"><use href="#i-plus"/></svg>New conversation</button>
      </div>
      <div class="thread-search"><svg class="ic"><use href="#i-research"/></svg><input placeholder="Search conversations" /></div>
      <div class="thread-list">${threadsHtml}</div>
    </aside>`;

  if (!convo) {
    return threadsPane + `
    <div class="ask-main">
      <div class="ask-empty">
        <div class="ask-empty-mark"><svg class="ic"><use href="#i-spark"/></svg></div>
        <h1>Ask LegalAI anything about statutes &amp; precedent</h1>
        <p>General legal research that isn’t tied to one matter — cites its sources, and waits for your review before it’s used in any filing. Need to discuss a specific case instead? Head to <a href="#/case-chat">Case Chat</a>.</p>
        <div class="prompt-grid">${ASK_PROMPT_CARDS}</div>
      </div>
      ${composer()}
    </div>`;
  }

  return threadsPane + askMainHtml(convo);
}

/* Case Chat — pick a case, conversations grouped and saved under that case's name */
function pageCaseChat(threadId, query) {
  let convo = threadId ? CONVERSATIONS.find(c => c.id === threadId && c.matterId) : null;
  const presetQ = query.get('q');
  const presetMatter = query.get('matter');

  if (!state.caseChatScope || !matterById(state.caseChatScope)) state.caseChatScope = MATTERS[0]?.id || null;
  if (presetMatter) state.caseChatScope = presetMatter;

  if (!convo && presetQ && !threadId) {
    convo = {
      id: uid('c'), title: presetQ.slice(0, 48),
      matterId: presetMatter || state.caseChatScope, updated: 'Just now', messages: [{ role: 'user', text: presetQ }]
    };
    CONVERSATIONS.unshift(convo);
    location.hash = `#/case-chat/${convo.id}`;
  }

  const groups = groupedCaseThreads();
  const threadsHtml = groups.length ? groups.map(g => `
    <div class="thread-group">
      <p class="thread-group-label">${esc(g.label)}</p>
      ${g.convos.map(c => `
        <a class="thread-item${convo && c.id === convo.id ? ' active' : ''}" href="#/case-chat/${c.id}">
          <div class="thread-item-top"><strong>${esc(c.title)}</strong><time>${esc(c.updated)}</time></div>
        </a>`).join('')}
    </div>`).join('') : '<p class="empty-note">No case conversations yet — pick a case below and ask something.</p>';

  const threadsPane = `
    <aside class="ask-threads" id="askThreads">
      <div class="ask-threads-head"><h1>Case Chat</h1>
        <label class="ask-scope-label">Chatting about</label>
        ${caseScopePickerHtml('caseScopeSelect')}
        <button class="new-chat-btn" data-action="new-chat"><svg class="ic"><use href="#i-plus"/></svg>New conversation</button>
      </div>
      <div class="thread-search"><svg class="ic"><use href="#i-research"/></svg><input placeholder="Search conversations" /></div>
      <div class="thread-list">${threadsHtml}</div>
    </aside>`;

  if (!convo) {
    return threadsPane + `
    <div class="ask-main">
      <div class="ask-empty">
        <div class="ask-empty-mark"><svg class="ic"><use href="#i-network"/></svg></div>
        <h1>Chat with LegalAI about a specific case</h1>
        <p>Every answer is grounded in the matter’s own facts, Indian statutes and reported judgments, cites its sources, and waits for your review before it’s used in any filing.</p>
        <div class="ask-empty-scope"><label>Which case?</label>${caseScopePickerHtml('caseScopeSelectEmpty')}</div>
        <div class="prompt-grid">${ASK_PROMPT_CARDS}</div>
      </div>
      ${composer()}
    </div>`;
  }

  return threadsPane + askMainHtml(convo);
}

function composer() {
  return `
  <div class="ask-composer-wrap">
    <form class="ask-composer" id="askForm">
      <textarea id="askInput" rows="1" placeholder="Ask about a matter, a statute, or a draft…"></textarea>
      <div class="ask-composer-row">
        <button type="button" class="composer-tool" aria-label="Attach a document"><svg class="ic"><use href="#i-paperclip"/></svg></button>
        <button type="button" class="composer-tool" aria-label="Voice input"><svg class="ic"><use href="#i-mic"/></svg></button>
        <button class="composer-send" id="askSend" type="submit" aria-label="Send"><svg class="ic"><use href="#i-send"/></svg></button>
      </div>
    </form>
    <p class="ask-disclaimer">Demo: these answers are scripted examples, not model output. Verify any real answer before relying on it.</p>
  </div>`;
}

function renderMsg(m, i) {
  if (m.role === 'user') {
    return `<div class="msg user"><div class="msg-avatar">SA</div><div class="msg-body"><div class="msg-bubble">${esc(m.text)}</div></div></div>`;
  }
  const body = (m.text || '').replace(/<cite>(\d+)<\/cite>/g, (_, n) => `<button type="button" class="cite" data-cite="${n}">${n}</button>`);
  return `<div class="msg ai"><div class="msg-avatar"><svg class="ic" style="width:15px"><use href="#i-spark"/></svg></div>
    <div class="msg-body">
      <div class="msg-bubble">${body.startsWith('<p>') ? body : `<p>${body}</p>`}</div>
      ${m.citations ? `<div class="msg-verify"><svg class="ic"><use href="#i-shield"/></svg>${m.citations.length} source${m.citations.length === 1 ? '' : 's'} verified against the knowledge graph</div>` : ''}
      <div class="msg-actions">
        <button data-action="copy-msg" aria-label="Copy"><svg class="ic"><use href="#i-copy"/></svg></button>
        <button data-action="save-msg" aria-label="Save to matter"><svg class="ic"><use href="#i-bookmark"/></svg></button>
      </div>
    </div></div>`;
}

function askRespond(convo) {
  const inner = $('#askThreadInner');
  const pendingId = uid('pending');
  inner.insertAdjacentHTML('beforeend', `<div class="msg ai msg-pending" id="${pendingId}"><div class="msg-avatar"><svg class="ic" style="width:15px"><use href="#i-spark"/></svg></div><div class="msg-body"><div class="msg-bubble">Researching across statutes and precedent<span class="typing-dots"><i></i><i></i><i></i></span></div></div></div>`);
  $('#askScroll').scrollTop = $('#askScroll').scrollHeight;
  const text = convo.messages[convo.messages.length - 1].text;
  setTimeout(() => {
    const matter = convo.matterId ? matterById(convo.matterId) : null;
    const resp = generateResponse(text, matter);
    const aiMsg = { role: 'ai', text: resp.text, citations: resp.citations };
    convo.messages.push(aiMsg);
    $(`#${pendingId}`)?.remove();
    inner.insertAdjacentHTML('beforeend', renderMsg(aiMsg));
    $('#askScroll').scrollTop = $('#askScroll').scrollHeight;
    route(); // refresh sources panel + trace with the new last answer
  }, 900);
}

/* Ask AI, scoped in-context to a single matter */
function pageMatterChat(m, threadId, query) {
  let convo = threadId ? CONVERSATIONS.find(c => c.id === threadId && c.matterId === m.id) : null;
  const presetQ = query.get('q');

  if (!convo && presetQ && !threadId) {
    convo = { id: uid('c'), title: presetQ.slice(0, 48), matterId: m.id, updated: 'Just now', messages: [{ role: 'user', text: presetQ }] };
    CONVERSATIONS.unshift(convo);
    location.hash = `#/matters/${m.id}/chat/${convo.id}`;
  }

  const convos = CONVERSATIONS.filter(c => c.matterId === m.id);
  const threadsHtml = convos.length ? convos.map(c => `
    <a class="thread-item${convo && c.id === convo.id ? ' active' : ''}" href="#/matters/${m.id}/chat/${c.id}">
      <div class="thread-item-top"><strong>${esc(c.title)}</strong><time>${esc(c.updated)}</time></div>
    </a>`).join('') : '<p class="empty-note">No conversations yet — ask something below.</p>';

  const threadsPane = `
    <aside class="ask-threads" id="askThreads">
      <div class="ask-threads-head"><h1>Ask AI</h1>
        <p class="ask-threads-sub">Scoped to ${esc(m.title)}.</p>
        <button class="new-chat-btn" data-action="new-chat"><svg class="ic"><use href="#i-plus"/></svg>New conversation</button>
      </div>
      <div class="thread-search"><svg class="ic"><use href="#i-research"/></svg><input placeholder="Search conversations" /></div>
      <div class="thread-list">${threadsHtml}</div>
    </aside>`;

  if (!convo) {
    return threadsPane + `
    <div class="ask-main">
      <div class="ask-empty">
        <div class="ask-empty-mark"><svg class="ic"><use href="#i-spark"/></svg></div>
        <h1>Ask about ${esc(m.title)}</h1>
        <p>Grounded in this matter’s own facts, the statutes and precedents on file, and reported judgments — every answer cites its sources and waits for your review.</p>
        <div class="prompt-grid">${ASK_PROMPT_CARDS}</div>
      </div>
      ${composer()}
    </div>`;
  }

  return threadsPane + askMainHtml(convo);
}

function bindAskPage({ threadId, basePath, scoped = false, fixedMatterId = null }) {
  const scroll = $('#askScroll');
  if (scroll) scroll.scrollTop = scroll.scrollHeight;

  const mountConvo = CONVERSATIONS.find(c => c.id === threadId);
  if (mountConvo && mountConvo.messages.length && mountConvo.messages[mountConvo.messages.length - 1].role === 'user') {
    askRespond(mountConvo);
  }

  $('#toggleThreads')?.addEventListener('click', () => $('#askThreads').classList.toggle('open'));
  $$('.thread-item').forEach(a => a.addEventListener('click', () => $('#askThreads').classList.remove('open')));

  const scopeParam = () => (!fixedMatterId && scoped && state.caseChatScope) ? `&matter=${state.caseChatScope}` : '';
  const newChatHref = () => (!fixedMatterId && scoped && state.caseChatScope) ? `${basePath}?matter=${state.caseChatScope}` : basePath;
  $$('[data-action="use-prompt"]').forEach(btn => btn.addEventListener('click', () => {
    navigate(`${basePath}?q=${encodeURIComponent(btn.dataset.prompt)}${scopeParam()}`);
  }));
  $('[data-action="new-chat"]')?.addEventListener('click', () => navigate(newChatHref()));

  $$('.ask-scope-select').forEach(sel => sel.addEventListener('change', () => {
    state.caseChatScope = sel.value || null;
    $$('.ask-scope-select').forEach(s => { if (s !== sel) s.value = sel.value; });
  }));

  $$('.cite').forEach(btn => btn.addEventListener('click', () => {
    const card = $(`.source-card[data-source="${btn.dataset.cite}"]`);
    if (card) { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); card.style.borderColor = 'var(--teal)'; setTimeout(() => card.style.borderColor = '', 900); }
  }));
  $$('[data-action="copy-msg"]').forEach(btn => btn.addEventListener('click', () => showToast('Answer copied to clipboard.')));
  $$('[data-action="save-msg"]').forEach(btn => btn.addEventListener('click', () => {
    const convo = CONVERSATIONS.find(c => c.id === threadId);
    const matterId = convo?.matterId || fixedMatterId || (scoped ? state.caseChatScope : null);
    if (!matterId) { showToast('Open this from a matter, or pick a case first, to save the answer to its research notes.'); return; }
    const answers = $$('.msg.ai').filter(el => !el.classList.contains('msg-pending'));
    const msg = convo?.messages.filter(x => x.role === 'ai')[answers.indexOf(btn.closest('.msg.ai'))];
    if (wbSaveChatAnswer(matterId, msg)) showToast(`Saved to ${matterById(matterId).title} — Research notes.`);
  }));

  const form = $('#askForm');
  const input = $('#askInput');
  if (!form) return;
  input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 160) + 'px'; });
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
  form.addEventListener('submit', e => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    let convo = CONVERSATIONS.find(c => c.id === threadId);
    if (!convo) {
      navigate(`${basePath}?q=${encodeURIComponent(text)}${scopeParam()}`);
      return;
    }
    convo.messages.push({ role: 'user', text });
    convo.updated = 'Just now';
    $('#askThreadInner').insertAdjacentHTML('beforeend', renderMsg({ role: 'user', text }));
    input.value = ''; input.style.height = 'auto';
    askRespond(convo);
  });
}

function bindAsk(threadId) { bindAskPage({ threadId, basePath: '#/ask', scoped: false }); }
function bindCaseChat(threadId) { bindAskPage({ threadId, basePath: '#/case-chat', scoped: true }); }
function bindMatterChat(m, threadId) { if (m) bindAskPage({ threadId, basePath: `#/matters/${m.id}/chat`, fixedMatterId: m.id }); }

/* =============================================================================
   PAGE: MATTERS LIST
   ============================================================================= */
function pageMattersList() {
  return `
  <div class="page-head">
    <div class="page-head-text"><p class="eyebrow">Matter management</p><h1>Matters</h1><p class="lede">Every case you and your team are running, and where each one sits in the workflow.</p></div>
    <button class="btn btn-primary" data-action="open-new-matter"><svg class="ic"><use href="#i-plus"/></svg>New matter</button>
  </div>
  <div class="toolbar">
    <div class="search-box"><svg class="ic"><use href="#i-research"/></svg><input id="mattersSearch" placeholder="Search by party, matter number or court" /></div>
    <button class="select-box"><svg class="ic"><use href="#i-filter"/></svg>Filters</button>
    <span class="toolbar-count">${MATTERS.length} active matters</span>
  </div>
  <div class="card" style="padding:0;overflow:hidden">
    <table class="table" id="mattersTable">
      <thead><tr><th>Matter</th><th>Stage</th><th>Last activity</th><th>Lead</th><th></th></tr></thead>
      <tbody>${MATTERS.map(matterRow).join('')}</tbody>
    </table>
  </div>`;
}

function matterRow(m) {
  return `<tr class="clickable" data-href="#/matters/${m.id}">
    <td><strong style="display:block;font-size:13.5px;font-weight:600">${esc(m.title)}</strong><small class="muted" style="font-size:11.5px">${esc(m.area)} · ${esc(m.court)} · <span class="mono">${esc(m.caseNo)}</span></small></td>
    <td><span class="chip chip-navy" style="margin-bottom:4px">${esc(STAGE_LABELS[m.stage])}</span><br/><span class="stage-track">${STAGE_LABELS.map((_, i) => `<i class="${i < m.stage ? 'done' : i === m.stage ? 'now' : ''}"></i>`).join('')}</span></td>
    <td class="muted">${esc(m.updated)}</td>
    <td><span class="chip chip-navy" style="background:${initialsColor(MATTERS.indexOf(m))};color:#fff">${esc(m.leadInitials)}</span> ${esc(m.lead)}</td>
    <td><svg class="ic" style="color:var(--faint)"><use href="#i-chevron"/></svg></td>
  </tr>`;
}

function bindMattersList() {
  $$('#mattersTable tr.clickable').forEach(tr => tr.addEventListener('click', () => navigate(tr.dataset.href)));
  $('#mattersSearch')?.addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    const filtered = MATTERS.filter(m => m.title.toLowerCase().includes(q) || m.court.toLowerCase().includes(q) || m.caseNo.toLowerCase().includes(q));
    $('#mattersTable tbody').innerHTML = filtered.map(matterRow).join('') || `<tr><td colspan="5" class="empty-note">No matters match “${esc(q)}”.</td></tr>`;
    $$('#mattersTable tr.clickable').forEach(tr => tr.addEventListener('click', () => navigate(tr.dataset.href)));
  });
}

/* =============================================================================
   PAGE: MATTER DETAIL
   ============================================================================= */
const TAB_LABELS = { overview: 'Overview', chat: 'Ask AI', research: 'Research', evidence: 'Evidence', drafting: 'Drafting', arguments: 'Arguments', hearing: 'Hearing prep', status: 'Case status', postjudgment: 'Post-judgment', timeline: 'Timeline' };

function pageMatterDetail(id, tab) {
  const m = matterById(id);
  if (!m) return `<div class="card card-pad"><h2>Matter not found</h2><p class="hint">This matter may have been removed.</p><a class="btn-text" href="#/matters">Back to matters<svg class="ic"><use href="#i-arrow"/></svg></a></div>`;

  return `
  <div class="matter-subhead">
    <div class="matter-subhead-text">
      <p class="eyebrow">${esc(m.area)} · <span class="mono">${esc(m.caseNo)}</span></p>
      <h1>${esc(TAB_LABELS[tab] || 'Overview')}</h1>
    </div>
    <div class="matter-actions">
      <a class="btn btn-teal" href="#/matters/${m.id}/chat"><svg class="ic"><use href="#i-spark"/></svg>Ask about this matter</a>
      <button class="btn btn-ghost" data-action="add-evidence"><svg class="ic"><use href="#i-upload"/></svg>Add evidence</button>
    </div>
  </div>
  <div id="matterTabContent">${matterTab(m, tab)}</div>`;
}

function matterTab(m, tab) {
  if (tab === 'research') return tabResearch(m);
  if (tab === 'evidence') return tabEvidence(m);
  if (tab === 'drafting') return tabDrafting(m);
  if (tab === 'arguments') return tabArguments(m);
  if (tab === 'hearing') return tabHearing(m);
  if (tab === 'status') return tabStatus(m);
  if (tab === 'postjudgment') return tabPostJudgment(m);
  if (tab === 'timeline') return tabTimeline(m);
  return tabOverview(m);
}

function tabOverview(m) {
  return `
  <div class="dash-grid">
    <div class="card card-pad">
      <h2>Case facts</h2>
      <div style="margin-top:14px">
        <div class="fact-item"><div class="fact-label">Objective</div><div class="fact-value">${esc(m.facts.objective || '—')}</div></div>
        <div class="fact-item"><div class="fact-label">Relief sought</div><div class="fact-value">${esc(m.facts.relief || '—')}</div></div>
        <div class="fact-item"><div class="fact-label">Key issue</div><div class="fact-value">${esc(m.facts.issue || '—')}</div></div>
      </div>
      ${m.strengths.length ? `<h2 style="margin-top:22px">Case strength</h2><p class="hint">A score for each issue, based only on authorities and evidence already in the file.</p>
        <div class="grid-3">${m.strengths.map(s => `<div class="strength-card"><div class="strength-top"><span>${esc(s.label)}</span><b>${s.score}<em>/100</em></b></div><div class="score-bar ${s.tone === 'good' ? '' : s.tone === 'mid' ? 'mid' : 'low'}"><i style="width:${s.score}%"></i></div><p>${esc(s.note)}</p></div>`).join('')}</div>` : ''}
    </div>
    <div class="card card-pad">
      <h2>Open tasks</h2>
      <div style="margin-top:12px">${m.tasks.length ? m.tasks.map(t => `<div class="list-row"><input type="checkbox" ${t.done ? 'checked' : ''} style="width:16px;height:16px;accent-color:var(--teal)" /><span style="font-size:13px;${t.done ? 'color:var(--faint);text-decoration:line-through' : ''}">${esc(t.label)}</span></div>`).join('') : '<p class="empty-note">No open tasks.</p>'}</div>
      ${m.nextHearing ? `<div class="card-head" style="margin-top:22px"><h2>Next hearing</h2><a class="btn-text" href="#/calendar/${m.nextHearing.dateISO || ''}">View on calendar<svg class="ic"><use href="#i-arrow"/></svg></a></div><a class="cal-event" href="#/calendar/${m.nextHearing.dateISO || ''}" style="margin-top:12px;text-decoration:none;color:inherit"><div class="cal-event-time mono">${esc(m.nextHearing.time)}</div><div class="cal-event-copy"><strong>${esc(m.nextHearing.purpose)}</strong><small>${esc(m.nextHearing.date)} · ${esc(m.nextHearing.court2)}</small></div></a>` : ''}
    </div>
  </div>`;
}

/* Research, Evidence, Drafting and Arguments (the "Build the case" tabs) live in workbench.js. */

function tabHearing(m) {
  if (!m.nextHearing) return `<div class="card card-pad"><h2>No hearing scheduled</h2><p class="hint">This matter has no upcoming listing yet.</p></div>`;
  return `
  <div class="dash-grid">
    <div class="card" style="padding:0;overflow:hidden">
      <div style="padding:20px 22px;background:linear-gradient(135deg,var(--navy),#132540);color:#fff;display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
        <div><span style="display:inline-flex;align-items:center;gap:7px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#9FD9C7"><span class="dot" style="background:#7BD3B4"></span>Next hearing · ${esc(m.nextHearing.time)}</span>
        <h2 style="color:#fff;margin-top:10px">${esc(m.title)}</h2>
        <p style="color:#C9D2DF;font-size:13px;margin-top:4px">${esc(m.nextHearing.court2)}</p></div>
        <a href="#/calendar/${m.nextHearing.dateISO || ''}" style="flex:0 0 auto;display:inline-flex;align-items:center;gap:6px;color:#fff;font-size:12px;font-weight:600;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.22);padding:7px 11px;border-radius:8px"><svg class="ic" style="width:14px"><use href="#i-calendar"/></svg>Calendar</a>
      </div>
      <div class="grid-2" style="padding:22px">
        <div><p class="eyebrow">Hearing objective</p><p style="font-size:13.5px;color:var(--ink-soft);line-height:1.55">${esc(m.facts.objective)}</p>
          <p class="eyebrow" style="margin-top:18px">Key authorities</p>
          ${m.authorities.map((a, i) => `<div class="authority-row"><div class="authority-num mono">${i + 1}</div><div class="authority-copy"><strong>${esc(a.title)}</strong><small>${esc(a.meta)}</small></div></div>`).join('') || '<p class="empty-note" style="text-align:left;padding:6px 0">None pinned yet.</p>'}
        </div>
        <div><div class="card-head" style="margin-bottom:2px"><p class="eyebrow" style="margin:0">Argument prep</p><a class="btn-text" href="#/matters/${m.id}/arguments">Open full workspace<svg class="ic"><use href="#i-arrow"/></svg></a></div>
          ${(m.counterArgs && m.counterArgs.length) ? `<p style="font-size:12.5px;color:var(--muted);margin:4px 0 10px">${m.counterArgs.length} anticipated counter-argument${m.counterArgs.length === 1 ? '' : 's'}, each with a rebuttal already prepared.</p><div class="counter-card" style="margin-bottom:8px"><p class="counter-point"><svg class="ic"><use href="#i-alert"/></svg>${esc(m.counterArgs[0].point)}</p><p class="counter-rebuttal"><svg class="ic"><use href="#i-check"/></svg>${esc(m.counterArgs[0].rebuttal)}</p></div>` : '<p class="empty-note" style="text-align:left;padding:6px 0">No counter-arguments prepared yet.</p>'}
          <p class="eyebrow" style="margin-top:18px">Open tasks before hearing</p>
          ${m.tasks.filter(t => !t.done).map(t => `<label style="display:flex;gap:9px;align-items:center;font-size:13px;padding:5px 0"><input type="checkbox" style="width:16px;height:16px;accent-color:var(--teal)" />${esc(t.label)}</label>`).join('') || '<p class="empty-note" style="text-align:left;padding:6px 0">All tasks complete.</p>'}
        </div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:15px 22px;border-top:1px solid var(--line)"><span style="display:inline-flex;align-items:center;gap:7px;color:var(--teal-ink);font-size:13px;font-weight:500"><svg class="ic"><use href="#i-shield"/></svg>Built from ${m.documents.length + m.authorities.length} verified records</span><a class="btn-text" href="#/matters/${m.id}/drafting">Open written submissions<svg class="ic"><use href="#i-arrow"/></svg></a></div>
    </div>
    <div class="card card-pad">
      <h2>Ask about this hearing</h2>
      <p class="hint">Anticipate a question the bench might ask.</p>
      <a class="btn btn-teal btn-block" href="#/matters/${m.id}/chat"><svg class="ic"><use href="#i-spark"/></svg>Ask LegalAI</a>
    </div>
  </div>`;
}

/* ---- Case status: this matter's record as synced from eCourts. ---- */
function tabStatus(m) {
  const e = ECOURTS[m.id];
  if (!e) {
    return `<div class="card card-pad"><h2>Not yet synced with eCourts</h2><p class="hint">This matter has no eCourts record linked yet. Once a CNR number is available, the case status, cause-list entries and order sheets will appear here automatically.</p><button class="btn btn-teal" style="margin-top:12px" data-action="sync-case" data-matter="${m.id}"><svg class="ic"><use href="#i-sync"/></svg>Sync with eCourts</button></div>`;
  }
  const statusChip = /dispos/i.test(e.status) ? 'chip-red' : /adjourn/i.test(e.status) ? 'chip-amber' : 'chip-teal';
  const next = parseISODateStr(e.nextDate);
  const daysLeft = Math.round((next - parseISODateStr(TODAY_ISO)) / 86400000);
  return `
  <div class="dash-grid">
    <div class="card card-pad">
      <div class="card-head"><div><p class="eyebrow">eCourts record</p><h2>${esc(e.stage)}</h2></div><span class="chip ${statusChip}">${esc(e.status)}</span></div>
      <div class="ecourt-facts">
        <div class="fact-item"><div class="fact-label">CNR number</div><div class="fact-value mono">${esc(e.cnr)}</div></div>
        <div class="fact-item"><div class="fact-label">Filed</div><div class="fact-value">${esc(fmtDate(e.filed))}</div></div>
        <div class="fact-item"><div class="fact-label">Registered</div><div class="fact-value">${esc(fmtDate(e.regDate))}</div></div>
        <div class="fact-item"><div class="fact-label">Court</div><div class="fact-value">${esc(m.court)}</div></div>
      </div>
      <h2 style="margin-top:22px">Order sheet</h2>
      <div class="timeline-v" style="margin-top:10px">${e.orders.map(o => `<article><time class="mono">${esc(fmtDate(o.date, true))}</time><span class="tl-dot"></span><div class="tl-copy"><p>${esc(o.text)}</p><a class="btn-text" href="#/deadlines?matter=${m.id}&date=${esc(o.date)}">Work out a limitation date from this order<svg class="ic"><use href="#i-arrow"/></svg></a></div></article>`).join('')}</div>
    </div>
    <div class="card card-pad">
      <p class="eyebrow">Next listing</p>
      <div class="pj-countdown"><b>${daysLeft}</b><span>day${daysLeft === 1 ? '' : 's'} away</span></div>
      <p class="hint" style="margin-top:2px">${esc(fmtDate(e.nextDate))} · ${esc(e.nextPurpose)}</p>
      <div class="settings-row" style="margin-top:14px"><div class="settings-copy"><strong>Bench</strong><small>${esc(e.bench)}</small></div></div>
      <a class="btn btn-ghost btn-block" style="margin-top:10px" href="#/calendar/${e.nextDate}"><svg class="ic"><use href="#i-calendar"/></svg>View on calendar</a>
      <button class="btn btn-teal btn-block" style="margin-top:10px" data-action="sync-case" data-matter="${m.id}"><svg class="ic"><use href="#i-sync"/></svg>Re-sync now</button>
      <p class="hint" style="margin-top:10px;font-size:11px">${e.live ? 'Synced live from the eCourts service' + (e.syncedAt ? ' · ' + esc(e.syncedAt) : '') + '.' : e.sample ? 'Sample record from the eCourts service’s fixture source, not live court data.' : 'Built-in sample data — hit Re-sync to ask the eCourts service.'}</p>
    </div>
  </div>`;
}

/* ---- Post-judgment analysis: outcome review + appeal assessment — the
   terminal stage of the litigation lifecycle, alongside Courtroom Prep. ---- */
function tabPostJudgment(m) {
  const pj = m.postJudgment;
  if (!pj) {
    return `<div class="card card-pad"><h2>No judgment yet</h2><p class="hint">This matter is still at the ${esc(STAGE_LABELS[m.stage] || 'Intake')} stage. Once a judgment or award is delivered, outcome review and appeal assessment will appear here.</p></div>`;
  }
  const outcomeChip = { granted: 'chip-teal', partial: 'chip-amber', dismissed: 'chip-red' }[pj.outcome] || 'chip-navy';
  const deadline = parseISODateStr(pj.appealDeadline);
  const daysLeft = Math.round((deadline - parseISODateStr(TODAY_ISO)) / 86400000);
  return `
  <div class="dash-grid">
    <div class="card card-pad">
      <div class="card-head"><div><p class="eyebrow">Outcome</p><h2>${esc(pj.outcomeLabel)}</h2></div><span class="chip ${outcomeChip}">${esc(pj.judgmentDate)}</span></div>
      <p style="font-size:13.5px;color:var(--ink-soft);line-height:1.6;margin-top:10px">${esc(pj.summary)}</p>
      <h2 style="margin-top:22px">Appeal grounds — strength assessment</h2>
      <p class="hint">Scored only against what’s already in the award and the case file.</p>
      <div class="grid-3">${pj.grounds.map(g => `<div class="strength-card"><div class="strength-top"><span>${esc(g.label)}</span><b>${g.score}<em>/100</em></b></div><div class="score-bar ${g.tone === 'good' ? '' : g.tone === 'mid' ? 'mid' : 'low'}"><i style="width:${g.score}%"></i></div><p>${esc(g.note)}</p></div>`).join('')}</div>
    </div>
    <div class="card card-pad">
      <p class="eyebrow">Appeal window</p>
      <a class="btn-text" href="#/deadlines?matter=${m.id}" style="float:right">Work out the exact last date<svg class="ic"><use href="#i-arrow"/></svg></a>
      <div class="pj-countdown"><b>${daysLeft}</b><span>day${daysLeft === 1 ? '' : 's'} remaining</span></div>
      <p class="hint" style="margin-top:2px">Deadline: ${esc(deadline.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }))}</p>
      <h2 style="margin-top:20px">Next steps</h2>
      ${pj.nextSteps.map(s => `<label style="display:flex;gap:9px;align-items:center;font-size:13px;padding:6px 0"><input type="checkbox" ${s.done ? 'checked' : ''} style="width:16px;height:16px;accent-color:var(--teal)" />${esc(s.label)}</label>`).join('')}
      <a class="btn btn-teal btn-block" style="margin-top:14px" href="#/matters/${m.id}/chat"><svg class="ic"><use href="#i-spark"/></svg>Ask about appeal prospects</a>
    </div>
  </div>`;
}

function tabTimeline(m) {
  return `<div class="card card-pad"><h2>Case timeline</h2>
    <div class="timeline-v">${m.timeline.length ? m.timeline.map(t => `<article><time class="mono">${esc(t.date)}</time><span class="tl-dot ${t.flag ? 'warn' : ''}"></span><div class="tl-copy"><strong>${esc(t.title)}</strong><p>${esc(t.note)}</p>${t.flag ? '<small class="flag">Potential contradiction</small>' : ''}</div></article>`).join('') : '<p class="empty-note">No events recorded yet.</p>'}</div>
  </div>`;
}

function bindMatterDetail() { wbBindMatterDetail(); }

/* =============================================================================
   PAGE: CALENDAR — iPhone-style: Day / Week / Month / Year. Month view keeps a
   persistent agenda strip below the grid (like iOS) — tapping a date updates
   it in place, it never pops up as a card and there's nothing to "close".
   Every date-related feature (hearings, deadlines, personal notes) lives here.
   ============================================================================= */
const calState = { view: 'month', cursor: TODAY_ISO, expanded: TODAY_ISO };
const CAL_VIEWS = ['day', 'week', 'month', 'year'];

function applyCalParam(param) {
  if (!param) return;
  calState.cursor = param;
  calState.expanded = param;
  calState.view = 'day';
}
function addDays(iso, n) { const d = parseISODateStr(iso); d.setDate(d.getDate() + n); return isoDate(d.getFullYear(), d.getMonth(), d.getDate()); }
function startOfWeek(iso) { const d = parseISODateStr(iso); d.setDate(d.getDate() - d.getDay()); return isoDate(d.getFullYear(), d.getMonth(), d.getDate()); }
function weekDates(iso) { const start = startOfWeek(iso); return Array.from({ length: 7 }, (_, i) => addDays(start, i)); }
function addMonths(year, month, n) { let m = month + n, y = year; while (m < 0) { m += 12; y--; } while (m > 11) { m -= 12; y++; } return { year: y, month: m }; }
function calShift(delta) {
  const c = parseISODateStr(calState.cursor);
  if (calState.view === 'day') calState.cursor = addDays(calState.cursor, delta);
  else if (calState.view === 'week') calState.cursor = addDays(calState.cursor, delta * 7);
  else if (calState.view === 'year') calState.cursor = isoDate(c.getFullYear() + delta, c.getMonth(), 1);
  else { const r = addMonths(c.getFullYear(), c.getMonth(), delta); calState.cursor = isoDate(r.year, r.month, 1); }
  calState.expanded = calState.cursor; // the agenda strip always tracks a date within the period on screen
}
function calGoToday() { calState.cursor = TODAY_ISO; calState.expanded = TODAY_ISO; }
function monthMatrix(year, month) {
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();
  const cells = [];
  for (let i = firstDow - 1; i >= 0; i--) { const m2 = month === 0 ? 11 : month - 1, y2 = month === 0 ? year - 1 : year; cells.push({ y: y2, m: m2, d: daysInPrev - i, outside: true }); }
  for (let d = 1; d <= daysInMonth; d++) cells.push({ y: year, m: month, d, outside: false });
  let next = 1;
  while (cells.length < 42) { const m2 = month === 11 ? 0 : month + 1, y2 = month === 11 ? year + 1 : year; cells.push({ y: y2, m: m2, d: next, outside: true }); next++; }
  return cells;
}

function pageCalendar(dateParam) {
  applyCalParam(dateParam);
  return `
  <div class="cal-head">
    <h1>Calendar</h1>
    <div class="cal-sync-note"><svg class="ic"><use href="#i-refresh"/></svg>Sample cause lists · demo data, not synced from any court</div>
  </div>
  <div id="calWrap">${calendarBody()}</div>`;
}

function calHeaderTitle() {
  const c = parseISODateStr(calState.cursor);
  if (calState.view === 'day') return c.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
  if (calState.view === 'year') return String(c.getFullYear());
  if (calState.view === 'week') {
    const days = weekDates(calState.cursor), a = parseISODateStr(days[0]), b = parseISODateStr(days[6]);
    return a.getMonth() === b.getMonth() ? `${MONTH_NAMES[a.getMonth()]} ${a.getDate()}–${b.getDate()}, ${a.getFullYear()}` : `${MONTH_NAMES[a.getMonth()].slice(0, 3)} ${a.getDate()} – ${MONTH_NAMES[b.getMonth()].slice(0, 3)} ${b.getDate()}, ${b.getFullYear()}`;
  }
  return `${MONTH_NAMES[c.getMonth()]} ${c.getFullYear()}`;
}

function calendarBody() {
  const body = calState.view === 'day' ? dayView() : calState.view === 'week' ? weekView() : calState.view === 'year' ? yearView() : monthView();
  return `
  <div class="card cal-card">
    <div class="cal-toolbar">
      <h2 class="cal-title">${calHeaderTitle()}</h2>
      <div class="cal-toolbar-right">
        <div class="cal-nav">
          <button class="cal-nav-btn" id="calPrev" aria-label="Previous"><svg class="ic"><use href="#i-chevron"/></svg></button>
          <button class="btn btn-ghost btn-sm" id="calTodayBtn">Today</button>
          <button class="cal-nav-btn next" id="calNext" aria-label="Next"><svg class="ic"><use href="#i-chevron"/></svg></button>
        </div>
        <div class="cal-view-switch">${CAL_VIEWS.map(v => `<button type="button" class="cal-view-btn${calState.view === v ? ' active' : ''}" data-view="${v}">${v[0].toUpperCase()}${v.slice(1)}</button>`).join('')}</div>
      </div>
    </div>
    <div class="cal-body">${body}</div>
  </div>`;
}

/* ---- Month view: grid on top, a persistent agenda strip below it (like iOS) —
   tapping a date updates the strip in place; it never pops up and never closes. ---- */
function monthView() {
  const c = parseISODateStr(calState.cursor);
  const cells = monthMatrix(c.getFullYear(), c.getMonth());
  const agendaDate = calState.expanded || calState.cursor;
  const grid = cells.map(cell => {
    const iso = isoDate(cell.y, cell.m, cell.d);
    const h = hearingsOn(iso), d = deadlinesOn(iso), n = notesOn(iso);
    const dots = [h.length && '<i class="cal-dot-mini teal"></i>', d.length && '<i class="cal-dot-mini amber"></i>', n.length && '<i class="cal-dot-mini violet"></i>'].filter(Boolean).join('');
    // compact labels shown inside the cell on desktop; phones keep the dots
    const labels = [
      ...h.map(x => `<span class="cal-ev teal">${esc(to24h(x.time))} ${esc((matterById(x.matterId)?.title || '').split(' v.')[0])}</span>`),
      ...d.map(x => `<span class="cal-ev amber">${esc(x.title)}</span>`),
      ...n.map(x => `<span class="cal-ev violet">${esc(x.text)}</span>`)
    ];
    const shown = labels.length > 2 ? labels.slice(0, 1) : labels;
    const more = labels.length - shown.length;
    return `<button type="button" class="cal-cell${cell.outside ? ' outside' : ''}${iso === TODAY_ISO ? ' is-today' : ''}${iso === agendaDate ? ' is-selected' : ''}" data-date="${iso}">
      <span class="cal-cell-num">${cell.d}</span><span class="cal-dots">${dots}</span>
      <span class="cal-cell-events">${shown.join('')}${more ? `<span class="cal-ev-more">+${more} more</span>` : ''}</span>
    </button>`;
  }).join('');
  return `
    <div class="cal-month-layout">
      <div class="cal-month-main">
        <div class="cal-weekdays">${WEEKDAY_SHORT.map(w => `<span>${w}</span>`).join('')}</div>
        <div class="cal-grid">${grid}</div>
        <div class="cal-legend"><span><i class="cal-dot-mini teal"></i>Hearing</span><span><i class="cal-dot-mini amber"></i>Deadline</span><span><i class="cal-dot-mini violet"></i>Note</span></div>
      </div>
      <div class="cal-agenda-panel" id="calAgendaPanel">${dayAgenda(agendaDate)}<a class="btn-text" href="#/calendar/${agendaDate}" style="margin-top:14px">Open full day view<svg class="ic"><use href="#i-arrow"/></svg></a></div>
    </div>`;
}

/* ---- Week view: an agenda strip you tap into for the full day ---- */
function weekView() {
  const days = weekDates(calState.cursor);
  return `<div class="cal-week-list">${days.map(iso => {
    const h = hearingsOn(iso), d = deadlinesOn(iso), n = notesOn(iso);
    const dt = parseISODateStr(iso);
    const chips = [
      ...h.map(x => `<span class="cal-week-chip teal">${esc(x.time)} · ${esc(matterById(x.matterId)?.title || '')}</span>`),
      ...d.map(x => `<span class="cal-week-chip amber">${esc(x.title)}</span>`),
      ...n.map(x => `<span class="cal-week-chip violet">${esc(x.text)}</span>`)
    ].join('');
    return `<button type="button" class="cal-week-day${iso === TODAY_ISO ? ' is-today' : ''}" data-date="${iso}">
      <div class="cal-week-day-date"><b>${dt.getDate()}</b><span>${WEEKDAY_SHORT[dt.getDay()]}</span></div>
      <div class="cal-week-day-body">${chips || '<span class="cal-week-empty">Nothing scheduled</span>'}</div>
      <svg class="ic cal-week-chevron"><use href="#i-chevron"/></svg>
    </button>`;
  }).join('')}</div>`;
}

/* ---- Year view: 12 mini months, tap a month to zoom in, tap a day to jump straight in ---- */
function yearView() {
  const year = parseISODateStr(calState.cursor).getFullYear();
  return `<div class="cal-year-grid">${Array.from({ length: 12 }, (_, m) => {
    const cells = monthMatrix(year, m);
    return `<div class="cal-mini-month">
      <button type="button" class="cal-mini-month-title" data-goto-month="${m}">${MONTH_NAMES[m]}</button>
      <div class="cal-mini-grid">
        ${WEEKDAY_SHORT.map(w => `<span class="cal-mini-dow">${w[0]}</span>`).join('')}
        ${cells.map(cell => {
          const iso = isoDate(cell.y, cell.m, cell.d);
          const has = !cell.outside && (hearingsOn(iso).length || deadlinesOn(iso).length || notesOn(iso).length);
          return `<button type="button" class="cal-mini-cell${cell.outside ? ' outside' : ''}${iso === TODAY_ISO ? ' is-today' : ''}${has ? ' has-event' : ''}" data-date="${iso}"${cell.outside ? ' disabled' : ''}>${cell.d}</button>`;
        }).join('')}
      </div>
    </div>`;
  }).join('')}</div>`;
}

/* ---- Day view: the full agenda for one date, using the full card width —
   events on the left, notes on the right, so the panel isn't a narrow column
   floating in a lot of empty space. ---- */
function dayView() {
  const iso = calState.cursor;
  return `<div class="cal-day-view">
    ${dayAgendaHeading(iso, true)}
    <div class="cal-day-columns">
      <div class="cal-day-col">${dayAgendaEvents(iso)}</div>
      <div class="cal-day-col">${dayAgendaNotes(iso)}</div>
    </div>
  </div>`;
}

function dayAgendaHeading(iso, big) {
  const heading = parseISODateStr(iso).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return `${iso === TODAY_ISO ? '<p class="eyebrow">Today</p>' : ''}<h2${big ? ' class="cal-day-heading"' : ''}>${heading}</h2>`;
}

function dayAgendaEvents(iso) {
  const h = hearingsOn(iso), d = deadlinesOn(iso);
  let html = '';
  if (h.length) {
    html += `<p class="cal-detail-label">Hearings</p>` + h.map(x => {
      const m = matterById(x.matterId);
      if (!m) return '';
      return `<a class="cal-event" href="#/matters/${m.id}/hearing" style="text-decoration:none;color:inherit"><div class="cal-event-time">${esc(x.time)}</div><div class="cal-event-copy"><strong>${esc(m.title)}</strong><small>${esc(x.court)} · ${esc(x.purpose)}</small></div><span class="chip ${x.status === 'ready' ? 'chip-teal' : x.status === 'risk' ? 'chip-red' : 'chip-amber'}">${x.status === 'ready' ? 'Ready' : x.status === 'risk' ? 'Needs review' : 'Preparing'}</span></a>`;
    }).join('');
  }
  if (d.length) {
    html += `<p class="cal-detail-label" style="margin-top:${h.length ? '16px' : '0'}">Deadlines</p>` + d.map(x => `<a class="cal-event deadline" href="#/matters/${x.matterId}" style="text-decoration:none;color:inherit"><div class="cal-event-time"><svg class="ic" style="width:15px"><use href="#i-flag"/></svg></div><div class="cal-event-copy"><strong>${esc(x.title)}</strong><small>${esc(matterById(x.matterId)?.title || '')} · ${esc(x.type)}</small></div></a>`).join('');
  }
  if (!h.length && !d.length) html += `<p class="hint" style="margin:4px 0 0">No hearings or deadlines on this date.</p>`;
  return html;
}

function dayAgendaNotes(iso) {
  const n = notesOn(iso);
  let html = `<p class="cal-detail-label">Notes</p><div id="calNotesList">`;
  html += n.length ? n.map(note => `<div class="cal-note-item"><p>${esc(note.text)}</p><div class="cal-note-meta"><span>${esc(note.createdAt)}</span><button type="button" data-action="delete-note" data-date="${iso}" data-id="${note.id}">Remove</button></div></div>`).join('') : '<p class="empty-note" style="text-align:left;padding:2px 0 8px">No notes for this date yet.</p>';
  html += `</div><form class="cal-note-form" id="calNoteForm" data-date="${iso}"><textarea rows="2" placeholder="Add a note for this date — a reminder, a task, anything."></textarea><button class="btn btn-teal btn-sm" type="submit"><svg class="ic"><use href="#i-plus"/></svg>Add note</button></form>`;
  return html;
}

/* Single-column version used inside Month view's agenda strip, matching iOS's simple list. */
function dayAgenda(iso) {
  return dayAgendaHeading(iso) + dayAgendaEvents(iso) + `<div style="margin-top:18px">${dayAgendaNotes(iso)}</div>`;
}

function refreshCalendar() {
  const wrap = $('#calWrap');
  if (!wrap) return;
  const active = document.activeElement;
  const focusSelector = active && wrap.contains(active) ? (
    active.id ? `#${active.id}` :
    active.dataset.date ? `[data-date="${active.dataset.date}"]` :
    active.dataset.view ? `[data-view="${active.dataset.view}"]` :
    active.dataset.gotoMonth != null ? `[data-goto-month="${active.dataset.gotoMonth}"]` : null
  ) : null;
  wrap.innerHTML = calendarBody();
  bindCalendar();
  if (focusSelector) wrap.querySelector(focusSelector)?.focus();
}

function bindCalendar() {
  $('#calPrev')?.addEventListener('click', () => { calShift(-1); refreshCalendar(); });
  $('#calNext')?.addEventListener('click', () => { calShift(1); refreshCalendar(); });
  $('#calTodayBtn')?.addEventListener('click', () => { calGoToday(); refreshCalendar(); });
  $$('.cal-view-btn').forEach(b => b.addEventListener('click', () => {
    calState.view = b.dataset.view;
    if (calState.view === 'month') calState.expanded = calState.cursor;
    refreshCalendar();
  }));

  $$('.cal-cell').forEach(btn => btn.addEventListener('click', () => {
    const iso = btn.dataset.date;
    if (btn.classList.contains('outside')) { const d = parseISODateStr(iso); calState.cursor = isoDate(d.getFullYear(), d.getMonth(), 1); }
    calState.expanded = iso; // always selects — the agenda strip below just updates, like iOS
    refreshCalendar();
    const cell = document.querySelector(`.cal-cell[data-date="${iso}"]`);
    cell?.classList.add('pop');
    setTimeout(() => cell?.classList.remove('pop'), 380);
  }));
  $$('.cal-week-day').forEach(b => b.addEventListener('click', () => { calState.view = 'day'; calState.cursor = b.dataset.date; refreshCalendar(); }));
  $$('.cal-mini-cell').forEach(b => b.addEventListener('click', () => { calState.view = 'day'; calState.cursor = b.dataset.date; refreshCalendar(); }));
  $$('[data-goto-month]').forEach(b => b.addEventListener('click', () => {
    const c = parseISODateStr(calState.cursor);
    calState.view = 'month'; calState.cursor = isoDate(c.getFullYear(), Number(b.dataset.gotoMonth), 1); calState.expanded = calState.cursor;
    refreshCalendar();
  }));

  $('#calNoteForm')?.addEventListener('submit', e => {
    e.preventDefault();
    const ta = $('textarea', e.currentTarget);
    const text = ta.value.trim();
    if (!text) return;
    const iso = e.currentTarget.dataset.date;
    (NOTES[iso] ||= []).push({ id: uid('note'), text, createdAt: 'Just now' });
    refreshCalendar();
    showToast('Note added to ' + parseISODateStr(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + '.');
  });
  $$('[data-action="delete-note"]').forEach(b => b.addEventListener('click', () => {
    const iso = b.dataset.date;
    NOTES[iso] = (NOTES[iso] || []).filter(n => n.id !== b.dataset.id);
    refreshCalendar();
  }));
}

/* =============================================================================
   PAGE: DOCUMENTS (global library)
   ============================================================================= */
function docRow(d) {
  return `<a class="doc-row" href="#/matters/${d.matterId}/evidence" style="padding:14px 20px;text-decoration:none;color:inherit;border-top:1px solid var(--line-soft)"><div class="doc-type ${d.type}">${d.type.toUpperCase()}</div><div class="doc-copy"><strong>${esc(d.name)}</strong><small>${esc(d.matter)} · Added ${esc(d.added)} · ${esc(d.size)}</small></div><span class="chip ${d.status === 'Key document' ? 'chip-teal' : d.status === 'Needs review' ? 'chip-amber' : 'chip-navy'}">${esc(d.status)}</span></a>`;
}

function pageDocuments() {
  const rows = MATTERS.flatMap(m => m.documents.map(d => ({ ...d, matter: m.title, matterId: m.id })));
  return `
  <div class="page-head"><div class="page-head-text"><p class="eyebrow">Document library</p><h1>Documents</h1><p class="lede">Every document added to a matter, in one place. Search by name, matter or status; to search inside a document, read its text on the matter’s Evidence tab.</p></div><button class="btn btn-primary" data-action="upload-doc"><svg class="ic"><use href="#i-upload"/></svg>Upload</button></div>
  <div class="toolbar"><div class="search-box"><svg class="ic"><use href="#i-research"/></svg><input id="docsSearch" placeholder="Search by file name, matter or status" /></div><span class="toolbar-count" id="docsCount">${rows.length} documents</span></div>
  <div class="card" style="padding:0;overflow:hidden" id="docsList">${rows.map(docRow).join('')}</div>`;
}

let docsRefresh = null;                               // repaints the library list in place, so adding a file does not rebuild the page (and close the dialog)
function bindDocuments() {
  docsRefresh = () => {
    const rows = MATTERS.flatMap(m => m.documents.map(d => ({ ...d, matter: m.title, matterId: m.id })));
    const input = $('#docsSearch'), list = $('#docsList'), count = $('#docsCount');
    if (!input || !list || !count) return;
    const q = input.value.toLowerCase(), filtered = q ? rows.filter(d => (d.name + d.matter + d.status).toLowerCase().includes(q)) : rows;
    list.innerHTML = filtered.length ? filtered.map(docRow).join('') : `<p class="empty-note" style="padding:20px">No documents match “${esc(input.value)}”.</p>`;
    count.textContent = `${filtered.length} document${filtered.length === 1 ? '' : 's'}`;
  };
  $('#docsSearch')?.addEventListener('input', docsRefresh);
}

/* =============================================================================
   PAGE: KNOWLEDGE BASE
   ============================================================================= */
function pageKnowledge() {
  return `
  <div class="page-head"><div class="page-head-text"><p class="eyebrow">Trust &amp; sources</p><h1>Knowledge base</h1><p class="lede">The statutes and precedents LegalAI grounds every answer in — this is what "verified" means.</p></div></div>

  <div class="card card-pad section">
    <div class="card-head"><div><h2>Knowledge graph</h2><p class="hint">How your matters connect to the statutes and precedents that ground them. Click a matter to open it.</p></div></div>
    <div class="kg-wrap">${renderKnowledgeGraph()}</div>
    <div class="cal-legend" style="margin-top:4px"><span><i class="kg-dot violet"></i>Matter</span><span><i class="kg-dot teal"></i>Precedent</span><span><i class="kg-dot amber"></i>Statute</span></div>
  </div>

  <div class="grid-2">
    <div class="card card-pad"><h2>Statutes indexed</h2>${KNOWLEDGE.statutes.map(s => `<div class="kb-entry" id="kb-${s.key}"><div class="kb-entry-top"><strong>${esc(s.title)}</strong><span class="chip chip-teal">${s.used} uses</span></div><p>${esc(s.body)}</p></div>`).join('')}</div>
    <div class="card card-pad"><h2>Reported precedents</h2>${KNOWLEDGE.precedents.map(p => `<div class="kb-entry" id="kb-${p.key}"><div class="kb-entry-top"><strong>${esc(p.title)}</strong><span class="chip chip-teal">${p.used} uses</span></div><p>${esc(p.body)}</p></div>`).join('')}</div>
  </div>
  <div class="card card-pad section" style="margin-top:18px"><h2>How grounding works</h2><p class="hint" style="max-width:640px">Every answer combines dense retrieval over this corpus with a knowledge graph that models statute–precedent–fact relationships. A citation is only shown if it resolves to a real node in that graph — otherwise it’s flagged, not surfaced.</p></div>`;
}

/* Small hand-laid-out SVG showing matter → precedent → statute connections,
   derived from the same data the app already uses (no parallel dataset). */
function renderKnowledgeGraph() {
  const matters = MATTERS.filter(m => m.authorities && m.authorities.length);
  const prec = KNOWLEDGE.precedents, stat = KNOWLEDGE.statutes;
  const rowY = i => 54 + i * 92;
  const mX = 90, pX = 372, sX = 654;
  const rows = Math.max(matters.length, prec.length, stat.length, 1);
  const W = 760, H = 54 + (rows - 1) * 92 + 50;
  const mPos = {}, pPos = {}, sPos = {};
  matters.forEach((m, i) => mPos[m.id] = { x: mX, y: rowY(i) });
  prec.forEach((p, i) => pPos[p.key] = { x: pX, y: rowY(i) });
  stat.forEach((s, i) => sPos[s.key] = { x: sX, y: rowY(i) });

  const edges = [];
  matters.forEach(m => m.authorities.forEach(a => {
    if (pPos[a.key]) edges.push([mPos[m.id], pPos[a.key]]);
    else if (sPos[a.key]) edges.push([mPos[m.id], sPos[a.key]]);
  }));
  GRAPH_INTERPRETS.forEach(l => { if (pPos[l.precedent] && sPos[l.statute]) edges.push([pPos[l.precedent], sPos[l.statute]]); });

  const lineSvg = edges.map(([a, b]) => `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="kg-edge"/>`).join('');
  const truncate = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;
  const matterSvg = matters.map(m => `<g class="kg-node has-link" data-href="#/matters/${m.id}"><circle cx="${mPos[m.id].x}" cy="${mPos[m.id].y}" r="7" class="kg-dot-svg violet"/><text x="${mPos[m.id].x + 15}" y="${mPos[m.id].y + 4}" class="kg-label">${esc(truncate(m.title, 24))}</text></g>`).join('');
  const precSvg = prec.map(p => `<g class="kg-node"><circle cx="${pPos[p.key].x}" cy="${pPos[p.key].y}" r="8" class="kg-dot-svg teal"/><text x="${pPos[p.key].x + 15}" y="${pPos[p.key].y + 4}" class="kg-label">${esc(truncate(p.title, 28))}</text></g>`).join('');
  const statSvg = stat.map(s => `<g class="kg-node"><circle cx="${sPos[s.key].x}" cy="${sPos[s.key].y}" r="8" class="kg-dot-svg amber"/><text x="${sPos[s.key].x + 15}" y="${sPos[s.key].y + 4}" class="kg-label">${esc(s.title.split(' — ')[0])}</text></g>`).join('');

  return `<svg class="kg-svg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${lineSvg}${matterSvg}${precSvg}${statSvg}</svg>`;
}

/* =============================================================================
   PAGE: eCOURTS — case status / cause lists / order sheets from the NJDG
   ============================================================================= */
function countUpcomingListings(days) {
  const start = parseISODateStr(TODAY_ISO);
  return HEARINGS.filter(h => { const diff = Math.round((parseISODateStr(h.date) - start) / 86400000); return diff >= 0 && diff <= days; }).length;
}
function ecStatusChip(status) { return /dispos/i.test(status) ? 'chip-red' : /adjourn/i.test(status) ? 'chip-amber' : 'chip-teal'; }

/* Map the ecourts-service response onto this app's ECOURTS record shape. */
function adaptServiceRecord(r) {
  const s = r.status || {};
  return {
    cnr: r.cnr, filed: r.filingDateIso || null, regDate: r.registrationDateIso || null,
    stage: s.stage || '—',
    nextDate: s.nextHearingDateIso || s.decisionDateIso || null,
    nextPurpose: s.disposed ? (s.natureOfDisposal || 'Disposed') : 'Next listing',
    bench: s.courtAndJudge || '—',
    status: s.disposed ? 'Disposed' : (s.nextHearingDateIso ? 'Listed' : 'Pending'),
    orders: (r.orders || []).map(o => ({ date: o.dateIso || o.date, text: o.details || '' })),
    live: r.meta?.source === 'live', sample: r.meta?.source === 'fixture', syncedAt: 'Just now'
  };
}

/* Live call to the ecourts-service. Resolves to a status string; updates ECOURTS
   in place on success. Fails soft so an offline service never breaks the demo. */
/* Raw call to the live service. Never throws — callers branch on `status`. */
async function fetchLiveCaseStatus(cnr) {
  try {
    const res = await fetch(`${ECOURTS_SERVICE.url}/api/case-status/${encodeURIComponent(cnr)}`, {
      headers: { 'x-api-key': ECOURTS_SERVICE.key }
    });
    if (res.status === 404) return { status: 'not-found' };
    if (!res.ok) return { status: 'error' };
    return { status: 'ok', data: await res.json() };
  } catch {
    return { status: 'offline' };
  }
}

async function syncCaseStatusFromService(matterId) {
  const existing = ECOURTS[matterId];
  const cnr = existing?.cnr;
  if (!cnr) { showToast('No CNR is linked to this matter yet.'); return 'no-cnr'; }
  showToast('Contacting eCourts…');
  const r = await fetchLiveCaseStatus(cnr);
  if (r.status === 'not-found') { showToast(`eCourts has no record for ${cnr} yet.`); return 'not-found'; }
  if (r.status === 'error') { showToast('eCourts returned an error — showing last-known data.'); return 'error'; }
  if (r.status === 'offline') { showToast('eCourts service offline — showing last-known data.'); return 'offline'; }
  ECOURTS[matterId] = { ...existing, ...adaptServiceRecord(r.data) };
  if (location.hash.includes('/status') || location.hash.startsWith('#/ecourts')) route();
  showToast(r.data.meta?.source === 'live' ? `Synced live from eCourts · ${cnr}` : `Synced from the eCourts service (sample data) · ${cnr}`);
  return 'ok';
}

async function syncAllFromService() {
  const ids = Object.keys(ECOURTS);
  showToast(`Syncing ${ids.length} cases with eCourts…`);
  let ok = 0;
  for (const id of ids) {
    const r = await fetchLiveCaseStatus(ECOURTS[id].cnr);
    if (r.status === 'ok') { ECOURTS[id] = { ...ECOURTS[id], ...adaptServiceRecord(r.data) }; ok++; }
  }
  if (location.hash.startsWith('#/ecourts')) route();
  showToast(ok ? `Synced ${ok} of ${ids.length} cases from eCourts.` : 'eCourts service offline — showing last-known data.');
}

/* Reverse-lookup so a direct CNR search can link back to a tracked matter. */
function matterIdForCnr(cnr) {
  const norm = String(cnr).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const hit = Object.entries(ECOURTS).find(([, e]) => (e.cnr || '').toUpperCase().replace(/[^A-Z0-9]/g, '') === norm);
  return hit ? hit[0] : null;
}

/* ---------------------------------------------------------------------------
   eCourts multi-mode search — case number, party name, filing number, FIR
   number, advocate, act, case type, caveat, and pending/pre-trial applications.
   Mirrors the ecourts-service /api/search modes 1:1.
   ------------------------------------------------------------------------- */
const EC_MODES = [
  { key: 'cnr', label: 'Case Number' },
  { key: 'party', label: 'Party Name', location: true },
  { key: 'filing', label: 'Filing No.', location: true },
  { key: 'fir', label: 'FIR No.', location: 'partial' },
  { key: 'advocate', label: 'Advocate', location: true },
  { key: 'act', label: 'Act', location: true },
  { key: 'caseType', label: 'Case Type', location: true },
  { key: 'caveat', label: 'Caveat', location: true },
  { key: 'pretrial', label: 'Pre-trial App.', location: true }
];
const EC_PRIMARY_FIELD = {
  cnr: { name: 'cnr', label: 'CNR number', placeholder: 'e.g. MHCC01-001234-2026', required: true },
  party: { name: 'name', label: 'Party name', placeholder: 'e.g. Sharma', required: true },
  filing: { name: 'filingNumber', label: 'Filing number', placeholder: 'e.g. 4521/2026', required: true },
  fir: { name: 'firNumber', label: 'FIR number', placeholder: 'e.g. 211/2026', required: true },
  advocate: { name: 'name', label: 'Advocate name', placeholder: 'e.g. Kamat', required: true },
  act: { name: 'act', label: 'Act name', placeholder: 'e.g. Arbitration and Conciliation Act', required: true },
  caseType: { name: 'caseType', label: 'Case type', placeholder: 'e.g. Motor Accident Claim', required: true },
  caveat: { name: 'name', label: 'Party name', placeholder: 'e.g. Rao Constructions', required: true },
  pretrial: { name: 'type', label: 'Application type', placeholder: 'optional — e.g. injunction', required: false }
};
const EC_EXTRA_FIELDS = {
  filing: [{ name: 'year', label: 'Year', placeholder: 'optional — e.g. 2026' }],
  fir: [{ name: 'year', label: 'Year', placeholder: 'optional — e.g. 2026' }, { name: 'policeStation', label: 'Police station', placeholder: 'optional' }],
  caseType: [{ name: 'year', label: 'Year', placeholder: 'optional — e.g. 2026' }],
  pretrial: [{ name: 'status', label: 'Status', placeholder: 'optional — e.g. Pending' }]
};
/* Same hierarchy the service ships (src/data/courts.js). Seeded synchronously so
   location selects render instantly; refreshed from /api/courts in the
   background in case the service's coverage has grown since this shipped. */
const EC_COURTS_FALLBACK = {
  Maharashtra: {
    Mumbai: ['Bombay High Court', 'City Civil Court, Mumbai', 'Family Court, Mumbai'],
    Pune: ['District Court, Pune', 'Labour Court, Pune', 'Sessions Court, Pune', 'MACT, Pune']
  },
  Delhi: { 'New Delhi': ['Delhi High Court'] }
};
let ecCourts = EC_COURTS_FALLBACK;
let ecMode = 'cnr';
let ecFieldState = { primary: '', extra: {}, status: '', state: '', district: '', courtComplex: '' };

async function ensureCourtHierarchy() {
  try {
    const res = await fetch(`${ECOURTS_SERVICE.url}/api/courts`);
    if (res.ok) { const body = await res.json(); if (body?.hierarchy) ecCourts = body.hierarchy; }
  } catch { /* keep the fallback — offline service shouldn't block search UI */ }
}

async function fetchLiveSearch(mode, params) {
  const qs = new URLSearchParams({ mode, ...params });
  try {
    const res = await fetch(`${ECOURTS_SERVICE.url}/api/search?${qs.toString()}`, { headers: { 'x-api-key': ECOURTS_SERVICE.key } });
    if (!res.ok) {
      let message = 'eCourts returned an error.';
      try { const body = await res.json(); if (body?.error) message = body.error; } catch { /* non-JSON error body */ }
      return { status: 'error', message };
    }
    return { status: 'ok', data: await res.json() };
  } catch {
    return { status: 'offline' };
  }
}

function ecModePillsHtml() {
  return EC_MODES.map(m => `<button type="button" class="ec-mode-pill${m.key === ecMode ? ' active' : ''}" data-mode="${m.key}">${esc(m.label)}</button>`).join('');
}

function ecLocationHtml() {
  const spec = EC_MODES.find(m => m.key === ecMode);
  if (!spec || !spec.location) return '';
  const states = Object.keys(ecCourts);
  const districts = ecFieldState.state ? Object.keys(ecCourts[ecFieldState.state] || {}) : [];
  const complexes = (ecFieldState.state && ecFieldState.district) ? (ecCourts[ecFieldState.state]?.[ecFieldState.district] || []) : [];
  const showComplex = spec.location === true; // 'partial' (FIR search) has no court-complex filter server-side
  return `<div class="ec-location-grid">
    <select id="ecState"><option value="">Any state</option>${states.map(s => `<option value="${esc(s)}"${s === ecFieldState.state ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select>
    <select id="ecDistrict" ${ecFieldState.state ? '' : 'disabled'}><option value="">${ecFieldState.state ? 'Any district' : 'Select a state first'}</option>${districts.map(d => `<option value="${esc(d)}"${d === ecFieldState.district ? ' selected' : ''}>${esc(d)}</option>`).join('')}</select>
    ${showComplex ? `<select id="ecCourtComplex" ${ecFieldState.district ? '' : 'disabled'}><option value="">${ecFieldState.district ? 'Any court complex' : 'Select a district first'}</option>${complexes.map(c => `<option value="${esc(c)}"${c === ecFieldState.courtComplex ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select>` : ''}
  </div>`;
}

/* This demo's search index only covers the 8 matters already in the app, so an
   arbitrary name/number will genuinely return zero results — that's the thin
   mock dataset, not a broken API. Visible examples stop that from reading as
   a bug. */
const EC_EXAMPLES = {
  cnr: 'Try MHCC01-001234-2026 or DLHC05-013207-2026',
  party: 'Try Sharma, Patel, Mehra, Kulkarni, Kapoor, Fernandes, Rao or Joshi',
  filing: 'Try 1234/2026 or 4521/2026',
  fir: 'Try 211/2026 or 88/2025',
  advocate: 'Try Kamat, Mehta, Sethi or Iyer',
  act: 'Try “Motor Vehicles Act”, “Contract Act” or “Arbitration”',
  caseType: 'Try “writ”, “bail” or “motor accident”',
  caveat: 'Try Aarohi Estates, Rao Constructions or Patel',
  pretrial: 'Leave blank to see all, or try “injunction” or “maintenance”'
};

function ecFieldsWrapHtml() {
  const primary = EC_PRIMARY_FIELD[ecMode];
  const extras = EC_EXTRA_FIELDS[ecMode] || [];
  return `
    <div class="ec-fields-main">
      <div class="ec-field"><label class="ec-field-label">${esc(primary.label)}</label><input id="ecPrimaryInput" type="text" placeholder="${esc(primary.placeholder)}" value="${esc(ecFieldState.primary)}" /><small class="ec-field-hint">${esc(EC_EXAMPLES[ecMode] || '')}</small></div>
      ${extras.map(f => `<div class="ec-field"><label class="ec-field-label">${esc(f.label)}</label><input class="ec-extra-input" data-field="${f.name}" type="text" placeholder="${esc(f.placeholder)}" value="${esc(ecFieldState.extra[f.name] || '')}" /></div>`).join('')}
      ${ecMode === 'party' ? `<div class="ec-field"><label class="ec-field-label">Status</label><select id="ecStatusSelect"><option value=""${!ecFieldState.status ? ' selected' : ''}>Any</option><option value="pending"${ecFieldState.status === 'pending' ? ' selected' : ''}>Pending</option><option value="disposed"${ecFieldState.status === 'disposed' ? ' selected' : ''}>Disposed</option></select></div>` : ''}
    </div>
    <div id="ecLocationWrap">${ecLocationHtml()}</div>`;
}

function ecSearchCardHtml() {
  return `
  <div class="card card-pad section ec-lookup-card">
    <div class="card-head"><div><p class="eyebrow">Look up any case</p><h2>Search eCourts</h2></div></div>
    <p class="hint">Not limited to matters you already track — search live by case number, party name, filing number, FIR number, advocate, act, case type, caveat, or a pending pre-trial application.</p>
    <div class="ec-mode-pills" id="ecModePills">${ecModePillsHtml()}</div>
    <form class="ec-search-form" id="ecSearchForm">
      <div class="ec-fields" id="ecFieldsWrap">${ecFieldsWrapHtml()}</div>
      <button class="btn btn-primary" type="submit"><svg class="ic"><use href="#i-research"/></svg>Search</button>
    </form>
    <div id="ecLookupResult"></div>
  </div>`;
}

function ecResultCardHtml(mode, item, idx) {
  const id = `ecResult${idx}`;
  if (mode === 'caveat') {
    return `<div class="ec-result-card">
      <div class="ec-result-top"><span class="chip chip-amber">Caveat</span><span class="mono ec-lookup-cnr">${esc(item.caveatNumber)}</span></div>
      <p class="ec-result-parties"><b>${esc(item.caveator)}</b> <span>caveator, against</span> <b>${esc(item.against)}</b></p>
      <p class="hint" style="margin-top:6px">${esc(item.note)}</p>
      <div class="ec-lookup-facts"><div><span>Filed</span><b>${esc(fmtDate(item.filedDate, true))}</b></div><div><span>Court</span><b>${esc(item.courtComplex)}</b></div></div>
      ${item.relatedCnr ? `<button type="button" class="btn-text ec-view-case" data-cnr="${esc(item.relatedCnr)}" data-target="${id}">View related case<svg class="ic"><use href="#i-arrow"/></svg></button>` : ''}
      <div class="ec-result-detail" id="${id}" hidden></div>
    </div>`;
  }
  if (mode === 'pretrial') {
    return `<div class="ec-result-card">
      <div class="ec-result-top"><span class="chip chip-teal">${esc(item.status)}</span><span class="mono ec-lookup-cnr">${esc(item.iaNumber)}</span></div>
      <strong class="ec-lookup-type">${esc(item.type)}</strong>
      <p class="ec-result-parties">${esc(item.caseTitle)}</p>
      <div class="ec-lookup-facts"><div><span>Filed</span><b>${esc(fmtDate(item.filedDate, true))}</b></div><div><span>Court</span><b>${esc(item.courtComplex)}</b></div></div>
      <button type="button" class="btn-text ec-view-case" data-cnr="${esc(item.cnr)}" data-target="${id}">View case<svg class="ic"><use href="#i-arrow"/></svg></button>
      <div class="ec-result-detail" id="${id}" hidden></div>
    </div>`;
  }
  // case-summary shape: party / filing / fir / advocate / act / caseType
  return `<div class="ec-result-card">
    <div class="ec-result-top"><span class="chip ${item.status === 'disposed' ? 'chip-red' : 'chip-teal'}">${esc(item.status === 'disposed' ? 'Disposed' : 'Pending')}</span><span class="mono ec-lookup-cnr">${esc(item.cnr)}</span></div>
    <strong class="ec-lookup-type">${esc(item.caseType)}</strong>
    <p class="ec-result-parties">${esc(item.petitioners.join(', '))} <span>v.</span> ${esc(item.respondents.join(', '))}</p>
    <p class="hint" style="margin-top:4px">${esc(item.courtComplex)}${item.acts?.length ? ' · ' + esc(item.acts[0]) : ''}</p>
    <button type="button" class="btn-text ec-view-case" data-cnr="${esc(item.cnr)}" data-target="${id}">View full details<svg class="ic"><use href="#i-arrow"/></svg></button>
    <div class="ec-result-detail" id="${id}" hidden></div>
  </div>`;
}

function ecSearchResultsHtml(mode, r) {
  if (r.status === 'offline') return `<div class="ec-lookup-result offline"><svg class="ic"><use href="#i-alert"/></svg><div><strong>eCourts service is offline</strong><small>Couldn’t reach the live search service — try again shortly.</small></div></div>`;
  if (r.status === 'error') return `<div class="ec-lookup-result offline"><svg class="ic"><use href="#i-alert"/></svg><div><strong>Search failed</strong><small>${esc(r.message || 'Something went wrong on the service side.')}</small></div></div>`;
  const { count, results } = r.data;
  if (!count) return `<div class="ec-lookup-result notfound"><svg class="ic"><use href="#i-research"/></svg><div><strong>No matches found</strong><small>This demo's index only covers the matters already in the app — try clearing the court filters, or: ${esc(EC_EXAMPLES[mode] || '')}</small></div></div>`;
  return `<p class="ec-results-count">${count} match${count === 1 ? '' : 'es'}</p><div class="ec-results-list">${results.map((item, i) => ecResultCardHtml(mode, item, i)).join('')}</div>`;
}

async function runEcSearch() {
  const box = $('#ecLookupResult');
  const primary = ecFieldState.primary.trim();
  const primarySpec = EC_PRIMARY_FIELD[ecMode];
  if (primarySpec.required && !primary) { showToast(`${primarySpec.label} is required to search.`); return; }

  if (ecMode === 'cnr') {
    box.innerHTML = `<div class="ec-lookup-result pending"><span class="typing-dots"><i></i><i></i><i></i></span>Searching eCourts for ${esc(primary)}…</div>`;
    const r = await fetchLiveCaseStatus(primary);
    box.innerHTML = ecLookupResultHtml(primary, r);
    return;
  }

  const params = {};
  if (primary) params[primarySpec.name] = primary;
  for (const [k, v] of Object.entries(ecFieldState.extra)) if (v && v.trim()) params[k] = v.trim();
  if (ecFieldState.status) params.status = ecFieldState.status;
  if (ecFieldState.state) params.state = ecFieldState.state;
  if (ecFieldState.district) params.district = ecFieldState.district;
  if (ecFieldState.courtComplex) params.courtComplex = ecFieldState.courtComplex;

  box.innerHTML = `<div class="ec-lookup-result pending"><span class="typing-dots"><i></i><i></i><i></i></span>Searching eCourts…</div>`;
  const r = await fetchLiveSearch(ecMode, params);
  box.innerHTML = ecSearchResultsHtml(ecMode, r);
  bindEcResultCards();
}

function bindEcResultCards() {
  $$('.ec-view-case').forEach(btn => btn.addEventListener('click', async () => {
    const target = $(`#${btn.dataset.target}`);
    if (!target) return;
    if (!target.hidden) { target.hidden = true; return; }
    target.hidden = false;
    target.innerHTML = `<div class="ec-lookup-result pending"><span class="typing-dots"><i></i><i></i><i></i></span>Loading…</div>`;
    const r = await fetchLiveCaseStatus(btn.dataset.cnr);
    target.innerHTML = ecLookupResultHtml(btn.dataset.cnr, r);
  }));
}

function bindEcSearchCard() {
  ensureCourtHierarchy().then(() => {
    // if the mode currently shown needs location selects, refresh them in case the background fetch found richer data
    if (EC_MODES.find(m => m.key === ecMode)?.location) { const wrap = $('#ecLocationWrap'); if (wrap) wrap.innerHTML = ecLocationHtml(); }
  });

  $('#ecModePills')?.addEventListener('click', e => {
    const btn = e.target.closest('.ec-mode-pill');
    if (!btn) return;
    ecMode = btn.dataset.mode;
    ecFieldState = { primary: '', extra: {}, status: '', state: '', district: '', courtComplex: '' };
    $('#ecModePills').innerHTML = ecModePillsHtml();
    $('#ecFieldsWrap').innerHTML = ecFieldsWrapHtml();
    $('#ecLookupResult').innerHTML = '';
  });

  $('#ecSearchForm')?.addEventListener('input', e => {
    if (e.target.id === 'ecPrimaryInput') ecFieldState.primary = e.target.value;
    else if (e.target.classList.contains('ec-extra-input')) ecFieldState.extra[e.target.dataset.field] = e.target.value;
  });
  $('#ecSearchForm')?.addEventListener('change', e => {
    if (e.target.id === 'ecStatusSelect') ecFieldState.status = e.target.value;
    else if (e.target.id === 'ecState') { ecFieldState.state = e.target.value; ecFieldState.district = ''; ecFieldState.courtComplex = ''; $('#ecLocationWrap').innerHTML = ecLocationHtml(); }
    else if (e.target.id === 'ecDistrict') { ecFieldState.district = e.target.value; ecFieldState.courtComplex = ''; $('#ecLocationWrap').innerHTML = ecLocationHtml(); }
    else if (e.target.id === 'ecCourtComplex') { ecFieldState.courtComplex = e.target.value; }
  });
  $('#ecSearchForm')?.addEventListener('submit', e => { e.preventDefault(); runEcSearch(); });
}

function ecLookupResultHtml(cnrInput, r) {
  if (r.status === 'offline') return `<div class="ec-lookup-result offline"><svg class="ic"><use href="#i-alert"/></svg><div><strong>eCourts service is offline</strong><small>Couldn’t reach the live lookup service — try again shortly.</small></div></div>`;
  if (r.status === 'error') return `<div class="ec-lookup-result offline"><svg class="ic"><use href="#i-alert"/></svg><div><strong>eCourts returned an error</strong><small>Something went wrong on the service side.</small></div></div>`;
  if (r.status === 'not-found') return `<div class="ec-lookup-result notfound"><svg class="ic"><use href="#i-research"/></svg><div><strong>No case found for ${esc(cnrInput)}</strong><small>Double-check the CNR number and try again.</small></div></div>`;
  const c = r.data, s = c.status || {};
  const linked = matterIdForCnr(c.cnr);
  return `<div class="ec-lookup-result found">
    <div class="ec-lookup-top"><span class="chip ${s.disposed ? 'chip-red' : 'chip-teal'}">${esc(s.disposed ? 'Disposed' : (s.stage || 'Listed'))}</span><span class="mono ec-lookup-cnr">${esc(c.cnr)}</span></div>
    <strong class="ec-lookup-type">${esc(c.caseType || 'Case')}</strong>
    <p class="ec-lookup-parties">${esc((c.parties?.petitioners || []).map(p => p.name).join(', ') || '—')} <span>v.</span> ${esc((c.parties?.respondents || []).map(p => p.name).join(', ') || '—')}</p>
    <div class="ec-lookup-facts">
      <div><span>Filed</span><b>${c.filingDateIso ? esc(fmtDate(c.filingDateIso, true)) : '—'}</b></div>
      <div><span>${s.disposed ? 'Decided' : 'Next date'}</span><b>${(s.decisionDateIso || s.nextHearingDateIso) ? esc(fmtDate(s.decisionDateIso || s.nextHearingDateIso, true)) : '—'}</b></div>
      <div><span>Court &amp; judge</span><b>${esc(s.courtAndJudge || '—')}</b></div>
    </div>
    ${linked ? `<a class="btn-text" href="#/matters/${linked}/status">Already tracked — open matter<svg class="ic"><use href="#i-arrow"/></svg></a>` : `<p class="hint" style="margin-top:8px">Not linked to any matter you’re tracking yet.</p>`}
  </div>`;
}

function ecMatterRowHtml(m) {
  const e = ECOURTS[m.id];
  return `<tr class="clickable" data-href="#/matters/${m.id}/status">
    <td><strong style="display:block;font-size:13px;font-weight:600">${esc(m.title)}</strong><small class="muted" style="font-size:11px">${esc(m.court)}</small></td>
    <td class="mono" style="font-size:11.5px">${e ? esc(e.cnr) : '—'}</td>
    <td class="muted" style="font-size:12px">${e ? esc(e.stage) : 'Not synced'}</td>
    <td class="muted" style="font-size:12px">${e ? esc(fmtDate(e.nextDate, true)) : '—'}</td>
    <td>${e ? `<span class="chip ${ecStatusChip(e.status)}">${esc(e.status)}</span>` : '<span class="chip chip-navy">Not synced</span>'}</td>
  </tr>`;
}

function pageECourts() {
  const today = hearingsOn(TODAY_ISO);
  const synced = MATTERS.filter(m => ECOURTS[m.id]);
  return `
  <div class="page-head"><div class="page-head-text"><p class="eyebrow">Court &amp; clients</p><h1>eCourts</h1><p class="lede">Case status, cause lists and order sheets pulled from the National Judicial Data Grid — no more manual checking on the portal.</p></div><button class="btn btn-primary" data-action="sync-ecourts"><svg class="ic"><use href="#i-sync"/></svg>Sync all</button></div>

  ${ecSearchCardHtml()}

  <div class="grid-3 section">
    <div class="stat-card"><div class="stat-top"><span>Linked to eCourts</span><svg class="ic"><use href="#i-court"/></svg></div><div class="stat-num">${synced.length}</div><div class="stat-note">of ${MATTERS.length} matters</div></div>
    <div class="stat-card"><div class="stat-top"><span>Listed today</span><svg class="ic"><use href="#i-calendar"/></svg></div><div class="stat-num">${today.length}</div><div class="stat-note">on today’s cause list</div></div>
    <div class="stat-card"><div class="stat-top"><span>Next 7 days</span><svg class="ic"><use href="#i-clock"/></svg></div><div class="stat-num">${countUpcomingListings(7)}</div><div class="stat-note">upcoming listings</div></div>
  </div>

  <div class="card card-pad section">
    <div class="card-head"><div><p class="eyebrow">Today’s cause list</p><h2>${esc(fmtDate(TODAY_ISO))}</h2></div></div>
    ${today.length ? today.map(h => { const m = matterById(h.matterId); const e = ECOURTS[m.id];
      return `<a class="cause-row" href="#/matters/${m.id}/status" style="text-decoration:none;color:inherit"><div class="hearing-time mono">${h.time}</div><div class="cause-copy"><strong>${esc(m.title)}</strong><small>${esc(h.court)} · ${esc(h.purpose)}</small>${e ? `<small class="mono cause-cnr">${esc(e.cnr)}</small>` : ''}</div><span class="chip ${e ? ecStatusChip(e.status) : 'chip-teal'}">${e ? esc(e.status) : 'Listed'}</span></a>`;
    }).join('') : '<p class="empty-note">Nothing on the cause list today.</p>'}
  </div>

  <div class="card" style="padding:0;overflow:hidden">
    <div class="card-head" style="padding:16px 20px 12px"><div><p class="eyebrow">All matters</p><h2>Case status</h2></div></div>
    <div class="toolbar" style="padding:0 20px 14px"><div class="search-box"><svg class="ic"><use href="#i-research"/></svg><input id="ecTableSearch" placeholder="Search by matter, CNR, court or stage" /></div><span class="toolbar-count" id="ecTableCount">${MATTERS.length} matters</span></div>
    <table class="table" style="margin-top:0">
      <thead><tr><th>Matter</th><th>CNR</th><th>Stage</th><th>Next date</th><th>Status</th></tr></thead>
      <tbody id="ecTableBody">${MATTERS.map(ecMatterRowHtml).join('')}</tbody>
    </table>
  </div>`;
}

function bindECourts() {
  $$('tr.clickable[data-href]').forEach(tr => tr.addEventListener('click', () => navigate(tr.dataset.href)));

  $('#ecTableSearch')?.addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    const filtered = MATTERS.filter(m => {
      const en = ECOURTS[m.id];
      return (m.title + m.court + (en?.cnr || '') + (en?.stage || '')).toLowerCase().includes(q);
    });
    $('#ecTableBody').innerHTML = filtered.length ? filtered.map(ecMatterRowHtml).join('') : `<tr><td colspan="5" class="empty-note">No matters match “${esc(e.target.value)}”.</td></tr>`;
    $('#ecTableCount').textContent = `${filtered.length} matter${filtered.length === 1 ? '' : 's'}`;
    $$('tr.clickable[data-href]').forEach(tr => tr.addEventListener('click', () => navigate(tr.dataset.href)));
  });

  bindEcSearchCard();
}

/* =============================================================================
   PAGE: CASE LAW — real judgments from the Supreme Court and every High Court

   Data comes from the case-law service (caselaw-db, port 8090): ~19M judgments
   and orders, searchable by party, citation, case number, court, year, case type
   and outcome. It holds catalogue METADATA only — the PDF itself is opened from
   the public archive, never copied. If the service is down the page falls back
   to the built-in sample judgments instead of breaking.
   ============================================================================= */
const CASELAW_API = { url: 'http://localhost:8090' };
const CL_DEFAULTS = { q: '', court: '', yearFrom: '', yearTo: '', caseType: '', outcome: '', sort: '', page: 1 };
const CL_EXAMPLES = ['Kesavananda Bharati', 'Maneka Gandhi', '2021 INSC 306', '[2021] 6 S.C.R. 527'];
const CL_PDF_HOST = /^https:\/\/indian-(supreme|high)-court-judgments\.s3\.ap-south-1\.amazonaws\.com\//;

let clState = { ...CL_DEFAULTS };
let clFacets = null;            // filter options, cached after the first load
let clReq = 0;                  // race guard: only the latest search may paint
let clAbort = null;
let clCards = [];               // cards currently on screen (for "Save to a matter")

const clNum = n => Number(n).toLocaleString('en-IN');
const clSafePdf = u => (u && CL_PDF_HOST.test(u) ? u : null);   // only ever link to the public archive

/* the archive stores party names in capitals — show them as normal names */
function clTidy(s) {
  if (!s) return '';
  const letters = s.replace(/[^A-Za-z]/g, '');
  if (!letters || letters !== letters.toUpperCase()) return s;
  return s.toLowerCase()
    .replace(/(^|[^a-z0-9'’])([a-z])/g, (m, a, b) => a + b.toUpperCase())
    .replace(/ (Of|And|The|In|For|To|By|On|Vs|Versus|Or|At) /g, m => m.toLowerCase())
    .replace(/\b([SWDR])\/O\b/g, m => m.toLowerCase());                 // s/o, w/o, d/o, r/o
}
function clCardTitle(c) {
  if (c.petitioner && c.respondent) return `${clTidy(c.petitioner)} v. ${clTidy(c.respondent)}`;
  return clTidy(c.title || 'Untitled case');
}
function clOutcomeChip(o) {
  if (!o) return '';
  const t = o.toLowerCase();
  const cls = /allow|grant|acquit/.test(t) ? 'chip-teal' : /dismiss|reject|refus|convict/.test(t) ? 'chip-red' : 'chip-navy';
  return `<span class="chip ${cls}">${esc(clTidy(o))}</span>`;
}
function clStateFromQuery(query) {
  const st = { ...CL_DEFAULTS };
  for (const k of Object.keys(CL_DEFAULTS)) {
    const v = query.get(k);
    if (!v) continue;
    st[k] = k === 'page' ? Math.min(200, Math.max(1, parseInt(v, 10) || 1)) : v.slice(0, 200);
  }
  return st;
}
function clHash(st) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(st)) if (v !== '' && v != null && !(k === 'page' && v === 1)) p.set(k, v);
  const s = p.toString();
  return `#/caselaw${s ? `?${s}` : ''}`;
}
const clHasFilters = st => !!(st.court || st.yearFrom || st.yearTo || st.caseType || st.outcome);

/* ── filters ─────────────────────────────────────────────────────────────── */
function clFiltersHtml() {
  const st = clState, f = clFacets;
  const opt = (v, label, cur) => `<option value="${esc(v)}"${String(v) === String(cur) ? ' selected' : ''}>${esc(label)}</option>`;
  const select = (id, label, cur, first, options) =>
    `<label class="cl-field"><span>${label}</span><select id="${id}"${f ? '' : ' disabled'}>${opt('', first, cur)}${options.map(([v, l]) => opt(v, l, cur)).join('')}</select></label>`;
  const courts = f ? [...f.courts].sort((a, b) => (a.kind === 'supreme' ? -1 : b.kind === 'supreme' ? 1 : a.name.localeCompare(b.name))) : [];
  const years = f ? Array.from({ length: f.years.max - f.years.min + 1 }, (_, i) => f.years.max - i) : [];
  const withCurrent = (list, cur) => (cur && !list.includes(cur) ? [cur, ...list] : list);
  const types = f ? withCurrent(f.caseTypes.map(t => t.value), st.caseType) : [];
  const outs = f ? withCurrent(f.outcomes.map(o => o.value), st.outcome) : [];
  const sortOpts = [['', st.q ? 'Best match' : 'Newest first'], ...(st.q ? [['newest', 'Newest first']] : []), ['oldest', 'Oldest first']];
  const sortCur = st.sort === 'newest' && !st.q ? '' : st.sort;
  return `
    ${select('clCourt', 'Court', st.court, 'All courts', courts.map(c => [c.code, c.name]))}
    ${select('clYearFrom', 'From year', st.yearFrom, 'Any', years.map(y => [String(y), String(y)]))}
    ${select('clYearTo', 'To year', st.yearTo, 'Any', years.map(y => [String(y), String(y)]))}
    ${select('clCaseType', 'Case type', st.caseType, 'Any type', types.map(t => [t, t]))}
    ${select('clOutcome', 'Outcome', st.outcome, 'Any outcome', outs.map(o => [o, clTidy(o)]))}
    <label class="cl-field"><span>Sort by</span><select id="clSort">${sortOpts.map(([v, l]) => opt(v, l, sortCur)).join('')}</select></label>
    ${clHasFilters(st) ? '<button type="button" class="btn-text cl-clear" data-cl-clear>Clear filters</button>' : ''}`;
}

async function clLoadFacets() {
  if (clFacets) return clFacets;
  for (let attempt = 0; attempt < 2 && !clFacets; attempt++) {
    try {
      const res = await fetch(`${CASELAW_API.url}/api/caselaw/facets`);
      if (res.status === 200) { clFacets = await res.json(); break; }
      if (res.status !== 202) break;                       // 202 = still being computed; retry once
    } catch { break; }
    await new Promise(r => setTimeout(r, 3000));
  }
  return clFacets;
}
function clCorpusLine() {
  const f = clFacets;
  if (!f) return '';
  return `${clNum(f.total)} judgments &amp; orders · Supreme Court + ${f.courts.filter(c => c.kind !== 'supreme').length} High Courts · ${f.years.min}–${f.years.max}`;
}

/* ── page shell ──────────────────────────────────────────────────────────── */
function pageCaseLaw(query) {
  clState = clStateFromQuery(query);
  return `
  <div class="page-head"><div class="page-head-text"><p class="eyebrow">Research</p><h1>Case law</h1><p class="lede">Search judgments and orders of the Supreme Court and every High Court. Open the original PDF, or save a judgment into a matter’s authorities.</p><p class="cl-corpus" id="clCorpus">${clCorpusLine()}</p></div></div>
  <form class="cl-form" id="clForm" role="search">
    <div class="search-box cl-search"><svg class="ic"><use href="#i-research"/></svg><input id="clInput" type="search" maxlength="200" autocomplete="off" aria-label="Search case law" placeholder="Party name, citation or case number — e.g. Kesavananda Bharati" value="${esc(clState.q)}" /></div>
    <button class="btn btn-primary" type="submit">Search</button>
  </form>
  <p class="cl-scope">Searches case titles, party names, citations and case numbers. Judgment text isn’t searchable yet.</p>
  <div class="cl-filters" id="clFilters">${clFiltersHtml()}</div>
  <p class="cl-status" id="clStatus" role="status" aria-live="polite"></p>
  <div id="clBody">
    <div class="caselaw-list" id="clResults"></div>
    <nav class="cl-pager" id="clPager" aria-label="Result pages"></nav>
  </div>
  <p class="cl-attrib">Judgments and orders: Supreme Court of India and the High Courts, published on the AWS Open Data registry under CC-BY-4.0. Entries are catalogue records — verify every citation against the official record before relying on it. PDFs open from the public archive; LegalAI does not store them.</p>`;
}

/* ── result cards ────────────────────────────────────────────────────────── */
function clMatterSelect(i) {
  return `<select class="ask-scope-select caselaw-save" data-i="${i}" aria-label="Save to a matter">
    <option value="">Save to a matter…</option>
    ${MATTERS.map(m => `<option value="${m.id}">${esc(m.title)}</option>`).join('')}
  </select>`;
}
function clCardHtml(c, i) {
  const pdf = clSafePdf(c.pdfUrl);
  const ids = [c.neutralCitation, c.citation, c.caseNumber].filter((v, k, a) => v && a.indexOf(v) === k);
  const meta = [c.courtName, c.caseType, c.decisionDate ? fmtDate(c.decisionDate, true) : null, c.judges].filter(Boolean);
  return `
  <article class="caselaw-card cl-card">
    <div class="caselaw-top">
      <div class="caselaw-title"><strong>${esc(clCardTitle(c))}</strong>${ids.length ? `<small class="mono">${ids.map(esc).join(' · ')}</small>` : ''}</div>
      <span class="chip chip-navy">${esc(String(c.year || '—'))}</span>
    </div>
    <p class="caselaw-meta">${meta.map(esc).join(' · ')}</p>
    ${c.snippet ? `<p class="caselaw-snippet">${esc(c.snippet)}</p>` : ''}
    <div class="cl-tags">${clOutcomeChip(c.outcome)}${c.orders.length > 1 ? `<span class="chip chip-navy">${c.orders.length} orders</span>` : ''}<span class="cl-badge" title="Only the case record is indexed — the judgment text isn’t searchable yet.">Metadata only</span></div>
    <div class="caselaw-actions">
      ${pdf ? `<a class="btn btn-teal btn-sm" href="${esc(pdf)}" target="_blank" rel="noopener noreferrer"><svg class="ic"><use href="#i-external"/></svg>Open PDF</a>` : '<span class="cl-nopdf">PDF link unavailable</span>'}
      ${c.source === 'aws-hc' && c.cnr ? `<button type="button" class="btn btn-ghost btn-sm" data-cl-orders="${i}" aria-expanded="false">All orders in this case</button>` : ''}
      ${clMatterSelect(i)}
    </div>
    <div class="cl-orders" id="clOrders${i}" hidden></div>
  </article>`;
}
function clOrdersHtml(orders) {
  if (!orders.length) return '<p class="cl-orders-empty">No other orders found for this case.</p>';
  return `<ul class="cl-orders-list">${orders.map(o => {
    const pdf = clSafePdf(o.pdfUrl);
    return `<li><span class="cl-o-date">${o.date ? esc(fmtDate(o.date, true)) : 'Undated'}</span><span class="cl-o-no">${o.orderNumber ? `Order ${esc(o.orderNumber)}` : ''}</span>${o.outcome ? `<span class="cl-o-out">${esc(clTidy(o.outcome))}</span>` : '<span></span>'}${pdf ? `<a href="${esc(pdf)}" target="_blank" rel="noopener noreferrer">PDF</a>` : '<span class="cl-nopdf">no PDF</span>'}</li>`;
  }).join('')}</ul>`;
}

/* offline fallback: the built-in landmark judgments (clearly labelled as samples) */
function clSampleHtml(q) {
  const needle = q.toLowerCase();
  const rows = CASELAW.filter(j => !needle || (j.title + j.area + j.snippet + j.cite + j.court + j.bench).toLowerCase().includes(needle));
  return `
    <div class="ec-lookup-result offline cl-offline"><svg class="ic"><use href="#i-alert"/></svg><div><strong>The case-law service is offline</strong><small>Showing ${rows.length} built-in sample judgment${rows.length === 1 ? '' : 's'} instead — these are examples, not live search results.</small></div><button type="button" class="btn btn-ghost btn-sm" data-cl-retry>Retry</button></div>
    ${rows.map(j => `
      <article class="caselaw-card">
        <div class="caselaw-top"><div class="caselaw-title"><strong>${esc(j.title)}</strong><small class="mono">${esc(j.cite)}</small></div><span class="chip chip-navy">${esc(String(j.year))}</span></div>
        <p class="caselaw-meta">${esc(j.court)} · ${esc(j.bench)} · ${esc(j.area)}</p>
        <p class="caselaw-snippet">${esc(j.snippet)}</p>
        <div class="cl-tags"><span class="cl-badge">Sample data</span></div>
        <div class="caselaw-actions"><button type="button" class="btn btn-ghost btn-sm" data-cl-sample-open>Open judgment</button></div>
      </article>`).join('') || '<div class="card card-pad"><p class="empty-note">No sample judgments match that search.</p></div>'}`;
}

function clEmptyHtml(st) {
  return `<div class="card card-pad cl-empty">
    <strong>No judgments found${st.q ? ` for “${esc(st.q)}”` : ''}.</strong>
    <p>Try fewer words, check the spelling, or search by a citation such as <em>2021 INSC 306</em> or a CNR number. Judgment text isn’t searchable yet — the search covers case titles, parties, citations and case numbers.</p>
    ${clHasFilters(st) ? '<button type="button" class="btn btn-ghost btn-sm" data-cl-clear>Clear filters</button>' : ''}
    <div class="cl-examples">${CL_EXAMPLES.map(x => `<button type="button" class="chip chip-teal" data-cl-example="${esc(x)}">${esc(x)}</button>`).join('')}</div>
  </div>`;
}

function clStatusText(d, st) {
  const bits = [];
  if (d.fuzzy) bits.push(`No exact match for “${esc(st.q)}” — showing similar names`);
  else if (d.total == null) bits.push('Many matches');
  else if (d.total === 0) bits.push('No results');
  else if (!st.q && !clHasFilters(st) && clFacets) bits.push(`Newest of ${clNum(clFacets.total)} judgments &amp; orders`);
  else bits.push(`${clNum(d.total)}${d.totalCapped ? '+' : ''} result${d.total === 1 ? '' : 's'}${st.q ? ` for “${esc(st.q)}”` : ''}`);
  if (d.sortFallback) bits.push('too broad to rank, so shown newest first');
  else if (d.rankedAmong) bits.push(`best match ranks the newest ${clNum(d.rankedAmong)} — sort by date or add a filter to see the rest`);
  return bits.join(' · ') + (d.tookMs != null ? ` <span class="cl-took">${d.tookMs} ms</span>` : '');
}
function clPagerHtml(d) {
  const prev = d.page > 1, next = d.hasMore && d.page < 200;
  if (!prev && !next) return '';
  return `<button type="button" class="btn btn-ghost btn-sm" data-cl-page="${d.page - 1}"${prev ? '' : ' disabled'}>← Previous</button>
    <span>Page ${d.page}</span>
    <button type="button" class="btn btn-ghost btn-sm" data-cl-page="${d.page + 1}"${next ? '' : ' disabled'}>Next →</button>`;
}

/* ── search ──────────────────────────────────────────────────────────────── */
async function clFetchSearch(st, signal) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(st)) if (v !== '' && v != null) qs.set(k, v);
  try {
    const res = await fetch(`${CASELAW_API.url}/api/caselaw/search?${qs}`, { signal });
    let body = null;
    try { body = await res.json(); } catch { /* non-JSON error body */ }
    if (!res.ok) return { status: 'error', message: body?.message || 'The search failed — please try again.' };
    return { status: 'ok', data: body };
  } catch (e) {
    return e.name === 'AbortError' ? { status: 'aborted' } : { status: 'offline' };
  }
}

async function clRun() {
  const box = $('#clResults'), status = $('#clStatus'), pager = $('#clPager'), filters = $('#clFilters');
  if (!box) return;
  const my = ++clReq;
  clAbort?.abort();
  clAbort = new AbortController();
  const st = { ...clState };
  status.innerHTML = 'Searching…';
  if (box.children.length && !box.querySelector('.cl-skel')) box.classList.add('is-loading');
  else box.innerHTML = '<div class="caselaw-card cl-skel"><i></i><i></i><i></i></div><div class="caselaw-card cl-skel"><i></i><i></i><i></i></div>';

  const r = await clFetchSearch(st, clAbort.signal);
  if (my !== clReq || !$('#clResults')) return;               // a newer search (or another page) took over
  box.classList.remove('is-loading');

  if (r.status === 'offline') {
    clCards = [];
    filters.hidden = true; pager.innerHTML = '';
    status.textContent = '';
    box.innerHTML = clSampleHtml(st.q);
    return;
  }
  filters.hidden = false;
  if (r.status === 'error') {
    clCards = []; pager.innerHTML = '';
    status.textContent = '';
    box.innerHTML = `<div class="ec-lookup-result offline"><svg class="ic"><use href="#i-alert"/></svg><div><strong>Search failed</strong><small>${esc(r.message)}</small></div></div>`;
    return;
  }
  const d = r.data;
  clCards = d.results;
  status.innerHTML = clStatusText(d, st);
  box.innerHTML = d.results.length ? d.results.map(clCardHtml).join('') : clEmptyHtml(st);
  pager.innerHTML = clPagerHtml(d);
}

/* change state, keep the URL in sync (so Back / refresh / sharing work), re-run */
function clSet(patch) {
  clState = { ...clState, page: 1, ...patch };
  if (clState.sort === 'newest' && !clState.q) clState.sort = '';
  const hash = clHash(clState);
  history[hash === location.hash ? 'replaceState' : 'pushState'](null, '', hash);
  const f = $('#clFilters'); if (f) f.innerHTML = clFiltersHtml();
  clRun();
}

function bindCaseLaw() {
  $('#clForm')?.addEventListener('submit', e => {
    e.preventDefault();
    clSet({ q: $('#clInput').value.trim() });
  });

  $('#clFilters')?.addEventListener('change', e => {
    const map = { clCourt: 'court', clYearFrom: 'yearFrom', clYearTo: 'yearTo', clCaseType: 'caseType', clOutcome: 'outcome', clSort: 'sort' };
    const key = map[e.target.id];
    if (!key) return;
    const patch = { [key]: e.target.value };
    // keep the year range sensible: swapping is friendlier than an empty result
    const from = +(key === 'yearFrom' ? e.target.value : clState.yearFrom), to = +(key === 'yearTo' ? e.target.value : clState.yearTo);
    if (from && to && from > to) { patch.yearFrom = String(to); patch.yearTo = String(from); }
    clSet(patch);
  });

  $('#clFilters')?.addEventListener('click', e => { if (e.target.closest('[data-cl-clear]')) clSet({ court: '', yearFrom: '', yearTo: '', caseType: '', outcome: '' }); });

  const body = $('#clBody');
  body?.addEventListener('click', async e => {
    const t = e.target;
    const page = t.closest('[data-cl-page]');
    if (page && !page.disabled) { clSet({ page: +page.dataset.clPage }); $('#clForm')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    const ex = t.closest('[data-cl-example]');
    if (ex) { $('#clInput').value = ex.dataset.clExample; clSet({ q: ex.dataset.clExample }); return; }
    if (t.closest('[data-cl-clear]')) { clSet({ court: '', yearFrom: '', yearTo: '', caseType: '', outcome: '' }); return; }
    if (t.closest('[data-cl-retry]')) { clRun(); return; }
    if (t.closest('[data-cl-sample-open]')) { showToast('Sample judgment — the case-law service is offline, so it can’t be opened.'); return; }
    const ob = t.closest('[data-cl-orders]');
    if (ob) await clToggleOrders(ob);
  });
  body?.addEventListener('change', e => {
    const sel = e.target.closest('.caselaw-save');
    if (!sel) return;
    const m = matterById(sel.value), c = clCards[+sel.dataset.i];
    if (!m || !c) return;
    if (wbPinAuthority(m.id, wbAuthorityFromCard(c))) showToast(`${clCardTitle(c)} saved to ${m.title} authorities.`);
    sel.value = '';
  });

  // filter options load once (then come from cache); the search itself does not wait for them
  clLoadFacets().then(f => {
    if (!f || !$('#clFilters')) return;
    $('#clFilters').innerHTML = clFiltersHtml();
    const corpus = $('#clCorpus'); if (corpus) corpus.innerHTML = clCorpusLine();
  });
  clRun();
}

async function clToggleOrders(btn) {
  const i = +btn.dataset.clOrders, c = clCards[i], panel = $(`#clOrders${i}`);
  if (!c || !panel) return;
  if (!panel.hidden) { panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); return; }
  panel.hidden = false; btn.setAttribute('aria-expanded', 'true');
  if (panel.dataset.loaded) return;
  panel.innerHTML = '<p class="cl-orders-empty">Loading orders…</p>';
  try {
    const res = await fetch(`${CASELAW_API.url}/api/caselaw/case?court=${encodeURIComponent(c.courtCode)}&cnr=${encodeURIComponent(c.cnr)}`);
    if (!res.ok) throw new Error('bad status');
    panel.innerHTML = clOrdersHtml((await res.json()).orders);
    panel.dataset.loaded = '1';
  } catch { panel.innerHTML = '<p class="cl-orders-empty">Couldn’t load the orders — try again.</p>'; }
}

/* The Reminders page lives in reminders-ui.js (logic in reminders.js). */

/* =============================================================================
   PAGE: AUDIT TRAIL
   ============================================================================= */
function pageAudit() {
  return `
  <div class="page-head"><div class="page-head-text"><p class="eyebrow">Trust &amp; sources</p><h1>Audit trail</h1><p class="lede">Every agent action and every lawyer decision, in one accountable log. Entries with a reasoning trace can be expanded.</p></div></div>
  <div class="card card-pad">${AUDIT_LOG.map((a, i) => `
    <div class="audit-block${a.trace ? ' has-trace' : ''}">
      <button type="button" class="audit-row${a.trace ? ' clickable' : ''}" ${a.trace ? `data-action="toggle-audit" data-idx="${i}"` : 'disabled'}>
        <div class="audit-time">${esc(a.time)}</div>
        <div class="audit-copy"><strong>${esc(a.agent)}</strong><small>${esc(a.action)}</small></div>
        <span class="chip ${a.status === 'warn' ? 'chip-amber' : 'chip-teal'}">${esc(a.matter)}</span>
        ${a.trace ? '<svg class="ic audit-chevron" id="auditChevron' + i + '"><use href="#i-chevron-down"/></svg>' : '<span></span>'}
      </button>
      ${a.trace ? `<div class="audit-trace" id="auditTrace${i}" hidden>${a.trace.map((t, ti) => `<div class="trace-step done"><span><svg class="ic"><use href="#i-check"/></svg></span><div class="trace-copy"><strong>Step ${ti + 1}</strong><small>${esc(t)}</small></div></div>`).join('')}</div>` : ''}
    </div>`).join('')}</div>`;
}

/* =============================================================================
   PAGE: SETTINGS
   ============================================================================= */
function pageSettings() {
  return `
  <div class="page-head"><div class="page-head-text"><p class="eyebrow">Workspace</p><h1>Settings</h1><p class="lede">Your profile and how LegalAI behaves in this workspace.</p></div></div>
  <div class="grid-2">
    <div class="card card-pad"><h2>Profile</h2>
      <div class="settings-row"><div class="settings-copy"><strong>Name</strong><small>Shreyas A. · Senior associate</small></div><button class="btn btn-ghost btn-sm">Edit</button></div>
      <div class="settings-row"><div class="settings-copy"><strong>Firm</strong><small>Kamat &amp; Partners</small></div><button class="btn btn-ghost btn-sm">Edit</button></div>
      <div class="settings-row"><div class="settings-copy"><strong>Email notifications</strong><small>Hearing reminders and review-queue digests.</small></div><button class="switch on" data-action="toggle-switch"></button></div>
    </div>
    <div class="card card-pad"><h2>AI behaviour</h2>
      <div class="settings-row"><div class="settings-copy"><strong>Mandatory citation verification</strong><small>Every citation must resolve to a real source before it is shown. This cannot be turned off.</small></div><button class="switch on locked"></button></div>
      <div class="settings-row"><div class="settings-copy"><strong>Require my approval before export</strong><small>No draft can be exported or filed without your explicit approval.</small></div><button class="switch on locked"></button></div>
      <div class="settings-row"><div class="settings-copy"><strong>Suggest research proactively</strong><small>Let agents surface relevant precedent while you work.</small></div><button class="switch on" data-action="toggle-switch"></button></div>
    </div>
  </div>`;
}

/* ---------------------------------------------------------------------------
   Page-level binder dispatch
   ------------------------------------------------------------------------- */
function bindPage(key, parts, query) {
  $$('[data-action="open-new-matter"]').forEach(b => b.addEventListener('click', () => { resetIntake(); refreshIntake(); openModal('#matterModal'); }));
  $$('[data-action="toggle-switch"]').forEach(b => b.addEventListener('click', () => { b.classList.toggle('on'); showToast(b.classList.contains('on') ? 'Setting enabled.' : 'Setting disabled.'); }));
  $$('[data-action="toggle-audit"]').forEach(b => b.addEventListener('click', () => {
    const trace = $(`#auditTrace${b.dataset.idx}`), chevron = $(`#auditChevron${b.dataset.idx}`);
    if (!trace) return;
    trace.hidden = !trace.hidden;
    chevron?.classList.toggle('open', !trace.hidden);
  }));
  $$('.kg-node.has-link').forEach(g => g.addEventListener('click', () => { if (g.dataset.href) navigate(g.dataset.href); }));
  $$('[data-action="sync-ecourts"]').forEach(b => b.addEventListener('click', () => syncAllFromService()));
  $$('[data-action="sync-case"]').forEach(b => b.addEventListener('click', () => syncCaseStatusFromService(b.dataset.matter)));
  $$('[data-action="upload-doc"]').forEach(b => b.addEventListener('click', () => wbOpenEvidenceForm(null)));

  if (key === 'today') bindToday();
  else if (key === 'ask') bindAsk(parts[1]);
  else if (key === 'case-chat') bindCaseChat(parts[1]);
  else if (key === 'caselaw') bindCaseLaw();
  else if (key === 'reminders') bindReminders();
  else if (key === 'deadlines') bindDeadlines();
  else if (key === 'ecourts') bindECourts();
  else if (key === 'matters' && parts[1] && parts[2] === 'chat') bindMatterChat(matterById(parts[1]), parts[3]);
  else if (key === 'matters' && parts[1]) bindMatterDetail();
  else if (key === 'matters') bindMattersList();
  else if (key === 'calendar') bindCalendar();
  else if (key === 'documents') bindDocuments();
}

/* ---------------------------------------------------------------------------
   Init
   ------------------------------------------------------------------------- */
window.addEventListener('hashchange', route);
document.addEventListener('DOMContentLoaded', route);
