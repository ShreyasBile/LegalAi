/* =============================================================================
   BUILD THE CASE — the Research, Evidence, Drafting and Arguments tabs of a matter.

   These tabs change the matter's own arrays (authorities, documents, timeline, arguments,
   counterArgs, drafts, notes) in place, so every other page that reads them — Documents,
   Knowledge base, Hearing prep, Timeline — stays in step. What the user changes is kept in
   this browser's localStorage; nothing is sent anywhere. The document-format logic lives in
   drafting.js (unit-tested); this file is the screens and the saving.

   Loaded after app.js and drafting.js. app.js calls tabResearch / tabEvidence / tabDrafting /
   tabArguments, wbBindMatterDetail, wbPinAuthority, wbAuthorityFromCard and wbSaveChatAnswer.
   ============================================================================= */
const WB_KEY = 'legalai.workbench.v1';
const WB_FIELDS = ['authorities', 'documents', 'timeline', 'arguments', 'counterArgs', 'drafts', 'notes'];
const wb = { touched: {}, formats: [], defaults: {}, audit: [], warned: false };      // what is saved
const wbUi = { draft: {}, mode: 'edit', results: null, req: 0, lastType: '', fmt: null };  // what is only on screen

const wbIc = name => `<svg class="ic"><use href="#i-${name}"/></svg>`;
const wbStr = (v, n = 500) => String(v ?? '').slice(0, n);
const wbShort = (s, n = 36) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const wbToday = () => parseISODateStr(TODAY_ISO).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const wbExtras = m => ({ cnr: ECOURTS[m.id]?.cnr || '', today: fmtDate(TODAY_ISO) });
const wbFormats = () => Drafting.allFormats(wb.formats);

/* ── saving and loading ──────────────────────────────────────────────────────
   Anything read back from storage is rebuilt field by field, so a damaged or edited
   entry can never put markup or odd types into the page. */
const WB_CLEAN = {
  authorities: a => ({ key: wbStr(a.key, 80), title: wbStr(a.title, 300), meta: wbStr(a.meta, 300), pdfUrl: wbStr(a.pdfUrl, 500), note: wbStr(a.note, 1000) }),
  documents: d => ({ id: wbStr(d.id, 40), name: wbStr(d.name, 200), type: /^[a-z]{2,5}$/.test(d.type) ? d.type : 'file', added: wbStr(d.added, 20), size: wbStr(d.size, 20), status: wbStr(d.status, 40) || 'Needs review', tool: wbStr(d.tool, 60), toolNote: wbStr(d.toolNote, 200), processing: !!d.processing, note: wbStr(d.note, 1000) }),
  timeline: t => ({ date: wbStr(t.date, 30), iso: /^\d{4}-\d{2}-\d{2}$/.test(t.iso) ? t.iso : '', title: wbStr(t.title, 200), note: wbStr(t.note, 1000), flag: !!t.flag, omitFromDrafts: !!t.omitFromDrafts }),
  arguments: a => ({ point: wbStr(a.point, 500), support: wbStr(a.support, 1000), strength: Math.max(0, Math.min(100, Math.round(Number(a.strength)) || 0)), stressTest: wbStr(a.stressTest, 2000), links: Array.isArray(a.links) ? a.links.map(k => wbStr(k, 80)) : [] }),
  counterArgs: c => ({ point: wbStr(c.point, 500), rebuttal: wbStr(c.rebuttal, 1000) }),
  drafts: d => Drafting.normalizeDraft(d),
  notes: n => ({ id: wbStr(n.id, 40), text: wbStr(n.text, 6000), source: n.source === 'ask-ai' ? 'ask-ai' : 'manual', createdAt: wbStr(n.createdAt, 30) })
};

function wbEnsure(m) {
  for (const k of WB_FIELDS) if (!Array.isArray(m[k])) m[k] = [];
  m.authorities.forEach(a => { if (!a.key) a.key = uid('auth'); });
  return m;
}

function wbMigrateDraft(m, d) {                       // a sample draft that predates formats: rebuild it from its format
  const f = Drafting.defaultFormatFor(wbFormats(), wb.defaults, d.docType || d.title);
  return f ? Drafting.createDraft(f, m, { title: d.title, extras: wbExtras(m) }) : null;
}

function wbLoad() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(WB_KEY) || 'null'); } catch { saved = null; }
  if (saved && saved.v === 1) {
    wb.formats = (Array.isArray(saved.formats) ? saved.formats : []).map(f => Drafting.normalizeFormat(f)).filter(f => f.name && f.docType && f.sections.length);
    for (const [type, id] of Object.entries(saved.defaults && typeof saved.defaults === 'object' ? saved.defaults : {})) if (typeof id === 'string') wb.defaults[type] = id;
    wb.audit = (Array.isArray(saved.audit) ? saved.audit : []).filter(a => a && typeof a === 'object').slice(0, 50)
      .map(a => ({ time: wbStr(a.time, 30), agent: wbStr(a.agent, 80), action: wbStr(a.action, 300), matter: wbStr(a.matter, 120), status: 'approve' }));
    for (const [id, data] of Object.entries(saved.matters && typeof saved.matters === 'object' ? saved.matters : {})) {
      const m = matterById(id);
      if (!m || !data || typeof data !== 'object') continue;
      for (const k of WB_FIELDS) if (Array.isArray(data[k])) m[k] = data[k].filter(x => x && typeof x === 'object').map(WB_CLEAN[k]);
      wb.touched[id] = true;
    }
  }
  for (const m of MATTERS) {
    wbEnsure(m);
    m.drafts = m.drafts.map(d => (Array.isArray(d.sections) ? d : wbMigrateDraft(m, d))).filter(Boolean);
  }
  AUDIT_LOG.unshift(...wb.audit);
}

function wbSave(matterId) {
  if (matterId) wb.touched[matterId] = true;
  clearTimeout(wbSaveTimer); wbSaveTimer = null;
  const matters = {};
  for (const id of Object.keys(wb.touched)) {
    const m = matterById(id);
    if (m) matters[id] = Object.fromEntries(WB_FIELDS.map(k => [k, m[k]]));
  }
  try { localStorage.setItem(WB_KEY, JSON.stringify({ v: 1, matters, formats: wb.formats, defaults: wb.defaults, audit: wb.audit })); }
  catch { if (!wb.warned) { wb.warned = true; showToast('This browser would not keep your changes — they will be lost when you reload.'); } }
}
let wbSaveTimer = null;
function wbSaveSoon(matterId) { wb.touched[matterId] = true; clearTimeout(wbSaveTimer); wbSaveTimer = setTimeout(() => wbSave(), 400); }
window.addEventListener('pagehide', () => { if (wbSaveTimer) wbSave(); });

