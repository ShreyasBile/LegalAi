export interface RulePeriod {
  days?: number;
  months?: number;
  years?: number;
}

export interface RuleExtend {
  from: 'start' | 'end';
  period: RulePeriod;
  label: string;
}

export interface LimitationRuleDef {
  id: string;
  group: string;
  name: string;
  period: RulePeriod;
  trigger: string;
  source: string;
  copy: boolean;
  s5: boolean;
  extend: RuleExtend | null;
  note: string;
  custom: boolean;
  chain?: (start: string) => { raw: string; steps: string[] };
}

const DAY = 86400000;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function toDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? d : null;
}

export const toIso = (d: Date): string => d.toISOString().slice(0, 10);

export const addDays = (iso: string, n: number): string => {
  const dt = toDate(iso);
  if (!dt) return iso;
  return toIso(new Date(dt.getTime() + n * DAY));
};

export function addMonths(iso: string, n: number): string {
  const d = toDate(iso);
  if (!d) return iso;
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + n;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return toIso(new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), lastDay))));
}

export const diffDays = (a: string, b: string): number => {
  const da = toDate(a);
  const db = toDate(b);
  if (!da || !db) return 0;
  return Math.round((da.getTime() - db.getTime()) / DAY);
};

export const addPeriod = (iso: string, p: RulePeriod): string => {
  if (p.days) return addDays(iso, p.days);
  return addMonths(iso, (p.months || 0) + 12 * (p.years || 0));
};

export const weekday = (iso: string): string => {
  const dt = toDate(iso);
  return dt ? WEEKDAYS[dt.getUTCDay()] : '';
};

