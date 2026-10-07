/* =============================================================================
   PAGE: REMINDERS — WhatsApp reminders for hearings and deadlines (reminders.js has the logic).

   What it does: prepares each message, shows what is due today, and gives a "Send on WhatsApp" link that
   opens WhatsApp with the message typed, so the lawyer taps Send. It cannot send by itself — that needs
   the WhatsApp Business platform and a server, and this app has neither. Client numbers, consent, the
   templates, custom reminders and which ones were sent are kept in this browser's localStorage.
   Loaded after app.js, reminders.js and workbench.js (it reuses wbOpenModal).
   ============================================================================= */
const RM_KEY = 'legalai.reminders.v1';
const rm = { contacts: {}, templates: {}, firm: 'Kamat & Partners', me: { name: 'Shreyas A.', phone: '' }, custom: [], state: { off: {}, sent: {}, edits: {} }, warned: false };

const rmStr = (v, n = 200) => String(v ?? '').slice(0, n);
const rmDate = v => !!Reminders.fmtDay(v);
const rmFmt = s => esc(s).replace(/\*(.+?)\*/g, '<b>$1</b>').replace(/\n/g, '<br>');         // WhatsApp's *bold*

function rmLoad() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(RM_KEY) || 'null'); } catch { saved = null; }
  if (!saved || saved.v !== 1) return;
  for (const [id, c] of Object.entries(saved.contacts && typeof saved.contacts === 'object' ? saved.contacts : {})) {
    if (matterById(id) && c && typeof c === 'object') rm.contacts[id] = { name: rmStr(c.name, 80), phone: rmStr(c.phone, 30), consent: !!c.consent };
  }
  for (const k of ['hearing', 'deadline']) if (typeof saved.templates?.[k] === 'string' && saved.templates[k].trim()) rm.templates[k] = rmStr(saved.templates[k], 1000);
  if (typeof saved.firm === 'string' && saved.firm.trim()) rm.firm = rmStr(saved.firm, 80);
  if (saved.me && typeof saved.me === 'object') rm.me = { name: rmStr(saved.me.name, 80) || rm.me.name, phone: rmStr(saved.me.phone, 30) };
  rm.custom = (Array.isArray(saved.custom) ? saved.custom : []).filter(c => c && typeof c === 'object' && rmDate(c.date) && typeof c.body === 'string' && c.body.trim())
    .map(c => ({ id: rmStr(c.id, 40) || uid('rm'), matterId: matterById(c.matterId) ? c.matterId : '', toKind: c.toKind === 'client' ? 'client' : 'me', date: c.date, time: /^\d{1,2}:\d{2}$/.test(c.time) ? c.time : '', body: rmStr(c.body, 2000) }));
  const keyed = obj => Object.fromEntries(Object.entries(obj && typeof obj === 'object' ? obj : {}).filter(([k]) => k.length < 200));
  rm.state = {
    off: Object.fromEntries(Object.keys(keyed(saved.state?.off)).map(k => [k, true])),
    sent: Object.fromEntries(Object.entries(keyed(saved.state?.sent)).map(([k, v]) => [k, rmStr(v, 30)])),
    edits: Object.fromEntries(Object.entries(keyed(saved.state?.edits)).filter(([, v]) => typeof v === 'string').map(([k, v]) => [k, rmStr(v, 2000)]))
  };
}
function rmSave() {
  try { localStorage.setItem(RM_KEY, JSON.stringify({ v: 1, contacts: rm.contacts, templates: rm.templates, firm: rm.firm, me: rm.me, custom: rm.custom, state: rm.state })); }
  catch { if (!rm.warned) { rm.warned = true; showToast('This browser would not keep your changes — they will be lost when you reload.'); } }
}

/* a matter's client: what was saved, else the name from the sample client list and no number yet */
const rmContact = id => ({ name: CLIENTS[id]?.name || '', phone: '', consent: false, ...(rm.contacts[id] || {}) });
function rmBuild() {
  const contacts = Object.fromEntries(MATTERS.map(m => [m.id, rmContact(m.id)]));
  contacts._me = rm.me;
  return Reminders.build({ hearings: HEARINGS, deadlines: DEADLINES, custom: rm.custom, titleOf: id => matterById(id)?.title || '', contacts, templates: rm.templates, firm: rm.firm, today: TODAY_ISO, state: rm.state });
}
const rmDueCount = () => rmBuild().filter(r => r.status === 'due').length;

