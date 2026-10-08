/* =============================================================================
   LIMITATION & DEADLINES — the page that works out a last date (limitation.js has the rules),
   keeps the court's closed days, and saves a date to the matter's calendar.

   A saved deadline is pushed into the app's DEADLINES list, so the Calendar, the Today page and
   the Reminders page pick it up with no extra wiring. Everything is kept in this browser's
   localStorage. Loaded after app.js, limitation.js and workbench.js (it reuses wbOpenModal).
   ============================================================================= */
const DL_KEY = 'legalai.deadlines.v1';
const dl = { saved: [], closures: [], weekly: { saturday: 'none' }, custom: [], warned: false };
const dlUi = { matterId: '', ruleId: 'appeal-hc', start: '', exclude: 0 };

const dlStr = (v, n = 200) => String(v ?? '').slice(0, n);
const dlIsoOk = v => !!Limitation.toDate(v);

function dlLoad() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(DL_KEY) || 'null'); } catch { saved = null; }
  if (saved && saved.v === 1) {
    dl.saved = (Array.isArray(saved.saved) ? saved.saved : []).filter(d => d && typeof d === 'object' && dlIsoOk(d.date) && matterById(d.matterId))
      .map(d => ({ id: dlStr(d.id, 40) || uid('dl'), matterId: dlStr(d.matterId, 40), title: dlStr(d.title), date: d.date, ruleId: dlStr(d.ruleId, 40), note: dlStr(d.note, 1000), done: !!d.done }));
    dl.closures = (Array.isArray(saved.closures) ? saved.closures : []).filter(c => c && dlIsoOk(c.from) && dlIsoOk(c.to) && c.from <= c.to)
      .map(c => ({ id: dlStr(c.id, 40) || uid('cl'), from: c.from, to: c.to, label: dlStr(c.label, 80) }));
    dl.weekly = { saturday: ['none', 'all', 'alt'].includes(saved.weekly?.saturday) ? saved.weekly.saturday : 'none' };
    for (const c of Array.isArray(saved.custom) ? saved.custom : []) {          // makeCustomRule re-checks every field, so a damaged entry is simply dropped
      const made = c && typeof c === 'object' ? Limitation.makeCustomRule(c) : { error: 'bad' };
      if (made.rule) dl.custom.push(made.rule);
    }
  }
  dl.saved.filter(d => !d.done).forEach(dlPublish);
}
const dlRules = () => [...Limitation.RULES, ...dl.custom];
const dlPublish = d => { if (!DEADLINES.some(x => x.id === d.id)) DEADLINES.push({ id: d.id, date: d.date, title: d.title, matterId: d.matterId, type: 'Limitation', custom: true }); };
const dlUnpublish = id => { const i = DEADLINES.findIndex(x => x.id === id); if (i >= 0) DEADLINES.splice(i, 1); };

function dlSave() {
  const custom = dl.custom.map(r => { const unit = Object.keys(r.period)[0]; return { id: r.id, name: r.name, trigger: r.trigger, source: r.source, copy: r.copy, amount: r.period[unit], unit }; });
  try { localStorage.setItem(DL_KEY, JSON.stringify({ v: 1, saved: dl.saved, closures: dl.closures, weekly: dl.weekly, custom })); }
  catch { if (!dl.warned) { dl.warned = true; showToast('This browser would not keep your changes — they will be lost when you reload.'); } }
}

/* ── the page ────────────────────────────────────────────────────────────── */
const dlCalc = () => Limitation.compute({ ruleId: dlUi.ruleId, start: dlUi.start, excludeDays: dlUi.exclude, weekly: dl.weekly, closures: dl.closures, today: TODAY_ISO, rules: dlRules() });
const dlChip = n => (n === null ? '' : n < 0 ? `<span class="chip chip-red">${-n} day${n === -1 ? '' : 's'} ago</span>` : n === 0 ? '<span class="chip chip-red">Today</span>' : `<span class="chip ${n <= 7 ? 'chip-red' : n <= 30 ? 'chip-amber' : 'chip-teal'}">${n} day${n === 1 ? '' : 's'} left</span>`);

function dlResultHtml() {
  if (!dlUi.start) return '<p class="empty-note">Enter the date to see the last date and how it was counted.</p>';
  const r = dlCalc();
  if (r.error) return `<p class="wb-flag">${wbIc('alert')}<span>${esc(r.error)}</span></p>`;
  return `
    <p class="eyebrow">Last date</p>
    <div class="dl-answer"><b>${esc(Limitation.weekday(r.lastDate))}, ${esc(Limitation.fmtLong(r.lastDate))}</b>${dlChip(r.daysLeft)}</div>
    <p class="hint" style="margin:2px 0 12px">${esc(r.rule.source)}</p>
    ${r.extend ? `<div class="dl-extend"><strong>Court may allow until ${esc(Limitation.fmtLong(r.extend.date))}</strong><small>${esc(r.extend.label)}</small></div>` : ''}
    <p class="eyebrow wb-mt">How it was counted</p>
    <ol class="dl-steps">${r.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
    ${r.warnings.map(w => `<p class="wb-flag">${wbIc('alert')}<span>${esc(w)}</span></p>`).join('')}
    <div class="dl-actions"><button type="button" class="btn btn-teal btn-sm" data-dl="add">${wbIc('calendar')}Add to calendar and reminders</button><button type="button" class="btn btn-ghost btn-sm" data-dl="copy">${wbIc('copy')}Copy summary</button></div>`;
}

