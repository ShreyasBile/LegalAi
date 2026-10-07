/* =============================================================================
   EVIDENCE — reading the documents' text, searching it, and comparing it.

   The screens for extract.js (reading a file: text, Word, PDF, OCR in English / Hindi / Marathi) and textmine.js
   (dates, amounts, search, possible inconsistencies). The text of each document lives in IndexedDB under
   "<matter id>:<document id>"; the document's own record only keeps how it was read (words, method, languages).

   Everything found here is a pointer for the lawyer to check against the original: OCR can misread a digit, and
   the "possible inconsistencies" list only says two documents give different dates or amounts next to the same word.

   Loaded after workbench.js, which calls evReadLine, evIndexShell, evAfterRender, evForget, evRunReads,
   evOpenRead, evOpenViewer and evLangBoxes.
   ============================================================================= */
const ev = { texts: new Map(), mined: new Map(), conflicts: null, ver: 0, query: '', missing: new Set(), warnedMemory: false };

const evKey = (m, d) => `${m.id}:${d.id}`;
const evChanged = () => { ev.ver++; ev.conflicts = null; };
const evMoney = n => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const evModalOpen = () => !!$('#wbModal')?.classList.contains('open');

function evLangBoxes(selected) {
  const sel = new Set(Extract.normalizeLangs(selected));
  return Object.entries(Extract.LANGS).map(([k, label]) => `<label class="ev-lang"><input type="checkbox" name="lang" value="${k}"${sel.has(k) ? ' checked' : ''} />${esc(label)}</label>`).join('');
}
const evPrivacyNote = () => 'Nothing is uploaded. Word files, text files and PDFs that have a text layer are read right here. Scanned pages and photos are read by OCR in this browser: the first time, it downloads the OCR engine (a few MB) and each language’s data (1.5–3 MB) from a public library host — your document never leaves this computer.';

/* ── the document row ──────────────────────────────────────────────────────── */
function evMethodText(r) {
  const base = Extract.METHODS[r.method] || 'text';
  return r.ocrPages > 0 || r.method === 'ocr' ? `${base} in ${Extract.langLabel(r.langs)}` : base;
}
function evReadBits(d) {                              // plain text, escaped by whoever uses it
  if (!d.read) return 'Text not read yet';
  const r = d.read, bits = [`Text read · ${r.words.toLocaleString('en-IN')} words · ${evMethodText(r)}`];
  if ((r.ocrPages > 0 || r.method === 'ocr') && r.confidence) bits.push(`OCR confidence about ${r.confidence}%`);
  if (r.edited) bits.push('corrected by you');
  return bits.join(' · ');
}
function evReadLine(d) {
  if (!d.read) return `<small class="ev-read ev-unread" data-ev-line="${esc(d.id)}">${esc(evReadBits(d))}</small>`;
  return `<small class="ev-read" data-ev-line="${esc(d.id)}"><i></i>${esc(evReadBits(d))}</small>${d.read.note ? `<small class="ev-warn">${esc(d.read.note)}</small>` : ''}`;
}

/* ── loading and keeping text ──────────────────────────────────────────────── */
async function evText(m, d) {
  const key = evKey(m, d);
  if (ev.texts.has(key)) return ev.texts.get(key);
  let rec = null;
  try { rec = (await Extract.store.get(key)) || null; } catch { rec = null; }
  if (rec && typeof rec.text !== 'string') rec = null;
  ev.texts.set(key, rec);
  return rec;
}
function evForget(m, d) {
  const key = evKey(m, d);
  ev.texts.delete(key); ev.mined.delete(key); evChanged();
  Extract.store.del(key).catch(() => {});
}
function evMine(key, rec) {
  const hit = ev.mined.get(key);
  if (hit && hit.text === rec.text) return hit.mine;
  const mine = TextMine.mine(rec.text);
  ev.mined.set(key, { text: rec.text, mine });
  return mine;
}
async function evKeep(m, d, rec) {                    // store the text, then record how it was read
  await Extract.store.put(evKey(m, d), rec);
  ev.texts.set(evKey(m, d), rec); ev.mined.delete(evKey(m, d)); evChanged();
  d.read = wbCleanRead({ words: TextMine.wordCount(rec.text), method: rec.method, langs: rec.langs, pages: rec.pages, ocrPages: rec.ocrPages, confidence: rec.confidence, at: TODAY_ISO, edited: rec.edited, note: (rec.notes || []).join(' ') });
  if (!Extract.store.persistent && !ev.warnedMemory) { ev.warnedMemory = true; showToast('This browser would not keep the text after you reload, so it will need to be read again.'); }
}