/* ── the page ────────────────────────────────────────────────────────────── */
const rmChip = r => ({ due: '<span class="chip chip-amber">Due</span>', upcoming: '<span class="chip chip-navy">Upcoming</span>', sent: '<span class="chip chip-teal">Marked sent</span>', off: '<span class="chip chip-navy">Off</span>' })[r.status];

function rmCard(r) {
  const b = dayBadge(r.sendDate), m = matterById(r.matterId);
  const who = r.toKind === 'client' ? (r.toName || 'The client') : (r.toName || 'You');
  const number = r.phone ? Reminders.formatPhone(r.phone) : (r.toKind === 'client' ? 'no number yet' : 'you choose the chat in WhatsApp');
  const send = r.blocker
    ? `<button type="button" class="btn btn-ghost btn-sm" data-rm="contact" data-matter="${esc(r.matterId)}">${wbIc('users')}Add contact</button>`
    : `<a class="btn btn-teal btn-sm" href="${esc(r.link)}" target="_blank" rel="noopener noreferrer" data-rm="send" data-key="${esc(r.key)}">${wbIc('whatsapp')}Send on WhatsApp</a>`;
  return `
  <div class="rm-card${r.status === 'off' ? ' off' : ''}" data-key="${esc(r.key)}">
    <div class="reminder-date"><b>${b.num}</b><span>${b.mon}</span></div>
    <div class="rm-main">
      <div class="rm-title"><strong>${esc(r.type)}</strong>${rmChip(r)}${r.edited ? '<span class="chip chip-violet">Edited</span>' : ''}</div>
      <small>To ${esc(who)} · ${esc(number)} · ${r.status === 'sent' ? `marked sent ${esc(r.sentAt.replace('T', ' '))}` : `send ${esc(r.sendTime)}`}</small>
      ${m ? `<small class="reminder-matter">${esc(m.title)}</small>` : ''}
      <div class="rm-msg">${rmFmt(r.body)}</div>
      ${r.blocker && r.status !== 'sent' && r.status !== 'off' ? `<p class="rm-blocker">${wbIc('alert')}${esc(r.blocker)}</p>` : ''}
      <div class="rm-actions">
        ${r.status === 'sent' ? `<button type="button" class="btn btn-ghost btn-sm" data-rm="unsend" data-key="${esc(r.key)}">Mark as not sent</button>` : r.status === 'off' ? '' : send}
        <button type="button" class="btn-text" data-rm="copy" data-key="${esc(r.key)}">${wbIc('copy')}Copy</button>
        <button type="button" class="btn-text" data-rm="edit" data-key="${esc(r.key)}">${wbIc('edit')}Edit message</button>
        ${r.kind === 'custom' ? `<button type="button" class="btn-text wb-danger" data-rm="remove" data-id="${esc(r.customId)}">Remove</button>` : ''}
      </div>
    </div>
    ${r.status === 'sent' ? '' : `<button type="button" class="switch${r.status === 'off' ? '' : ' on'}" data-rm="toggle" data-key="${esc(r.key)}" role="switch" aria-checked="${r.status !== 'off'}" aria-label="Remind me about this"></button>`}
  </div>`;
}

function rmListsHtml(list) {
  const due = list.filter(r => r.status === 'due'), up = list.filter(r => r.status === 'upcoming'), rest = list.filter(r => r.status === 'sent' || r.status === 'off');
  const section = (eyebrow, title, rows, empty, extra = '') => `<div class="card card-pad"><div class="card-head"><div><p class="eyebrow">${eyebrow}</p><h2>${title}</h2></div><span class="chip chip-navy">${rows.length}</span></div>${rows.length ? rows.map(rmCard).join('') : `<p class="empty-note">${empty}</p>`}${extra}</div>`;
  return `${section('Today', 'Due now', due, 'Nothing is due. Reminders appear here on the day they should go out.')}
    ${section('Scheduled', 'Upcoming', up, 'No upcoming reminders.')}
    ${rest.length ? section('History', 'Sent and switched off', rest, '') : ''}`;
}