function dlSavedHtml() {
  const rows = [...dl.saved].sort((a, b) => (a.done - b.done) || a.date.localeCompare(b.date));
  if (!rows.length) return '<p class="empty-note">Nothing saved yet. Work out a date and add it to the calendar.</p>';
  return rows.map(d => {
    const m = matterById(d.matterId), left = Limitation.diffDays(d.date, TODAY_ISO), b = dayBadge(d.date);
    return `<div class="dl-saved${d.done ? ' done' : ''}">
      <div class="deadline-date"><b>${b.num}</b><span>${b.mon}</span></div>
      <div class="dl-saved-copy"><strong>${esc(d.title)}</strong><small><a href="#/matters/${esc(d.matterId)}">${esc(m ? m.title : '')}</a> · ${esc(Limitation.fmtLong(d.date))}</small>${d.note ? `<small class="wb-note">${esc(d.note)}</small>` : ''}</div>
      ${d.done ? '<span class="chip chip-navy">Done</span>' : dlChip(left)}
      <div class="wb-row-actions"><button type="button" class="icon-btn" data-dl="done" data-id="${esc(d.id)}" aria-label="${d.done ? 'Mark as not done' : 'Mark as done'}" aria-pressed="${d.done}">${wbIc('check')}</button><button type="button" class="icon-btn" data-dl="del" data-id="${esc(d.id)}" aria-label="Remove deadline">${wbIc('close')}</button></div></div>`;
  }).join('');
}

function dlClosuresHtml() {
  return `
    <label class="dl-field">Saturdays<select data-dl-change="saturday"><option value="none"${dl.weekly.saturday === 'none' ? ' selected' : ''}>The court sits</option><option value="alt"${dl.weekly.saturday === 'alt' ? ' selected' : ''}>2nd and 4th Saturdays closed</option><option value="all"${dl.weekly.saturday === 'all' ? ' selected' : ''}>All Saturdays closed</option></select></label>
    <p class="hint" style="margin:6px 0 10px">Sundays are always treated as closed. Add vacations, holidays and strikes below, because they differ by court.</p>
    ${dl.closures.map(c => `<div class="dl-closure"><span><b>${esc(Limitation.fmtLong(c.from))}${c.to !== c.from ? ` – ${esc(Limitation.fmtLong(c.to))}` : ''}</b>${c.label ? ` · ${esc(c.label)}` : ''}</span><button type="button" class="icon-btn" data-dl="closure-del" data-id="${esc(c.id)}" aria-label="Remove closure">${wbIc('close')}</button></div>`).join('')}
    <form class="dl-inline" data-dl-submit="closure"><input type="date" name="from" required aria-label="Closed from" /><input type="date" name="to" aria-label="Closed until (optional)" /><input name="label" maxlength="80" placeholder="e.g. Summer vacation" aria-label="Reason" /><button class="btn btn-ghost btn-sm" type="submit">Add</button></form>`;
}

function dlCustomHtml() {
  return `<p class="hint">Add a period that is not in the list, such as a High Court rule or a statute you use often. It works like the built-in ones.</p>
    ${dl.custom.map(r => `<div class="dl-closure"><span><b>${esc(r.name)}</b> · ${esc(Limitation.describe(r.period))} · ${esc(r.trigger)}</span><button type="button" class="icon-btn" data-dl="custom-del" data-id="${esc(r.id)}" aria-label="Remove period">${wbIc('close')}</button></div>`).join('')}
    <button type="button" class="btn btn-ghost btn-sm" data-dl="custom-add">${wbIc('plus')}Add a period</button>`;
}

