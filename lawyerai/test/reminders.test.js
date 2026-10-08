const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../reminders.js');

const TODAY = '2026-09-11';
const titleOf = id => ({ m1: 'Sharma v. State', m2: 'Aarohi Estates v. Patel' }[id] || '');
const contacts = { m1: { name: 'Rohan Sharma', phone: '98123 45678', consent: true }, m2: { name: 'Mr. Desai', phone: '99887 76655', consent: false }, _me: { name: 'Shreyas', phone: '+91 90000 11111' } };
const hearing = (date, matterId = 'm1', time = '10:30 AM') => ({ date, time, matterId, court: 'Bombay High Court · Courtroom 52', purpose: 'Bail hearing' });
const base = o => ({ titleOf, contacts, firm: 'Kamat & Partners', today: TODAY, ...o });

test('phone numbers: Indian mobiles in every common way of typing them', () => {
  for (const ok of ['9812345678', '09812345678', '+91 98123 45678', '+91-9812345678', '919812345678', '0091 98123 45678', '(98123) 45678']) assert.equal(R.normalizePhone(ok), '919812345678', ok);
});

test('phone numbers: other countries need a +, and junk is refused', () => {
  assert.equal(R.normalizePhone('+1 415 555 2671'), '14155552671');
  assert.equal(R.normalizePhone('+44 20 7946 0958'), '442079460958');
  assert.equal(R.normalizePhone('442079460958'), null);          // no +, not Indian: never guessed
  assert.equal(R.normalizePhone('5812345678'), null);            // an Indian number that is not a mobile
  assert.equal(R.normalizePhone('12345'), null);
  assert.equal(R.normalizePhone('+91 12345'), null);
  assert.equal(R.normalizePhone('call me'), null);
  assert.equal(R.normalizePhone(''), null);
  assert.equal(R.normalizePhone(null), null);
  assert.equal(R.normalizePhone('98123 45678 ext 2'), null);
});

test('phone numbers are shown readably', () => {
  assert.equal(R.formatPhone('919812345678'), '+91 98123 45678');
  assert.equal(R.formatPhone('14155552671'), '+14155552671');
  assert.equal(R.formatPhone(''), '');
});

test('the WhatsApp link carries the number and the message, safely encoded', () => {
  assert.equal(R.waLink('98123 45678', 'Hi *Sharma* & co?'), 'https://wa.me/919812345678?text=Hi%20*Sharma*%20%26%20co%3F');
  assert.equal(R.waLink('', 'Hello'), 'https://wa.me/?text=Hello');                       // no number: WhatsApp asks whom to send to
  assert.equal(R.waLink('not a number', 'x'), 'https://wa.me/?text=x');
  assert.ok(!R.waLink('98123 45678', 'a\nb').includes('\n'));
  assert.ok(R.waLink('98123 45678', 'a\nb').endsWith('a%0Ab'));
});

test('templates fill known fields, leave unknown ones, and tidy spaces', () => {
  assert.equal(R.renderTemplate('Hi {client}, {matter} {when}.', { client: 'Rohan', matter: 'X', when: 'tomorrow' }), 'Hi Rohan, X tomorrow.');
  assert.equal(R.renderTemplate('{nope} {client}', { client: 'A' }), '{nope} A');
  assert.equal(R.renderTemplate('a {time}  b', { time: '' }), 'a b');
  assert.deepEqual(R.unknownFields('{client} {nope} {x_y}'), ['nope', 'x_y']);
  assert.ok(R.DEFAULT_TEMPLATES.hearing && R.unknownFields(R.DEFAULT_TEMPLATES.hearing).length === 0 && R.unknownFields(R.DEFAULT_TEMPLATES.deadline).length === 0);
});

test('"today", "tomorrow" and "N days left" are worked out from the real date', () => {
  assert.equal(R.whenPhrase('2026-09-11', TODAY), 'today');
  assert.equal(R.whenPhrase('2026-09-12', TODAY), 'tomorrow');
  assert.equal(R.whenPhrase('2026-09-15', TODAY), 'on 15 Sep 2026');
  assert.equal(R.daysPhrase('2026-09-18', TODAY), '7 days left');
  assert.equal(R.daysPhrase('2026-09-12', TODAY), '1 day left');
  assert.equal(R.daysPhrase('2026-09-11', TODAY), 'today');
  assert.equal(R.clock('18:05'), '6:05 PM');
  assert.equal(R.clock('00:30'), '12:30 AM');
  assert.equal(R.clock('12:00'), '12:00 PM');
  assert.equal(R.clock('24:00'), '');
  assert.equal(R.clock('9'), '');
});

test('a hearing prepares a client message the day before, due once that day comes', () => {
  const [tomorrow] = R.build(base({ hearings: [hearing('2026-09-12')] }));
  assert.equal(tomorrow.sendDate, '2026-09-11');
  assert.equal(tomorrow.status, 'due');
  assert.equal(tomorrow.toKind, 'client');
  assert.equal(tomorrow.sendTime, '6:00 PM');
  assert.equal(tomorrow.body, 'Reminder: your matter *Sharma v. State* is listed tomorrow at 10:30 AM, Bombay High Court · Courtroom 52. Please reach 30 minutes early. — Kamat & Partners');
  const [later] = R.build(base({ hearings: [hearing('2026-09-15')] }));
  assert.equal(later.status, 'upcoming');
  assert.equal(later.sendDate, '2026-09-14');
  assert.match(later.body, /listed on 15 Sep 2026 at/);
  const [same] = R.build(base({ hearings: [hearing('2026-09-11')] }));
  assert.equal(same.status, 'due');
  assert.match(same.body, /listed today at/);
});