export const fmtLong = (iso: string): string => {
  const d = toDate(iso);
  if (!d) return iso;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

export function describe(p: RulePeriod): string {
  const bits: string[] = [];
  if (p.years) bits.push(`${p.years} year${p.years === 1 ? '' : 's'}`);
  if (p.months) bits.push(`${p.months} month${p.months === 1 ? '' : 's'}`);
  if (p.days) bits.push(`${p.days} day${p.days === 1 ? '' : 's'}`);
  return bits.join(' and ');
}

const R = (
  id: string,
  group: string,
  name: string,
  period: RulePeriod,
  trigger: string,
  source: string,
  o: Partial<LimitationRuleDef> = {}
): LimitationRuleDef => ({
  id,
  group,
  name,
  period,
  trigger,
  source,
  copy: false,
  s5: false,
  extend: null,
  note: '',
  custom: false,
  ...o,
});

export const RULES: LimitationRuleDef[] = [
  R('suit-113', 'Suits', 'Suit with no period given elsewhere', { years: 3 }, 'Date the right to sue accrues', 'Limitation Act, 1963, Art. 113'),
  R('suit-54', 'Suits', 'Specific performance of a contract', { years: 3 }, 'Date fixed for performance (or notice of refusal)', 'Limitation Act, 1963, Art. 54'),
  R('suit-55', 'Suits', 'Compensation for breach of contract', { years: 3 }, 'Date the contract was broken', 'Limitation Act, 1963, Art. 55'),
  R('suit-58', 'Suits', 'Declaration', { years: 3 }, 'Date the right to sue first accrues', 'Limitation Act, 1963, Art. 58'),
  R('suit-64', 'Suits', 'Possession, on the strength of earlier possession', { years: 12 }, 'Date of dispossession', 'Limitation Act, 1963, Art. 64'),
  R('suit-65', 'Suits', 'Possession, on the strength of title', { years: 12 }, 'Date adverse possession begins', 'Limitation Act, 1963, Art. 65'),
  R('exec-136', 'Suits', 'Execution of a decree or order', { years: 12 }, 'Date decree becomes enforceable', 'Limitation Act, 1963, Art. 136'),
  R('app-137', 'Suits', 'Any other application with no period given elsewhere', { years: 3 }, 'Date the right to apply accrues', 'Limitation Act, 1963, Art. 137'),

  R('ws-ordinary', 'Pleadings', 'Written statement — ordinary suit', { days: 30 }, 'Date summons was served', 'Order VIII Rule 1 CPC', {
    extend: { from: 'start', period: { days: 90 }, label: 'The court may allow up to 90 days from service for reasons in writing.' },
  }),
  R('ws-commercial', 'Pleadings', 'Written statement — commercial suit', { days: 30 }, 'Date summons was served', 'Commercial Courts Act, 2015 / Order VIII Rule 1 CPC', {
    extend: { from: 'start', period: { days: 120 }, label: 'Strict outer limit is 120 days from service.' },
  }),

  R('appeal-hc', 'Appeals and review', 'Civil appeal to the High Court', { days: 90 }, 'Date of the decree or order appealed from', 'Limitation Act, 1963, Art. 116(a)', { copy: true, s5: true }),
  R('appeal-other', 'Appeals and review', 'Civil appeal to District Court', { days: 30 }, 'Date of the decree or order appealed from', 'Limitation Act, 1963, Art. 116(b)', { copy: true, s5: true }),
  R('appeal-lpa', 'Appeals and review', 'Letters Patent / intra-court appeal', { days: 30 }, 'Date of High Court order', 'Limitation Act, 1963, Art. 117', { copy: true, s5: true }),
  R('review-124', 'Appeals and review', 'Review of a judgment (other than SC)', { days: 30 }, 'Date of decree or order', 'Limitation Act, 1963, Art. 124', { copy: true, s5: true }),
  R('slp', 'Appeals and review', 'Special Leave Petition (Supreme Court)', { days: 90 }, 'Date of judgment or order', 'Supreme Court Rules, 2013, Order XXI Rule 2', { copy: true, s5: true }),
  R('review-sc', 'Appeals and review', 'Review petition in Supreme Court', { days: 30 }, 'Date of judgment or order', 'Supreme Court Rules, 2013, Order XLVII Rule 2'),
  R('mact-173', 'Appeals and review', 'Appeal against MACT award', { days: 90 }, 'Date of the award', 'Motor Vehicles Act, 1988, s.173(1)', { copy: true }),
  R('arb-34', 'Appeals and review', 'Application to set aside arbitral award', { months: 3 }, 'Date of receiving award', 'Arbitration & Conciliation Act, 1996, s.34(3)', {
    extend: { from: 'end', period: { days: 30 }, label: 'Court may entertain within a further 30 days if sufficient cause is shown.' },
  }),

  R('consumer-69', 'Forums and statutes', 'Consumer complaint', { years: 2 }, 'Date cause of action arose', 'Consumer Protection Act, 2019, s.69(1)'),
  R('consumer-41', 'Forums and statutes', 'Appeal to State Commission', { days: 45 }, 'Date of District Commission order', 'Consumer Protection Act, 2019, s.41'),
  R('consumer-51', 'Forums and statutes', 'Appeal to National Commission', { days: 30 }, 'Date of State Commission order', 'Consumer Protection Act, 2019, s.51'),
  R('consumer-67', 'Forums and statutes', 'Appeal from NCDRC to Supreme Court', { days: 30 }, 'Date of National Commission order', 'Consumer Protection Act, 2019, s.67'),
  R('labour-2a', 'Forums and statutes', 'Individual dismissal dispute (Labour Court)', { years: 3 }, 'Date of dismissal/discharge', 'Industrial Disputes Act, 1947, s.2A(3)'),
  R('gst-107', 'Forums and statutes', 'GST appeal to First Appellate Authority', { months: 3 }, 'Date order was communicated', 'CGST Act, 2017, s.107(1)', {
    extend: { from: 'end', period: { months: 1 }, label: 'Further one month may be allowed if sufficient cause is shown.' },
  }),

  R('ni-present', 'Cheque dishonour (NI Act)', 'Presenting cheque to bank', { months: 3 }, 'Date on the cheque', 'NI Act, 1881, s.138 proviso (a)'),
  R('ni-notice', 'Cheque dishonour (NI Act)', 'Demand notice to drawer', { days: 30 }, 'Date of unpaid memo info', 'NI Act, 1881, s.138 proviso (b)'),
  R('ni-complaint', 'Cheque dishonour (NI Act)', 'Complaint to Magistrate', { months: 1 }, 'Date drawer received demand notice', 'NI Act, 1881, s.138 proviso (c)', {
    chain: (start: string) => {
      const payEnd = addDays(start, 15);
      const cause = addDays(payEnd, 1);
      return {
        raw: addMonths(cause, 1),
        steps: [
          `Drawer has 15 days to pay, ending on ${fmtLong(payEnd)}.`,
          `Cause of action arises on the next day, ${fmtLong(cause)}.`,
          `One month from then ends on ${fmtLong(addMonths(cause, 1))}.`,
        ],
      };
    },
  }),
];

export const GROUPS = [...new Set(RULES.map((r) => r.group))];

export interface WeeklyClosureConfig {
  saturday?: 'none' | 'all' | 'alt';
}

export interface CourtClosureRange {
  from: string;
  to: string;
  label?: string;
}

export function closedReason(
  iso: string,
  weekly: WeeklyClosureConfig = {},
  closures: CourtClosureRange[] = []
): string | null {
  const d = toDate(iso);
  if (!d) return null;
  const dow = d.getUTCDay();
  if (dow === 0) return 'a Sunday';
  if (
    dow === 6 &&
    (weekly.saturday === 'all' ||
      (weekly.saturday === 'alt' && [2, 4].includes(Math.ceil(d.getUTCDate() / 7))))
  ) {
    return 'a Saturday the court is closed';
  }
  const c = (closures || []).find(
    (x) => toDate(x.from) && toDate(x.to) && x.from <= iso && iso <= x.to
  );
  return c ? (c.label ? `closed (${c.label})` : 'a day the court is closed') : null;
}

export function nextOpen(
  iso: string,
  weekly: WeeklyClosureConfig = {},
  closures: CourtClosureRange[] = []
): { date: string; reasons: string[] } {
  let day = iso;
  const reasons: string[] = [];
  for (let i = 0; i < 400; i++) {
    const why = closedReason(day, weekly, closures);
    if (!why) return { date: day, reasons };
    reasons.push(`${fmtLong(day)} is ${why}`);
    day = addDays(day, 1);
  }
  return { date: day, reasons };
}

export interface ComputeParams {
  ruleId: string;
  start: string;
  excludeDays?: number;
  weekly?: WeeklyClosureConfig;
  closures?: CourtClosureRange[];
  today?: string;
  rules?: LimitationRuleDef[];
}

export interface CalculationOutput {
  rule?: LimitationRuleDef;
  start?: string;
  lastDate?: string;
  rawDate?: string;
  rolled?: boolean;
  extend?: { date: string; label: string } | null;
  daysLeft?: number | null;
  steps?: string[];
  warnings?: string[];
  error?: string;
}

export function computeLimitation({
  ruleId,
  start,
  excludeDays = 0,
  weekly = {},
  closures = [],
  today = '',
  rules = RULES,
}: ComputeParams): CalculationOutput {
  const rule = rules.find((r) => r.id === ruleId);
  if (!rule) return { error: 'Choose a period first.' };
  if (!toDate(start)) return { error: 'Enter the date as a real day, month and year.' };

  const ex = Math.max(0, Math.min(3650, Math.floor(Number(excludeDays) || 0)));
  const steps: string[] = [
    `${rule.trigger}: ${fmtLong(start)} (${weekday(start)}). That day is left out of the count (Limitation Act, 1963, s.12(1)).`,
  ];
  const warnings: string[] = [];
  let from = start;

  if (ex && rule.copy) {
    from = addDays(start, ex);
    steps.push(
      `Time taken to get the certified copy, ${ex} day${ex === 1 ? '' : 's'}, is left out as well (s.12(2)). Counting from ${fmtLong(from)}.`
    );
  } else if (ex) {
    warnings.push(
      'Certified-copy time is left out only for appeals, reviews and similar steps, so it was not used for this period.'
    );
  }

  let raw: string;
  if (rule.chain) {
    const c = rule.chain(from);
    raw = c.raw;
    steps.push(...c.steps);
  } else {
    raw = addPeriod(from, rule.period);
    steps.push(
      `${describe(rule.period)} from there ends on ${fmtLong(raw)} (${weekday(raw)}).`
    );
  }

  const open = nextOpen(raw, weekly, closures);
  const rolled = open.date !== raw;
  if (rolled) {
    steps.push(
      `${open.reasons.join('; ')}. The period runs to the day the court reopens, ${fmtLong(open.date)} (s.4).`
    );
  }

  let extend: { date: string; label: string } | null = null;
  if (rule.extend) {
    const base = rule.extend.from === 'start' ? from : raw;
    extend = {
      date: addPeriod(base, rule.extend.period),
      label: rule.extend.label,
    };
    steps.push(
      `Further window at the court’s discretion: until ${fmtLong(extend.date)}. ${rule.extend.label}`
    );
  }

  const daysLeft = toDate(today) ? diffDays(open.date, today) : null;
  if (daysLeft !== null && daysLeft < 0) {
    warnings.push(
      rule.s5
        ? `This date passed ${-daysLeft} day${daysLeft === -1 ? '' : 's'} ago. A late appeal can be admitted for sufficient cause (s.5).`
        : `This date passed ${-daysLeft} day${daysLeft === -1 ? '' : 's'} ago. Check whether the statute allows a late filing.`
    );
  }
  if (rule.note) warnings.push(rule.note);

  return {
    rule,
    start,
    lastDate: open.date,
    rawDate: raw,
    rolled,
    extend,
    daysLeft,
    steps,
    warnings,
  };
}