/* ── reading: the progress dialog ──────────────────────────────────────────── */
const EV_PHASE = { wait: 'Waiting', run: 'Reading', done: 'Done', fail: 'Could not be read', skip: 'Not read' };
function evProgressRows(jobs, st) {
  return jobs.map((j, i) => {
    const s = st[i], pct = Math.round((s.fraction || 0) * 100);
    return `<div class="ev-job ev-${s.phase}"><div class="ev-job-top"><strong>${esc(j.doc.name)}</strong><span class="chip ${s.phase === 'done' ? 'chip-teal' : s.phase === 'fail' ? 'chip-amber' : 'chip-navy'}">${EV_PHASE[s.phase]}</span></div>
      ${s.phase === 'run' ? `<div class="ev-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div><small>${esc(s.label || 'Starting…')}</small>` : ''}
      ${s.summary ? `<small>${esc(s.summary)}</small>` : ''}${s.note ? `<small class="ev-warn">${esc(s.note)}</small>` : ''}</div>`;
  }).join('');
}

async function evRunReads(m, jobs, langs, onDone) {
  const ls = Extract.normalizeLangs(langs), signal = { cancelled: false };
  const st = jobs.map(() => ({ phase: 'wait', label: '', fraction: 0, summary: '', note: '' }));
  const paint = () => { const el = $('#evProg'); if (el) el.innerHTML = evProgressRows(jobs, st); };
  wbOpenModal({
    eyebrow: 'Evidence', title: 'Reading documents', focus: false,
    html: `<div id="evProg" aria-live="polite"></div>
      <p class="hint" style="margin:12px 0 0">Scanned pages take a few seconds each. Keep this window open until it is done.</p>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" id="evStop">Stop</button><button type="button" class="btn btn-primary" id="evDone" hidden>Done</button></div>`,
    onClick: e => { if (e.target.closest('#evStop')) { signal.cancelled = true; $('#evStop').disabled = true; } if (e.target.closest('#evDone')) closeModals(); }
  });
  paint();
  for (let i = 0; i < jobs.length; i++) {
    const { doc, file, paste } = jobs[i];
    if (signal.cancelled || !evModalOpen()) { signal.cancelled = true; st[i] = { phase: 'skip', summary: 'Stopped before this one.', fraction: 0 }; continue; }
    st[i].phase = 'run'; paint();
    try {
      const r = file
        ? await Extract.readFile(file, { langs: ls, signal, onProgress: p => { if (!evModalOpen()) signal.cancelled = true; Object.assign(st[i], { label: p.label, fraction: p.fraction }); paint(); } })
        : { text: TextMine.cleanText(paste), method: 'pasted', pages: 0, ocrPages: 0, langs: ls, confidence: 0, notes: [] };
      if (!r.text.trim()) throw new Error(r.notes.join(' ') || 'No text could be made out.');
      await evKeep(m, doc, { text: r.text, method: r.method, langs: r.langs, pages: r.pages, ocrPages: r.ocrPages, confidence: r.confidence, notes: r.notes });
      st[i] = { phase: 'done', fraction: 1, summary: `${TextMine.wordCount(r.text).toLocaleString('en-IN')} words · ${evMethodText({ ...r, langs: ls })}`, note: r.notes.join(' ') };
    } catch (err) {
      st[i] = err && err.cancelled ? { phase: 'skip', summary: 'Stopped.', fraction: 0 } : { phase: 'fail', summary: (err && err.message) || 'This file could not be read.', fraction: 0 };
    }
    paint();
  }
  paint();                                             // files skipped after Stop are never painted inside the loop
  await Extract.release();
  wbSave(m.id);
  const done = $('#evDone'), stop = $('#evStop');
  if (done) { done.hidden = false; if (stop) stop.hidden = true; done.focus(); }
  const read = st.filter(s => s.phase === 'done').length;
  if (!evModalOpen()) showToast(`${read} of ${jobs.length} document${jobs.length === 1 ? '' : 's'} read.`);
  onDone?.();
}

