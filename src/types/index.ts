export interface NextHearing {
  date: string;
  dateISO: string;
  time: string;
  purpose: string;
  court2: string;
}

export interface MatterFacts {
  objective: string;
  relief: string;
  issue: string;
}

export interface LegalAuthority {
  key: string;
  title: string;
  meta: string;
  url?: string;
  pinned?: boolean;
}

export interface ArgumentItem {
  point: string;
  support: string;
  strength: number;
  stressTest?: string;
}

export interface CounterArgumentItem {
  point: string;
  rebuttal: string;
}

export interface MatterTask {
  label: string;
  done: boolean;
}

export interface EvidenceDocument {
  id: string;
  title: string;
  type: string;
  date: string;
  dateISO: string;
  summary: string;
  pages?: number;
  annexure?: string;
  text?: string;
  status?: 'indexed' | 'pending' | 'flagged';
}

export interface ChronologyEvent {
  date: string;
  dateISO: string;
  event: string;
  sourceDoc: string;
  badge?: string;
}

export interface MatterNote {
  id: string;
  title: string;
  date: string;
  body: string;
}

export interface Matter {
  id: string;
  title: string;
  court: string;
  caseNo: string;
  area: string;
  stage: number;
  lead: string;
  leadInitials: string;
  updated: string;
  nextHearing: NextHearing;
  tags: string[];
  facts: MatterFacts;
  authorities: LegalAuthority[];
  arguments: ArgumentItem[];
  counterArgs: CounterArgumentItem[];
  tasks: MatterTask[];
  evidenceDocs?: EvidenceDocument[];
  chronology?: ChronologyEvent[];
  notes?: MatterNote[];
}

export interface LimitationRule {
  id: string;
  category: string;
  name: string;
  periodDays?: number;
  periodMonths?: number;
  periodYears?: number;
  triggerEvent: string;
  statuteRef: string;
  allowsCertifiedCopyExclusion?: boolean;
  notes?: string;
}

export interface CourtClosure {
  startDate: string;
  endDate: string;
  description: string;
}

export interface LimitationCalculationResult {
  ruleId: string;
  ruleName: string;
  statuteRef: string;
  triggerDate: string;
  targetDateRaw: string;
  finalDeadline: string;
  daysRemaining: number;
  isExpired: boolean;
  adjustments: string[];
  explanation: string;
}

export interface ExtractedDate {
  dateString: string;
  isoDate?: string;
  context: string;
  startIndex: number;
  endIndex: number;
  script?: 'latin' | 'devanagari';
}

export interface ExtractedAmount {
  raw: string;
  numericValue: number;
  context: string;
  script?: 'latin' | 'devanagari';
}

export interface InconsistencyFlag {
  field: string;
  docA: { id: string; title: string; value: string };
  docB: { id: string; title: string; value: string };
  severity: 'high' | 'medium' | 'low';
  note: string;
}

export interface DraftVersion {
  id: string;
  timestamp: string;
  author: string;
  summary: string;
  content: string;
  diffSummary?: {
    addedWords: number;
    removedWords: number;
  };
}

export interface DraftComment {
  id: string;
  sectionId?: string;
  author: string;
  timestamp: string;
  comment: string;
  resolved: boolean;
  replies?: Array<{
    author: string;
    timestamp: string;
    comment: string;
  }>;
}

export interface ParaReply {
  paraNumber: number;
  originalText: string;
  stance: 'admitted' | 'denied' | 'partly' | 'no_knowledge' | 'legal';
  substanceBlank: string;
  generatedReply: string;
}

export interface ECourtsCaseStatus {
  cnr: string;
  caseType: string;
  filingNumber: string;
  filingDate: string;
  registrationNumber: string;
  registrationDate: string;
  firstHearingDate?: string;
  nextHearingDate?: string;
  caseStage?: string;
  courtNumberAndJudge?: string;
  petitioner: string;
  petitionerAdvocate?: string;
  respondent: string;
  respondentAdvocate?: string;
  acts: Array<{ act: string; section: string }>;
  history: Array<{
    hearingDate: string;
    purpose: string;
    businessOnDate: string;
  }>;
  orders: Array<{
    orderNumber: string;
    orderDate: string;
    orderType: string;
    pdfUrl?: string;
  }>;
}
