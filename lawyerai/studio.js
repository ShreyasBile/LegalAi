/* =============================================================================
   THE STUDIO LAYOUT — the shared look of every page.

     main      ONE main feature fills the page: a header, then a single panel of flat rows.
               Nothing else competes with it. No blocks side by side, no stack of boxed cards.
     rail      everything else sits on the right edge as icons. Hover for the name and what it does,
               click for a popup. Secondary lists, forms and AI tools all live there.

   This file builds markup (header, section, panel pieces, rail) and routes rail clicks to the handlers
   a page registers with Studio.on. It has no page logic. Loaded first; it reaches for esc, wbOpenModal
   and the Wb* handler maps of workbench.js only when something is clicked.
   ============================================================================= */
const Studio = (() => {
  const ic = name => `<svg class="ic"><use href="#i-${name}"/></svg>`;
  const e = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* eyebrow and actions are HTML the caller has already escaped; the title, the lede and the chips' text are plain text */
  function head({ eyebrow = '', title, lede = '', chips = [], actions = '' }) {
    return `<header class="ds-head"><div class="ds-head-text">${eyebrow ? `<p class="eyebrow">${eyebrow}</p>` : ''}<h1>${e(title)}</h1>${lede ? `<p class="lede">${e(lede)}</p>` : ''}
      ${chips.length ? `<div class="ds-chips">${chips.filter(Boolean).map(c => `<span class="chip${c.tone ? ` chip-${c.tone}` : ''}">${e(c.text)}</span>`).join('')}</div>` : ''}</div>${actions ? `<div class="ds-head-act">${actions}</div>` : ''}</header>`;
  }

  /* the main surface of a page: an optional heading row and line of help, then one panel.
     title and sub are plain text; action and body are HTML. pad = padding around the body; flush = none (a table or a list of links). */
  function sec({ title = '', sub = '', action = '', body = '', panel = true, pad = false, flush = false, cls = '' }) {
    const heading = title || action ? `<div class="ds-step-h">${title ? `<h2>${e(title)}</h2>` : '<span></span>'}${action ? `<div class="ds-step-act">${action}</div>` : ''}</div>` : '';
    return `<section class="ds-step${cls ? ` ${cls}` : ''}">${heading}${sub ? `<p class="ds-step-sub">${e(sub)}</p>` : ''}${panel ? `<div class="ds-panel${pad ? ' pad' : ''}${flush ? ' flush' : ''}">${body}</div>` : body}</section>`;
  }

  /* a heading inside the one panel, for when the main feature has parts: [title, optional right-hand action] */
  const part = (title, action = '') => `<div class="ds-part"><h3>${e(title)}</h3>${action ? `<div class="ds-step-act">${action}</div>` : ''}</div>`;

  /* label / value rows: [[label, valueHtml]] */
  const kv = rows => `<dl class="ds-kv">${rows.map(([k, v]) => `<div><dt>${e(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>`;

  const empty = text => `<p class="empty-note">${e(text)}</p>`;

  /* ── the rail ──────────────────────────────────────────────────────────── */
  function tool(t) {
    const off = !!t.off, ai = !!t.ai;
    const tip = `<span class="ds-tip" role="tooltip"><b>${e(t.name)}${ai ? ' <i>AI</i>' : ''}</b>${e(off ? (t.offNote || 'Not available yet.') : t.fn)}</span>`;
    const cls = `ds-tool${ai ? ' ai' : ''}`, label = `${e(t.name)}: ${e(t.fn)}`;
    const shown = t.badge !== undefined && t.badge !== null && t.badge !== '' && t.badge !== 0;
    const badge = shown || t.badgeId ? `<em${t.badgeId ? ` id="${e(t.badgeId)}"` : ''}${shown ? '' : ' hidden'}>${e(shown ? t.badge : '')}</em>` : '';
    if (t.href && !off) return `<a class="${cls}" href="${e(t.href)}" aria-label="${label}">${ic(t.icon)}${badge}${tip}</a>`;
    return `<button type="button" class="${cls}" data-rail="${e(t.id)}" aria-label="${label}"${off ? ' disabled' : ''}>${ic(t.icon)}${badge}${tip}</button>`;
  }
  const rail = groups => {
    const used = groups.filter(g => g && g.tools && g.tools.length);
    return `<nav class="ds-rail" aria-label="Tools for this page">${used.map(g => `<div class="ds-group" role="group" aria-label="${e(g.group)}">${g.tools.map(tool).join('')}</div>`).join('<i class="ds-sep"></i>')}</nav>`;
  };

  /* a whole page: the content, then the rail when the page has tools (the content keeps clear of it) */
  const page = (content, groups = []) => {
    const has = groups.some(g => g && g.tools && g.tools.length);
    return `<div class="ds${has ? ' has-rail' : ''}">${content}</div>${has ? rail(groups) : ''}`;
  };

  /* a page registers what its tools do; a click on any rail button finds the handler by id */
  const handlers = Object.create(null);
  const on = (id, fn) => { handlers[id] = fn; };
  const context = () => ({ m: typeof wbCtx === 'function' ? wbCtx().m : null });

  /* ── popups ────────────────────────────────────────────────────────────── */
  /* a popup with ready-made html (the dialog of workbench.js) */
  function popup({ eyebrow, title, html, size = 'md', ...rest }) {
    wbOpenModal({ eyebrow, title, html: `<div class="wb-form">${html}</div>`, focus: false, size, ...rest });
  }

  /* A popup that shows a live part of the page (a list, a form). render() draws it; clicks, changes and form submits on
     elements that carry the page's own data-wb attributes are sent to the same handlers the page uses (WB_CLICK and so on,
     for the matter m), and the popup is drawn again afterwards, so adding, removing and flagging work as they do on the page. */
  function view({ eyebrow, title, render, size = 'md', wide = false, m = null, after = null }) {
    const box = () => document.querySelector('#stView');
    const paint = () => { const b = box(); if (b) { b.innerHTML = render(); if (after) after(b); } };
    const send = (map, key, el, ...rest) => { const fn = m && map[key]; if (!fn) return false; fn(el, m, ...rest); return true; };
    wbOpenModal({
      eyebrow, title, size, wide, focus: false, html: `<div class="wb-form" id="stView">${render()}</div>`,
      onClick: ev => { const el = ev.target.closest('[data-wb]'); if (el && send(WB_CLICK, el.dataset.wb, el, ev) && box()) paint(); },
      onChange: ev => { const el = ev.target.closest('[data-wb-change]'); if (el && send(WB_CHANGE, el.dataset.wbChange, el) && box()) paint(); },
      onInput: ev => { const el = ev.target.closest('[data-wb-input]'); if (el) send(WB_INPUT, el.dataset.wbInput, el); },
      onSubmit: ev => { const f = ev.target.closest('form[data-wb-submit]'); if (f && send(WB_SUBMIT, f.dataset.wbSubmit, f) && box()) paint(); }
    });
    if (after) after(box());
  }

  /* a tool that opens one of the AI assistant's actions in a popup */
  const onAi = (id, action, eyebrow = 'AI assistant') => on(id, ctx => popup({ eyebrow, title: AiUi.actionTitle(action), html: AiUi.popupHtml(action, ctx.m) }));

  if (typeof document !== 'undefined') {
    document.addEventListener('click', ev => {
      const b = ev.target.closest('[data-rail]');
      if (!b || b.disabled) return;
      const fn = handlers[b.dataset.rail];
      if (fn) fn({ ...context(), el: b });
    });
  }

  /* the tools every matter page has */
  const matterTools = m => ({ group: 'Matter', tools: [
    { id: 'matter-ask', icon: 'chat', name: 'Ask about this matter', fn: 'Ask VakilBuddy a question about this case.', href: `#/matters/${m.id}/chat` },
    { id: 'matter-evidence', icon: 'upload', name: 'Add evidence', fn: 'Record a document for this matter. Files are never uploaded.' },
    { id: 'matter-limit', icon: 'calendar', name: 'Limitation dates', fn: 'Work out a last date for this matter.', href: `#/deadlines?matter=${m.id}` }
  ] });
  on('matter-evidence', ctx => { if (ctx.m) wbOpenEvidenceForm(ctx.m); });

  /* change the number on a rail icon after the page is drawn */
  const setBadge = (id, n) => { const el = typeof document !== 'undefined' && document.getElementById(id); if (el) { el.textContent = n || ''; el.hidden = !n; } };

  const api = { ic, head, sec, part, kv, empty, rail, tool, page, on, onAi, popup, view, setBadge, matterTools };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  return api;
})();