/* ── reading: choosing a file for a document already on the matter ─────────── */
function evOpenRead(m, d) {
  wbOpenModal({
    eyebrow: 'Evidence', title: d.read ? `Read “${wbShort(d.name, 40)}” again` : `Read “${wbShort(d.name, 40)}”`,
    html: `<form class="wb-form">
      <p class="hint" style="margin:0 0 4px">Choose the file again — the app never kept it. ${evPrivacyNote()}</p>
      <label>File<input type="file" name="file" accept=".pdf,.docx,.txt,.md,.csv,.png,.jpg,.jpeg,.bmp,.webp,.gif" /></label>
      <fieldset class="ev-read-opts"><div class="ev-langs"><span>Language of scanned pages and photos:</span>${evLangBoxes(d.read ? d.read.langs : ['eng'])}</div></fieldset>
      <label>…or paste the text<textarea name="paste" rows="6" maxlength="400000" placeholder="Paste the text of the document here"></textarea></label>
      <div class="modal-actions">${wbCancelButton}<button class="btn btn-primary" type="submit">Read</button></div></form>`,
    onSubmit: e => {
      const f = new FormData(e.target), file = e.target.elements.file.files[0], paste = String(f.get('paste') || '').trim();
      if (!file && !paste) { showToast('Choose a file, or paste its text.'); return; }
      evRunReads(m, [file ? { doc: d, file } : { doc: d, paste }], f.getAll('lang'), () => { if (wbCtx().tab === 'evidence') wbRefresh(); });
    }
  });
}

/* ── the text of one document ──────────────────────────────────────────────── */
function evMarkHtml(text, q, cap = 300) {             // the text with every occurrence of q marked; everything else is escaped
  const needle = String(q || '').trim().normalize('NFC').toLowerCase(), lower = text.toLowerCase();
  if (needle.length < 2 || lower.length !== text.length) return { html: esc(text), count: 0 };
  let html = '', at = 0, count = 0;
  for (let i = lower.indexOf(needle); i >= 0 && count < cap; i = lower.indexOf(needle, at)) {
    html += `${esc(text.slice(at, i))}<mark>${esc(text.slice(i, i + needle.length))}</mark>`;
    at = i + needle.length; count++;
  }
  return { html: html + esc(text.slice(at)), count };
}