function dlFormHtml() {
  const rules = dlRules(), rule = rules.find(r => r.id === dlUi.ruleId) || rules[0];
  const groups = [...Limitation.GROUPS, ...(dl.custom.length ? ['Your own periods'] : [])];
  return `
    <label class="dl-field">Matter (optional)<select data-dl-change="matter"><option value="">— none —</option>${MATTERS.map(m => `<option value="${esc(m.id)}"${m.id === dlUi.matterId ? ' selected' : ''}>${esc(m.title)}</option>`).join('')}</select></label>
    <label class="dl-field">What are you counting?<select data-dl-change="rule">${groups.map(g => `<optgroup label="${esc(g)}">${rules.filter(r => r.group === g).map(r => `<option value="${esc(r.id)}"${r.id === rule.id ? ' selected' : ''}>${esc(r.name)} — ${esc(Limitation.describe(r.period))}</option>`).join('')}</optgroup>`).join('')}</select></label>
    <label class="dl-field">Start date<input type="date" data-dl-input="start" value="${esc(dlUi.start)}" /></label>
    <p class="hint" style="margin:4px 0 0" id="dlTrigger">${esc(rule.trigger)}.</p>
    ${rule.copy ? `<label class="dl-field">Days taken to get the certified copy<input type="number" min="0" max="3650" data-dl-input="exclude" value="${dlUi.exclude || ''}" placeholder="0" /></label><p class="hint" style="margin:4px 0 0">From the day you applied to the day the copy was ready, both counted. Confirm the counting practice of your court.</p>` : ''}`;
}

function pageDeadlines(query) {
  const rules = dlRules();
  if (query.get('rule') && rules.some(r => r.id === query.get('rule'))) dlUi.ruleId = query.get('rule');
  if (query.get('matter') && matterById(query.get('matter'))) dlUi.matterId = query.get('matter');
  if (query.get('date') && dlIsoOk(query.get('date'))) dlUi.start = query.get('date');
  return `
  <div class="page-head"><div class="page-head-text"><p class="eyebrow">Court &amp; clients</p><h1>Limitation &amp; deadlines</h1><p class="lede">Work out the last date for an appeal, a filing or a suit. It shows how the date was counted, allows for the court’s closed days, and saves the date to the matter’s calendar and reminders.</p></div></div>
  <p class="wb-flag">${wbIc('alert')}<span>This is an aid for counting, not legal advice. The periods are a starting set written from the statutes — check each against the current text, and the court’s own holidays, before you rely on it. Criminal appeals, writ petitions and tax statutes are not included; add your own periods for those.</span></p>
  <div class="dash-grid" id="dlRoot">
    <div class="wb-col">
      <div class="card card-pad"><h2>Calculate</h2><div id="dlForm">${dlFormHtml()}</div></div>
      <div class="card card-pad" id="dlResult">${dlResultHtml()}</div>
    </div>
    <div class="wb-col">
      <div class="card card-pad"><h2>Saved deadlines</h2><p class="hint">These appear on the Calendar, the Today page and Reminders.</p><div id="dlSaved">${dlSavedHtml()}</div></div>
      <div class="card card-pad"><h2>When the court is closed</h2><div id="dlClosures">${dlClosuresHtml()}</div></div>
      <div class="card card-pad"><h2>Your own periods</h2><div id="dlCustom">${dlCustomHtml()}</div></div>
    </div>
  </div>`;
}

const dlPaint = () => {
  for (const [id, fn] of [['dlResult', dlResultHtml], ['dlSaved', dlSavedHtml], ['dlClosures', dlClosuresHtml], ['dlCustom', dlCustomHtml], ['dlForm', dlFormHtml]]) {
    const el = $(`#${id}`);
    if (el) el.innerHTML = fn();
  }
};

function dlSummary(r) {
  const m = dlUi.matterId ? matterById(dlUi.matterId) : null;
  return `${r.rule.name}${m ? ` — ${m.title}` : ''}\nLast date: ${Limitation.weekday(r.lastDate)}, ${Limitation.fmtLong(r.lastDate)}\n${r.rule.source}\n\n${r.steps.join('\n')}\n\n(An aid for counting, not legal advice. Check the statute and the court’s holidays.)`;
}

function dlOpenAdd(r) {
  wbOpenModal({
    eyebrow: 'Deadlines', title: 'Add to calendar and reminders',
    html: `<form class="wb-form">
      <label>Matter<select name="matter" required><option value="">Choose a matter…</option>${MATTERS.map(m => `<option value="${esc(m.id)}"${m.id === dlUi.matterId ? ' selected' : ''}>${esc(m.title)}</option>`).join('')}</select></label>
      <label>Title<input name="title" required maxlength="200" value="${esc(r.rule.name)}" /></label>
      <label>Last date<input value="${esc(`${Limitation.weekday(r.lastDate)}, ${Limitation.fmtLong(r.lastDate)}`)}" readonly /></label>
      <label>Note (optional)<textarea name="note" maxlength="1000" placeholder="e.g. certified copy applied for on 4 Sept"></textarea></label>
      <p class="hint" style="margin-top:10px">A reminder is prepared two days before, on the Reminders page.</p>
      <div class="modal-actions">${wbCancelButton}<button class="btn btn-primary" type="submit">Add deadline</button></div></form>`,
    onSubmit: e => {
      const els = e.target.elements, matterId = els.matter.value, title = els.title.value.trim();
      if (!matterById(matterId) || !title) return;
      const d = { id: uid('dl'), matterId, title, date: r.lastDate, ruleId: r.rule.id, note: els.note.value.trim(), done: false };
      dl.saved.push(d); dlPublish(d); dlSave(); closeModals(); dlPaint();
      showToast(`Added to ${matterById(matterId).title}: ${Limitation.fmtLong(d.date)}.`);
    }
  });
}