function rmPreviewHtml(list) {
  const next = list.find(r => r.status === 'due') || list.find(r => r.status === 'upcoming');
  if (!next) return '<p class="empty-note">Nothing to preview.</p>';
  const name = next.toKind === 'client' ? (next.toName || 'Client') : (next.toName || 'You');
  return `<p class="hint">Exactly what ${esc(name)} will see once you tap Send.</p>
    <div class="wa-phone"><div class="wa-head"><span class="wa-avatar">${esc(name.slice(0, 1))}</span><div class="wa-head-copy"><strong>${esc(name)}</strong><small>${esc(next.phone ? Reminders.formatPhone(next.phone) : 'WhatsApp')}</small></div>${wbIc('whatsapp')}</div>
      <div class="wa-body"><div class="wa-bubble">${rmFmt(next.body)}<time>${esc(next.sendTime)}</time></div><p class="wa-date">For ${esc(Reminders.fmtDay(next.sendDate))}</p></div></div>`;
}

function rmContactsHtml() {
  return MATTERS.map(m => {
    const c = rmContact(m.id), ok = Reminders.normalizePhone(c.phone);
    return `<button type="button" class="rm-contact" data-rm="contact" data-matter="${esc(m.id)}"><span><strong>${esc(m.title)}</strong><small>${esc(c.name || 'No client name')} · ${ok ? esc(Reminders.formatPhone(ok)) : 'no number'}</small></span>${ok && c.consent ? '<span class="chip chip-teal">Ready</span>' : '<span class="chip chip-amber">Set up</span>'}</button>`;
  }).join('');
}

function rmTemplatesHtml() {
  const t = k => rm.templates[k] || Reminders.DEFAULT_TEMPLATES[k];
  const field = (k, label) => `<label class="rm-field">${label}<textarea data-rm-change="tpl-${k}" rows="3" maxlength="1000">${esc(t(k))}</textarea></label>
    <p class="rm-hint">${Reminders.unknownFields(t(k)).length ? `<span class="wb-danger">Unknown field: ${esc(Reminders.unknownFields(t(k)).map(x => `{${x}}`).join(' '))}</span>` : ''}${rm.templates[k] ? `<button type="button" class="btn-text" data-rm="tpl-reset" data-k="${k}">Reset to the standard message</button>` : ''}</p>`;
  return `<p class="hint">Fields you can use: ${Reminders.PLACEHOLDERS.map(p => `<code title="${esc(p.hint)}">{${p.key}}</code>`).join(' ')}. Wrap words in *stars* to bold them in WhatsApp.</p>
    ${field('hearing', 'Hearing reminder (to the client)')}${field('deadline', 'Deadline reminder (to you)')}
    <label class="rm-field">Your firm’s name<input data-rm-change="firm" maxlength="80" value="${esc(rm.firm)}" /></label>
    <label class="rm-field">Your WhatsApp number<input data-rm-change="me-phone" maxlength="30" value="${esc(rm.me.phone)}" placeholder="So reminders to you open your own chat" /></label>`;
}