async function evOpenViewer(m, d, { query = '' } = {}) {
  const rec = await evText(m, d);
  if (!rec) { showToast('The text read earlier is no longer stored in this browser. Choose the file again.'); evOpenRead(m, d); return; }
  const key = evKey(m, d);
  const paint = q => {
    const pre = $('#evText'), out = $('#evFindCount');
    if (!pre) return;
    const cur = ev.texts.get(key).text, r = evMarkHtml(cur, q);
    pre.innerHTML = r.html;
    if (out) out.textContent = q.trim().length < 2 ? '' : r.count ? `${r.count}${r.count >= 300 ? '+' : ''} match${r.count === 1 ? '' : 'es'}` : 'No matches';
    pre.querySelector('mark')?.scrollIntoView({ block: 'center' });
  };
  wbOpenModal({
    eyebrow: 'Evidence', title: d.name, wide: true, focus: false,
    html: `<div class="ev-viewer-bar"><input type="search" id="evFind" class="wb-input" placeholder="Find in this document" value="${esc(query)}" aria-label="Find in this document" /><span class="hint" id="evFindCount" aria-live="polite"></span>
        <button type="button" class="btn btn-ghost btn-sm" id="evEditBtn">Correct the text</button><button type="button" class="btn btn-ghost btn-sm" id="evCopyBtn">${wbIc('copy')}Copy</button></div>
      <p class="hint" style="margin:8px 0">${d.read ? `${esc(evReadBits(d))}. ` : ''}Check anything important against the original — a scan can be misread, especially digits.</p>
      <pre class="ev-text" id="evText" tabindex="0" lang="hi"></pre>
      <form id="evEditForm" class="wb-form" hidden><label>Text<textarea name="text" id="evEditText" rows="16" maxlength="1000000"></textarea></label>
        <div class="modal-actions"><button type="button" class="btn btn-ghost" id="evEditCancel">Cancel</button><button class="btn btn-primary" type="submit">Save corrections</button></div></form>`,
    onInput: e => { if (e.target.id === 'evFind') paint(e.target.value); },
    onClick: async e => {
      const t = e.target.closest('button');
      if (!t) return;
      if (t.id === 'evCopyBtn') { try { await navigator.clipboard.writeText(ev.texts.get(key).text); showToast('Text copied.'); } catch { showToast('This browser would not copy the text. Select it and copy by hand.'); } }
      if (t.id === 'evEditBtn') { $('#evEditText').value = ev.texts.get(key).text; $('#evEditForm').hidden = false; $('#evText').hidden = true; $('#evEditBtn').hidden = true; $('#evEditText').focus(); }
      if (t.id === 'evEditCancel') { $('#evEditForm').hidden = true; $('#evText').hidden = false; $('#evEditBtn').hidden = false; }
    },
    onSubmit: async e => {
      if (e.target.id !== 'evEditForm') return;
      const text = TextMine.cleanText(new FormData(e.target).get('text'));
      if (!text) { showToast('The text cannot be empty. Use Remove to drop the document instead.'); return; }
      const prev = ev.texts.get(key);
      try { await evKeep(m, d, { ...prev, text, edited: true }); } catch { showToast('This browser would not keep the corrected text.'); return; }
      wbSave(m.id);
      $('#evEditForm').hidden = true; $('#evText').hidden = false; $('#evEditBtn').hidden = false;
      paint($('#evFind').value);
      if (wbCtx().tab === 'evidence') wbRefresh();
      showToast('Corrections saved.');
    }
  });
  paint(query);
}

/* ── what the documents say: search, dates, amounts, possible inconsistencies ─ */
function evIndexShell(m) {
  const any = m.documents.some(d => d.read);
  return `<div class="card card-pad ev-index" id="evIndex">
    <div class="card-head"><div><h2>What the documents say</h2><p class="hint">Built only from the text you have read. Dates, amounts and “possible inconsistencies” are found by pattern, so treat each as a place to look and check it against the original — OCR can misread a digit.</p></div></div>
    <div id="evIndexBody">${any ? '<p class="empty-note">Loading the stored text…</p>' : '<p class="empty-note" style="text-align:left">Nothing has been read yet. Use “Read text…” on a document above (or tick “Read the text now” when adding one). Then you can search across the documents, see every date and amount they mention, and see where two documents give different dates or amounts for the same thing.</p>'}</div>
  </div>`;
}

function evAfterRender(root) {
  if (!root || !root.querySelector('#evIndexBody')) return;
  const { m } = wbCtx();
  if (m) evPaint(m);
}

function evSnip(item) {
  const { html } = evMarkHtml(item.snippet, item.raw);
  return `<span class="ev-snip">${html}</span>`;
}