/* ── plumbing shared by every tab ────────────────────────────────────────── */
function wbCtx() {
  const { parts } = parseHash();
  return { m: parts[0] === 'matters' ? matterById(parts[1]) : null, tab: parts[2] || 'overview' };
}
const wbGrow = ta => { ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight + 2}px`; };
const wbAfterRender = root => $$('.wb-ta', root).forEach(wbGrow);
function wbRefresh() {                                // repaint the open tab in place (keeps the scroll position)
  const { m, tab } = wbCtx(), root = $('#matterTabContent');
  if (!m || !root) return;
  root.innerHTML = matterTab(m, tab);
  wbAfterRender(root);
}

const WB_CLICK = {}, WB_INPUT = {}, WB_CHANGE = {}, WB_SUBMIT = {};

function wbBindMatterDetail() {
  const { m, tab } = wbCtx();
  if (!m) return;
  wbEnsure(m);
  $$('[data-action="add-evidence"]').forEach(b => b.addEventListener('click', () => wbOpenEvidenceForm(wbCtx().m)));
  const root = $('#matterTabContent');
  if (!root || !['research', 'evidence', 'drafting', 'arguments'].includes(tab)) return;
  root.addEventListener('click', e => { const el = e.target.closest('[data-wb]'); if (el && root.contains(el)) WB_CLICK[el.dataset.wb]?.(el, wbCtx().m, e); });
  root.addEventListener('input', e => { const el = e.target.closest('[data-wb-input]'); if (el) WB_INPUT[el.dataset.wbInput]?.(el, wbCtx().m); });
  root.addEventListener('change', e => { const el = e.target.closest('[data-wb-change]'); if (el) WB_CHANGE[el.dataset.wbChange]?.(el, wbCtx().m); });
  root.addEventListener('submit', e => { const f = e.target.closest('form[data-wb-submit]'); if (!f) return; e.preventDefault(); WB_SUBMIT[f.dataset.wbSubmit]?.(f, wbCtx().m); });
  wbAfterRender(root);
}

/* One dialog element serves every form here. Its handlers are replaced on each open, so they never pile up. */
function wbOpenModal({ eyebrow, title, html, wide = false, focus = true, onSubmit, onClick, onInput, onChange, onFocus }) {
  const modal = $('#wbModal');
  if (!modal) return;
  modal.classList.toggle('wb-wide', wide);
  modal.setAttribute('aria-label', title);
  modal.innerHTML = `<header><div><p class="eyebrow">${esc(eyebrow)}</p><h2>${esc(title)}</h2></div><button type="button" class="icon-btn" data-wb-close aria-label="Close">${wbIc('close')}</button></header><div class="wb-modal-body">${html}</div>`;
  modal.onclick = e => { if (e.target.closest('[data-wb-close]')) { closeModals(); return; } onClick?.(e); };
  modal.oninput = onInput || null;
  modal.onchange = onChange || null;
  if (modal._wbFocus) modal.removeEventListener('focusin', modal._wbFocus);        // there is no onfocusin property to assign
  modal._wbFocus = onFocus || null;
  if (onFocus) modal.addEventListener('focusin', onFocus);
  modal.onsubmit = e => { e.preventDefault(); onSubmit?.(e); };
  openModal('#wbModal');
  if (focus) setTimeout(() => modal.querySelector('input:not([type=file]):not([type=checkbox]), textarea, select')?.focus(), 60);
}
const wbCancelButton = '<button type="button" class="btn btn-ghost" data-wb-close>Cancel</button>';

/* =============================================================================
   RESEARCH
   ============================================================================= */
const wbPinned = (m, a) => m.authorities.some(x => (a.key && x.key === a.key) || x.title.trim().toLowerCase() === a.title.trim().toLowerCase());

function wbAuthorityFromCard(c) {                     // a result from the case-law service
  return { key: c.key || '', title: clCardTitle(c), meta: [c.year, c.citation || c.neutralCitation || c.cnr, c.courtName].filter(Boolean).join(' · '), pdfUrl: clSafePdf(c.pdfUrl) || '' };
}
const wbAuthorityFromSample = c => ({ key: c.key, title: c.title, meta: `${c.year} · ${c.cite} · ${c.court}`, pdfUrl: '' });

function wbPinAuthority(matterId, a) {
  const m = matterById(matterId);
  if (!m || !a || !a.title) return false;
  wbEnsure(m);
  if (wbPinned(m, a)) { showToast(`${a.title} is already in ${m.title}.`); return false; }
  m.authorities.push({ key: a.key || uid('auth'), title: a.title, meta: a.meta || '', pdfUrl: a.pdfUrl || '', note: '' });
  wbSave(m.id);
  return true;
}

function wbSaveChatAnswer(matterId, msg) {            // "Save to matter" on an Ask AI answer
  const m = matterById(matterId);
  if (!m || !msg) return false;
  wbEnsure(m);
  const plain = new DOMParser().parseFromString(String(msg.text || '').replace(/<cite>(\d+)<\/cite>/g, '[$1]').replace(/<p>/g, '\n\n'), 'text/html').body.textContent.replace(/\n{3,}/g, '\n\n').trim();
  const sources = (msg.citations || []).map(c => `[${c.n}] ${c.title}${c.meta ? ` (${c.meta})` : ''}`).join('\n');
  const text = sources ? `${plain}\n\nSources:\n${sources}` : plain;
  if (m.notes.some(n => n.text === text)) { showToast('That answer is already in this matter’s research notes.'); return false; }
  m.notes.unshift({ id: uid('note'), text, source: 'ask-ai', createdAt: wbToday() });
  wbSave(m.id);
  return true;
}

function wbResultsHtml(m) {
  const r = wbUi.results;
  if (!r || r.matterId !== m.id) return '<p class="hint wb-mt">Try “Maneka Gandhi”, “2021 INSC 306” or “anticipatory bail”.</p>';
  if (r.busy) return '<p class="hint wb-mt">Searching…</p>';
  if (r.error) return `<p class="wb-flag">${wbIc('alert')}<span>${esc(r.error)}</span></p>`;
  const note = r.sample ? `<p class="wb-flag">${wbIc('alert')}<span>The case-law service is offline, so these are built-in sample judgments, not live results. Start it to search every court.</span></p>` : '';
  if (!r.items.length) return `${note}<p class="empty-note">No results for “${esc(r.q)}”.</p>`;
  return note + r.items.map((a, i) => `
    <div class="wb-result"><div class="authority-copy"><strong>${esc(a.title)}</strong><small>${esc(a.meta)}</small></div>
      ${wbPinned(m, a) ? '<span class="chip chip-teal">Pinned</span>' : `<button type="button" class="btn btn-ghost btn-sm" data-wb="auth-pin" data-i="${i}">${wbIc('bookmark')}Pin</button>`}</div>`).join('');
}
const wbPaintResults = m => { const box = $('#wbResults'); if (box) box.innerHTML = wbResultsHtml(m); };

async function wbSearchAuthorities(m, q) {
  const my = ++wbUi.req;
  wbUi.results = { matterId: m.id, q, busy: true, items: [], sample: false };
  wbPaintResults(m);
  const r = await clFetchSearch({ q, pageSize: 6 });
  if (my !== wbUi.req) return;
  if (r.status === 'ok') wbUi.results = { matterId: m.id, q, busy: false, items: r.data.results.map(wbAuthorityFromCard), sample: false };
  else if (r.status === 'error') wbUi.results = { matterId: m.id, q, busy: false, items: [], sample: false, error: r.message };
  else {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const rows = CASELAW.filter(j => words.every(w => `${j.title} ${j.area} ${j.snippet} ${j.cite}`.toLowerCase().includes(w)));
    wbUi.results = { matterId: m.id, q, busy: false, items: rows.map(wbAuthorityFromSample), sample: true };
  }
  if ($('#wbResults')) wbPaintResults(wbCtx().m || m);
}

function wbAuthorityRow(a, i) {
  const pdf = clSafePdf(a.pdfUrl);
  return `<div class="authority-row"><div class="authority-num mono">${i + 1}</div>
    <div class="authority-copy"><strong>${esc(a.title)}</strong><small>${esc(a.meta)}</small>${a.note ? `<small class="wb-note">${esc(a.note)}</small>` : ''}
      ${pdf ? `<a class="btn-text wb-link" href="${esc(pdf)}" target="_blank" rel="noopener noreferrer">${wbIc('external')}Open PDF</a>` : ''}</div>
    <div class="wb-row-actions"><button type="button" class="icon-btn" data-wb="auth-edit" data-i="${i}" aria-label="Edit authority">${wbIc('edit')}</button><button type="button" class="icon-btn" data-wb="auth-del" data-i="${i}" aria-label="Remove authority">${wbIc('close')}</button></div></div>`;
}

function tabResearch(m) {
  wbEnsure(m);
  const threads = CONVERSATIONS.filter(c => c.matterId === m.id);
  const q = wbUi.results?.matterId === m.id ? wbUi.results.q : '';
  return `
  <div class="dash-grid">
    <div class="wb-col">
      <div class="card card-pad">
        <h2>Find authorities</h2>
        <p class="hint">Search reported judgments and pin the ones this matter relies on. Pinned authorities flow into your drafts.</p>
        <form class="wb-search" data-wb-submit="auth-search"><div class="search-box">${wbIc('research')}<input name="q" maxlength="200" autocomplete="off" aria-label="Search authorities" placeholder="Party name, citation or case number" value="${esc(q)}" /></div><button class="btn btn-teal btn-sm" type="submit">Search</button></form>
        <div id="wbResults">${wbResultsHtml(m)}</div>
      </div>
      <div class="card card-pad">
        <div class="card-head"><div><h2>Research history</h2><p class="hint">Conversations with LegalAI scoped to this matter.</p></div><a class="btn btn-ghost btn-sm" href="#/matters/${m.id}/chat">${wbIc('spark')}New question</a></div>
        ${threads.length ? threads.map(t => `<a class="list-row" href="#/matters/${m.id}/chat/${t.id}" style="text-decoration:none;color:inherit"><div class="review-icon">${wbIc('spark')}</div><div class="review-text"><strong>${esc(t.title)}</strong><small>${esc(t.updated)} · ${t.messages.filter(x => x.role === 'ai').length} answer${t.messages.filter(x => x.role === 'ai').length === 1 ? '' : 's'}</small></div>${wbIc('chevron').replace('class="ic"', 'class="ic" style="color:var(--faint)"')}</a>`).join('') : '<p class="empty-note">No research yet for this matter. Ask LegalAI a question to get started.</p>'}
      </div>
    </div>
    <div class="wb-col">
      <div class="card card-pad">
        <div class="card-head"><div><h2>Key authorities</h2><p class="hint">What this matter relies on, in the order you list it.</p></div><button type="button" class="btn btn-ghost btn-sm" data-wb="auth-add">${wbIc('plus')}Add</button></div>
        ${m.authorities.length ? m.authorities.map(wbAuthorityRow).join('') : '<p class="empty-note">No authorities pinned yet. Search above, or add one by hand.</p>'}
      </div>
      <div class="card card-pad">
        <h2>Research notes</h2>
        <p class="hint">Propositions, doubts, things to check. Use “Save to matter” on an Ask AI answer to keep it here.</p>
        <form class="wb-note-form" data-wb-submit="note-add"><textarea name="text" rows="3" maxlength="4000" aria-label="New research note" placeholder="Write a note…"></textarea><button class="btn btn-teal btn-sm" type="submit">Add note</button></form>
        ${m.notes.length ? m.notes.map((n, i) => `<div class="wb-note-item"><p>${esc(n.text)}</p><div class="wb-note-meta"><span>${esc(n.createdAt)}${n.source === 'ask-ai' ? ' · From Ask AI' : ''}</span><button type="button" data-wb="note-del" data-i="${i}">Remove</button></div></div>`).join('') : '<p class="empty-note">No notes yet.</p>'}
      </div>
    </div>
  </div>`;
}

WB_SUBMIT['auth-search'] = (form, m) => { const q = form.elements.q.value.trim(); if (q) wbSearchAuthorities(m, q); };
WB_CLICK['auth-pin'] = (el, m) => {
  const a = wbUi.results?.items[+el.dataset.i];
  if (a && wbPinAuthority(m.id, a)) wbRefresh();
};
WB_CLICK['auth-add'] = (el, m) => wbOpenAuthorityForm(m, null);
WB_CLICK['auth-edit'] = (el, m) => wbOpenAuthorityForm(m, +el.dataset.i);
WB_CLICK['auth-del'] = (el, m) => {
  const [a] = m.authorities.splice(+el.dataset.i, 1);
  if (a) m.arguments.forEach(x => { x.links = (x.links || []).filter(k => k !== a.key); });
  wbSave(m.id); wbRefresh();
};
WB_SUBMIT['note-add'] = (form, m) => {
  const text = form.elements.text.value.trim();
  if (!text) { showToast('Write something first.'); return; }
  m.notes.unshift({ id: uid('note'), text, source: 'manual', createdAt: wbToday() });
  wbSave(m.id); wbRefresh();
};
WB_CLICK['note-del'] = (el, m) => {
  if (!confirm('Remove this research note?')) return;
  m.notes.splice(+el.dataset.i, 1);
  wbSave(m.id); wbRefresh();
};

function wbOpenAuthorityForm(m, idx) {
  const a = idx == null ? { title: '', meta: '', note: '' } : m.authorities[idx];
  if (!a) return;
  wbOpenModal({
    eyebrow: 'Research', title: idx == null ? 'Add an authority' : 'Edit authority',
    html: `<form class="wb-form">
      <label>Authority<input name="title" required maxlength="300" value="${esc(a.title)}" placeholder="e.g. Section 482, Bharatiya Nagarik Suraksha Sanhita, 2023" /></label>
      <label>Citation and details<input name="meta" maxlength="300" value="${esc(a.meta)}" placeholder="e.g. 2020 · 5 SCC 1 · Supreme Court" /></label>
      <label>Why it matters (optional)<textarea name="note" maxlength="1000">${esc(a.note || '')}</textarea></label>
      <div class="modal-actions">${wbCancelButton}<button class="btn btn-primary" type="submit">${idx == null ? 'Add authority' : 'Save'}</button></div></form>`,
    onSubmit: e => {
      const f = new FormData(e.target), title = String(f.get('title')).trim();
      if (!title) return;
      const next = { title, meta: String(f.get('meta')).trim(), note: String(f.get('note')).trim() };
      if (idx == null) {
        if (wbPinned(m, next)) { showToast('That authority is already pinned.'); return; }
        m.authorities.push({ key: uid('auth'), pdfUrl: '', ...next });
      } else Object.assign(m.authorities[idx], next);
      wbSave(m.id); closeModals(); wbRefresh();
    }
  });
}

/* =============================================================================
   EVIDENCE
   ============================================================================= */
const WB_STATUSES = ['Key document', 'Reviewed', 'Needs review'];
const WB_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function wbTlKey(t) {                                 // sort key for a chronology event; older sample events carry only "07 Feb"
  if (t.iso) return t.iso;
  if (/^today$/i.test(t.date)) return TODAY_ISO;
  const p = /^(\d{1,2})\s+([A-Za-z]{3})/.exec(t.date || '');
  const mon = p ? WB_MONTHS.indexOf(p[2].toLowerCase()) : -1;
  return mon < 0 ? '9999' : `${TODAY_ISO.slice(0, 4)}-${pad2(mon + 1)}-${pad2(+p[1])}`;
}

function wbFileType(name) {
  const ext = (String(name).split('.').pop() || '').toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (['doc', 'docx', 'odt', 'rtf', 'txt'].includes(ext)) return 'doc';
  if (['zip', 'rar', '7z'].includes(ext)) return 'zip';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'tif', 'tiff'].includes(ext)) return 'img';
  return 'file';
}
const wbBytes = n => (n < 1024 ? `${n} B` : n < 1048576 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`);