function pageReminders() {
  const list = rmBuild();
  return `
  <div class="page-head"><div class="page-head-text"><p class="eyebrow">Court &amp; clients</p><h1>Reminders</h1><p class="lede">Hearing and deadline reminders, prepared for you and your clients. Tap <b>Send on WhatsApp</b> and WhatsApp opens with the message already typed.</p></div><button class="btn btn-primary" data-rm="new" type="button">${wbIc('plus')}New reminder</button></div>
  <div class="wa-banner section"><div class="wa-banner-icon">${wbIc('whatsapp')}</div><div class="wa-banner-copy"><strong>You tap Send — LegalAI does not send by itself</strong><small>Sending on its own needs the WhatsApp Business platform and a server, which this app does not have. Reminders are prepared and tracked here; the message goes from your own WhatsApp.</small></div></div>
  <div class="dash-grid" id="rmRoot">
    <div class="wb-col" id="rmLists">${rmListsHtml(list)}</div>
    <div class="wb-col">
      <div class="card card-pad"><p class="eyebrow">Preview</p><h2 style="margin-bottom:2px">Next message</h2><div id="rmPreview">${rmPreviewHtml(list)}</div></div>
      <div class="card card-pad"><h2>Client contacts</h2><p class="hint">A client message needs a WhatsApp number and the client’s agreement to receive it.</p><div id="rmContacts">${rmContactsHtml()}</div></div>
      <div class="card card-pad"><h2>Messages and your details</h2><div id="rmTemplates">${rmTemplatesHtml()}</div></div>
    </div>
  </div>`;
}

function rmPaint(all = false) {
  const list = rmBuild();
  const set = (id, html) => { const el = $(`#${id}`); if (el) el.innerHTML = html; };
  set('rmLists', rmListsHtml(list)); set('rmPreview', rmPreviewHtml(list)); set('rmContacts', rmContactsHtml());
  if (all) set('rmTemplates', rmTemplatesHtml());
  const badge = $('.nav-item[href="#/reminders"]');                         // keep the sidebar count in step
  if (badge) { const n = list.filter(r => r.status === 'due').length; let em = $('em', badge); if (n && !em) { em = document.createElement('em'); badge.appendChild(em); } if (em) { em.textContent = n; em.hidden = !n; } }
}

function rmOpenContact(matterId) {
  const m = matterById(matterId);
  if (!m) return;
  const c = rmContact(matterId);
  wbOpenModal({
    eyebrow: 'Reminders', title: 'Client contact',
    html: `<form class="wb-form"><p class="hint" style="margin:0">${esc(m.title)}</p>
      <label>Client name<input name="name" maxlength="80" value="${esc(c.name)}" /></label>
      <label>WhatsApp number<input name="phone" maxlength="30" value="${esc(c.phone)}" placeholder="98123 45678 or +44 20 7946 0958" /></label>
      <p class="hint" style="margin:4px 0 0">A number without + is taken as Indian. Other countries need a +.</p>
      <label class="wb-check"><input type="checkbox" name="consent"${c.consent ? ' checked' : ''} /><span>The client has agreed to receive WhatsApp messages about this matter</span></label>
      <div class="modal-actions">${wbCancelButton}<button class="btn btn-primary" type="submit">Save</button></div></form>`,
    onSubmit: e => {
      const els = e.target.elements, phone = els.phone.value.trim();
      if (phone && !Reminders.normalizePhone(phone)) { showToast('That does not look like a WhatsApp number. Check the digits, and add a + for a number outside India.'); return; }
      rm.contacts[matterId] = { name: els.name.value.trim().slice(0, 80), phone, consent: els.consent.checked };
      rmSave(); closeModals(); rmPaint();
    }
  });
}

function rmOpenNew() {
  wbOpenModal({
    eyebrow: 'Reminders', title: 'New reminder',
    html: `<form class="wb-form">
      <label>Matter (optional)<select name="matter"><option value="">— none —</option>${MATTERS.map(m => `<option value="${esc(m.id)}">${esc(m.title)}</option>`).join('')}</select></label>
      <label>Send to<select name="to"><option value="me">Me</option><option value="client">The matter’s client</option></select></label>
      <div class="form-grid"><label>Day<input type="date" name="date" required value="${TODAY_ISO}" /></label><label>Time<input type="time" name="time" value="09:00" /></label></div>
      <label>Message<textarea name="body" required maxlength="2000" placeholder="e.g. Please bring the original sale deed to court tomorrow."></textarea></label>
      <div class="modal-actions">${wbCancelButton}<button class="btn btn-primary" type="submit">Add reminder</button></div></form>`,
    onSubmit: e => {
      const els = e.target.elements, body = els.body.value.trim(), date = els.date.value;
      if (!body || !rmDate(date)) return;
      if (els.to.value === 'client' && !els.matter.value) { showToast('Pick the matter, so LegalAI knows which client to send to.'); return; }
      rm.custom.push({ id: uid('rm'), matterId: els.matter.value, toKind: els.to.value === 'client' ? 'client' : 'me', date, time: els.time.value, body });
      rmSave(); closeModals(); rmPaint();
    }
  });
}