function evDocBlock(m, d, mine) {
  const cap = 60, dates = mine.dates.slice(0, cap), amounts = mine.amounts.slice(0, cap);
  const inChrono = item => m.timeline.some(t => t.iso === item.value && t.source === d.name);
  return `<details class="ev-doc"><summary><strong>${esc(d.name)}</strong><span class="hint">${mine.dates.length} date${mine.dates.length === 1 ? '' : 's'} · ${mine.amounts.length} amount${mine.amounts.length === 1 ? '' : 's'}</span></summary>
    <div class="ev-rows">${dates.map((x, i) => `<div class="ev-row"><time class="mono">${esc(fmtDate(x.value, true))}</time>
        <div class="ev-row-copy">${x.eventLabel ? `<span class="chip chip-navy">${esc(x.eventLabel)}</span> ` : ''}${evSnip(x)}</div>
        <div class="ev-row-act"><button type="button" class="btn-text" data-wb="ev-view" data-doc="${esc(d.id)}" data-q="${esc(x.raw)}">View</button>${inChrono(x) ? '<span class="chip chip-teal">In chronology</span>' : `<button type="button" class="btn-text" data-wb="ev-chrono" data-doc="${esc(d.id)}" data-i="${i}">${wbIc('calendar')}Add to chronology</button>`}</div></div>`).join('')}
      ${amounts.map(x => `<div class="ev-row"><b class="mono">${esc(evMoney(x.value))}</b>
        <div class="ev-row-copy">${x.eventLabel ? `<span class="chip chip-navy">${esc(x.eventLabel)}</span> ` : ''}${evSnip(x)}</div>
        <div class="ev-row-act"><button type="button" class="btn-text" data-wb="ev-view" data-doc="${esc(d.id)}" data-q="${esc(x.raw)}">View</button></div></div>`).join('')}
      ${mine.dates.length > cap || mine.amounts.length > cap ? `<p class="hint">Only the first ${cap} of each are listed here. Use View text to see the rest.</p>` : ''}
      ${mine.dates.length + mine.amounts.length === 0 ? '<p class="hint">No dates or rupee amounts were recognised in this text.</p>' : ''}</div></details>`;
}

function evConflictBlock(c, i) {
  const fmt = it => (c.type === 'date' ? fmtDate(it.value, true) : evMoney(it.value));
  return `<div class="ev-conflict"><div class="contradiction-icon">${wbIc('alert')}</div><div class="ev-conflict-copy">
    <p class="eyebrow" style="margin-bottom:3px">${c.type === 'date' ? 'Different dates' : 'Different amounts'}</p><strong>${esc(c.label)}</strong>
    ${c.docs.map(d => `<div class="ev-conflict-doc"><b>${esc(d.docName)}</b>: ${d.items.map(it => `<span class="chip chip-amber">${esc(fmt(it))}</span>`).join(' ')}
      ${d.items.slice(0, 2).map(it => `<small class="ev-snip">${evMarkHtml(it.snippet, it.raw).html}</small>`).join('')}</div>`).join('')}
    <div class="ev-row-act"><button type="button" class="btn-text" data-wb="${c.type === 'date' ? 'ev-conflict-event' : 'ev-conflict-note'}" data-i="${i}">${c.type === 'date' ? `${wbIc('flag')}Flag in chronology` : `${wbIc('docs')}Save as a note`}</button></div></div></div>`;
}

async function evPaint(m) {
  const docs = m.documents.filter(d => d.read);
  if (!docs.length) return;
  const need = docs.filter(d => !ev.texts.has(evKey(m, d)));
  if (need.length) await Promise.all(need.map(d => evText(m, d)));        // when everything is already in memory this runs straight through, so the card does not flicker
  const box = $('#evIndexBody');
  if (!box || wbCtx().m !== m) return;                 // the user has moved on
  const ready = [], gone = [];
  for (const d of docs) (ev.texts.get(evKey(m, d)) ? ready : gone).push(d);
  for (const d of gone) { const line = document.querySelector(`[data-ev-line="${CSS.escape(d.id)}"]`); if (line) { line.classList.add('ev-lost'); line.textContent = 'The text read earlier is no longer stored in this browser — read the file again.'; } }
  if (!ready.length) { box.innerHTML = '<p class="empty-note" style="text-align:left">The text read earlier is no longer stored in this browser. Use “Read again…” on each document.</p>'; return; }
  const mined = ready.map(d => ({ d, mine: evMine(evKey(m, d), ev.texts.get(evKey(m, d))) }));
  const sig = `${m.id}|${ev.ver}|${ready.map(d => d.id).join(',')}`;
  if (!ev.conflicts || ev.conflicts.sig !== sig) ev.conflicts = { sig, list: ready.length > 1 ? TextMine.findConflicts(ready.map(d => ({ id: d.id, name: d.name, text: ev.texts.get(evKey(m, d)).text }))) : [] };
  const conflicts = ev.conflicts.list;
  box.innerHTML = `
    <label class="ev-search">${wbIc('research')}<input type="search" data-wb-input="ev-search" value="${esc(ev.query)}" placeholder="Search the text of ${ready.length} read document${ready.length === 1 ? '' : 's'}" aria-label="Search the text of the documents" /></label>
    <div id="evSearchOut" aria-live="polite"></div>
    <h3 class="ev-h">Possible inconsistencies <span class="chip chip-${conflicts.length ? 'amber' : 'navy'}">${conflicts.length}</span></h3>
    ${ready.length < 2 ? '<p class="hint">Read at least two documents to compare them.</p>'
      : conflicts.length ? `<p class="hint">Two documents give a different date or amount next to the same word. Often that is fine — they may be about different things — so read both places.</p>${conflicts.map(evConflictBlock).join('')}`
      : '<p class="hint">No document gives a different date or amount from another next to the same word. That is not proof they agree: only dates and rupee amounts are compared.</p>'}
    <h3 class="ev-h">Dates and amounts by document</h3>
    ${mined.map(x => evDocBlock(m, x.d, x.mine)).join('')}`;
  if (ev.query) evSearch(m);
}

