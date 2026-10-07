/* ============================================================================
   Limitation periods — the pure date logic behind the Deadlines page.
   No DOM and no storage here, so every rule is unit-tested (test/limitation.test.js).
   Loaded by the browser as a classic script (global `Limitation`) and by Node with require().

   This is an AID for computing a last date, not legal advice. The periods below are a
   starting set written from the statutes; a lawyer should check each one against the current
   text (statutes are amended and replaced) before relying on it. Users can add their own periods.

   How a date is worked out:
   - the day of the event is left out of the count (Limitation Act, 1963, s.12(1));
   - for appeals and reviews, the time taken to get a certified copy is also left out (s.12(2));
   - months and years are calendar months and years, and the last date clamps to the end of a
     short month (31 January + 1 month = 28 February);
   - if the last day falls when the court is closed, the period runs to the day it reopens (s.4).
   ============================================================================ */
const Limitation = (() => {
  const DAY = 86400000;
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  /* ── dates: ISO strings, worked in UTC so no time zone can move a day ───── */
  function toDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) return null;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? d : null;      // rejects 2026-02-30
  }
  const toIso = d => d.toISOString().slice(0, 10);
  const addDays = (iso, n) => toIso(new Date(toDate(iso).getTime() + n * DAY));
  function addMonths(iso, n) {
    const d = toDate(iso);
    const y = d.getUTCFullYear(), m = d.getUTCMonth() + n;
    const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return toIso(new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), lastDay))));
  }
  const diffDays = (a, b) => Math.round((toDate(a) - toDate(b)) / DAY);                  // a - b
  const addPeriod = (iso, p) => (p.days ? addDays(iso, p.days) : addMonths(iso, (p.months || 0) + 12 * (p.years || 0)));
  const weekday = iso => WEEKDAYS[toDate(iso).getUTCDay()];
  const fmtLong = iso => { const d = toDate(iso); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
  function describe(p) {
    const bits = [];
    if (p.years) bits.push(`${p.years} year${p.years === 1 ? '' : 's'}`);
    if (p.months) bits.push(`${p.months} month${p.months === 1 ? '' : 's'}`);
    if (p.days) bits.push(`${p.days} day${p.days === 1 ? '' : 's'}`);
    return bits.join(' and ');
  }

  /* ── the rules ──────────────────────────────────────────────────────────────
     period: what runs; trigger: what the start date means; copy: certified-copy time is left out (s.12(2));
     s5: a late filing can be admitted for sufficient cause; extend: a further window the court may allow
     (from: 'end' adds it to the last date, 'start' measures it from the start date instead). */
  const R = (id, group, name, period, trigger, source, o = {}) => ({ id, group, name, period, trigger, source, copy: false, s5: false, extend: null, note: '', custom: false, ...o });

  const RULES = [
    R('suit-113', 'Suits', 'Suit with no period given elsewhere', { years: 3 }, 'Date the right to sue accrues', 'Limitation Act, 1963, Art. 113'),
    R('suit-54', 'Suits', 'Specific performance of a contract', { years: 3 }, 'Date fixed for performance (or, if none, the date the plaintiff has notice that performance is refused)', 'Limitation Act, 1963, Art. 54'),
    R('suit-55', 'Suits', 'Compensation for breach of contract', { years: 3 }, 'Date the contract was broken', 'Limitation Act, 1963, Art. 55'),
    R('suit-58', 'Suits', 'Declaration', { years: 3 }, 'Date the right to sue first accrues', 'Limitation Act, 1963, Art. 58'),
    R('suit-64', 'Suits', 'Possession, on the strength of earlier possession', { years: 12 }, 'Date of dispossession', 'Limitation Act, 1963, Art. 64'),
    R('suit-65', 'Suits', 'Possession, on the strength of title', { years: 12 }, 'Date the defendant’s possession becomes adverse to the plaintiff', 'Limitation Act, 1963, Art. 65'),
    R('exec-136', 'Suits', 'Execution of a decree or order', { years: 12 }, 'Date the decree or order becomes enforceable', 'Limitation Act, 1963, Art. 136', { note: 'Check the provisos in Art. 136 and the order itself, for example where payment was fixed for a later date.' }),
    R('app-137', 'Suits', 'Any other application with no period given elsewhere', { years: 3 }, 'Date the right to apply accrues', 'Limitation Act, 1963, Art. 137'),

    R('ws-ordinary', 'Pleadings', 'Written statement — ordinary suit', { days: 30 }, 'Date summons was served', 'Code of Civil Procedure, 1908, Order VIII Rule 1',
      { extend: { from: 'start', period: { days: 90 }, label: 'The court may allow up to 90 days from service, for reasons recorded in writing. Courts have sometimes allowed more in ordinary suits.' } }),
    R('ws-commercial', 'Pleadings', 'Written statement — commercial suit', { days: 30 }, 'Date summons was served', 'Order VIII Rule 1 CPC as applied by the Commercial Courts Act, 2015',
      { extend: { from: 'start', period: { days: 120 }, label: 'The outer limit is 120 days from service. After that the right to file a written statement is forfeited.' } }),

    R('appeal-hc', 'Appeals and review', 'Civil appeal to the High Court', { days: 90 }, 'Date of the decree or order appealed from', 'Limitation Act, 1963, Art. 116(a)', { copy: true, s5: true }),
    R('appeal-other', 'Appeals and review', 'Civil appeal to any other court (for example the District Court)', { days: 30 }, 'Date of the decree or order appealed from', 'Limitation Act, 1963, Art. 116(b)', { copy: true, s5: true }),
    R('appeal-lpa', 'Appeals and review', 'Appeal from a High Court order to the same High Court (Letters Patent / intra-court)', { days: 30 }, 'Date of the decree or order appealed from', 'Limitation Act, 1963, Art. 117', { copy: true, s5: true }),
    R('review-124', 'Appeals and review', 'Review of a judgment (court other than the Supreme Court)', { days: 30 }, 'Date of the decree or order', 'Limitation Act, 1963, Art. 124', { copy: true, s5: true }),
    R('slp', 'Appeals and review', 'Special leave petition against a High Court judgment', { days: 90 }, 'Date of the judgment or order', 'Supreme Court Rules, 2013, Order XXI Rule 2', { copy: true, s5: true, note: 'Check how the Supreme Court counts certified-copy time and the day of judgment in your matter.' }),
    R('review-sc', 'Appeals and review', 'Review petition in the Supreme Court', { days: 30 }, 'Date of the judgment or order', 'Supreme Court Rules, 2013, Order XLVII Rule 2'),
    R('mact-173', 'Appeals and review', 'Appeal against a Motor Accident Claims Tribunal award', { days: 90 }, 'Date of the award', 'Motor Vehicles Act, 1988, s.173(1)', { copy: true, note: 'The High Court may entertain a late appeal if there was sufficient cause (proviso to s.173(1)).' }),
    R('arb-34', 'Appeals and review', 'Application to set aside an arbitral award', { months: 3 }, 'Date the party received the award', 'Arbitration and Conciliation Act, 1996, s.34(3)',
      { extend: { from: 'end', period: { days: 30 }, label: 'The court may entertain an application within a further 30 days if sufficient cause is shown, and not after that.' }, note: 'If a request for correction or interpretation was made under s.33, count from the date it was disposed of.' }),

    R('consumer-69', 'Forums and statutes', 'Consumer complaint', { years: 2 }, 'Date the cause of action arose', 'Consumer Protection Act, 2019, s.69(1)', { note: 'The Commission may admit a late complaint if sufficient cause is shown.' }),
    R('consumer-41', 'Forums and statutes', 'Appeal from a District Commission to the State Commission', { days: 45 }, 'Date of the District Commission’s order', 'Consumer Protection Act, 2019, s.41', { note: 'The State Commission may admit a late appeal if sufficient cause is shown.' }),
    R('consumer-51', 'Forums and statutes', 'Appeal from a State Commission to the National Commission', { days: 30 }, 'Date of the State Commission’s order', 'Consumer Protection Act, 2019, s.51', { note: 'The National Commission may admit a late appeal if sufficient cause is shown.' }),
    R('consumer-67', 'Forums and statutes', 'Appeal from the National Commission to the Supreme Court', { days: 30 }, 'Date of the National Commission’s order', 'Consumer Protection Act, 2019, s.67'),
    R('labour-2a', 'Forums and statutes', 'Individual dismissal dispute before the Labour Court', { years: 3 }, 'Date of discharge, dismissal, retrenchment or termination', 'Industrial Disputes Act, 1947, s.2A(3)'),
    R('gst-107', 'Forums and statutes', 'GST appeal to the first appellate authority', { months: 3 }, 'Date the order was communicated', 'Central Goods and Services Tax Act, 2017, s.107(1)',
      { extend: { from: 'end', period: { months: 1 }, label: 'A further one month may be allowed if sufficient cause is shown (s.107(4)).' } }),

    R('ni-present', 'Cheque dishonour (NI Act)', 'Presenting the cheque to the bank', { months: 3 }, 'Date on the cheque', 'Negotiable Instruments Act, 1881, s.138 proviso (a)', { note: 'The cheque must be presented within three months of its date or within its validity, whichever is earlier.' }),
    R('ni-notice', 'Cheque dishonour (NI Act)', 'Demand notice to the drawer', { days: 30 }, 'Date the payee received the bank’s information that the cheque was unpaid', 'Negotiable Instruments Act, 1881, s.138 proviso (b)'),
    R('ni-complaint', 'Cheque dishonour (NI Act)', 'Complaint to the Magistrate', { months: 1 }, 'Date the drawer received the demand notice', 'Negotiable Instruments Act, 1881, s.138 proviso (c) and s.142(1)(b)',
      { note: 'The drawer has 15 days from receipt of the notice to pay. This counts the cause of action as arising on the 16th day after receipt, and allows one month from then. Courts have read this point differently, so confirm it against the facts.',
        custom: false,
        chain: start => {
          const payEnd = addDays(start, 15), cause = addDays(payEnd, 1);
          return { raw: addMonths(cause, 1), steps: [`The drawer has 15 days from receipt to pay, so the payment window ends on ${fmtLong(payEnd)}.`, `The cause of action arises on the next day, ${fmtLong(cause)}.`, `One month from then ends on ${fmtLong(addMonths(cause, 1))}.`] };
        } })
  ];

  const GROUPS = [...new Set(RULES.map(r => r.group))];

  /* ── when is the court closed? ──────────────────────────────────────────────
     Sundays always. Saturdays as the user sets them: none, all, or the 2nd and 4th. Closures are
     date ranges (a vacation, a strike, a holiday); the user enters them because they differ by court. */
  function closedReason(iso, weekly = {}, closures = []) {
    const d = toDate(iso), dow = d.getUTCDay();
    if (dow === 0) return 'a Sunday';
    if (dow === 6 && (weekly.saturday === 'all' || (weekly.saturday === 'alt' && [2, 4].includes(Math.ceil(d.getUTCDate() / 7))))) return 'a Saturday the court is closed';
    const c = (closures || []).find(x => toDate(x.from) && toDate(x.to) && x.from <= iso && iso <= x.to);
    return c ? (c.label ? `closed (${c.label})` : 'a day the court is closed') : null;
  }
  function nextOpen(iso, weekly, closures) {
    let day = iso;
    const reasons = [];
    for (let i = 0; i < 400; i++) {                      // a year of closures at most; stops a bad range from looping forever
      const why = closedReason(day, weekly, closures);
      if (!why) return { date: day, reasons };
      reasons.push(`${fmtLong(day)} is ${why}`);
      day = addDays(day, 1);
    }
    return { date: day, reasons };
  }

  /* ── the calculation ────────────────────────────────────────────────────── */
  function compute({ ruleId, start, excludeDays = 0, weekly = {}, closures = [], today = '', rules = RULES }) {
    const rule = rules.find(r => r.id === ruleId);
    if (!rule) return { error: 'Choose a period first.' };
    if (!toDate(start)) return { error: 'Enter the date as a real day, month and year.' };
    const ex = Math.max(0, Math.min(3650, Math.floor(Number(excludeDays) || 0)));
    const steps = [`${rule.trigger}: ${fmtLong(start)} (${weekday(start)}). That day is left out of the count (Limitation Act, 1963, s.12(1)).`];
    const warnings = [];
    let from = start;
    if (ex && rule.copy) { from = addDays(start, ex); steps.push(`Time taken to get the certified copy, ${ex} day${ex === 1 ? '' : 's'}, is left out as well (s.12(2)). Counting from ${fmtLong(from)}.`); }
    else if (ex) warnings.push('Certified-copy time is left out only for appeals, reviews and similar steps, so it was not used for this period.');

    let raw;
    if (rule.chain) { const c = rule.chain(from); raw = c.raw; steps.push(...c.steps); }
    else { raw = addPeriod(from, rule.period); steps.push(`${describe(rule.period)} from there ends on ${fmtLong(raw)} (${weekday(raw)}).`); }

    const open = nextOpen(raw, weekly, closures);
    const rolled = open.date !== raw;
    if (rolled) steps.push(`${open.reasons.join('; ')}. The period runs to the day the court reopens, ${fmtLong(open.date)} (s.4).`);

    let extend = null;
    if (rule.extend) {
      const base = rule.extend.from === 'start' ? from : raw;
      extend = { date: addPeriod(base, rule.extend.period), label: rule.extend.label };
      steps.push(`Further window at the court’s discretion: until ${fmtLong(extend.date)}. ${rule.extend.label}`);
    }

    const daysLeft = toDate(today) ? diffDays(open.date, today) : null;
    if (daysLeft !== null && daysLeft < 0) warnings.push(rule.s5 ? `This date passed ${-daysLeft} day${daysLeft === -1 ? '' : 's'} ago. A late appeal or application can be admitted if the court is satisfied there was sufficient cause (Limitation Act, 1963, s.5), and the delay must be explained.` : `This date passed ${-daysLeft} day${daysLeft === -1 ? '' : 's'} ago. Check whether the statute allows a late filing for sufficient cause.`);
    if (rule.note) warnings.push(rule.note);
    return { rule, start, lastDate: open.date, rawDate: raw, rolled, extend, daysLeft, steps, warnings };
  }

  /* A period the user adds themselves. Checked, because it comes from a form (and from storage). */
  function makeCustomRule(f) {
    const name = String(f.name || '').trim().slice(0, 120);
    const trigger = String(f.trigger || '').trim().slice(0, 200);
    const n = Math.floor(Number(f.amount));
    const unit = ['days', 'months', 'years'].includes(f.unit) ? f.unit : null;
    if (!name) return { error: 'Give the period a name.' };
    if (!trigger) return { error: 'Say what the start date is.' };
    if (!unit || !(n >= 1 && n <= 5000)) return { error: 'Enter a period of 1 or more.' };
    return { rule: R(String(f.id || `custom-${Math.random().toString(36).slice(2, 9)}`).slice(0, 40), 'Your own periods', name, { [unit]: n }, trigger, String(f.source || '').trim().slice(0, 200) || 'Added by you', { copy: !!f.copy, custom: true }) };
  }

  return { RULES, GROUPS, toDate, addDays, addMonths, diffDays, weekday, fmtLong, describe, closedReason, nextOpen, compute, makeCustomRule };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Limitation;
