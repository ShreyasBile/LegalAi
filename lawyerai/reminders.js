/* ============================================================================
   Reminders — the pure logic behind the Reminders page.
   No DOM and no storage here, so every rule is unit-tested (test/reminders.test.js).
   Loaded by the browser as a classic script (global `Reminders`) and by Node with require().

   What this can and cannot do: it prepares each reminder, works out when it is due, and builds a
   wa.me link that opens WhatsApp with the message already typed, so the lawyer taps Send. It cannot
   send by itself. Sending without a person needs the WhatsApp Business platform and a server that
   holds its credentials, which a browser-only app does not have.
   ============================================================================ */
const Reminders = (() => {
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAY = 86400000;
  const toDate = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '')); if (!m) return null; const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? d : null; };
  const addDays = (iso, n) => new Date(toDate(iso).getTime() + n * DAY).toISOString().slice(0, 10);
  const diffDays = (a, b) => Math.round((toDate(a) - toDate(b)) / DAY);
  const fmtDay = iso => { const d = toDate(iso); return d ? `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` : ''; };

  /* ── phone numbers ──────────────────────────────────────────────────────────
     wa.me wants digits only, with the country code. A number typed without a + is taken as Indian
     (10 digits, 0 and 10 digits, or 91 and 10 digits); any other country needs a + so it is never guessed.
     An Indian number must be a mobile one (starts 6-9), because WhatsApp is on mobiles. */
  function normalizePhone(raw) {
    const s = String(raw ?? '').trim();
    if (!s || !/^[+\d\s().-]+$/.test(s)) return null;
    let d = s.replace(/\D/g, '');
    if (!s.startsWith('+')) {
      if (d.startsWith('00')) d = d.slice(2);                                       // 0091 98123 45678
      else if (d.length === 11 && d.startsWith('0')) d = `91${d.slice(1)}`;         // 09812345678
      else if (d.length === 10) d = `91${d}`;                                       // 9812345678
      else if (!(d.length === 12 && d.startsWith('91'))) return null;               // anything else needs a +
    }
    if (d.startsWith('91')) return d.length === 12 && /^[6-9]/.test(d[2]) ? d : null;
    return d.length >= 8 && d.length <= 15 ? d : null;
  }
  function formatPhone(digits) {
    if (!digits) return '';
    return digits.length === 12 && digits.startsWith('91') ? `+91 ${digits.slice(2, 7)} ${digits.slice(7)}` : `+${digits}`;
  }
  /* With a number the chat opens straight to that person; without one WhatsApp asks whom to send to. */
  const waLink = (phone, text) => `https://wa.me/${normalizePhone(phone) || ''}?text=${encodeURIComponent(String(text ?? ''))}`;

  /* ── message templates ──────────────────────────────────────────────────── */
  const PLACEHOLDERS = [
    { key: 'client', hint: 'The client’s name' }, { key: 'matter', hint: 'The matter title' }, { key: 'when', hint: '“today”, “tomorrow” or “on 15 Sep 2026”' },
    { key: 'date', hint: 'The date, e.g. 15 Sep 2026' }, { key: 'time', hint: 'The hearing time' }, { key: 'court', hint: 'Court and courtroom' },
    { key: 'purpose', hint: 'What the hearing is for' }, { key: 'title', hint: 'The deadline’s title' }, { key: 'days', hint: 'Days left to a deadline' }, { key: 'firm', hint: 'Your firm’s name' }
  ];
  const DEFAULT_TEMPLATES = {
    hearing: 'Reminder: your matter *{matter}* is listed {when} at {time}, {court}. Please reach 30 minutes early. — {firm}',
    deadline: 'Heads up: *{title}* is due on {date} for {matter} ({days}).'
  };
  const KNOWN = PLACEHOLDERS.map(p => p.key);
  function renderTemplate(tpl, vars) {
    return String(tpl ?? '').replace(/\{([a-z_]+)\}/g, (all, k) => (KNOWN.includes(k) ? String(vars[k] ?? '') : all)).replace(/ {2,}/g, ' ').trim();
  }
  const unknownFields = tpl => [...String(tpl ?? '').matchAll(/\{([a-z_]+)\}/g)].map(m => m[1]).filter(k => !KNOWN.includes(k));

  function whenPhrase(eventIso, today) {
    const n = diffDays(eventIso, today);
    return n === 0 ? 'today' : n === 1 ? 'tomorrow' : `on ${fmtDay(eventIso)}`;
  }
  function daysPhrase(eventIso, today) {
    const n = diffDays(eventIso, today);
    return n === 0 ? 'today' : n === 1 ? '1 day left' : n > 0 ? `${n} days left` : `${-n} day${n === -1 ? '' : 's'} ago`;
  }
  const clock = hhmm => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '')); if (!m || +m[1] > 23 || +m[2] > 59) return ''; const h = +m[1]; return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`; };

  /* ── the list ───────────────────────────────────────────────────────────────
     A hearing prepares a message to the client the day before (6 PM). A deadline prepares a reminder to
     the lawyer two days before (9 AM). Custom reminders are the user's own.
     status: due (send day has come) · upcoming · sent · off (switched off by the user). Past events drop out. */
  function build({ hearings = [], deadlines = [], custom = [], titleOf = () => '', contacts = {}, templates = {}, firm = '', today, state = {} }) {
    const tpl = { hearing: templates.hearing || DEFAULT_TEMPLATES.hearing, deadline: templates.deadline || DEFAULT_TEMPLATES.deadline };
    const sent = state.sent || {}, off = state.off || {}, edits = state.edits || {};
    const out = [];
    const finish = r => {
      const c = r.toKind === 'client' ? contacts[r.matterId] || {} : contacts._me || {};
      r.toName = r.toKind === 'client' ? c.name || '' : c.name || 'You';
      r.phone = normalizePhone(c.phone) || '';
      r.body = typeof edits[r.key] === 'string' && edits[r.key] ? edits[r.key] : r.body;
      r.edited = r.body !== r.original;
      r.status = sent[r.key] ? 'sent' : off[r.key] ? 'off' : r.sendDate <= today ? 'due' : 'upcoming';
      r.sentAt = sent[r.key] || '';
      r.blocker = r.toKind === 'client' && !r.phone ? 'Add the client’s WhatsApp number to send this.' : r.toKind === 'client' && !c.consent ? 'Confirm the client agreed to WhatsApp messages to send this.' : '';
      r.link = r.blocker ? '' : waLink(r.phone, r.body);
      out.push(r);
    };
    for (const h of hearings) {
      if (!toDate(h.date) || h.date < today) continue;
      const c = contacts[h.matterId] || {};
      const body = renderTemplate(tpl.hearing, { client: c.name || '', matter: titleOf(h.matterId), when: whenPhrase(h.date, today), date: fmtDay(h.date), time: h.time, court: h.court, purpose: h.purpose, firm });
      finish({ key: `hearing:${h.date}:${h.time}:${h.matterId}`, kind: 'hearing', type: 'Hearing reminder', matterId: h.matterId, toKind: 'client', eventDate: h.date, sendDate: addDays(h.date, -1), sendTime: '6:00 PM', original: body, body });
    }
    for (const d of deadlines) {
      if (!toDate(d.date) || d.date < today) continue;
      const body = renderTemplate(tpl.deadline, { matter: titleOf(d.matterId), title: d.title, date: fmtDay(d.date), days: daysPhrase(d.date, today), when: whenPhrase(d.date, today), firm });
      finish({ key: `deadline:${d.id || `${d.date}:${d.title}`}`, kind: 'deadline', type: `${d.type || 'Deadline'} deadline`, matterId: d.matterId, toKind: 'me', eventDate: d.date, sendDate: addDays(d.date, -2), sendTime: '9:00 AM', original: body, body });
    }
    for (const c of custom) {
      if (!toDate(c.date)) continue;
      finish({ key: `custom:${c.id}`, kind: 'custom', type: 'Reminder', matterId: c.matterId || '', toKind: c.toKind === 'client' ? 'client' : 'me', eventDate: c.date, sendDate: c.date, sendTime: clock(c.time) || '9:00 AM', original: c.body, body: c.body, customId: c.id });
    }
    const rank = { due: 0, upcoming: 1, off: 2, sent: 3 };
    return out.sort((a, b) => rank[a.status] - rank[b.status] || (a.status === 'sent' ? b.sendDate.localeCompare(a.sendDate) : a.sendDate.localeCompare(b.sendDate)));
  }

  return { PLACEHOLDERS, DEFAULT_TEMPLATES, normalizePhone, formatPhone, waLink, renderTemplate, unknownFields, whenPhrase, daysPhrase, clock, fmtDay, build };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Reminders;