test('hearings and deadlines that are already past are not listed', () => {
  assert.equal(R.build(base({ hearings: [hearing('2026-09-10')], deadlines: [{ date: '2026-09-10', title: 'x', matterId: 'm1' }] })).length, 0);
});

test('a client message cannot be sent without a number and the client’s consent', () => {
  const [ok] = R.build(base({ hearings: [hearing('2026-09-12', 'm1')] }));
  assert.equal(ok.blocker, '');
  assert.equal(ok.phone, '919812345678');
  assert.ok(ok.link.startsWith('https://wa.me/919812345678?text=Reminder'));
  const [noConsent] = R.build(base({ hearings: [hearing('2026-09-12', 'm2')] }));
  assert.match(noConsent.blocker, /agreed/);
  assert.equal(noConsent.link, '');
  const [noNumber] = R.build(base({ hearings: [hearing('2026-09-12', 'm3')] }));
  assert.match(noNumber.blocker, /number/);
  assert.equal(noNumber.link, '');
  const [badNumber] = R.build(base({ contacts: { m1: { name: 'x', phone: 'nope', consent: true } }, hearings: [hearing('2026-09-12', 'm1')] }));
  assert.match(badNumber.blocker, /number/);
});

test('a deadline prepares a reminder to the lawyer two days before', () => {
  const [d] = R.build(base({ deadlines: [{ id: 'dl-1', date: '2026-09-18', title: 'Compliance affidavit due', matterId: 'm1', type: 'Compliance' }] }));
  assert.equal(d.sendDate, '2026-09-16');
  assert.equal(d.status, 'upcoming');
  assert.equal(d.toKind, 'me');
  assert.equal(d.type, 'Compliance deadline');
  assert.equal(d.body, 'Heads up: *Compliance affidavit due* is due on 18 Sep 2026 for Sharma v. State (7 days left).');
  assert.equal(d.blocker, '');
  assert.ok(d.link.startsWith('https://wa.me/919000011111?text='));              // to my own number when I have given it
  const [noMe] = R.build(base({ contacts: {}, deadlines: [{ id: 'dl-1', date: '2026-09-18', title: 't', matterId: 'm1' }] }));
  assert.ok(noMe.link.startsWith('https://wa.me/?text='));                       // otherwise WhatsApp asks whom to send to
  assert.equal(noMe.blocker, '');
});

test('custom reminders are due on their own date and can go to the client', () => {
  const custom = [{ id: 'c1', matterId: 'm1', toKind: 'client', date: '2026-09-11', time: '16:30', body: 'Please bring the originals.' }, { id: 'c2', toKind: 'me', date: '2026-09-20', time: '', body: 'Call the registry.' }];
  const [a, b] = R.build(base({ custom }));
  assert.equal(a.status, 'due');
  assert.equal(a.sendTime, '4:30 PM');
  assert.equal(a.toKind, 'client');
  assert.ok(a.link.includes('Please%20bring%20the%20originals.'));
  assert.equal(b.status, 'upcoming');
  assert.equal(b.sendTime, '9:00 AM');
  assert.equal(b.matterId, '');
});

test('sent and switched-off reminders are tracked, and an edited message wins over the template', () => {
  const hs = [hearing('2026-09-12', 'm1'), hearing('2026-09-13', 'm1', '11:00 AM'), hearing('2026-09-14', 'm1', '12:00 PM')];
  const keys = R.build(base({ hearings: hs })).map(r => r.key);
  assert.equal(new Set(keys).size, 3, 'keys are unique');
  const list = R.build(base({ hearings: hs, state: { sent: { [keys[0]]: '2026-09-11T10:00' }, off: { [keys[1]]: true }, edits: { [keys[2]]: 'My own words.' } } }));
  const by = k => list.find(r => r.key === k);
  assert.equal(by(keys[0]).status, 'sent');
  assert.equal(by(keys[0]).sentAt, '2026-09-11T10:00');
  assert.equal(by(keys[1]).status, 'off');
  assert.equal(by(keys[2]).body, 'My own words.');
  assert.equal(by(keys[2]).edited, true);
  assert.ok(by(keys[2]).link.endsWith('My%20own%20words.'));
  assert.equal(by(keys[1]).edited, false);
  assert.deepEqual(list.map(r => r.status), ['upcoming', 'off', 'sent']);                // the edited one (14 Sept, sends 13th) is not due yet
});

test('the order is: due, upcoming, off, sent — each by date', () => {
  const list = R.build(base({
    hearings: [hearing('2026-09-20'), hearing('2026-09-12', 'm2'), hearing('2026-09-16')],
    deadlines: [{ id: 'd1', date: '2026-09-13', title: 'a', matterId: 'm1' }],
    state: { sent: { 'hearing:2026-09-16:10:30 AM:m1': 'x' }, off: { 'hearing:2026-09-20:10:30 AM:m1': true } }
  }));
  assert.deepEqual(list.map(r => `${r.status}:${r.sendDate}`), ['due:2026-09-11', 'due:2026-09-11', 'off:2026-09-19', 'sent:2026-09-15']);
});

test('my own template replaces the default', () => {
  const [r] = R.build(base({ hearings: [hearing('2026-09-12')], templates: { hearing: 'Court {when}: {matter}' } }));
  assert.equal(r.body, 'Court tomorrow: Sharma v. State');
});

test('a message with damaged input does not break the list', () => {
  const list = R.build(base({ hearings: [{ date: 'x', matterId: 'm1' }, hearing('2026-09-12')], deadlines: [{ date: '2026-02-30', title: 'bad' }], custom: [{ id: 'z', date: 'no', body: 'b' }] }));
  assert.equal(list.length, 1);
});
