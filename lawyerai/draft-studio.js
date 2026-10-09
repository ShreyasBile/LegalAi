/* =============================================================================
   THE DRAFTING PAGE — a matter's Drafting tab.

   1. Which application? A card for each kind of document (the formats in Document formats).
   2. How to prepare it?  Manual (write each section), Auto (AI writes the sections from what you tell it)
      or Preview (the finished document as it will print).
   3. A floating tool rail on the right: every check and helper for the draft opens in a popup from there.

   The sections, versions, approval and export are the same ones as before (workbench.js and drafting.js);
   this file is the page around them. Loaded after workbench.js and ai-ui.js.
   ============================================================================= */
const dsDraft = m => wbDraftOf(m);

const DraftStudio = (() => {
  const MODES = [
    { id: 'edit', name: 'Manual', icon: 'edit', text: 'Write and edit each section yourself, starting from the format filled with this matter\'s record.' },
    { id: 'auto', name: 'Auto', icon: 'spark', text: 'Tell it what happened and AI writes the sections for you to review. Needs an OpenRouter key.' },
    { id: 'preview', name: 'Preview', icon: 'docs', text: 'See the finished document as it will print.' }
  ];

  /* ── the tool rail ─────────────────────────────────────────────────────── */
  const TOOLS = [
    { group: 'Check', tools: [
      { id: 'complete', icon: 'check', name: 'Completeness', fn: 'How complete the draft is, what is missing, and the court rules it is checked against.', needsDraft: true },
      { id: 'citations', icon: 'shield', name: 'Citation check', fn: 'Looks up every case and citation in the draft in the Supreme Court database. Needs no AI key.', needsDraft: true, ai: 'citation-check' },
      { id: 'format', icon: 'court', name: 'Filing format check', fn: 'AI lists what the draft lacks for filing in a court: cause title, verification, annexures.', needsDraft: true, ai: 'court-rules' },
      { id: 'audit', icon: 'alert', name: 'Deemed-admission audit', fn: 'AI reads a reply as a judge would and flags paragraphs that may be treated as admitted.', needsDraft: true, ai: 'vulnerability-audit' }
    ] },
    { group: 'Write', tools: [
      { id: 'reply', icon: 'edit', name: 'Reply to one paragraph', fn: 'AI drafts the answer to a single paragraph of the other side\'s pleading.', ai: 'pleading-reply' },
      { id: 'parawise', icon: 'scale', name: 'Para-wise reply', fn: 'Answer a plaint or notice paragraph by paragraph and put the reply in a draft.' },
      { id: 'interim', icon: 'gavel', name: 'Caveat or injunction', fn: 'AI drafts a caveat (s.148A CPC) or an Order XXXIX injunction application.', ai: 'interim-draft' }
    ] },
    { group: 'Manage', tools: [
      { id: 'formats', icon: 'docs', name: 'Document formats', fn: 'Set up how each kind of document is laid out, and make your own the default.' },
      { id: 'rules', icon: 'book', name: 'Court rules', fn: 'Enter a court\'s paper, margins and page-number rules for the Word file.' },
      { id: 'history', icon: 'clock', name: 'History', fn: 'Earlier versions of this draft, a redline between any two, and restore.', needsDraft: true },
      { id: 'comments', icon: 'chat', name: 'Review comments', fn: 'Comments from a reviewer on each section, with replies.', needsDraft: true }
    ] }
  ];

  const toolHtml = (t, m, d, pct) => {
    const off = t.needsDraft && !d;
    return `<button type="button" class="ds-tool${t.ai && t.ai !== 'citation-check' ? ' ai' : ''}" data-wb="ds-tool" data-tool="${t.id}" aria-label="${esc(t.name)}: ${esc(t.fn)}"${off ? ' disabled' : ''}>
      ${wbIc(t.icon)}${t.id === 'complete' && d ? `<em id="dsPct">${pct}</em>` : ''}
      <span class="ds-tip" role="tooltip"><b>${esc(t.name)}${t.ai && t.ai !== 'citation-check' ? ' <i>AI</i>' : ''}</b>${esc(off ? 'Start a draft first.' : t.fn)}</span></button>`;
  };
  const railHtml = (m, d) => {
    const pct = d ? Drafting.draftChecks(d, m, wbProfileOf(d)).pct : 0;
    return `<nav class="ds-rail" aria-label="Drafting tools">${TOOLS.map(g => `<div class="ds-group" role="group" aria-label="${g.group}">${g.tools.map(t => toolHtml(t, m, d, pct)).join('')}</div>`).join('<i class="ds-sep"></i>')}</nav>`;
  };

  /* ── the page ──────────────────────────────────────────────────────────── */
  const chosenType = m => wbUi.docType[m.id] || wbDraftOf(m)?.docType || '';
  const typesOf = () => Drafting.docTypes(wbFormats());
  const defaultFormat = type => Drafting.defaultFormatFor(wbFormats(), wb.defaults, type);

  function typeCards(m, cur) {
    return `<div class="ds-types" role="radiogroup" aria-label="Application">${typesOf().map(t => {
      const n = m.drafts.filter(d => d.docType === t).length, f = defaultFormat(t);
      return `<button type="button" class="ds-type${t === cur ? ' on' : ''}" role="radio" aria-checked="${t === cur}" data-wb="ds-type" data-type="${esc(t)}">
        <strong>${esc(t)}</strong><small>${esc(f?.description || '')}</small>${n ? `<span class="chip chip-teal">${n} in this matter</span>` : ''}</button>`;
    }).join('')}</div>`;
  }

  function draftTabs(m, d) {
    if (!m.drafts.length) return '';
    return `<div class="wb-bar ds-drafts"><span class="ds-label">Drafts in this matter</span><div class="wb-drafts" role="tablist">${m.drafts.map(x => `<button type="button" role="tab" class="wb-draft-tab${d && x.id === d.id ? ' active' : ''}" aria-selected="${!!d && x.id === d.id}" data-wb="draft-pick" data-id="${esc(x.id)}"><span>${esc(x.title)}</span>${x.status === 'Approved' ? '<i class="wb-ok" title="Approved"></i>' : ''}</button>`).join('')}</div>
      <button type="button" class="btn btn-ghost btn-sm" data-wb="draft-new">${wbIc('plus')}New draft…</button></div>`;
  }

  function modeCards(active, hasDraft) {
    return `<div class="ds-modes" role="radiogroup" aria-label="How to prepare it">${MODES.map(x => {
      const off = x.id === 'preview' && !hasDraft;
      return `<button type="button" class="ds-mode${x.id === active ? ' on' : ''}" role="radio" aria-checked="${x.id === active}" data-wb="ds-mode" data-mode="${x.id}"${off ? ' disabled' : ''}>
        <span class="ds-mode-ic">${wbIc(x.icon)}</span><strong>${x.name}</strong><small>${esc(off ? 'Start a draft first.' : x.text)}</small></button>`;
    }).join('')}</div>`;
  }

  const sectionFoot = (d, approved) => `<div class="wb-draft-foot">${approved
    ? `<span class="wb-approved">${wbIc('shield')}Approved ${esc(d.approvedAt)}</span><div class="wb-foot-actions"><button type="button" class="btn btn-teal btn-sm" data-wb="draft-word">${wbIc('download')}Download Word (.docx)</button><button type="button" class="btn btn-ghost btn-sm" data-wb="draft-print">Print / save as PDF</button><button type="button" class="btn-text" data-wb="draft-reopen">Reopen for editing</button></div>`
    : `<span class="hint" style="margin:0">You approve every draft before it can be exported.</span><div class="wb-foot-actions"><button type="button" class="btn btn-ghost btn-sm wb-danger-btn" data-wb="draft-del">Delete this draft</button><button type="button" class="btn btn-teal btn-sm" data-wb="draft-approve">Approve draft</button></div>`}</div>`;

  function draftCard(m, d, preview) {
    const approved = d.status === 'Approved';
    return `<div class="card wb-draft">
      <div class="wb-draft-head"><input class="wb-title" data-wb-input="draft-title" value="${esc(d.title)}" maxlength="120" aria-label="Draft title"${approved ? ' readonly' : ''} /><span class="chip ${approved ? 'chip-teal' : 'chip-amber'}">${approved ? 'Approved' : 'Draft'}</span></div>
      <div class="wb-draft-sub"><span>Format: <b>${esc(d.formatName || 'Custom')}</b> · ${esc(d.docType)}</span></div>
      ${approved ? '<p class="wb-banner">Approved and locked. Reopen the draft to change it; it will need approving again before it can be exported.</p>' : ''}
      <div class="wb-draft-body">${preview ? `<div class="wb-paper">${Drafting.renderDraftHtml(d)}</div>` : wbEditorHtml(d, approved)}</div>
      ${sectionFoot(d, approved)}</div>`;
  }

  /* Auto: what the AI is told. Starts from this matter's record; the advocate edits it. */
  function autoState(m) {
    if (!wbUi.auto[m.id]) {
      const f = m.facts || {};
      wbUi.auto[m.id] = { court: m.court || '', parties: m.title || '', facts: [f.objective, f.issue].filter(Boolean).join('\n'), relief: f.relief || '', other: '', useRecord: true };
    }
    return wbUi.auto[m.id];
  }

  function autoPanel(m, d, type) {
    const a = autoState(m), res = wbUi.autoResult[m.id], busy = !!wbUi.autoBusy[m.id], approved = d?.status === 'Approved';
    const usable = AiUi.usable();
    const field = (name, label, rows, hint) => `<label class="ds-field"><span>${label}</span><textarea class="wb-ta" rows="${rows}" data-wb-input="ds-auto" data-f="${name}">${esc(a[name])}</textarea>${hint ? `<small>${hint}</small>` : ''}</label>`;
    const line = (name, label) => `<label class="ds-field"><span>${label}</span><input class="wb-input" data-wb-input="ds-auto" data-f="${name}" value="${esc(a[name])}" maxlength="300" /></label>`;
    const pinned = m.authorities.length;
    return `<div class="card card-pad ds-auto">
      <div class="card-head"><div><p class="eyebrow">Auto · AI</p><h2>Tell it about the ${esc(type.toLowerCase())}</h2></div></div>
      <p class="hint">Fill in what you know. The AI writes every section of the ${esc(type.toLowerCase())} from this, using the matter's record if you leave that on. It leaves <b>[____]</b> where it has no fact, and you review everything.</p>
      ${usable ? '' : `<div class="ai-banner">AI needs an OpenRouter API key. <a href="#/settings">Add it in Settings</a>, then come back; nothing you type here is lost.</div>`}
      ${approved ? '<div class="ai-banner">This draft is approved and locked. Reopen it in Manual first.</div>' : ''}
      <div class="ds-form">
        ${line('court', 'Court')}${line('parties', 'Parties')}
        ${field('facts', 'What happened', 6, 'The facts in your own words, with dates. This is what the draft is built on.')}
        ${field('relief', 'What you want the court to do', 3)}
        ${field('other', 'Anything else: FIR number, notice, order, instructions', 3)}
        <label class="ds-check"><input type="checkbox" data-wb-change="ds-auto-record"${a.useRecord ? ' checked' : ''} /> Also use this matter's chronology (${m.timeline.length}), arguments (${m.arguments.length}) and pinned authorities (${pinned})</label>
        <p class="hint" style="margin:0">${pinned ? `It may cite only the ${pinned} authorit${pinned === 1 ? 'y' : 'ies'} you pinned on the Research tab.` : 'No authorities are pinned on the Research tab, so it will write [authority to be added] where a ground needs one.'}</p>
      </div>
      <div class="ds-actions"><button type="button" class="btn btn-teal" data-wb="ds-generate"${busy || approved || !usable ? ' disabled' : ''}>${busy ? 'Writing…' : `${wbIc('spark')}Write the ${esc(type.toLowerCase())}`}</button>
        ${d ? '<span class="hint" style="margin:0">This replaces the text of the sections it writes. The earlier text stays in History.</span>' : ''}</div>
      ${res ? autoResultHtml(res) : ''}</div>`;
  }

  function autoResultHtml(res) {
    if (res.error) return `<div class="ai-error" style="margin-top:14px">${esc(res.error)}</div>`;
    const c = res.citations;
    return `<div class="ds-result"><p class="ai-label-ai">Written by a model (${esc(res.model)}). Check every fact, date and citation before you rely on it.</p>
      <p><strong>${res.count}</strong> section${res.count === 1 ? '' : 's'} written into the draft.</p>
      ${c ? `<p class="ai-sum"><strong>${c.summary.found}</strong> citation${c.summary.found === 1 ? '' : 's'} in the new text · <strong>${c.summary.verified}</strong> confirmed in the database · <strong class="${c.summary.problems ? 'ai-bad' : ''}">${c.summary.problems}</strong> not confirmed</p>
        ${c.items.filter(i => ['misattributed', 'wrong-number', 'not-found'].includes(i.status)).map(i => `<div class="ai-check"><span class="chip chip-red">Not confirmed</span> <span class="mono">${esc(i.raw)}</span><small>${esc(i.message)}</small></div>`).join('')}`
        : '<p class="hint">The case-law database could not be reached, so the citations were not checked. Start it and use the Citation check tool.</p>'}
      <div class="ds-actions"><button type="button" class="btn btn-teal btn-sm" data-wb="ds-mode" data-mode="edit">Review in Manual</button><button type="button" class="btn btn-ghost btn-sm" data-wb="ds-mode" data-mode="preview">Preview</button><button type="button" class="btn btn-ghost btn-sm" data-wb="ds-tool" data-tool="citations">Full citation check</button></div></div>`;
  }

  function render(m) {
    wbEnsure(m);
    if (Date.now() - (wbUi.statusAt || 0) > 10000) {              // the key may have been added or removed since: look again, and repaint only if that changes anything
      const was = AiUi.hasStatus() ? AiUi.usable() : null;
      wbUi.statusAt = Date.now();
      AiUi.loadStatus(true).then(() => { if (AiUi.usable() !== was && wbCtx().tab === 'drafting') wbRefresh(); });
    }
    const type = chosenType(m);
    if (type && !wbUi.docType[m.id]) wbUi.docType[m.id] = type;
    const d = type ? wbDraftOf(m) : null;
    const active = wbUi.mode === 'auto' ? 'auto' : d ? (wbUi.mode === 'preview' ? 'preview' : 'edit') : '';
    let work;
    if (!type) work = '';
    else if (active === 'auto') work = autoPanel(m, d, type);
    else if (d) work = draftCard(m, d, active === 'preview');
    else work = `<div class="card card-pad ds-empty"><h2>No ${esc(type.toLowerCase())} in this matter yet</h2><p class="hint">Choose <b>Manual</b> to start from the format with this matter's record filled in, or <b>Auto</b> to have AI write it from what you tell it.</p></div>`;
    return `<div class="ds">
      ${!type || wbUi.pickType[m.id]
        ? `<section class="ds-step"><h2><span class="ds-n">1</span>Which application do you want to make?</h2>${typeCards(m, type)}</section>`
        : `<section class="ds-step ds-done"><h2><span class="ds-n">1</span>Application</h2><strong class="ds-chosen">${esc(type)}</strong><button type="button" class="btn btn-ghost btn-sm" data-wb="ds-change">Change</button></section>`}
      ${draftTabs(m, d)}
      ${type ? `<section class="ds-step"><h2><span class="ds-n">2</span>How do you want to prepare it?</h2>${modeCards(active, !!d)}</section>` : '<p class="hint ds-first">Pick an application above to begin.</p>'}
      ${work ? `<section class="ds-work">${work}</section>` : ''}
    </div>${railHtml(m, d)}`;
  }

  /* ── what the page does ────────────────────────────────────────────────── */
  function startDraft(m, type) {
    const f = defaultFormat(type);
    if (!f) { showToast('There is no format for this application. Add one under Document formats.'); return null; }
    const d = Drafting.createDraft(f, m, { title: type, extras: wbExtras(m), profileId: wbNewDraftProfile() });
    m.drafts.push(d);
    wbUi.draft[m.id] = d.id; wbUi.lastType = type;
    wbSave(m.id);
    const gaps = Drafting.countGaps(d.sections.map(s => `${s.heading}\n${s.body}`).join('\n'));
    showToast(`Started from “${f.name}”.${gaps ? ` ${gaps} blank${gaps === 1 ? '' : 's'} to fill in.` : ''}`);
    return d;
  }

  WB_CLICK['ds-change'] = (el, m) => { wbUi.pickType[m.id] = true; wbRefresh(); };
  WB_CLICK['ds-type'] = (el, m) => {
    wbUi.pickType[m.id] = false;
    wbUi.docType[m.id] = el.dataset.type;
    const mine = m.drafts.filter(d => d.docType === el.dataset.type);
    if (mine.length) wbUi.draft[m.id] = (mine.find(d => d.id === wbUi.draft[m.id]) || mine[0]).id;
    if (!mine.length && wbUi.mode === 'preview') wbUi.mode = 'edit';
    wbRefresh();
  };
  WB_CLICK['draft-pick'] = (el, m) => {                         // choosing a draft also chooses its application
    const d = m.drafts.find(x => x.id === el.dataset.id);
    if (d) { wbUi.draft[m.id] = d.id; wbUi.docType[m.id] = d.docType; }
    wbRefresh();
  };
  WB_CLICK['ds-mode'] = (el, m) => {
    const type = chosenType(m), mode = el.dataset.mode;
    if (!type) return;
    if (mode === 'edit' && !wbDraftOf(m) && !startDraft(m, type)) return;
    if (mode === 'preview' && !wbDraftOf(m)) return;
    wbUi.mode = mode; wbRefresh();
  };

  WB_INPUT['ds-auto'] = (el, m) => { autoState(m)[el.dataset.f] = el.value; };
  WB_CHANGE['ds-auto-record'] = (el, m) => { autoState(m).useRecord = el.checked; };

  WB_CLICK['ds-generate'] = async (el, m) => {
    const type = chosenType(m);
    let d = wbDraftOf(m);
    if (wbUi.autoBusy[m.id] || !type) return;
    if (d?.status === 'Approved') { showToast('This draft is approved. Reopen it first.'); return; }
    const a = autoState(m);
    if (!a.facts.trim() && !a.other.trim() && !(a.useRecord && m.timeline.length)) { showToast('Say what happened first, or add events to the chronology.'); return; }
    if (!d && !(d = startDraft(m, type))) return;
    const payload = {
      docType: type, court: a.court, parties: a.parties, facts: a.facts, relief: a.relief, other: a.other,
      sections: d.sections.map(s => ({ id: s.id, heading: s.heading, layout: s.layout, body: s.body })),
      authorities: a.useRecord ? m.authorities.map(x => (x.meta ? `${x.title} (${x.meta})` : x.title)) : [],
      chronology: a.useRecord ? m.timeline.filter(t => !t.omitFromDrafts).map(t => `${t.date}: ${t.title}${t.note ? ` — ${t.note}` : ''}`) : [],
      arguments: a.useRecord ? m.arguments.map(x => `${x.point}${x.support ? ` ${x.support}` : ''}`) : [],
      documents: a.useRecord ? m.documents.slice(0, 26).map((x, i) => `Annexure ${String.fromCharCode(65 + i)} – ${x.name}`) : []
    };
    wbUi.autoBusy[m.id] = true; wbUi.autoResult[m.id] = null; wbRefresh();
    try {
      const r = await AiUi.api('/api/ai/run', { action: 'draft-application', payload });
      const live = m.drafts.find(x => x.id === d.id);
      if (!live) return;                                          // the draft was deleted while the model was working
      wbSnap(live, 'Before the AI draft', true);
      let count = 0;
      for (const s of r.result.sections) { const sec = live.sections.find(x => x.id === s.id); if (sec) { sec.body = s.body; count++; } }
      wbSnap(live, `Written by AI (${r.model})`, true);
      wbSave(m.id);
      wbUi.autoResult[m.id] = { count, citations: r.result.citations, model: r.model };
    } catch (e) { wbUi.autoResult[m.id] = { error: e.message }; }
    wbUi.autoBusy[m.id] = false;
    if (wbCtx().m === m && wbCtx().tab === 'drafting') wbRefresh();
  };

  /* ── the popups ────────────────────────────────────────────────────────── */
  function openComplete(m) {
    const d = wbDraftOf(m);
    if (!d) return;
    const body = () => {
      const r = Drafting.draftChecks(d, m, wbProfileOf(d)), approved = d.status === 'Approved';
      return `<div class="wb-ring-row"><div class="score-ring" style="--pct:${r.pct}"><b>${r.pct}</b></div><div><strong style="font-size:13.5px">Completeness</strong><p style="font-size:12px;color:var(--muted);margin-top:3px">The share of sections that have text. The checks below are counted from this draft and this matter's record.</p></div></div>
        <label class="dl-field">Court rules<select name="profile"${approved ? ' disabled' : ''}><option value="">None</option>${wbProfiles().map(p => `<option value="${esc(p.id)}"${p.id === d.profileId ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
        <p class="hint" style="margin:6px 0 4px">Sets the paper, margins and page numbers of the Word file, and checks the draft against the rules you have entered. <a href="#" data-ds-rules>Set up court rules</a></p>
        <div>${wbChecksHtml(r)}</div>${wbReviewHtml(d)}`;
    };
    const paint = () => { const box = $('#dsComplete'); if (box) box.innerHTML = body(); const pct = $('#dsPct'); if (pct) pct.textContent = Drafting.draftChecks(d, m, wbProfileOf(d)).pct; };
    wbOpenModal({
      eyebrow: 'Draft checks', title: 'Completeness', focus: false, html: `<div class="wb-form" id="dsComplete">${body()}</div>`,
      onChange: e => { if (e.target.name === 'profile' && d.status !== 'Approved') { d.profileId = e.target.value; wbSave(m.id); paint(); } },
      onClick: e => {
        if (e.target.closest('[data-ds-rules]')) { e.preventDefault(); wbOpenProfiles(m); return; }
        const c = e.target.closest('[data-wb="comment-open"],[data-wb="comments-open"]');
        if (c) wbOpenComments(m, c.dataset.sec || '');
      }
    });
  }

  const OPEN = {
    complete: m => openComplete(m),
    parawise: m => wbOpenParaReply(m),
    formats: m => wbOpenFormats(m),
    rules: m => wbOpenProfiles(m),
    history: m => wbOpenHistory(m),
    comments: m => wbOpenComments(m, '')
  };
  WB_CLICK['ds-tool'] = (el, m) => {
    const tool = TOOLS.flatMap(g => g.tools).find(t => t.id === el.dataset.tool);
    if (!tool || (tool.needsDraft && !wbDraftOf(m))) return;
    if (tool.ai) wbOpenModal({ eyebrow: tool.ai === 'citation-check' ? 'Check' : 'AI assistant', title: tool.name, focus: false, html: `<div class="wb-form">${AiUi.popupHtml(tool.ai, m)}</div>` });
    else OPEN[tool.id]?.(m);
  };

  return { render };
})();