function rmOpenEdit(r) {
  wbOpenModal({
    eyebrow: 'Reminders', title: 'Edit message',
    html: `<form class="wb-form"><p class="hint" style="margin:0">${esc(r.type)}${matterById(r.matterId) ? ` · ${esc(matterById(r.matterId).title)}` : ''}</p>
      <label>Message<textarea name="body" required maxlength="2000" style="height:140px">${esc(r.body)}</textarea></label>
      <div class="modal-actions">${r.edited && r.kind !== 'custom' ? `<button type="button" class="btn btn-ghost" data-rm-reset style="margin-right:auto">Use the standard message</button>` : ''}${wbCancelButton}<button class="btn btn-primary" type="submit">Save</button></div></form>`,
    onClick: e => { if (e.target.closest('[data-rm-reset]')) { delete rm.state.edits[r.key]; rmSave(); closeModals(); rmPaint(); } },
    onSubmit: e => {
      const body = e.target.elements.body.value.trim();
      if (!body) return;
      if (r.kind === 'custom') { const c = rm.custom.find(x => x.id === r.customId); if (c) c.body = body; }
      else if (body === r.original) delete rm.state.edits[r.key]; else rm.state.edits[r.key] = body;
      rmSave(); closeModals(); rmPaint();
    }
  });
}

function bindReminders() {
  const root = $('#rmRoot');
  if (!root) return;
  $('[data-rm="new"]')?.addEventListener('click', rmOpenNew);
  const find = key => rmBuild().find(r => r.key === key);
  root.addEventListener('click', e => {
    const el = e.target.closest('[data-rm]');
    if (!el) return;
    const act = el.dataset.rm, key = el.dataset.key;
    if (act === 'send') {                                                       // the link itself opens WhatsApp; this only records it
      rm.state.sent[key] = new Date().toISOString().slice(0, 16);
      rmSave();
      setTimeout(() => { rmPaint(); showToast('WhatsApp opened with the message — tap Send there. Marked as sent.'); }, 200);
    } else if (act === 'unsend') { delete rm.state.sent[key]; rmSave(); rmPaint(); }
    else if (act === 'toggle') { if (rm.state.off[key]) delete rm.state.off[key]; else rm.state.off[key] = true; rmSave(); rmPaint(); }
    else if (act === 'copy') { const r = find(key); if (r) (navigator.clipboard?.writeText(r.body) || Promise.reject()).then(() => showToast('Message copied.'), () => showToast('Your browser would not copy it. Use Edit message and copy from there.')); }
    else if (act === 'edit') { const r = find(key); if (r) rmOpenEdit(r); }
    else if (act === 'remove') { if (confirm('Remove this reminder?')) { rm.custom = rm.custom.filter(c => c.id !== el.dataset.id); rmSave(); rmPaint(); } }
    else if (act === 'contact') rmOpenContact(el.dataset.matter);
    else if (act === 'tpl-reset') { delete rm.templates[el.dataset.k]; rmSave(); rmPaint(true); }
  });
  root.addEventListener('change', e => {
    const k = e.target.dataset.rmChange;
    if (!k) return;
    if (k === 'tpl-hearing' || k === 'tpl-deadline') {
      const name = k.slice(4), v = e.target.value.trim();
      if (!v || v === Reminders.DEFAULT_TEMPLATES[name]) delete rm.templates[name]; else rm.templates[name] = v.slice(0, 1000);
    } else if (k === 'firm') rm.firm = e.target.value.trim().slice(0, 80) || 'Kamat & Partners';
    else if (k === 'me-phone') {
      const v = e.target.value.trim();
      if (v && !Reminders.normalizePhone(v)) { showToast('That does not look like a WhatsApp number.'); return; }
      rm.me.phone = v;
    }
    rmSave(); rmPaint(true);
  });
}

rmLoad();
