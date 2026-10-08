const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../limitation.js');

/* Every expected date here was counted by hand from the calendar, not worked out with the code under test. */
const calc = (ruleId, start, o = {}) => L.compute({ ruleId, start, ...o });

test('months clamp to the end of a short month, years survive leap days', () => {
  assert.equal(L.addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(L.addMonths('2024-01-31', 1), '2024-02-29');
  assert.equal(L.addMonths('2026-11-30', 3), '2027-02-28');
  assert.equal(L.addMonths('2026-12-15', 3), '2027-03-15');
  assert.equal(L.addMonths('2024-02-29', 12), '2025-02-28');
  assert.equal(L.addMonths('2026-03-15', -1), '2026-02-15');
});

test('days add across month and year ends', () => {
  assert.equal(L.addDays('2026-09-02', 90), '2026-12-01');        // 28 left in Sept + 31 + 30 + 1
  assert.equal(L.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(L.addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(L.diffDays('2026-12-01', '2026-09-02'), 90);
});

test('only real calendar dates are accepted', () => {
  assert.equal(L.toDate('2026-02-30'), null);
  assert.equal(L.toDate('2026-13-01'), null);
  assert.equal(L.toDate('11/09/2026'), null);
  assert.equal(L.toDate(''), null);
  assert.ok(L.toDate('2024-02-29'));
  assert.equal(L.toDate('2025-02-29'), null);
});

test('a 90-day appeal period leaves out the day of the order', () => {
  const r = calc('appeal-hc', '2026-09-02');
  assert.equal(r.lastDate, '2026-12-01');
  assert.equal(r.rolled, false);
  assert.equal(L.weekday(r.lastDate), 'Tuesday');
});

test('time taken for the certified copy is left out, and a Sunday last day runs to Monday', () => {
  const r = calc('appeal-hc', '2026-09-02', { excludeDays: 12 });
  assert.equal(r.rawDate, '2026-12-13');                           // 14 Sept + 90 days
  assert.equal(L.weekday(r.rawDate), 'Sunday');
  assert.equal(r.lastDate, '2026-12-14');
  assert.equal(r.rolled, true);
  assert.match(r.steps.join(' '), /certified copy, 12 days/);
  assert.match(r.steps.join(' '), /Sunday/);
});

test('certified-copy time is ignored, with a warning, where the law does not allow it', () => {
  const r = calc('suit-113', '2026-01-10', { excludeDays: 20 });
  assert.equal(r.lastDate, '2029-01-10');
  assert.match(r.warnings.join(' '), /not used for this period/);
});

test('three years and twelve years count by calendar year', () => {
  assert.equal(calc('suit-113', '2023-03-14').lastDate, '2026-03-14');                // a Saturday: the court is open unless told otherwise
  assert.equal(calc('suit-65', '2014-06-30').lastDate, '2026-06-30');                 // a Tuesday
  assert.equal(calc('suit-113', '2024-02-29').rawDate, '2027-02-28');                 // a leap day clamps to the end of February (a Sunday, so the last date is 1 March)
  assert.equal(calc('suit-113', '2024-02-29').lastDate, '2027-03-01');
});

test('when the last day is a Sunday the period runs to Monday, and the answer says why', () => {
  const r = calc('suit-113', '2023-03-15');
  assert.equal(r.rawDate, '2026-03-15');
  assert.equal(L.weekday(r.rawDate), 'Sunday');
  assert.equal(r.lastDate, '2026-03-16');
  assert.equal(r.rolled, true);
});

test('arbitration: three months, then a further 30 days the court may allow', () => {
  const r = calc('arb-34', '2026-01-31');
  assert.equal(r.rawDate, '2026-04-30');                           // clamped: 31 Jan + 3 months
  assert.equal(r.extend.date, '2026-05-30');
  assert.match(r.extend.label, /30 days/);
});

test('GST appeal: three months, plus one month with sufficient cause', () => {
  const r = calc('gst-107', '2026-05-31');
  assert.equal(r.rawDate, '2026-08-31');
  assert.equal(r.extend.date, '2026-09-30');
});

test('written statement: 30 days, with the 90-day (ordinary) or 120-day (commercial) outer limit measured from service', () => {
  const a = calc('ws-ordinary', '2026-09-01');
  assert.equal(a.lastDate, '2026-10-01');
  assert.equal(a.extend.date, '2026-11-30');
  const b = calc('ws-commercial', '2026-09-01');
  assert.equal(b.lastDate, '2026-10-01');
  assert.equal(b.extend.date, '2026-12-30');
});

test('cheque dishonour: notice in 30 days, and the complaint month starts the day after the 15-day window', () => {
  assert.equal(calc('ni-notice', '2026-03-01').lastDate, '2026-03-31');
  const r = calc('ni-complaint', '2026-03-11');
  assert.equal(r.lastDate, '2026-04-27');                          // pays by 26 Mar; cause arises 27 Mar; one month on (a Monday)
  assert.equal(r.rolled, false);
  assert.match(r.steps.join(' '), /15 days from receipt/);
  assert.match(r.warnings.join(' '), /confirm it against the facts/);
  const sun = calc('ni-complaint', '2026-03-10');                  // pays by 25 Mar; cause arises 26 Mar; one month on is a Sunday
  assert.equal(sun.rawDate, '2026-04-26');
  assert.equal(sun.lastDate, '2026-04-27');
  assert.equal(sun.rolled, true);
});

test('court closures: a vacation pushes the last date to the day the court reopens', () => {
  const vacation = [{ from: '2026-05-25', to: '2026-06-12', label: 'summer vacation' }];
  const none = calc('appeal-other', '2026-05-02', { closures: vacation });          // 30 days → 1 June, inside the vacation
  assert.equal(none.rawDate, '2026-06-01');
  assert.equal(none.lastDate, '2026-06-13');                                        // Saturday, and the court sits on Saturdays here
  assert.match(none.steps.join(' '), /summer vacation/);
  const all = calc('appeal-other', '2026-05-02', { closures: vacation, weekly: { saturday: 'all' } });
  assert.equal(all.lastDate, '2026-06-15');
  const alt = calc('appeal-other', '2026-05-02', { closures: vacation, weekly: { saturday: 'alt' } });
  assert.equal(alt.lastDate, '2026-06-15');                                         // 13 June is the 2nd Saturday
});

test('2nd and 4th Saturdays are closed under "alt", the 1st and 3rd are not', () => {
  const w = { saturday: 'alt' };
  assert.equal(L.closedReason('2026-06-06', w), null);             // 1st Saturday
  assert.ok(L.closedReason('2026-06-13', w));                      // 2nd
  assert.equal(L.closedReason('2026-06-20', w), null);             // 3rd
  assert.ok(L.closedReason('2026-06-27', w));                      // 4th
  assert.equal(L.closedReason('2026-06-13', {}), null);            // not closed unless the user says so
  assert.ok(L.closedReason('2026-06-14', {}));                     // Sundays always are
});

test('a closure range that runs past a year cannot hang the calculator', () => {
  const r = L.nextOpen('2026-01-01', {}, [{ from: '2026-01-01', to: '2030-01-01', label: 'x' }]);
  assert.ok(r.reasons.length <= 400);
});

test('days left, and a warning once the date has passed', () => {
  const r = calc('appeal-hc', '2026-09-02', { today: '2026-09-11' });
  assert.equal(r.daysLeft, 81);
  const late = calc('appeal-hc', '2026-01-02', { today: '2026-09-11' });
  assert.ok(late.daysLeft < 0);
  assert.match(late.warnings.join(' '), /s\.5/);
  const lateNoCondone = calc('consumer-69', '2020-01-02', { today: '2026-09-11' });
  assert.match(lateNoCondone.warnings.join(' '), /passed/);
});

test('bad input is refused with a plain message', () => {
  assert.match(calc('nope', '2026-01-01').error, /Choose a period/);
  assert.match(calc('suit-113', '2026-02-30').error, /real day/);
  assert.match(calc('suit-113', '').error, /real day/);
});

test('every built-in rule works from an ordinary date and carries its source', () => {
  assert.ok(L.RULES.length >= 25);
  const ids = new Set();
  for (const rule of L.RULES) {
    assert.ok(!ids.has(rule.id), 'duplicate ' + rule.id);
    ids.add(rule.id);
    assert.ok(rule.source && rule.trigger && rule.name && rule.group, rule.id);
    const r = calc(rule.id, '2026-02-10');
    assert.ok(!r.error, rule.id);
    assert.ok(L.toDate(r.lastDate) && r.lastDate > '2026-02-10', `${rule.id}: ${r.lastDate}`);
  }
  assert.deepEqual(L.GROUPS.slice(0, 3), ['Suits', 'Pleadings', 'Appeals and review']);
});

test('a period the user adds is checked, and then works like any other', () => {
  assert.match(L.makeCustomRule({ name: '', trigger: 'x', amount: 5, unit: 'days' }).error, /name/);
  assert.match(L.makeCustomRule({ name: 'n', trigger: '', amount: 5, unit: 'days' }).error, /start date/);
  assert.match(L.makeCustomRule({ name: 'n', trigger: 't', amount: 0, unit: 'days' }).error, /1 or more/);
  assert.match(L.makeCustomRule({ name: 'n', trigger: 't', amount: 5, unit: 'weeks' }).error, /1 or more/);
  const { rule } = L.makeCustomRule({ id: 'c1', name: 'High Court rule X', trigger: 'Date of the order', amount: 6, unit: 'months', source: 'Rule 9', copy: true });
  assert.equal(rule.custom, true);
  const r = L.compute({ ruleId: 'c1', start: '2026-03-31', rules: [...L.RULES, rule] });
  assert.equal(r.lastDate, '2026-09-30');
  assert.equal(L.compute({ ruleId: 'c1', start: '2026-03-31' }).error, 'Choose a period first.');   // not known unless passed in
});