function evSearch(m) {
  const out = $('#evSearchOut');
  if (!out) return;
  const q = ev.query.trim();
  if (q.length < 2) { out.innerHTML = ''; return; }
  const results = [];
  for (const d of m.documents) {
    const rec = ev.texts.get(evKey(m, d));
    if (!rec) continue;
    const hits = TextMine.search(rec.text, q, { max: 50 });
    if (hits.length) results.push({ d, hits });
  }
  out.innerHTML = results.length
    ? `<div class="ev-results">${results.map(r => `<div class="ev-result"><div class="ev-result-top"><strong>${esc(r.d.name)}</strong><span class="hint">${r.hits.length}${r.hits.length >= 50 ? '+' : ''} match${r.hits.length === 1 ? '' : 'es'}</span><button type="button" class="btn-text" data-wb="ev-view" data-doc="${esc(r.d.id)}" data-q="${esc(q)}">Open</button></div>
        ${r.hits.slice(0, 3).map(h => `<p class="ev-snip">${evMarkHtml(h.snippet, q).html}</p>`).join('')}</div>`).join('')}</div>`
    : `<p class="hint">Nothing in the read documents matches “${esc(q)}”. Documents whose text has not been read are not searched.</p>`;
}

WB_INPUT['ev-search'] = (el, m) => { ev.query = el.value; evSearch(m); };
WB_CLICK['ev-view'] = (el, m) => { const d = m.documents.find(x => x.id === el.dataset.doc); if (d) evOpenViewer(m, d, { query: el.dataset.q || '' }); };
WB_CLICK['ev-chrono'] = async (el, m) => {
  const d = m.documents.find(x => x.id === el.dataset.doc), rec = d && await evText(m, d);
  const item = rec && evMine(evKey(m, d), rec).dates[+el.dataset.i];
  if (item) wbOpenEventForm(m, { iso: item.value, title: item.eventLabel ? `${item.eventLabel} (${d.name})` : `Date in ${d.name}`, note: `“${item.snippet}”`, source: d.name });
};
WB_CLICK['ev-conflict-event'] = (el, m) => {
  const c = ev.conflicts && ev.conflicts.list[+el.dataset.i];
  if (!c) return;
  const all = c.docs.flatMap(d => d.items.map(it => it.value)).sort();
  wbOpenEventForm(m, { iso: all[0], title: `Possible inconsistency: ${c.label} date`, note: c.docs.map(d => `${d.docName}: ${d.items.map(it => fmtDate(it.value, true)).join(', ')}`).join('\n'), flag: true });
};
WB_CLICK['ev-conflict-note'] = (el, m) => {
  const c = ev.conflicts && ev.conflicts.list[+el.dataset.i];
  if (!c) return;
  wbEnsure(m).notes.unshift({ id: uid('note'), text: `Possible inconsistency — ${c.label} amount\n${c.docs.map(d => `${d.docName}: ${d.items.map(it => evMoney(it.value)).join(', ')}`).join('\n')}`, source: 'manual', createdAt: 'Just now' });
  wbSave(m.id);
  showToast('Saved as a note on this matter (Research tab).');
};