function dlOpenCustom() {
  wbOpenModal({
    eyebrow: 'Deadlines', title: 'Add a period',
    html: `<form class="wb-form">
      <label>Name<input name="name" required maxlength="120" placeholder="e.g. Appeal under High Court Rule 12" /></label>
      <div class="form-grid"><label>Length<input type="number" name="amount" min="1" max="5000" required value="30" /></label><label>Unit<select name="unit"><option value="days">days</option><option value="months">months</option><option value="years">years</option></select></label></div>
      <label>What the start date is<input name="trigger" required maxlength="200" placeholder="e.g. Date of the order" /></label>
      <label>Source (optional)<input name="source" maxlength="200" placeholder="e.g. Rule 12, Bombay High Court Appellate Side Rules" /></label>
      <label class="wb-check"><input type="checkbox" name="copy" /><span>Time to get a certified copy is left out (appeals and reviews)</span></label>
      <div class="modal-actions">${wbCancelButton}<button class="btn btn-primary" type="submit">Add period</button></div></form>`,
    onSubmit: e => {
      const f = new FormData(e.target);
      const made = Limitation.makeCustomRule({ name: f.get('name'), trigger: f.get('trigger'), amount: f.get('amount'), unit: f.get('unit'), source: f.get('source'), copy: f.has('copy') });
      if (made.error) { showToast(made.error); return; }
      dl.custom.push(made.rule);
      dlUi.ruleId = made.rule.id;
      dlSave(); closeModals(); dlPaint();
    }
  });
}

function bindDeadlines() {
  const root = $('#dlRoot');
  if (!root) return;
  root.addEventListener('click', e => {
    const el = e.target.closest('[data-dl]');
    if (!el) return;
    const act = el.dataset.dl, id = el.dataset.id;
    if (act === 'add') { const r = dlCalc(); if (!r.error) dlOpenAdd(r); }
    else if (act === 'copy') {
      const r = dlCalc();
      if (r.error) return;
      (navigator.clipboard?.writeText(dlSummary(r)) || Promise.reject()).then(() => showToast('Summary copied.'), () => showToast('Your browser would not copy it. Select the text and copy it by hand.'));
    } else if (act === 'done') { const d = dl.saved.find(x => x.id === id); if (d) { d.done = !d.done; d.done ? dlUnpublish(d.id) : dlPublish(d); dlSave(); dlPaint(); } }
    else if (act === 'del') { dlUnpublish(id); dl.saved = dl.saved.filter(x => x.id !== id); dlSave(); dlPaint(); }
    else if (act === 'closure-del') { dl.closures = dl.closures.filter(x => x.id !== id); dlSave(); dlPaint(); }
    else if (act === 'custom-del') {
      if (!confirm('Remove this period? Deadlines already saved from it stay on the calendar.')) return;
      dl.custom = dl.custom.filter(x => x.id !== id);
      if (dlUi.ruleId === id) dlUi.ruleId = 'appeal-hc';
      dlSave(); dlPaint();
    } else if (act === 'custom-add') dlOpenCustom();
  });
  root.addEventListener('change', e => {
    const key = e.target.dataset.dlChange;
    if (!key) return;
    if (key === 'matter') dlUi.matterId = e.target.value;
    else if (key === 'rule') { dlUi.ruleId = e.target.value; dlUi.exclude = 0; }
    else if (key === 'saturday') { dl.weekly.saturday = e.target.value; dlSave(); }
    if (key === 'rule') dlPaint(); else $('#dlResult').innerHTML = dlResultHtml();
  });
  root.addEventListener('input', e => {
    const key = e.target.dataset.dlInput;
    if (!key) return;
    if (key === 'start') dlUi.start = e.target.value;
    else if (key === 'exclude') dlUi.exclude = Number(e.target.value) || 0;
    $('#dlResult').innerHTML = dlResultHtml();
  });
  root.addEventListener('submit', e => {
    e.preventDefault();
    if (e.target.dataset.dlSubmit !== 'closure') return;
    const els = e.target.elements, from = els.from.value, to = els.to.value || from;
    if (!dlIsoOk(from) || !dlIsoOk(to) || to < from) { showToast('Closed-until must not be before closed-from.'); return; }
    dl.closures.push({ id: uid('cl'), from, to, label: els.label.value.trim().slice(0, 80) });
    dlSave(); dlPaint();
  });
}

dlLoad();
