/* =============================================================================
   AI ASSISTANT — the buttons on the matter tabs, the Settings section for the API key, and the
   helpers on Case law and Limitation. The work is done by the server (/api/ai/*, ai-server.mjs);
   this file is the forms and how the answers are shown.

   Loaded after app.js and workbench.js. app.js calls AiUi.withCard (matter tabs), AiUi.settingsCard,
   AiUi.caselawCard and AiUi.deadlinesCard, and AiUi.bindPage after a page is drawn.

   What the answers are: a model's draft or opinion. Every one says so, names the model, and the
   cases a model mentions are looked up in the database and marked. Nothing here files or sends
   anything. The API key stays on the server: this page can save it but never read it back.
   ============================================================================= */
const AiUi = (() => {
  const ST = { status: null, results: {}, open: new Set(), busy: new Set() };     // results are kept in memory so a repaint of the tab does not lose them

  /* ── what each action asks for ─────────────────────────────────────────── */
  const draftOptions = m => { const cur = typeof dsDraft === 'function' ? dsDraft(m) : null; return (m.drafts || []).map((d, i) => `<option value="${i}"${cur && cur.id === d.id ? ' selected' : ''}>${esc(d.title || `Draft ${i + 1}`)}</option>`).join(''); };
  const draftField = (m, hint) => ({ name: 'draft', label: 'Draft', type: 'draft', hint, options: draftOptions(m) });

  const ACTIONS = {
    'citation-check': { title: 'Check the citations in a draft', needsModel: false, run: 'Check citations',
      help: 'Finds every case name and citation number and looks each up in the Supreme Court database. No AI model is used, so this works without a key.',
      fields: m => [draftField(m, 'Pick a draft, or paste text below.')] },
    'pleading-reply': { title: 'Draft one reply paragraph', run: 'Draft paragraph',
      help: 'Writes the reply to a single paragraph of the opponent\'s pleading, from the stance you choose. Unknown facts stay as [____].',
      fields: () => [{ name: 'paraNumber', label: 'Paragraph no.', type: 'number', value: 1 }, { name: 'averment', label: 'The opponent\'s paragraph', type: 'textarea', rows: 4 },
        { name: 'stance', label: 'Your stance', type: 'select', options: ['Denied', 'Admitted', 'Partly admitted', 'No knowledge', 'Legal objection'].map(s => `<option>${s}</option>`).join('') },
        { name: 'facts', label: 'Facts to rely on', type: 'textarea', rows: 3, prefill: m => `${m.facts?.objective || ''}\n${m.facts?.issue || ''}`.trim() }] },
    'interim-draft': { title: 'Draft a caveat or an interim injunction application', run: 'Draft',
      help: 'Cause title, facts, grounds and prayer for a caveat (s.148A CPC) or an Order XXXIX injunction.',
      fields: m => [{ name: 'type', label: 'Kind', type: 'select', options: ['Caveat (s.148A CPC)', 'Interim injunction (Order XXXIX CPC)'].map(s => `<option>${s}</option>`).join('') },
        { name: 'court', label: 'Court', type: 'text', value: m.court || '' }, { name: 'applicant', label: 'Applicant', type: 'text' }, { name: 'opponent', label: 'Opposite party', type: 'text' },
        { name: 'subject', label: 'What is it about, and what step do you expect or want to stop?', type: 'textarea', rows: 4 }] },
    'court-rules': { title: 'Check a draft against a court\'s filing format', run: 'Check format',
      help: 'Lists what a draft lacks for filing (cause title, verification, affidavit, annexures). It lists problems; it does not rewrite your draft.',
      fields: m => [draftField(m, ''), { name: 'court', label: 'Court', type: 'text', value: m.court || '' }] },
    'vulnerability-audit': { title: 'Look for deemed-admission risks in a reply', run: 'Audit reply',
      help: 'Reads a written statement or reply the way a judge would under Order VIII Rules 3 to 5 CPC and points at paragraphs that may be treated as admitted.',
      fields: m => [draftField(m, '')] },
    'devils-advocate': { title: 'Argue the other side against this matter\'s arguments', run: 'Run devil\'s advocate',
      help: 'Takes the arguments on this tab and argues against each. Authorities it names are looked up and marked; do not cite one that is not confirmed.',
      fields: () => [] },
    'timeline-depositions': { title: 'Chronology and cross-examination questions from the documents', run: 'Build from documents',
      help: 'Uses the text of the documents you have read in this matter. Read a document on this tab first (text files, Word, PDF, or a scan with OCR).',
      fields: () => [] },
    'contradiction-matrix': { title: 'Compare witness statements', run: 'Find contradictions',
      help: 'Paste each statement as "Name: what they said", with a blank line between witnesses. It lists points where two witnesses disagree.',
      fields: () => [{ name: 'statements', label: 'Statements', type: 'textarea', rows: 7, placeholder: 'PW-1 Mehta: I met the applicant at 4 pm on 14 February.\n\nPW-2 Iyer: There was no meeting that day.' }] },
    'vernacular-summary': { title: 'Summarise a Hindi or Marathi document in English', run: 'Summarise',
      help: 'Paste the text, or pick a document you have already read. It translates and summarises; check names, numbers and sections against the original.',
      fields: () => [{ name: 'doc', label: 'Use a document I have read', type: 'readdoc' }, { name: 'text', label: 'Text', type: 'textarea', rows: 6 }] },
    'order-digest': { title: 'Digest a court order', run: 'Digest order',
      help: 'Pulls out the direction, deadlines, next date and what counsel should do. Check the order itself for exact wording.',
      fields: m => [{ name: 'orderText', label: 'Order text', type: 'textarea', rows: 6, prefill: m => (ECOURTS[m.id]?.orders?.[0]?.text || '') }] },
    'next-stage': { title: 'Prepare for the next listing', run: 'Suggest preparation',
      help: 'Reads this matter\'s hearing history and suggests what to have ready. It is a preparation aid, not a forecast: nobody can tell what a court will do.',
      fields: () => [] },
    'client-briefing': { title: 'Write a WhatsApp update for the client', run: 'Write update',
      help: 'A short, plain update in English, Hindi or Marathi. You read it, edit it and send it yourself.',
      fields: m => [{ name: 'clientName', label: 'Client', type: 'text' }, { name: 'language', label: 'Language', type: 'select', options: ['English', 'Hindi', 'Marathi'].map(s => `<option>${s}</option>`).join('') },
        { name: 'outcome', label: 'What happened at the hearing, and the next date', type: 'textarea', rows: 4 }] },
    'query-rewrite': { title: 'Improve my search', run: 'Suggest search terms', where: 'caselaw',
      help: 'Turns a plain-language question into search words and statutory provisions. Any case it names is looked up in the database and marked.',
      fields: () => [{ name: 'query', label: 'What are you looking for?', type: 'text', placeholder: 'e.g. can bail be refused only because the accused is a flight risk' }] },
    'limitation-classify': { title: 'Suggest the limitation period', run: 'Suggest period', where: 'deadlines',
      help: 'Picks a period from the built-in list of 27 and the start date from your description. The dates are then counted by the calculator, not by the model. Check both against the statute.',
      fields: () => [{ name: 'summary', label: 'Describe the dispute and when things happened', type: 'textarea', rows: 4 }] }
  };

  const TAB_ACTIONS = {
    arguments: ['devils-advocate'],
    evidence: ['timeline-depositions', 'contradiction-matrix', 'vernacular-summary'],
    hearing: ['client-briefing'],
    status: ['order-digest', 'next-stage']
  };

  /* ── talking to the server ─────────────────────────────────────────────── */
  async function api(path, data) {
    let res;
    try { res = await fetch(path, data === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); }
    catch { throw Object.assign(new Error('The workspace server did not answer. Is it running?'), { code: 'offline' }); }
    let body = {}; try { body = await res.json(); } catch { /* not JSON */ }
    if (!res.ok) throw Object.assign(new Error(body.message || `The server answered ${res.status}.`), { code: body.error || 'error' });
    return body;
  }
  async function loadStatus(force = false) {
    if (ST.status && !force) return ST.status;
    try { ST.status = await api('/api/ai/status'); } catch { ST.status = { configured: false, usable: false, offline: true }; }
    return ST.status;
  }

  /* ── drawing ───────────────────────────────────────────────────────────── */
  const key = (scope, id) => `${scope}:${id}`;
  const GOT = { verified: ['chip-teal', 'In the database'], 'number-found': ['chip-teal', 'Number found'], 'name-found': ['chip-amber', 'Parties found, number not checked'], misattributed: ['chip-red', 'Number belongs to another case'],
    'wrong-number': ['chip-red', 'Wrong number'], 'not-found': ['chip-red', 'Not confirmed: check by hand'], uncheckable: ['', 'Cannot be checked here'] };
  const badge = s => { const [c, t] = GOT[s] || ['', s]; return `<span class="chip ${c}">${esc(t)}</span>`; };
  const list = (items, cls = '') => (items && items.length ? `<ul class="ai-list ${cls}">${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>` : '<p class="hint">None.</p>');
  const para = t => `<p class="ai-p">${esc(t).replace(/\n/g, '<br>')}</p>`;
  const sub = t => `<p class="eyebrow" style="margin:14px 0 6px">${esc(t)}</p>`;
  /* one looked-up case or citation, as a card: how it came out, what was cited, what the database holds */
  const BAD = new Set(['misattributed', 'wrong-number', 'not-found']);
  const matchBlock = c => (c ? `<div class="ai-cite-match"><strong>${esc(c.title)}</strong><small>${[c.citation, c.neutralCitation].filter(Boolean).map(esc).join(' · ')}</small>${c.pdfUrl ? `<a href="${esc(c.pdfUrl)}" target="_blank" rel="noopener">Open the judgment (PDF)</a>` : ''}</div>` : '');
  const cite = (status, raw, message, match) => `<div class="ai-cite${BAD.has(status) ? ' bad' : ''}"><div>${badge(status)}</div><div class="ai-cite-raw">${esc(raw)}</div><p class="ai-cite-msg">${esc(message)}</p>${matchBlock(match)}</div>`;
  const checks = (cs, label) => (cs && cs.length ? `<div class="ai-checks"><p class="ai-checks-h">${esc(label)}</p>${cs.map(c => cite(c.status, c.text, c.message, c.match)).join('')}</div>` : '');

  const RENDER = {
    'citation-check': r => `${r.items.length ? '' : '<p class="hint">No case names or citation numbers were found in this text.</p>'}
      ${r.items.length ? `<div class="ai-summary"><span><b>${r.summary.found}</b>found</span><span class="ok"><b>${r.summary.verified}</b>confirmed</span><span class="${r.summary.problems ? 'bad' : ''}"><b>${r.summary.problems}</b>not confirmed</span><span><b>${r.summary.uncheckable}</b>cannot be checked here</span></div>` : ''}
      ${r.items.map(i => cite(i.status, i.kind === 'name' ? i.raw : [i.name, i.raw].filter(Boolean).join(' · '), i.message, i.match)).join('')}
      <p class="ai-foot">${esc(r.note)}</p>`,
    'pleading-reply': r => para(r.text), 'interim-draft': r => para(r.text), 'client-briefing': r => para(r.text),
    'court-rules': r => `${r.summary ? para(r.summary) : ''}${r.issues.length ? r.issues.map(i => `<div class="ai-item"><strong>${esc(i.what)}</strong><small>${esc(i.where)}</small><p>${esc(i.fix)}</p></div>`).join('') : '<p class="hint">No problems listed.</p>'}`,
    'vulnerability-audit': r => `${r.impression ? para(r.impression) : ''}${r.risks.length ? r.risks.map(i => `<div class="ai-item"><span class="chip chip-amber">${esc(i.type)}</span> <strong>${esc(i.paragraph)}</strong><p>${esc(i.problem)}</p><p class="ai-fix">${esc(i.fix)}</p></div>`).join('') : '<p class="hint">No risks listed.</p>'}`,
    'devils-advocate': r => `${r.summary ? para(r.summary) : ''}${r.pushback.map(p => `<div class="ai-item"><span class="chip ${p.risk === 'High' ? 'chip-red' : p.risk === 'Low' ? 'chip-teal' : 'chip-amber'}">${esc(p.risk)} risk</span> <strong>${esc(p.argument)}</strong>
      ${sub('Opposing counsel would say')}${para(p.counter)}${sub('How to answer')}${para(p.suggestedAnswer)}${checks(p.authorityChecks, 'Authorities the model named, looked up')}</div>`).join('')}`,
    'timeline-depositions': r => `${sub('Chronology')}${r.timeline.length ? `<table class="ai-table"><tbody>${r.timeline.map(t => `<tr><td class="mono">${esc(t.date)}</td><td>${esc(t.event)}${t.contested ? ' <span class="chip chip-amber">contested</span>' : ''}</td><td><small>${esc(t.source)}</small></td></tr>`).join('')}</tbody></table>` : '<p class="hint">None.</p>'}
      ${sub('Questions for cross-examination')}${r.questions.map(q => `<div class="ai-item"><strong>${esc(q.witness)}</strong><p>${esc(q.question)}</p><small>Aim: ${esc(q.aim)}${q.document ? ` · Confront with: ${esc(q.document)}` : ''}</small></div>`).join('') || '<p class="hint">None.</p>'}`,
    'contradiction-matrix': r => (r.points.length ? r.points.map(p => `<div class="ai-item"><span class="chip ${p.severity === 'Critical' ? 'chip-red' : p.severity === 'Minor' ? 'chip-teal' : 'chip-amber'}">${esc(p.severity)}</span> <strong>${esc(p.topic)}</strong>
      <div class="ai-two"><div><small>${esc(p.a.witness)}</small><p>${esc(p.a.position)}</p></div><div><small>${esc(p.b.witness)}</small><p>${esc(p.b.position)}</p></div></div><p class="ai-fix">${esc(p.note)}</p></div>`).join('') : '<p class="hint">No contradictions found in these statements.</p>'),
    'vernacular-summary': r => `<p><span class="chip">${esc(r.language)}</span></p>${para(r.summary)}${sub('Parties')}${list(r.parties)}${sub('Sections mentioned')}${list(r.sections)}${r.glossary.length ? sub('Glossary') + `<table class="ai-table"><tbody>${r.glossary.map(g => `<tr><td>${esc(g.original)}</td><td>${esc(g.english)}</td></tr>`).join('')}</tbody></table>` : ''}`,
    'order-digest': r => `${para(r.direction)}<p><span class="chip">${esc(r.status)}</span> Next date: <strong>${esc(r.nextDate)}</strong></p>${sub('To comply with')}${list(r.compliance)}${sub('What counsel should do')}${list(r.actions)}`,
    'next-stage': r => `${para(r.likelyStage)}<p class="hint">Based on: ${esc(r.basis)}</p>${sub('Have ready')}${list(r.prepare)}${sub('Could go differently')}${list(r.watch)}`,
    'query-rewrite': r => `<p>Search for: <strong>${esc(r.keywords)}</strong> <button class="btn btn-ghost btn-sm" data-ai-search="${esc(r.keywords.replace(/[,;]+/g, ' ').replace(/\s+/g, ' ').trim())}">Search these words</button></p>${r.advice ? para(r.advice) : ''}${sub('Provisions')}${list(r.provisions)}${checks(r.precedentChecks, 'Cases the model suggested, looked up')}`,
    'limitation-classify': (r, extra) => `<p><strong>${esc(extra?.ruleName || r.ruleId)}</strong>${r.startDate ? ` · start date ${esc(r.startDate)}` : ' · the start date was not in your description'}</p>${para(r.reasoning)}
      <button class="btn btn-teal btn-sm" data-ai-limit="${esc(r.ruleId)}|${esc(r.startDate)}">Use in the calculator</button>`
  };

  function fieldHtml(f, m, id) {
    const nm = `data-ai-f="${f.name}"`, ph = f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : '';
    const pre = f.prefill && m ? f.prefill(m) : f.value ?? '';
    const lab = `<label class="ai-label" for="${id}-${f.name}">${esc(f.label)}</label>`;
    if (f.type === 'textarea') return `<div class="ai-field">${lab}<textarea class="wb-ta" id="${id}-${f.name}" ${nm} rows="${f.rows || 4}"${ph}>${esc(pre)}</textarea></div>`;
    if (f.type === 'select') return `<div class="ai-field">${lab}<select class="wb-select" id="${id}-${f.name}" ${nm}>${f.options}</select></div>`;
    if (f.type === 'draft') return `<div class="ai-field">${lab}<select class="wb-select" id="${id}-${f.name}" ${nm}>${f.options}<option value="paste">Text I paste below</option></select>
      <textarea class="wb-ta" ${nm.replace(f.name, 'pasted')} rows="3" placeholder="${esc(f.hint || 'Paste text here to use it instead of a draft')}"></textarea></div>`;
    if (f.type === 'readdoc') return `<div class="ai-field">${lab}<select class="wb-select" id="${id}-${f.name}" data-ai-readdoc="1">${(m?.documents || []).filter(d => d.read).map(d => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join('') || ''}<option value="">— none —</option></select></div>`;
    return `<div class="ai-field">${lab}<input class="wb-input" id="${id}-${f.name}" ${nm} type="${f.type === 'number' ? 'number' : 'text'}" value="${esc(pre)}"${ph}></div>`;
  }

  function actionHtml(name, m, bare = false) {
    const a = ACTIONS[name], scope = m ? m.id : 'global', k = key(scope, name), id = `ai-${scope}-${name}`;
    const res = ST.results[k];
    const open = bare ? `<div class="ai-act ai-bare" data-ai-key="${esc(k)}">` : `<details class="ai-act" data-ai-key="${esc(k)}" ${ST.open.has(k) ? 'open' : ''}>
      <summary><span>${esc(a.title)}</span>${a.needsModel === false ? '<span class="chip chip-teal">no key needed</span>' : ''}</summary>`;
    return `${open}
      <div class="ai-body" data-ai-name="${name}" data-ai-scope="${esc(scope)}">
        <p class="hint">${esc(a.help)}</p>
        ${a.fields(m).map(f => fieldHtml(f, m, id)).join('')}
        <button class="btn btn-teal btn-sm" data-ai-run="${name}" ${ST.busy.has(k) ? 'disabled' : ''}>${ST.busy.has(k) ? 'Working…' : esc(a.run)}</button>
        <div class="ai-result" data-ai-result>${res ? resultHtml(name, res) : ''}</div>
      </div>${bare ? '</div>' : '</details>'}`;
  }

  function resultHtml(name, res) {
    if (res.error) return `<div class="ai-error">${esc(res.error)}</div>`;
    const a = ACTIONS[name];
    const label = a.needsModel === false ? '' : `<p class="ai-label-ai">Written by a model${res.model ? ` (${esc(res.model)})` : ''}. It can be wrong: check every fact, date and citation before you use it.</p>`;
    return `${label}<div class="ai-out" data-ai-out>${RENDER[name](res.result, res.extra)}</div>
      <div class="ai-tools"><button class="btn btn-ghost btn-sm" data-ai-copy>Copy</button>${res.matterId ? '<button class="btn btn-ghost btn-sm" data-ai-save>Save to matter notes</button>' : ''}</div>`;
  }

  function banner() {
    const s = ST.status;
    if (!s || s.usable) return '';
    return `<div class="ai-banner">${s.offline ? 'The workspace server did not answer.' : 'AI actions need an OpenRouter API key.'} <a href="#/settings">Add it in Settings</a>. Citation checking works without one.</div>`;
  }

  function withCard(base, m, tab) {
    const names = TAB_ACTIONS[tab];
    if (!names) return base;
    if (!ST.status) loadStatus().then(() => { const root = document.querySelector('#matterTabContent .ai-card .ai-banner-slot'); if (root) root.innerHTML = banner(); });
    return `${base}<div class="card card-pad ai-card" id="aiCard">
      <div class="card-head"><div><p class="eyebrow">AI assistant</p><h2>Drafts and checks from a language model</h2></div></div>
      <p class="hint">These produce drafts and opinions for you to review. Nothing is filed or sent. Cases a model names are looked up in the database and marked.</p>
      <div class="ai-banner-slot">${banner()}</div>
      ${names.map(n => actionHtml(n, m)).join('')}</div>`;
  }

  /* ── running an action ─────────────────────────────────────────────────── */
  const plainDraft = d => {
    try { return Drafting.layoutBlocks(d).blocks.map(b => (b.t === 'para' ? `${b.num ? `${b.num} ` : ''}${b.text}` : b.text || '')).join('\n').trim(); } catch { return ''; }
  };
  const val = (root, n) => root.querySelector(`[data-ai-f="${n}"]`)?.value ?? '';

  async function draftText(root, m) {
    const sel = val(root, 'draft'), pasted = val(root, 'pasted').trim();
    if (sel === 'paste' || (!sel && pasted)) return pasted;
    return pasted || plainDraft(m.drafts[Number(sel)] || {});
  }

  async function payloadFor(name, root, m) {
    switch (name) {
      case 'citation-check': return { text: await draftText(root, m) };
      case 'court-rules': return { draft: await draftText(root, m), court: val(root, 'court') };
      case 'vulnerability-audit': return { draft: await draftText(root, m) };
      case 'pleading-reply': return { paraNumber: Number(val(root, 'paraNumber')) || 1, averment: val(root, 'averment'), stance: val(root, 'stance'), facts: val(root, 'facts') };
      case 'interim-draft': return { type: val(root, 'type'), court: val(root, 'court'), applicant: val(root, 'applicant'), opponent: val(root, 'opponent'), subject: val(root, 'subject') };
      case 'devils-advocate': return { matterTitle: m.title, court: m.court, arguments: (m.arguments || []).map(a => ({ point: a.point, support: a.support })) };
      case 'timeline-depositions': {
        const docs = [];
        for (const d of m.documents || []) { if (!d.read) continue; const rec = await evText(m, d); if (rec?.text) docs.push({ title: d.name, text: rec.text }); }
        return { documents: docs };
      }
      case 'contradiction-matrix': return { statements: val(root, 'statements').split(/\n\s*\n/).map(b => { const i = b.indexOf(':'); return i > 0 ? { witnessName: b.slice(0, i).trim(), statement: b.slice(i + 1).trim() } : null; }).filter(Boolean) };
      case 'vernacular-summary': return { text: val(root, 'text') };
      case 'order-digest': return { orderText: val(root, 'orderText') };
      case 'next-stage': {
        const e = ECOURTS[m.id] || {};
        const history = (e.orders || []).map(o => ({ hearingDate: o.date, purpose: o.text }));
        if (e.nextDate) history.unshift({ hearingDate: e.nextDate, purpose: `Next listing: ${e.nextPurpose || ''}` });
        return { caseType: m.area, history };
      }
      case 'client-briefing': return { clientName: val(root, 'clientName'), matterTitle: m.title, language: val(root, 'language'), outcome: val(root, 'outcome') };
      case 'query-rewrite': return { query: val(root, 'query') };
      case 'limitation-classify': return { summary: val(root, 'summary'), rules: Limitation.RULES.map(r => ({ id: r.id, name: r.name, trigger: r.trigger })) };
      default: return {};
    }
  }

  async function run(btn) {
    const body = btn.closest('.ai-body'), name = body.dataset.aiName, scope = body.dataset.aiScope;
    const m = scope === 'global' ? null : matterById(scope), k = key(scope, name);
    if (ST.busy.has(k)) return;
    ST.busy.add(k); ST.open.add(k);
    btn.disabled = true; btn.textContent = 'Working…';
    const slot = body.querySelector('[data-ai-result]');
    try {
      const payload = await payloadFor(name, body, m);
      const r = await api('/api/ai/run', { action: name, payload });
      const extra = name === 'limitation-classify' ? { ruleName: Limitation.RULES.find(x => x.id === r.result.ruleId)?.name } : undefined;
      ST.results[k] = { result: r.result, model: r.model, extra, matterId: m?.id || '' };
    } catch (e) { ST.results[k] = { error: e.message }; }
    ST.busy.delete(k);
    const fresh = document.querySelector(`.ai-act[data-ai-key="${CSS.escape(k)}"] [data-ai-result]`) || slot;
    if (fresh) fresh.innerHTML = resultHtml(name, ST.results[k]);
    const b2 = document.querySelector(`.ai-act[data-ai-key="${CSS.escape(k)}"] [data-ai-run]`) || btn;
    b2.disabled = false; b2.textContent = ACTIONS[name].run;
  }

  /* ── clicks, once for the whole page (so a repaint of a tab never loses them) ── */
  let wired = false;
  function wire() {
    if (wired) return; wired = true;
    document.addEventListener('click', async e => {
      const t = e.target.closest('[data-ai-run],[data-ai-copy],[data-ai-save],[data-ai-search],[data-ai-limit],[data-ai-set]');
      if (!t) return;
      if (t.dataset.aiRun !== undefined) return run(t);
      const act = t.closest('.ai-act');
      if (t.dataset.aiCopy !== undefined) {
        const text = act.querySelector('[data-ai-out]').innerText;
        try { await navigator.clipboard.writeText(text); showToast('Copied.'); } catch { showToast('Could not copy: select the text and copy it.'); }
      } else if (t.dataset.aiSave !== undefined) {
        const m = matterById(act.querySelector('.ai-body').dataset.aiScope);
        if (!m) return;
        wbEnsure(m);
        m.notes.unshift({ id: uid('note'), text: act.querySelector('[data-ai-out]').innerText.slice(0, 6000), source: 'ask-ai', createdAt: new Date().toISOString() });
        wbSave(m.id);
        showToast('Saved to this matter\'s notes (Research tab).');
      } else if (t.dataset.aiSearch !== undefined) {
        location.hash = `#/caselaw?q=${encodeURIComponent(t.dataset.aiSearch)}`;
      } else if (t.dataset.aiLimit !== undefined) {
        const [ruleId, start] = t.dataset.aiLimit.split('|');
        if (typeof dlUi === 'object') { dlUi.ruleId = ruleId; if (start) dlUi.start = start; }
        showToast('Set in the calculator below. Check the start date.');
        const hash = location.hash; route();
        if (location.hash === hash) window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
    document.addEventListener('toggle', e => {
      const d = e.target; if (!(d instanceof HTMLDetailsElement) || !d.dataset.aiKey) return;
      d.open ? ST.open.add(d.dataset.aiKey) : ST.open.delete(d.dataset.aiKey);
    }, true);
    document.addEventListener('change', async e => {
      const sel = e.target.closest('[data-ai-readdoc]'); if (!sel) return;
      const m = matterById(sel.closest('.ai-body').dataset.aiScope), d = (m?.documents || []).find(x => x.id === sel.value);
      const ta = sel.closest('.ai-body').querySelector('[data-ai-f="text"]');
      if (d && ta) { const rec = await evText(m, d); ta.value = rec?.text || ''; }
    });
  }

  /* ── Settings: the API key ─────────────────────────────────────────────── */
  function settingsCard() {
    return `<div class="card card-pad ai-settings" id="aiSettings"><h2>AI model (OpenRouter)</h2>
      <p class="hint">The AI buttons on matters, Case law and Limitation use a language model through OpenRouter. Your key is saved on this computer by the workspace server and is never shown here again or sent anywhere except OpenRouter.</p>
      <div id="aiStatusLine" class="ai-status">Checking…</div>
      <div class="ai-field"><label class="ai-label" for="aiKey">OpenRouter API key</label><input class="wb-input" id="aiKey" type="password" autocomplete="off" spellcheck="false" placeholder="sk-or-v1-…"></div>
      <div class="ai-field"><label class="ai-label" for="aiModel">Model</label><input class="wb-input" id="aiModel" type="text" placeholder="openrouter/auto"><small class="hint">Any model id from openrouter.ai/models. The default lets OpenRouter choose.</small></div>
      <details class="ai-adv"><summary>Advanced</summary><div class="ai-field"><label class="ai-label" for="aiBase">API address</label><input class="wb-input" id="aiBase" type="text" placeholder="https://openrouter.ai/api/v1"><small class="hint">Leave blank for OpenRouter. A model on this computer (for example Ollama at http://localhost:11434/v1) needs no key.</small></div></details>
      <div class="ai-row"><button class="btn btn-teal btn-sm" id="aiSave">Save</button><button class="btn btn-ghost btn-sm" id="aiTest">Test connection</button><button class="btn btn-ghost btn-sm" id="aiClear">Remove key</button></div>
      <div id="aiMsg" class="ai-msg" aria-live="polite"></div></div>`;
  }
  function paintStatus(s) {
    const line = document.querySelector('#aiStatusLine'); if (!line) return;
    if (s.offline) line.innerHTML = '<span class="chip chip-red">Server not reachable</span>';
    else if (s.configured) line.innerHTML = `<span class="chip chip-teal">Key saved ${esc(s.keyHint)}</span> <small>${s.source === 'environment' ? 'from the OPENROUTER_API_KEY environment variable · ' : ''}model ${esc(s.model)}</small>`;
    else if (s.usable) line.innerHTML = `<span class="chip chip-teal">Using a model on this computer</span> <small>${esc(s.model)} at ${esc(s.baseUrl)}</small>`;
    else line.innerHTML = '<span class="chip chip-amber">No key yet</span> <small>AI buttons need a key to work. Citation checking does not.</small>';
    const m = document.querySelector('#aiModel'), b = document.querySelector('#aiBase');
    if (m && !m.value) m.placeholder = s.model || 'openrouter/auto';
    if (b && !b.value) b.placeholder = s.baseUrl || 'https://openrouter.ai/api/v1';
  }
  async function bindSettings() {
    const msg = t => { const el = document.querySelector('#aiMsg'); if (el) el.textContent = t; };
    paintStatus(await loadStatus(true));
    const keyEl = document.querySelector('#aiKey');
    document.querySelector('#aiSave')?.addEventListener('click', async () => {
      const data = {}, k = keyEl.value.trim(), model = document.querySelector('#aiModel').value, base = document.querySelector('#aiBase').value;
      if (k) data.apiKey = k;
      if (model.trim() || ST.status?.model !== undefined) data.model = model;
      data.baseUrl = base;
      try { ST.status = await api('/api/ai/settings', data); keyEl.value = ''; paintStatus(ST.status); msg('Saved.'); } catch (e) { msg(e.message); }
    });
    document.querySelector('#aiTest')?.addEventListener('click', async () => {
      msg('Testing…');
      try { const r = await api('/api/ai/test', {}); msg(`Connected. ${r.model} answered "${r.reply}".`); } catch (e) { msg(e.message); }
    });
    document.querySelector('#aiClear')?.addEventListener('click', async () => {
      try { ST.status = await api('/api/ai/settings', { clear: true }); paintStatus(ST.status); msg('The saved key was removed.'); } catch (e) { msg(e.message); }
    });
  }

  /* ── single-action cards on other pages ────────────────────────────────── */
  const pageCard = (name, title) => {
    if (!ST.status) loadStatus().then(() => { const el = document.querySelector('.ai-banner-slot'); if (el) el.innerHTML = banner(); });
    return `<div class="card card-pad ai-card" style="margin-top:18px"><div class="card-head"><div><p class="eyebrow">AI assistant</p><h2>${esc(title)}</h2></div></div><div class="ai-banner-slot">${banner()}</div>${actionHtml(name, null)}</div>`;
  };

  return {
    withCard, settingsCard, bindSettings, wire,
    caselawCard: () => pageCard('query-rewrite', 'Not sure what to search for?'),
    deadlinesCard: () => pageCard('limitation-classify', 'Not sure which period applies?'),
    bindPage(key) { wire(); if (key === 'settings') bindSettings(); },
    cite, api, loadStatus, usable: () => !!ST.status?.usable, hasStatus: () => !!ST.status, banner, render: (name, r) => RENDER[name](r),
    popupHtml(name, m) { wire(); if (!ST.status) loadStatus().then(() => { const el = document.querySelector('.ai-pop-banner'); if (el) el.innerHTML = banner(); }); return `<div class="ai-pop-banner">${banner()}</div>${actionHtml(name, m, true)}`; },
    actionTitle: name => ACTIONS[name]?.title || name,
    _ACTIONS: ACTIONS
  };
})();