function wbDocRow(d, i) {
  const statuses = WB_STATUSES.includes(d.status) ? WB_STATUSES : [...WB_STATUSES, d.status];
  return `<div class="doc-row doc-row-tall"><div class="doc-type ${esc(d.type)}">${esc(String(d.type || 'file').toUpperCase())}</div>
    <div class="doc-copy"><strong>${esc(d.name)}</strong><small>Added ${esc(d.added)}${d.size ? ` · ${esc(d.size)}` : ''}</small>
      ${d.tool ? `<small class="doc-tool${d.processing ? ' processing' : ''}"><i></i>${d.processing ? esc(d.toolNote) : `${esc(d.tool)} · ${esc(d.toolNote)}`}</small>` : ''}
      ${d.note ? `<small class="wb-note">${esc(d.note)}</small>` : ''}
      <div class="wb-doc-actions"><select class="wb-select wb-status" data-wb-change="doc-status" data-i="${i}" aria-label="Status of ${esc(d.name)}">${statuses.map(s => `<option${s === d.status ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select>
        <button type="button" class="btn-text" data-wb="doc-chrono" data-i="${i}">${wbIc('calendar')}Add to chronology</button>
        <button type="button" class="btn-text wb-danger" data-wb="doc-del" data-i="${i}">Remove</button></div></div></div>`;
}

function wbEventRow(t, i) {
  return `<article class="wb-event"><time class="mono">${esc(t.date)}</time>
    <div class="wb-event-copy"><strong>${esc(t.title)}</strong>${t.flag ? ' <span class="chip chip-amber">Inconsistency</span>' : ''}${t.omitFromDrafts ? ' <span class="chip chip-navy">Not in drafts</span>' : ''}${t.note ? `<p>${esc(t.note)}</p>` : ''}</div>
    <div class="wb-row-actions"><button type="button" class="icon-btn" data-wb="ev-flag" data-i="${i}" aria-label="${t.flag ? 'Clear the inconsistency flag' : 'Flag as an inconsistency'}" aria-pressed="${t.flag}">${wbIc('flag')}</button><button type="button" class="icon-btn" data-wb="ev-del" data-i="${i}" aria-label="Remove event">${wbIc('close')}</button></div></article>`;
}

function tabEvidence(m) {
  wbEnsure(m);
  const flagged = m.timeline.filter(t => t.flag);
  return `
  <div class="dash-grid">
    <div class="card card-pad">
      <div class="card-head"><div><h2>Documents</h2><p class="hint">Add the documents this case turns on, mark the key ones and put their dates into the chronology. Files stay on your computer — only their names and sizes are recorded, and their contents are not read.</p></div><button type="button" class="btn btn-teal btn-sm" data-wb="ev-add">${wbIc('upload')}Add evidence</button></div>
      ${m.documents.length ? m.documents.map(wbDocRow).join('') : '<p class="empty-note">No documents added yet.</p>'}
    </div>
    <div class="wb-col">
      <div class="card card-pad">
        <h2>Inconsistencies</h2>
        ${flagged.length ? flagged.map(t => `<div class="contradiction" style="margin-top:12px"><div class="contradiction-icon">${wbIc('alert')}</div><div><p class="eyebrow" style="margin-bottom:3px">Flagged</p><strong style="font-size:13px">${esc(t.title)}</strong>${t.note ? `<p style="font-size:12px;margin-top:4px;color:var(--ink-soft)">${esc(t.note)}</p>` : ''}</div></div>`).join('') : '<p class="empty-note" style="text-align:left;padding:8px 0">None flagged. Flag a chronology event below when two documents disagree.</p>'}
        <div class="grid-2" style="margin-top:16px"><div class="stat-card"><div class="stat-num" style="font-size:24px">${m.documents.length}</div><div class="stat-note">documents on file</div></div><div class="stat-card"><div class="stat-num" style="font-size:24px">${m.timeline.length}</div><div class="stat-note">events in chronology</div></div></div>
      </div>
      <div class="card card-pad">
        <div class="card-head"><div><h2>Chronology</h2><p class="hint">Dated events in order. They feed the “Chronology” field in your drafts.</p></div><button type="button" class="btn btn-ghost btn-sm" data-wb="ev-event">${wbIc('plus')}Add event</button></div>
        ${m.timeline.length ? m.timeline.map(wbEventRow).join('') : '<p class="empty-note">No events yet.</p>'}
      </div>
    </div>
  </div>`;
}

WB_CLICK['ev-add'] = (el, m) => wbOpenEvidenceForm(m);
WB_CLICK['ev-event'] = (el, m) => wbOpenEventForm(m, {});
WB_CLICK['doc-chrono'] = (el, m) => { const d = m.documents[+el.dataset.i]; if (d) wbOpenEventForm(m, { title: d.name }); };
WB_CLICK['doc-del'] = (el, m) => { m.documents.splice(+el.dataset.i, 1); wbSave(m.id); wbRefresh(); };
WB_CHANGE['doc-status'] = (el, m) => { const d = m.documents[+el.dataset.i]; if (d) { d.status = el.value; wbSave(m.id); wbRefresh(); } };
WB_CLICK['ev-flag'] = (el, m) => { const t = m.timeline[+el.dataset.i]; if (t) { t.flag = !t.flag; wbSave(m.id); wbRefresh(); } };
WB_CLICK['ev-del'] = (el, m) => { m.timeline.splice(+el.dataset.i, 1); wbSave(m.id); wbRefresh(); };

function wbOpenEvidenceForm(m) {
  if (!m) return;
  wbOpenModal({
    eyebrow: 'Evidence', title: 'Add evidence',
    html: `<form class="wb-form">
      <label>Files<input type="file" name="files" multiple /></label>
      <p class="hint" style="margin:8px 0 0">The files stay on your computer. Only their names, sizes and types are recorded here.</p>
      <label>…or a document you only hold on paper<input name="name" maxlength="200" placeholder="e.g. Original sale deed (paper copy)" /></label>
      <div class="form-grid"><label>Status<select name="status">${WB_STATUSES.map(s => `<option>${s}</option>`).join('')}</select></label>
        <label>Type (for a paper record)<select name="type"><option value="doc">Document</option><option value="pdf">PDF</option><option value="img">Image</option><option value="zip">Bundle</option><option value="file">Other</option></select></label></div>
      <label>Note (optional)<textarea name="note" maxlength="1000" placeholder="What it shows, or why it matters"></textarea></label>
      <div class="modal-actions">${wbCancelButton}<button class="btn btn-primary" type="submit">Add</button></div></form>`,
    onSubmit: e => {
      const f = new FormData(e.target), files = [...e.target.elements.files.files].filter(x => x.name), typed = String(f.get('name')).trim();
      if (!files.length && !typed) { showToast('Choose a file, or type the name of a paper document.'); return; }
      const base = { added: wbToday(), status: String(f.get('status')), tool: '', toolNote: '', processing: false, note: String(f.get('note')).trim() };
      const added = files.length ? files.map(x => ({ ...base, id: uid('doc'), name: x.name, type: wbFileType(x.name), size: wbBytes(x.size) }))
        : [{ ...base, id: uid('doc'), name: typed, type: /^(doc|pdf|img|zip|file)$/.test(f.get('type')) ? String(f.get('type')) : 'file', size: '' }];
      wbEnsure(m).documents.push(...added);
      wbSave(m.id); closeModals();
      if (wbCtx().tab === 'evidence') wbRefresh();
      showToast(`${added.length === 1 ? added[0].name : `${added.length} documents`} added to ${m.title}.`);
    }
  });
}

function wbOpenEventForm(m, preset) {
  wbOpenModal({
    eyebrow: 'Evidence', title: 'Add to chronology',
    html: `<form class="wb-form">
      <label>Date<input type="date" name="iso" required value="${TODAY_ISO}" /></label>
      <label>What happened<input name="title" required maxlength="200" value="${esc(preset.title || '')}" placeholder="e.g. FIR registered" /></label>
      <label>Detail (optional)<textarea name="note" maxlength="1000"></textarea></label>
      <label class="wb-check"><input type="checkbox" name="flag" /><span>Flag as an inconsistency with another document</span></label>
      <label class="wb-check"><input type="checkbox" name="omit" /><span>Keep out of drafts (an internal milestone, not a fact for the pleading)</span></label>
      <div class="modal-actions">${wbCancelButton}<button class="btn btn-primary" type="submit">Add event</button></div></form>`,
    onSubmit: e => {
      const f = new FormData(e.target), iso = String(f.get('iso')), title = String(f.get('title')).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !title) return;
      wbEnsure(m).timeline.push({ date: fmtDate(iso, true), iso, title, note: String(f.get('note')).trim(), flag: f.has('flag'), omitFromDrafts: f.has('omit') });
      m.timeline.sort((a, b) => wbTlKey(a).localeCompare(wbTlKey(b)));
      wbSave(m.id); closeModals(); wbRefresh();
    }
  });
}

/* =============================================================================
   ARGUMENTS
   ============================================================================= */
function wbArgCard(m, a, i) {
  const s = Math.max(0, Math.min(100, Number(a.strength) || 0));
  const linked = (a.links || []).map(k => m.authorities.find(x => x.key === k)).filter(Boolean);
  return `
  <div class="arg-card">
    <div class="arg-top"><span class="arg-num mono">${i + 1}</span>
      <div class="arg-copy"><strong>${esc(a.point)}</strong>${a.support ? `<p>${esc(a.support)}</p>` : ''}${linked.length ? `<div class="wb-chips">${linked.map(x => `<span class="chip chip-navy" title="${esc(x.title)}">${esc(wbShort(x.title))}</span>`).join('')}</div>` : ''}</div>
      <b class="arg-strength ${s >= 75 ? 'good' : s >= 55 ? 'mid' : 'low'}">${s}<em>/100</em></b></div>
    <div class="wb-arg-foot">
      <button type="button" class="btn-text arg-stress-btn" data-wb="arg-risk" data-i="${i}">${wbIc('scale')}Risks and opposing authority</button>
      <div class="wb-row-actions">
        <button type="button" class="icon-btn" data-wb="arg-up" data-i="${i}" aria-label="Move up"${i === 0 ? ' disabled' : ''}><svg class="ic" style="transform:rotate(-90deg)"><use href="#i-arrow"/></svg></button>
        <button type="button" class="icon-btn" data-wb="arg-down" data-i="${i}" aria-label="Move down"${i === m.arguments.length - 1 ? ' disabled' : ''}><svg class="ic" style="transform:rotate(90deg)"><use href="#i-arrow"/></svg></button>
        <button type="button" class="icon-btn" data-wb="arg-edit" data-i="${i}" aria-label="Edit argument">${wbIc('edit')}</button>
        <button type="button" class="icon-btn" data-wb="arg-del" data-i="${i}" aria-label="Remove argument">${wbIc('close')}</button></div></div>
    <div class="arg-stress" id="argStress${i}" hidden>${wbIc('alert')}<p>${a.stressTest ? esc(a.stressTest) : 'Nothing recorded yet. Edit this argument to note the opposing authority or weak point you expect.'}</p></div>
  </div>`;
}

function tabArguments(m) {
  wbEnsure(m);
  return `
  <div class="dash-grid">
    <div class="card card-pad">
      <div class="card-head"><div><h2>Structured arguments</h2><p class="hint">The points you will press, each with the authorities behind it and the risks you expect. Strength is your own rating. They flow into your drafts.</p></div><button type="button" class="btn btn-teal btn-sm" data-wb="arg-add">${wbIc('plus')}Add argument</button></div>
      ${m.arguments.length ? m.arguments.map((a, i) => wbArgCard(m, a, i)).join('') : '<p class="empty-note">No arguments yet. Add the first point you will press.</p>'}
    </div>
    <div class="wb-col">
      <div class="card card-pad">
        <div class="card-head"><div><h2>Anticipated counter-arguments</h2><p class="hint">What the other side is likely to raise, and your answer.</p></div><button type="button" class="btn btn-ghost btn-sm" data-wb="counter-add">${wbIc('plus')}Add</button></div>
        ${m.counterArgs.length ? m.counterArgs.map((c, i) => `
          <div class="counter-card"><p class="counter-point">${wbIc('alert')}${esc(c.point)}</p>${c.rebuttal ? `<p class="counter-rebuttal">${wbIc('check')}${esc(c.rebuttal)}</p>` : ''}
            <div class="wb-row-actions wb-counter-actions"><button type="button" class="icon-btn" data-wb="counter-edit" data-i="${i}" aria-label="Edit counter-argument">${wbIc('edit')}</button><button type="button" class="icon-btn" data-wb="counter-del" data-i="${i}" aria-label="Remove counter-argument">${wbIc('close')}</button></div></div>`).join('') : '<p class="empty-note">None added yet.</p>'}
      </div>
      <div class="card card-pad"><h2>Use them in a draft</h2><p class="hint">In Drafting, the fields <b>Arguments</b> and <b>Counter-arguments</b> pull these in, one paragraph each.</p><a class="btn btn-ghost btn-sm" href="#/matters/${m.id}/drafting">${wbIc('draft')}Open Drafting</a></div>
    </div>
  </div>`;
}

WB_CLICK['arg-add'] = (el, m) => wbOpenArgForm(m, null);
WB_CLICK['arg-edit'] = (el, m) => wbOpenArgForm(m, +el.dataset.i);
WB_CLICK['arg-del'] = (el, m) => {
  if (!confirm('Remove this argument?')) return;
  m.arguments.splice(+el.dataset.i, 1);
  wbSave(m.id); wbRefresh();
};
function wbMove(list, i, by) { const j = i + by; if (j < 0 || j >= list.length) return false; [list[i], list[j]] = [list[j], list[i]]; return true; }
WB_CLICK['arg-up'] = (el, m) => { if (wbMove(m.arguments, +el.dataset.i, -1)) { wbSave(m.id); wbRefresh(); } };
WB_CLICK['arg-down'] = (el, m) => { if (wbMove(m.arguments, +el.dataset.i, 1)) { wbSave(m.id); wbRefresh(); } };
WB_CLICK['arg-risk'] = el => {
  const panel = $(`#argStress${el.dataset.i}`);
  if (!panel) return;
  panel.hidden = !panel.hidden;
  el.classList.toggle('open', !panel.hidden);
};
WB_CLICK['counter-add'] = (el, m) => wbOpenCounterForm(m, null);
WB_CLICK['counter-edit'] = (el, m) => wbOpenCounterForm(m, +el.dataset.i);
WB_CLICK['counter-del'] = (el, m) => {
  if (!confirm('Remove this counter-argument?')) return;
  m.counterArgs.splice(+el.dataset.i, 1);
  wbSave(m.id); wbRefresh();
};

function wbOpenArgForm(m, idx) {
  const a = idx == null ? { point: '', support: '', strength: 60, stressTest: '', links: [] } : m.arguments[idx];
  if (!a) return;
  wbOpenModal({
    eyebrow: 'Arguments', title: idx == null ? 'Add an argument' : 'Edit argument',
    html: `<form class="wb-form">
      <label>The point<textarea name="point" required maxlength="500" placeholder="e.g. The applicant has cooperated at every stage of the investigation.">${esc(a.point)}</textarea></label>
      <label>What supports it<textarea name="support" maxlength="1000" placeholder="The document, statement or fact that backs it up">${esc(a.support)}</textarea></label>
      <label>Strength — your own rating, 0 to 100<input type="number" name="strength" min="0" max="100" value="${Number(a.strength) || 0}" /></label>
      ${m.authorities.length ? `<fieldset class="wb-fieldset"><legend>Authorities behind it</legend>${m.authorities.map(x => `<label class="wb-check"><input type="checkbox" name="links" value="${esc(x.key)}"${(a.links || []).includes(x.key) ? ' checked' : ''} /><span>${esc(x.title)}</span></label>`).join('')}</fieldset>` : '<p class="hint" style="margin-top:14px">Pin authorities in Research and you can link them to the point here.</p>'}
      <label>Risks and opposing authority<textarea name="stressTest" maxlength="2000" placeholder="The case or argument the other side will use against this point">${esc(a.stressTest || '')}</textarea></label>
      <div class="modal-actions">${wbCancelButton}<button class="btn btn-primary" type="submit">${idx == null ? 'Add argument' : 'Save'}</button></div></form>`,
    onSubmit: e => {
      const f = new FormData(e.target), point = String(f.get('point')).trim();
      if (!point) return;
      const next = { point, support: String(f.get('support')).trim(), strength: Math.max(0, Math.min(100, Math.round(Number(f.get('strength'))) || 0)), stressTest: String(f.get('stressTest')).trim(), links: f.getAll('links').map(String) };
      if (idx == null) m.arguments.push(next); else Object.assign(m.arguments[idx], next);
      wbSave(m.id); closeModals(); wbRefresh();
    }
  });
}

function wbOpenCounterForm(m, idx) {
  const c = idx == null ? { point: '', rebuttal: '' } : m.counterArgs[idx];
  if (!c) return;
  wbOpenModal({
    eyebrow: 'Arguments', title: idx == null ? 'Add a counter-argument' : 'Edit counter-argument',
    html: `<form class="wb-form">
      <label>What the other side may raise<textarea name="point" required maxlength="500">${esc(c.point)}</textarea></label>
      <label>Your answer<textarea name="rebuttal" maxlength="1000">${esc(c.rebuttal)}</textarea></label>
      <div class="modal-actions">${wbCancelButton}<button class="btn btn-primary" type="submit">${idx == null ? 'Add' : 'Save'}</button></div></form>`,
    onSubmit: e => {
      const f = new FormData(e.target), point = String(f.get('point')).trim();
      if (!point) return;
      const next = { point, rebuttal: String(f.get('rebuttal')).trim() };
      if (idx == null) m.counterArgs.push(next); else Object.assign(m.counterArgs[idx], next);
      wbSave(m.id); closeModals(); wbRefresh();
    }
  });
}

/* =============================================================================
   DRAFTING
   ============================================================================= */
const wbDraftOf = m => m.drafts.find(d => d.id === wbUi.draft[m.id]) || m.drafts[0] || null;

function wbSectionTools(prefix, i, last) {            // move up / down / remove — used by the draft editor and the format editor
  return `<div class="wb-row-actions">
    <button type="button" class="icon-btn" ${prefix} data-i="${i}" data-dir="up" aria-label="Move section up"${i === 0 ? ' disabled' : ''}><svg class="ic" style="transform:rotate(-90deg)"><use href="#i-arrow"/></svg></button>
    <button type="button" class="icon-btn" ${prefix} data-i="${i}" data-dir="down" aria-label="Move section down"${last ? ' disabled' : ''}><svg class="ic" style="transform:rotate(90deg)"><use href="#i-arrow"/></svg></button>
    <button type="button" class="icon-btn" ${prefix} data-i="${i}" data-dir="del" aria-label="Remove section">${wbIc('close')}</button></div>`;
}
const wbLayoutOptions = cur => Object.entries(Drafting.LAYOUTS).map(([k, l]) => `<option value="${k}"${cur === k ? ' selected' : ''}>${l}</option>`).join('');

function wbEditorHtml(d, locked) {
  const ro = locked ? ' readonly' : '';
  return `${d.sections.map((s, i) => `
    <div class="wb-sec">
      <div class="wb-sec-head">
        <input class="wb-input" data-wb-input="sec-heading" data-i="${i}" value="${esc(s.heading)}" placeholder="Heading (optional)" maxlength="200" aria-label="Section ${i + 1} heading"${ro} />
        <select class="wb-select" data-wb-change="sec-layout" data-i="${i}" aria-label="Section ${i + 1} layout"${locked ? ' disabled' : ''}>${wbLayoutOptions(s.layout)}</select>
        ${locked ? '' : wbSectionTools('data-wb="sec-move"', i, i === d.sections.length - 1)}
      </div>
      <textarea class="wb-ta" data-wb-input="sec-body" data-i="${i}" aria-label="Section ${i + 1} text"${ro}>${esc(s.body)}</textarea>
    </div>`).join('')}
    ${locked ? '' : `<button type="button" class="btn btn-ghost btn-sm" data-wb="sec-add">${wbIc('plus')}Add section</button>`}
    <p class="hint wb-mt">Each line is one paragraph. Put <b>**double asterisks**</b> around words to bold them. <b>[____]</b> marks a blank only you can fill in.</p>`;
}

function wbChecksHtml(r) {
  return r.checks.map(c => `<div class="check-row"><span class="check-icon ${c.ok ? 'ok' : 'warn'}">${c.ok ? wbIc('check') : '!'}</span><div><strong style="font-size:13px;font-weight:600;display:block">${esc(c.label)}</strong><small style="font-size:11.5px;color:var(--muted)">${esc(c.note)}</small></div></div>`).join('');
}
function wbPaintChecks(m, d) {
  const r = Drafting.draftChecks(d, m), box = $('#wbChecks'), ring = $('#wbRing');
  if (box) box.innerHTML = wbChecksHtml(r);
  if (ring) { ring.style.setProperty('--pct', r.pct); ring.firstElementChild.textContent = r.pct; }
}

function tabDrafting(m) {
  wbEnsure(m);
  const d = wbDraftOf(m);
  const bar = `
  <div class="wb-bar">
    <div class="wb-drafts" role="tablist" aria-label="Drafts for this matter">${m.drafts.map(x => `<button type="button" role="tab" class="wb-draft-tab${d && x.id === d.id ? ' active' : ''}" aria-selected="${!!d && x.id === d.id}" data-wb="draft-pick" data-id="${esc(x.id)}"><span>${esc(x.title)}</span>${x.status === 'Approved' ? '<i class="wb-ok" title="Approved"></i>' : ''}</button>`).join('')}</div>
    <div class="wb-bar-actions">
      <button type="button" class="btn btn-ghost" data-wb="formats-open">${wbIc('docs')}Document formats</button>
      <button type="button" class="btn btn-teal" data-wb="draft-new">${wbIc('plus')}New draft</button>
    </div>
  </div>`;
  if (!d) {
    return `${bar}<div class="card card-pad"><h2>No drafts yet</h2>
      <p class="hint" style="max-width:600px">Pick a document and a format. LegalAI places this matter’s facts, chronology, authorities, arguments and annexures into the format, leaves a <b>[____]</b> wherever it has nothing, and you edit the rest. It does not write legal text for you.</p>
      <p class="hint" style="max-width:600px">Set up how you like each document laid out under <b>Document formats</b> once, make it your default, and every new draft follows it.</p>
      <div style="display:flex;gap:9px;flex-wrap:wrap;margin-top:6px"><button type="button" class="btn btn-teal" data-wb="draft-new">${wbIc('plus')}New draft</button><button type="button" class="btn btn-ghost" data-wb="formats-open">${wbIc('docs')}Document formats</button></div></div>`;
  }
  const approved = d.status === 'Approved', edit = wbUi.mode === 'edit';
  const r = Drafting.draftChecks(d, m);
  return `${bar}
  <div class="dash-grid">
    <div class="card wb-draft">
      <div class="wb-draft-head"><input class="wb-title" data-wb-input="draft-title" value="${esc(d.title)}" maxlength="120" aria-label="Draft title"${approved ? ' readonly' : ''} /><span class="chip ${approved ? 'chip-teal' : 'chip-amber'}">${approved ? 'Approved' : 'Draft'}</span></div>
      <div class="wb-draft-sub"><span>Format: <b>${esc(d.formatName || 'Custom')}</b> · ${esc(d.docType)}</span>
        <div class="wb-seg" role="group" aria-label="View"><button type="button" class="${edit ? 'on' : ''}" data-wb="mode" data-mode="edit" aria-pressed="${edit}">Edit</button><button type="button" class="${edit ? '' : 'on'}" data-wb="mode" data-mode="preview" aria-pressed="${!edit}">Preview</button></div></div>
      ${approved ? '<p class="wb-banner">Approved and locked. Reopen the draft to change it; it will need approving again before it can be exported.</p>' : ''}
      <div class="wb-draft-body">${edit ? wbEditorHtml(d, approved) : `<div class="wb-paper">${Drafting.renderDraftHtml(d)}</div>`}</div>
      <div class="wb-draft-foot">${approved
        ? `<span class="wb-approved">${wbIc('shield')}Approved ${esc(d.approvedAt)}</span><div class="wb-foot-actions"><button type="button" class="btn btn-teal btn-sm" data-wb="draft-word">${wbIc('download')}Download for Word</button><button type="button" class="btn btn-ghost btn-sm" data-wb="draft-print">Print / save as PDF</button><button type="button" class="btn-text" data-wb="draft-reopen">Reopen for editing</button></div>`
        : `<span class="hint" style="margin:0">You approve every draft before it can be exported.</span><button type="button" class="btn btn-teal btn-sm" data-wb="draft-approve">Approve draft</button>`}</div>
    </div>
    <div class="card card-pad">
      <div class="wb-ring-row"><div class="score-ring" id="wbRing" style="--pct:${r.pct}"><b>${r.pct}</b></div><div><strong style="font-size:13.5px">Completeness</strong><p style="font-size:12px;color:var(--muted);margin-top:3px">The share of sections that have text. The checks below are counted from this draft and this matter’s record.</p></div></div>
      <div id="wbChecks">${wbChecksHtml(r)}</div>
      <button type="button" class="btn btn-ghost btn-block wb-danger-btn" data-wb="draft-del">Delete this draft</button>
    </div>
  </div>`;
}

WB_CLICK['draft-pick'] = (el, m) => { wbUi.draft[m.id] = el.dataset.id; wbRefresh(); };
WB_CLICK['mode'] = el => { wbUi.mode = el.dataset.mode === 'preview' ? 'preview' : 'edit'; wbRefresh(); };
WB_CLICK['formats-open'] = (el, m) => wbOpenFormats(m);
WB_CLICK['draft-new'] = (el, m) => wbOpenNewDraft(m);
WB_INPUT['draft-title'] = (el, m) => { const d = wbDraftOf(m); if (d && d.status !== 'Approved') { d.title = el.value; wbSaveSoon(m.id); } };
WB_INPUT['sec-heading'] = (el, m) => { const d = wbDraftOf(m), s = d?.sections[+el.dataset.i]; if (s && d.status !== 'Approved') { s.heading = el.value; wbPaintChecks(m, d); wbSaveSoon(m.id); } };
WB_INPUT['sec-body'] = (el, m) => { const d = wbDraftOf(m), s = d?.sections[+el.dataset.i]; if (s && d.status !== 'Approved') { s.body = el.value; wbGrow(el); wbPaintChecks(m, d); wbSaveSoon(m.id); } };
WB_CHANGE['sec-layout'] = (el, m) => { const d = wbDraftOf(m), s = d?.sections[+el.dataset.i]; if (s && d.status !== 'Approved') { s.layout = el.value; wbSave(m.id); } };
WB_CLICK['sec-move'] = (el, m) => {
  const d = wbDraftOf(m), i = +el.dataset.i, dir = el.dataset.dir;
  if (!d || d.status === 'Approved') return;
  if (dir === 'del') { if (!confirm('Remove this section from the draft?')) return; d.sections.splice(i, 1); }
  else if (!wbMove(d.sections, i, dir === 'up' ? -1 : 1)) return;
  wbSave(m.id); wbRefresh();
};
WB_CLICK['sec-add'] = (el, m) => {
  const d = wbDraftOf(m);
  if (!d || d.status === 'Approved') return;
  d.sections.push({ id: uid('s'), heading: '', layout: 'numbered', body: '' });
  wbSave(m.id); wbRefresh();
  const tas = $$('.wb-ta'); tas[tas.length - 1]?.focus();
};
WB_CLICK['draft-approve'] = (el, m) => {
  const d = wbDraftOf(m);
  if (!d) return;
  d.status = 'Approved'; d.approvedAt = fmtDate(TODAY_ISO, true);
  const entry = { time: `${wbToday()} · ${new Date().toTimeString().slice(0, 5)}`, agent: 'Shreyas A. (lawyer)', action: `Approved “${d.title}” for export.`, matter: m.title, status: 'approve' };
  AUDIT_LOG.unshift(entry); wb.audit.unshift(entry); wb.audit.length = Math.min(wb.audit.length, 50);
  wbSave(m.id); wbRefresh();
  showToast(`“${d.title}” approved — it can now be exported. Recorded in the audit trail.`);
};
WB_CLICK['draft-reopen'] = (el, m) => { const d = wbDraftOf(m); if (d) { d.status = 'Draft'; d.approvedAt = ''; wbSave(m.id); wbRefresh(); } };
WB_CLICK['draft-del'] = (el, m) => {
  const d = wbDraftOf(m);
  if (!d || !confirm(`Delete the draft “${d.title}”? This cannot be undone.`)) return;
  m.drafts = m.drafts.filter(x => x !== d);
  delete wbUi.draft[m.id];
  wbSave(m.id); wbRefresh();
};
WB_CLICK['draft-word'] = (el, m) => { const d = wbDraftOf(m); if (d?.status === 'Approved') wbDownload(d); };
WB_CLICK['draft-print'] = (el, m) => { const d = wbDraftOf(m); if (d?.status === 'Approved') wbPrint(d); };

function wbDownload(d) {
  const url = URL.createObjectURL(new Blob(['﻿', Drafting.exportHtml(d)], { type: 'application/msword' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `${Drafting.slug(d.title)}.doc` });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function wbPrint(d) {                                 // print from a hidden frame, so no pop-up blocker is involved
  const frame = document.createElement('iframe');
  frame.className = 'wb-print-frame'; frame.setAttribute('aria-hidden', 'true');
  frame.srcdoc = Drafting.exportHtml(d);
  frame.onload = () => { frame.contentWindow.onafterprint = () => frame.remove(); frame.contentWindow.focus(); frame.contentWindow.print(); setTimeout(() => frame.remove(), 120000); };
  document.body.appendChild(frame);
}

function wbOpenNewDraft(m) {
  const types = Drafting.docTypes(wbFormats());
  let type = [wbUi.lastType, wbDraftOf(m)?.docType].find(t => types.includes(t)) || types[0];
  const fmtOptions = t => {
    const all = wbFormats(), def = Drafting.defaultFormatFor(all, wb.defaults, t);
    return Drafting.formatsFor(all, t).map(f => `<option value="${esc(f.id)}"${def && f.id === def.id ? ' selected' : ''}>${esc(f.name)}${f.builtin ? '' : ' (yours)'}${def && f.id === def.id ? ' — default' : ''}</option>`).join('');
  };
  wbOpenModal({
    eyebrow: 'Drafting', title: 'New draft',
    html: `<form class="wb-form">
      <label>Document<select name="type">${types.map(t => `<option${t === type ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
      <label>Format<select name="format">${fmtOptions(type)}</select></label>
      <p class="hint wb-mt" id="wbFmtNote"></p>
      <label>Title<input name="title" maxlength="120" value="${esc(type)}" /></label>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-wb-manage style="margin-right:auto">${wbIc('docs')}Manage formats</button>${wbCancelButton}<button class="btn btn-primary" type="submit">Create draft</button></div></form>`,
    onClick: e => { if (e.target.closest('[data-wb-manage]')) wbOpenFormats(m); },
    onChange: e => {
      const els = e.target.form.elements;
      if (e.target.name === 'type') {
        const prev = type; type = e.target.value;
        els.format.innerHTML = fmtOptions(type);
        if (els.title.value === prev) els.title.value = type;      // follow the document name until the user types their own title
      }
      const f = wbFormats().find(x => x.id === els.format.value);
      $('#wbFmtNote').textContent = f ? (f.description || '') : '';
    },
    onSubmit: e => {
      const els = e.target.elements, f = wbFormats().find(x => x.id === els.format.value);
      if (!f) { showToast('Pick a format first.'); return; }
      const d = Drafting.createDraft(f, m, { title: els.title.value, extras: wbExtras(m) });
      m.drafts.push(d);
      wbUi.draft[m.id] = d.id; wbUi.mode = 'edit'; wbUi.lastType = f.docType;
      wbSave(m.id); closeModals(); wbRefresh();
      const gaps = Drafting.countGaps(d.sections.map(s => `${s.heading}\n${s.body}`).join('\n'));
      showToast(`Draft created from “${f.name}”.${gaps ? ` ${gaps} blank${gaps === 1 ? '' : 's'} to fill in.` : ''}`);
    }
  });
  $('#wbFmtNote').textContent = wbFormats().find(x => x.id === $('#wbModal').querySelector('form').elements.format.value)?.description || '';
}

/* ── the format library ──────────────────────────────────────────────────── */
const wbWorkCopy = f => JSON.parse(JSON.stringify(f));

function wbOpenFormats(m) {
  const all = wbFormats(), cur = wbDraftOf(m);
  const start = (cur && Drafting.defaultFormatFor(all, wb.defaults, cur.docType)) || all[0];
  wbUi.fmt = { work: wbWorkCopy(start), isNew: false, dirty: false, view: 'edit', makeDefault: Drafting.isDefault(all, wb.defaults, start), ta: null };
  wbOpenModal({ eyebrow: 'Drafting', title: 'Document formats', wide: true, focus: false, html: '<div id="wbFmt"></div>', onClick: wbFmtClick, onInput: wbFmtInput, onChange: wbFmtInput, onFocus: e => { if (e.target.matches?.('textarea[data-fsec="body"]')) wbUi.fmt.ta = e.target; } });
  wbPaintFormats();
}

function wbFmtItem(f, all, active) {
  return `<button type="button" class="wb-fmt-item${active ? ' active' : ''}" data-fmt="select" data-id="${esc(f.id)}"><span><strong>${esc(f.name)}</strong><small>${f.builtin ? 'Built-in' : 'Yours'}</small></span>${Drafting.formatsFor(all, f.docType).length > 1 && Drafting.isDefault(all, wb.defaults, f) ? '<span class="chip chip-teal">Default</span>' : ''}</button>`;   // "default" only means something when there is a choice
}

function wbPaintFormats() {
  const root = $('#wbFmt'), u = wbUi.fmt;
  if (!root || !u) return;
  const all = wbFormats(), m = wbCtx().m;
  root.innerHTML = `<div class="wb-fmt">
    <aside class="wb-fmt-list">
      <button type="button" class="btn btn-teal btn-sm btn-block" data-fmt="new">${wbIc('plus')}New format</button>
      ${u.isNew ? `<p class="wb-fmt-type">Not saved yet</p><button type="button" class="wb-fmt-item active" data-fmt="stay"><span><strong>${esc(u.work.name || 'New format')}</strong><small>Yours</small></span></button>` : ''}
      ${Drafting.docTypes(all).map(t => `<p class="wb-fmt-type">${esc(t)}</p>${Drafting.formatsFor(all, t).map(f => wbFmtItem(f, all, !u.isNew && f.id === u.work.id)).join('')}`).join('')}
    </aside>
    <section class="wb-fmt-pane">${u.work.builtin ? wbBuiltinPane(u.work, all, m) : wbEditorPane(u, all, m)}</section>
  </div>`;
  $$('.wb-ta', root).forEach(wbGrow);
}

function wbOutline(f) {
  return `<ol class="wb-outline">${f.sections.map(s => `<li><b>${esc(s.heading || (s.layout === 'center' ? 'Centred block (cause title)' : s.layout === 'signoff' ? 'Sign-off block' : 'Untitled'))}</b> <small>${esc(Drafting.LAYOUTS[s.layout])}</small></li>`).join('')}</ol>`;
}

function wbBuiltinPane(f, all, m) {
  const isDef = Drafting.isDefault(all, wb.defaults, f);
  return `
    <div class="wb-pane-head"><div><h3>${esc(f.docType)}</h3><p class="hint" style="margin:2px 0 0">${esc(f.description)}</p></div>
      <div class="wb-pane-actions">${isDef ? '<span class="chip chip-teal">Default for this document</span>' : `<button type="button" class="btn btn-ghost btn-sm" data-fmt="default" data-id="${esc(f.id)}">Make default</button>`}<button type="button" class="btn btn-teal btn-sm" data-fmt="duplicate">Duplicate and customise</button></div></div>
    <p class="wb-flag">${wbIc('alert')}<span>Built-in formats are general starting points, not legal advice. Duplicate one to make it yours, then check it against the court’s rules and your own practice.</span></p>
    <p class="eyebrow">Sections</p>${wbOutline(f)}
    <p class="eyebrow">Preview, filled from this matter</p>
    <div class="wb-paper wb-paper-sm">${Drafting.renderDraftHtml(Drafting.createDraft(f, m, { extras: wbExtras(m) }))}</div>`;
}

function wbEditorPane(u, all, m) {
  const f = u.work, st = f.style;
  const opt = (v, label, cur) => `<option value="${esc(v)}"${String(cur) === String(v) ? ' selected' : ''}>${esc(label)}</option>`;
  const head = `<div class="wb-pane-head"><div><h3>${u.isNew ? 'New format' : esc(f.docType || 'Format')}</h3></div>
    <div class="wb-pane-actions"><div class="wb-seg" role="group" aria-label="View"><button type="button" class="${u.view === 'edit' ? 'on' : ''}" data-fmt="view" data-v="edit">Edit</button><button type="button" class="${u.view === 'preview' ? 'on' : ''}" data-fmt="view" data-v="preview">Preview</button></div></div></div>`;
  if (u.view === 'preview') {
    const errs = Drafting.validateFormat(f, all);
    return `${head}${errs.length ? `<p class="wb-flag">${wbIc('alert')}<span>${esc(errs[0])}</span></p>` : ''}<p class="eyebrow">Preview, filled from this matter</p>
      <div class="wb-paper wb-paper-sm">${Drafting.renderDraftHtml(Drafting.createDraft(Drafting.normalizeFormat(f), m, { extras: wbExtras(m) }))}</div>`;
  }
  return `${head}
    <div class="form-grid">
      <label>Format name<input data-f="name" maxlength="80" value="${esc(f.name)}" placeholder="e.g. My bail application" /></label>
      <label>Document it is for<input data-f="docType" list="wbDocTypes" maxlength="80" value="${esc(f.docType)}" placeholder="e.g. Anticipatory bail application" /></label>
    </div>
    <datalist id="wbDocTypes">${Drafting.docTypes(all).map(t => `<option value="${esc(t)}"></option>`).join('')}</datalist>
    <label>Description (optional)<input data-f="description" maxlength="300" value="${esc(f.description)}" /></label>
    <p class="eyebrow wb-mt">How it looks</p>
    <div class="wb-style-grid">
      <label>Font<select data-fs="font">${Drafting.FONTS.map(x => opt(x, x, st.font)).join('')}</select></label>
      <label>Size (pt)<input type="number" data-fs="size" min="8" max="20" step="0.5" value="${esc(st.size)}" /></label>
      <label>Line spacing<select data-fs="spacing">${Drafting.SPACINGS.map(x => opt(x, x === 1 ? 'Single' : x === 2 ? 'Double' : String(x), st.spacing)).join('')}</select></label>
      <label>Text<select data-fs="align">${opt('justify', 'Justified', st.align)}${opt('left', 'Left-aligned', st.align)}</select></label>
      <label>Paragraph numbers<select data-fs="paraNumbering">${opt('continuous', 'Continue through the document', st.paraNumbering)}${opt('restart', 'Restart in each section', st.paraNumbering)}</select></label>
      <label>Headings<select data-fs="headingCase">${opt('upper', 'CAPITALS', st.headingCase)}${opt('asis', 'As typed', st.headingCase)}</select></label>
      <label>Heading position<select data-fs="headingAlign">${opt('center', 'Centred', st.headingAlign)}${opt('left', 'Left', st.headingAlign)}</select></label>
    </div>
    <p class="eyebrow wb-mt">Structure</p>
    <p class="hint">Sections run top to bottom. Each line of text is one paragraph. Click a field to put it into the section you are typing in — it fills from the matter when you make a draft.</p>
    <div class="wb-chips-row">${Drafting.PLACEHOLDERS.map(p => `<button type="button" class="wb-ph" data-fmt="ph" data-key="${p.key}" title="${esc(p.hint)}">${esc(p.label)}</button>`).join('')}</div>
    ${f.sections.map((s, i) => `
      <div class="wb-sec">
        <div class="wb-sec-head">
          <input class="wb-input" data-fsec="heading" data-i="${i}" value="${esc(s.heading)}" placeholder="Heading (optional)" maxlength="200" aria-label="Section ${i + 1} heading" />
          <select class="wb-select" data-fsec="layout" data-i="${i}" aria-label="Section ${i + 1} layout">${wbLayoutOptions(s.layout)}</select>
          ${wbSectionTools('data-fmt="sec"', i, i === f.sections.length - 1)}
        </div>
        <textarea class="wb-ta" data-fsec="body" data-i="${i}" aria-label="Section ${i + 1} text">${esc(s.body)}</textarea>
      </div>`).join('')}
    <button type="button" class="btn btn-ghost btn-sm" data-fmt="sec-add">${wbIc('plus')}Add section</button>
    <label class="wb-check wb-mt"><input type="checkbox" data-f="makeDefault"${u.makeDefault ? ' checked' : ''} /><span>Use this format by default for “${esc(f.docType || 'this document')}”</span></label>
    <div class="wb-pane-foot">${u.isNew ? '' : `<button type="button" class="btn btn-ghost btn-sm wb-danger-btn" data-fmt="delete">Delete format</button><button type="button" class="btn btn-ghost btn-sm" data-fmt="duplicate">Duplicate</button>`}<button type="button" class="btn btn-primary" data-fmt="save" style="margin-left:auto">Save format</button></div>`;
}

function wbFmtGuard() {                               // before leaving a format with unsaved edits
  const u = wbUi.fmt;
  return !(u.dirty && !confirm('Discard your unsaved changes to this format?'));
}

function wbFmtClick(e) {
  const el = e.target.closest('[data-fmt]');
  if (!el || !wbUi.fmt) return;
  const u = wbUi.fmt, all = wbFormats(), act = el.dataset.fmt;
  if (act === 'select') {
    const f = all.find(x => x.id === el.dataset.id);
    if (!f || (f.id === u.work.id && !u.isNew) || !wbFmtGuard()) return;
    Object.assign(u, { work: wbWorkCopy(f), isNew: false, dirty: false, view: 'edit', makeDefault: Drafting.isDefault(all, wb.defaults, f), ta: null });
    wbPaintFormats();
  } else if (act === 'new') {
    if (!wbFmtGuard()) return;
    Object.assign(u, { work: Drafting.blankFormat(''), isNew: true, dirty: true, view: 'edit', makeDefault: false, ta: null });
    wbPaintFormats();
  } else if (act === 'duplicate') {
    if (u.dirty && !u.isNew && !wbFmtGuard()) return;
    Object.assign(u, { work: Drafting.cloneFormat(u.work), isNew: true, dirty: true, view: 'edit', makeDefault: false, ta: null });
    wbPaintFormats();
  } else if (act === 'default') {
    const f = all.find(x => x.id === el.dataset.id);
    if (!f) return;
    wb.defaults = Drafting.setDefault(wb.defaults, f.docType, f.id);
    wbSave(); wbPaintFormats();
    showToast(`“${f.name}” is now the default for ${f.docType}.`);
  } else if (act === 'view') {
    u.view = el.dataset.v === 'preview' ? 'preview' : 'edit'; wbPaintFormats();
  } else if (act === 'sec-add') {
    u.work.sections.push({ id: uid('s'), heading: '', layout: 'numbered', body: '' }); u.dirty = true; wbPaintFormats();
    const tas = $$('#wbFmt .wb-ta'); tas[tas.length - 1]?.focus();
  } else if (act === 'sec') {
    const i = +el.dataset.i, dir = el.dataset.dir;
    if (dir === 'del') u.work.sections.splice(i, 1); else if (!wbMove(u.work.sections, i, dir === 'up' ? -1 : 1)) return;
    u.dirty = true; wbPaintFormats();
  } else if (act === 'ph') {
    const ta = u.ta && document.body.contains(u.ta) ? u.ta : [...$$('#wbFmt textarea[data-fsec="body"]')].pop();
    if (!ta) { showToast('Add a section first, then click a field to put it in.'); return; }
    ta.setRangeText(`{{${el.dataset.key}}}`, ta.selectionStart, ta.selectionEnd, 'end');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.focus();
  } else if (act === 'save') wbFmtSave();
  else if (act === 'delete') wbFmtDelete();
}

function wbFmtInput(e) {
  const u = wbUi.fmt, el = e.target;
  if (!u || u.work.builtin) return;
  const w = u.work;
  if (el.dataset.f === 'makeDefault') u.makeDefault = el.checked;
  else if (el.dataset.f) w[el.dataset.f] = el.value;
  else if (el.dataset.fs) w.style[el.dataset.fs] = el.dataset.fs === 'size' || el.dataset.fs === 'spacing' ? Number(el.value) : el.value;
  else if (el.dataset.fsec && w.sections[+el.dataset.i]) { w.sections[+el.dataset.i][el.dataset.fsec] = el.value; if (el.matches('textarea')) wbGrow(el); }
  else return;
  u.dirty = true;
}

function wbFmtSave() {
  const u = wbUi.fmt, all = wbFormats();
  const f = Drafting.normalizeFormat(u.work);
  const errs = Drafting.validateFormat(f, all);
  if (errs.length) { showToast(errs[0]); return; }
  const i = wb.formats.findIndex(x => x.id === f.id), oldType = i >= 0 ? wb.formats[i].docType : null;
  if (i >= 0) wb.formats[i] = f; else wb.formats.push(f);
  if (oldType && oldType !== f.docType && wb.defaults[oldType] === f.id) delete wb.defaults[oldType];
  const others = Drafting.formatsFor(wbFormats(), f.docType).filter(x => x.id !== f.id);
  if (u.makeDefault || !others.length) wb.defaults = Drafting.setDefault(wb.defaults, f.docType, f.id);
  else if (wb.defaults[f.docType] === f.id) delete wb.defaults[f.docType];
  wbSave();
  const isDef = Drafting.isDefault(wbFormats(), wb.defaults, f);
  Object.assign(u, { work: wbWorkCopy(f), isNew: false, dirty: false, makeDefault: isDef });
  wbPaintFormats();
  showToast(`Format “${f.name}” saved${isDef ? ` — it is the default for ${f.docType}` : ''}.`);
}

function wbFmtDelete() {
  const u = wbUi.fmt, f = u.work;
  if (!confirm(`Delete the format “${f.name}”? Drafts already made from it keep their text.`)) return;
  const r = Drafting.removeFormat(wb.formats, wb.defaults, f.id);
  wb.formats = r.custom; wb.defaults = r.defaults;
  wbSave();
  const next = Drafting.defaultFormatFor(wbFormats(), wb.defaults, f.docType) || wbFormats()[0];
  Object.assign(u, { work: wbWorkCopy(next), isNew: false, dirty: false, view: 'edit', makeDefault: Drafting.isDefault(wbFormats(), wb.defaults, next), ta: null });
  wbPaintFormats();
  showToast(`Format “${f.name}” deleted.`);
}

wbLoad();
