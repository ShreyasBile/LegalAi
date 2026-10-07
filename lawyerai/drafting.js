/* ============================================================================
   Document formats and drafting — the pure logic behind a matter's Drafting tab.
   No DOM and no storage in here, so every rule is unit-tested (test/drafting.test.js).
   The browser loads this as a classic script (global `Drafting`); Node loads it with require().

   A FORMAT is a reusable structure for one kind of document: an ordered list of sections
   (heading, layout, text with {{fields}}) plus typography. A DRAFT is a copy of a format
   filled from a matter's record. Later changes to the format never touch existing drafts.
   Nothing here writes legal text for the user: it only places what the matter already holds.
   ============================================================================ */
const Drafting = (() => {
  const GAP = '[____]';                                   // a blank the lawyer still has to fill in
  const FONTS = ['Times New Roman', 'Georgia', 'Arial', 'Calibri', 'Garamond'];
  const SPACINGS = [1, 1.15, 1.5, 2];
  const LAYOUTS = {
    para: 'Plain paragraphs',
    numbered: 'Numbered paragraphs',
    list: 'Numbered list',
    center: 'Centred block',
    signoff: 'Sign-off block'
  };
  const DEFAULT_STYLE = { font: 'Times New Roman', size: 12, spacing: 1.5, align: 'justify', paraNumbering: 'continuous', headingCase: 'upper', headingAlign: 'center' };

  /* The fields a section can pull from the matter. By the app's convention the first party in
     the matter title ("Sharma v. State") is the lawyer's client. */
  const PLACEHOLDERS = [
    { key: 'court', label: 'Court', hint: 'The court the matter is in' },
    { key: 'applicant', label: 'First party', hint: 'First party in the matter title — your client' },
    { key: 'respondent', label: 'Second party', hint: 'Second party in the matter title — the opponent' },
    { key: 'matter_title', label: 'Matter title', hint: 'Both parties, as in the matter title' },
    { key: 'area', label: 'Area of law', hint: 'e.g. Criminal · Anticipatory Bail' },
    { key: 'matter_ref', label: 'Matter ref.', hint: 'Your internal matter number' },
    { key: 'cnr', label: 'CNR', hint: 'The eCourts case number, once the matter is synced' },
    { key: 'objective', label: 'Objective', hint: 'Case facts → Objective' },
    { key: 'relief', label: 'Relief sought', hint: 'Case facts → Relief sought' },
    { key: 'issue', label: 'Key issue', hint: 'Case facts → Key issue' },
    { key: 'chronology', label: 'Chronology', hint: 'Dated events from Evidence → Chronology, one per line' },
    { key: 'authorities', label: 'Authorities', hint: 'Authorities pinned in Research, one per line' },
    { key: 'arguments', label: 'Arguments', hint: 'Points from Arguments, one per line' },
    { key: 'counter_arguments', label: 'Counter-arguments', hint: 'Anticipated objections with the reply, one per line' },
    { key: 'documents', label: 'Annexures', hint: 'Documents from Evidence as Annexure A, B, C…' },
    { key: 'hearing', label: 'Next hearing', hint: 'Purpose, date, time and court of the next hearing' },
    { key: 'today', label: 'Today’s date', hint: 'The workspace’s date' }
  ];
  const PH_KEYS = PLACEHOLDERS.map(p => p.key);

  const makeId = (p = 'id') => `${p}-${Math.random().toString(36).slice(2, 9)}`;
  const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const str = (v, max) => String(v ?? '').slice(0, max);
  const lines = body => String(body ?? '').replace(/\r\n?/g, '\n').split('\n');

  /* ── fields ──────────────────────────────────────────────────────────────── */
  function splitParties(title) {
    const parts = String(title || '').split(/\s+(?:v\.?|vs\.?|versus)\s+/i);
    return { applicant: (parts[0] || '').trim(), respondent: parts.slice(1).join(' v. ').trim() };
  }

  function annexLabel(i) {                                 // 0 → A, 25 → Z, 26 → AA
    const ch = n => String.fromCharCode(65 + n);
    return i < 26 ? ch(i) : annexLabel(Math.floor(i / 26) - 1) + ch(i % 26);
  }

  function matterContext(m, { cnr = '', today = '' } = {}) {
    const f = m.facts || {};
    const { applicant, respondent } = splitParties(m.title);
    const list = (arr, fn) => (arr || []).map(fn).join('\n');
    const h = m.nextHearing;
    return {
      court: m.court || '', applicant, respondent,
      matter_title: m.title || '', area: m.area || '', matter_ref: m.caseNo || '', cnr,
      objective: f.objective || '', relief: f.relief || '', issue: f.issue || '',
      chronology: list((m.timeline || []).filter(t => !t.omitFromDrafts), t => `${t.date}: ${t.title}${t.note ? ` — ${t.note}` : ''}`),
      authorities: list(m.authorities, a => `${a.title}${a.meta ? ` (${a.meta})` : ''}`),
      arguments: list(m.arguments, a => `${a.point}${a.support ? ` ${a.support}` : ''}`),
      counter_arguments: list(m.counterArgs, c => `${c.point}${c.rebuttal ? ` Reply: ${c.rebuttal}` : ''}`),
      documents: list(m.documents, (d, i) => `Annexure ${annexLabel(i)} – ${d.name}`),
      hearing: h ? `${h.purpose} on ${h.date} at ${h.time}, ${h.court2}` : '',
      today
    };
  }

  /* {{field}} or {{field|upper}}. A field the matter has nothing for becomes a visible blank. */
  const PH_RE = /\{\{\s*([a-z_]+)\s*(?:\|\s*(upper)\s*)?\}\}/gi;
  function fillTemplate(text, ctx) {
    const unknown = [];
    let gaps = 0;
    const out = String(text ?? '').replace(PH_RE, (all, key, filter) => {
      key = key.toLowerCase();
      if (!Object.prototype.hasOwnProperty.call(ctx, key)) { unknown.push(key); return all; }
      const v = String(ctx[key] ?? '').trim();
      if (!v) { gaps++; return GAP; }
      return filter ? v.toUpperCase() : v;
    });
    return { text: out, gaps, unknown };
  }

  const countGaps = text => String(text ?? '').split(GAP).length - 1;
  function unknownFields(text) {
    const found = [];
    String(text ?? '').replace(PH_RE, (all, key) => { if (!PH_KEYS.includes(key.toLowerCase())) found.push(key.toLowerCase()); return all; });
    return found;
  }

  /* ── normalising (everything read back from storage goes through these) ──── */
  function normalizeStyle(s) {
    s = s && typeof s === 'object' ? s : {};
    const pick = (v, allowed, d) => (allowed.includes(v) ? v : d);
    const size = s.size == null || s.size === '' ? NaN : Number(s.size);
    return {
      font: pick(s.font, FONTS, DEFAULT_STYLE.font),
      size: Number.isFinite(size) ? Math.min(20, Math.max(8, Math.round(size * 2) / 2)) : DEFAULT_STYLE.size,
      spacing: pick(Number(s.spacing), SPACINGS, DEFAULT_STYLE.spacing),
      align: pick(s.align, ['justify', 'left'], DEFAULT_STYLE.align),
      paraNumbering: pick(s.paraNumbering, ['continuous', 'restart'], DEFAULT_STYLE.paraNumbering),
      headingCase: pick(s.headingCase, ['upper', 'asis'], DEFAULT_STYLE.headingCase),
      headingAlign: pick(s.headingAlign, ['center', 'left'], DEFAULT_STYLE.headingAlign)
    };
  }

  function normalizeSection(s) {
    s = s && typeof s === 'object' ? s : {};
    return { id: str(s.id, 40) || makeId('s'), heading: str(s.heading, 200), layout: Object.prototype.hasOwnProperty.call(LAYOUTS, s.layout) ? s.layout : 'para', body: str(s.body, 20000) };
  }

  function normalizeFormat(f, { builtin = false } = {}) {
    f = f && typeof f === 'object' ? f : {};
    return {
      id: str(f.id, 40) || makeId('fmt'), name: str(f.name, 80).trim(), docType: str(f.docType, 80).trim(), description: str(f.description, 300),
      builtin, style: normalizeStyle(f.style),
      sections: (Array.isArray(f.sections) ? f.sections : []).slice(0, 40).map(normalizeSection)
    };
  }

  function normalizeDraft(d) {
    d = d && typeof d === 'object' ? d : {};
    return {
      id: str(d.id, 40) || makeId('d'), title: str(d.title, 120), docType: str(d.docType, 80), formatId: str(d.formatId, 40), formatName: str(d.formatName, 80),
      status: d.status === 'Approved' ? 'Approved' : 'Draft', approvedAt: str(d.approvedAt, 40), createdAt: str(d.createdAt, 40),
      profileId: str(d.profileId, 40),
      style: normalizeStyle(d.style),
      sections: (Array.isArray(d.sections) ? d.sections : []).slice(0, 60).map(normalizeSection)
    };
  }

  /* ── the built-in formats ────────────────────────────────────────────────────
     General starting points, not legal advice: check them against the court's rules.
     "[____]" marks something only the lawyer knows; "________" is for the registry or the signing day. */
  const S = (heading, layout, body) => ({ heading, layout, body });
  const SIGN = 'Place: ________\nDate: ________\n\nAdvocate for {{applicant}}';
  const cause = (caseLine, parties) => S('', 'center', `**IN THE {{court|upper}}**\n**${caseLine}**\n\n${parties}`);
  const parties = (a, b) => `**{{applicant|upper}}** …${a}\nVersus\n**{{respondent|upper}}** …${b}`;
  const reversed = (a, b) => `**{{respondent|upper}}** …${a}\nVersus\n**{{applicant|upper}}** …${b}`;   // the client is the second-named party
  const noticeTo = 'Date: {{today}}\nBy RPAD / Speed Post / Email\n\nTo,\n{{respondent}}\n[____] (address)';

  const BUILTIN_SPEC = [
    ['anticipatory-bail', 'Anticipatory bail application', 'Application under section 482 BNSS, 2023 (formerly section 438 CrPC) to the High Court or Sessions Court.', [
      cause('CRIMINAL APPLICATION (ANTICIPATORY BAIL) NO. ________ OF ________', parties('Applicant', 'Respondent')),
      S('', 'center', '**APPLICATION UNDER SECTION 482 OF THE BHARATIYA NAGARIK SURAKSHA SANHITA, 2023 (FORMERLY SECTION 438 OF THE CODE OF CRIMINAL PROCEDURE, 1973) FOR ANTICIPATORY BAIL**'),
      S('Facts', 'numbered', "The Applicant approaches this Hon'ble Court apprehending arrest in connection with the case described below.\n{{chronology}}"),
      S('Issue for consideration', 'numbered', '{{issue}}'),
      S('Grounds', 'numbered', '{{arguments}}'),
      S('Authorities relied on', 'list', '{{authorities}}'),
      S('Undertaking and conditions', 'numbered', "The Applicant undertakes to cooperate with the investigation and to appear before the Investigating Officer whenever required.\nThe Applicant undertakes not to tamper with the evidence or influence any witness, and not to leave India without the previous permission of this Hon'ble Court.\nThe Applicant is willing to abide by any other condition this Hon'ble Court may impose."),
      S('Prayer', 'para', "It is therefore most respectfully prayed that this Hon'ble Court may be pleased to:\n(a) {{relief}}\n(b) grant such other and further relief as this Hon'ble Court deems fit in the interest of justice."),
      S('', 'signoff', SIGN),
      S('Annexures', 'para', '{{documents}}')
    ]],
    ['regular-bail', 'Regular bail application', 'Application under section 483 BNSS, 2023 (formerly section 439 CrPC) by a person in custody.', [
      cause('BAIL APPLICATION NO. ________ OF ________', parties('Applicant', 'Respondent')),
      S('', 'center', '**APPLICATION FOR REGULAR BAIL UNDER SECTION 483 OF THE BHARATIYA NAGARIK SURAKSHA SANHITA, 2023 (FORMERLY SECTION 439 OF THE CODE OF CRIMINAL PROCEDURE, 1973)**'),
      S('Facts', 'numbered', '{{chronology}}'),
      S('Custody and antecedents', 'numbered', 'The Applicant has been in custody since [____].\nThe Applicant’s antecedents: [____].'),
      S('Grounds for bail', 'numbered', '{{arguments}}'),
      S('Authorities relied on', 'list', '{{authorities}}'),
      S('Undertaking and conditions', 'numbered', "The Applicant undertakes to attend every hearing, not to tamper with the evidence or influence any witness, and to abide by any condition this Hon'ble Court may impose."),
      S('Prayer', 'para', "It is therefore most respectfully prayed that this Hon'ble Court may be pleased to:\n(a) release the Applicant on bail on such terms and conditions as it deems fit; {{relief}}\n(b) grant such other and further relief as this Hon'ble Court deems fit."),
      S('', 'signoff', SIGN),
      S('Annexures', 'para', '{{documents}}')
    ]],
    ['legal-notice', 'Legal notice', 'A notice on behalf of your client (the first party) to the other side.', [
      S('', 'signoff', noticeTo),
      S('Subject', 'para', 'Notice on behalf of my client, {{applicant}}, regarding: {{objective}}'),
      S('', 'signoff', 'Sir / Madam,'),
      S('', 'numbered', 'Under instructions from and on behalf of my client, {{applicant}} (“my client”), I address this notice to you as follows.\n{{chronology}}'),
      S('Grounds', 'numbered', '{{arguments}}'),
      S('Demand', 'numbered', 'My client calls upon you to do the following within [____] days of receiving this notice:\n{{relief}}'),
      S('Consequences', 'numbered', 'If you fail to comply, my client will be constrained to take appropriate civil and/or criminal proceedings against you, at your risk as to costs and consequences.\nThis notice is without prejudice to all other rights and remedies available to my client, all of which are expressly reserved.'),
      S('', 'signoff', SIGN)
    ]],
    ['reply-notice', 'Reply to legal notice', 'A reply on behalf of your client (the first party), who received the notice.', [
      S('', 'signoff', noticeTo),
      S('Subject', 'para', 'Reply to your notice dated [____] sent to my client, {{applicant}}'),
      S('', 'signoff', 'Sir / Madam,'),
      S('Preliminary', 'numbered', 'Under instructions from my client, {{applicant}}, I reply to your notice dated [____] as follows.\nThe contents of your notice are denied, except those expressly admitted below.'),
      S('Reply to the notice', 'numbered', 'Paragraph [____] of the notice is [admitted / denied] because [____].'),
      S('The facts as they stand', 'numbered', '{{chronology}}'),
      S('Submissions', 'numbered', '{{arguments}}'),
      S('Conclusion', 'numbered', 'The demands in your notice are without basis and are rejected.\nMy client reserves all rights and remedies, including the right to claim costs.'),
      S('', 'signoff', SIGN)
    ]],
    ['plaint', 'Plaint (civil suit)', 'Plaint under Order VII Rule 1 CPC; the client is the plaintiff (first party).', [
      cause('CIVIL SUIT NO. ________ OF ________', parties('Plaintiff', 'Defendant')),
      S('', 'center', '**PLAINT UNDER ORDER VII RULE 1 OF THE CODE OF CIVIL PROCEDURE, 1908**'),
      S('The parties', 'numbered', 'The Plaintiff is {{applicant}}, residing at [____].\nThe Defendant is {{respondent}}, residing at [____].'),
      S('Facts', 'numbered', '{{chronology}}'),
      S('Cause of action', 'numbered', 'The cause of action arose on [____] and continues to subsist.\n{{issue}}'),
      S('Jurisdiction', 'numbered', "This Hon'ble Court has territorial jurisdiction because [____].\nThis Hon'ble Court has pecuniary jurisdiction because the suit is valued at [____]."),
      S('Limitation', 'numbered', 'The suit is within limitation because [____].'),
      S('Valuation and court fee', 'numbered', 'The suit is valued at Rs. [____] for jurisdiction and court fee, and court fee of Rs. [____] has been paid.'),
      S('Prayer', 'para', "The Plaintiff therefore prays that this Hon'ble Court may be pleased to:\n(a) {{relief}}\n(b) award the costs of the suit; and\n(c) grant such other relief as this Hon'ble Court deems fit."),
      S('Verification', 'para', 'I, [____], the Plaintiff, verify that the contents of paragraphs 1 to [____] are true to my knowledge, and that those of paragraphs [____] to [____] are true to my information received and believed to be true. Verified at ________ on this ____ day of ________.'),
      S('', 'signoff', SIGN),
      S('List of documents', 'para', '{{documents}}')
    ]],
    ['written-statement', 'Written statement', 'Written statement under Order VIII CPC; the client is the defendant (first party).', [
      cause('CIVIL SUIT NO. ________ OF ________', reversed('Plaintiff', 'Defendant')),
      S('', 'center', '**WRITTEN STATEMENT OF THE DEFENDANT UNDER ORDER VIII OF THE CODE OF CIVIL PROCEDURE, 1908**'),
      S('Preliminary objections', 'numbered', 'The suit is not maintainable, because [____].\n{{issue}}'),
      S('Reply on the merits', 'numbered', 'Paragraph [____] of the plaint is [admitted / denied] because [____].'),
      S('The facts as the Defendant states them', 'numbered', '{{chronology}}'),
      S('Additional pleas', 'numbered', '{{arguments}}'),
      S('Prayer', 'para', "The Defendant therefore prays that this Hon'ble Court may be pleased to:\n(a) dismiss the suit with costs; and\n(b) grant such other relief as this Hon'ble Court deems fit."),
      S('Verification', 'para', 'I, [____], the Defendant, verify that the contents of paragraphs 1 to [____] are true to my knowledge, and that those of paragraphs [____] to [____] are true to my information received and believed to be true. Verified at ________ on this ____ day of ________.'),
      S('', 'signoff', SIGN),
      S('List of documents', 'para', '{{documents}}')
    ]],
    ['writ-petition', 'Writ petition (Article 226)', 'Petition to a High Court under Article 226 of the Constitution.', [
      cause('WRIT PETITION NO. ________ OF ________', parties('Petitioner', 'Respondent')),
      S('', 'center', '**PETITION UNDER ARTICLE 226 OF THE CONSTITUTION OF INDIA**'),
      S('Synopsis', 'para', '{{objective}}'),
      S('Facts', 'numbered', '{{chronology}}'),
      S('Questions of law', 'numbered', '{{issue}}'),
      S('Grounds', 'numbered', '{{arguments}}'),
      S('Authorities relied on', 'list', '{{authorities}}'),
      S('Alternative remedy and other proceedings', 'numbered', "The Petitioner has no other efficacious alternative remedy.\nThe Petitioner has not filed any other petition on the same subject matter before this Hon'ble Court or any other court, except [____]."),
      S('Interim relief', 'para', "Pending the hearing and final disposal of this petition, this Hon'ble Court may be pleased to [____]."),
      S('Prayer', 'para', "It is therefore most respectfully prayed that this Hon'ble Court may be pleased to:\n(a) {{relief}}\n(b) grant such other and further relief as this Hon'ble Court deems fit."),
      S('', 'signoff', SIGN),
      S('Annexures', 'para', '{{documents}}')
    ]],
    ['affidavit', 'Affidavit', 'A sworn statement in support of an application or pleading.', [
      cause('AFFIDAVIT IN SUPPORT OF [____]', parties('Applicant', 'Respondent')),
      S('The deponent', 'para', 'I, [____], aged [____] years, residing at [____], do hereby solemnly affirm and state on oath as follows:'),
      S('Statements', 'numbered', 'I am the deponent in the above matter and am acquainted with its facts.\n{{chronology}}'),
      S('Verification', 'para', 'I, the deponent above named, verify that the contents of paragraphs 1 to [____] are true and correct to my knowledge and belief, that nothing material has been concealed, and that no part of this affidavit is false. Verified at ________ on this ____ day of ________.'),
      S('', 'signoff', 'Deponent\n\nBefore me: ________ (Notary / Oath Commissioner)')
    ]],
    ['written-submissions', 'Written submissions', 'Written submissions or synopsis of arguments for a hearing.', [
      cause('CASE NO. ________ OF ________', parties('Applicant', 'Respondent')),
      S('', 'center', '**WRITTEN SUBMISSIONS ON BEHALF OF {{applicant|upper}}**'),
      S('Summary of the case', 'numbered', '{{objective}}\n{{chronology}}'),
      S('Issues for determination', 'numbered', '{{issue}}'),
      S('Submissions', 'numbered', '{{arguments}}'),
      S('Anticipated objections and the reply', 'numbered', '{{counter_arguments}}'),
      S('Authorities relied on', 'list', '{{authorities}}'),
      S('Conclusion and prayer', 'para', 'It is respectfully submitted that the following relief be granted:\n{{relief}}'),
      S('', 'signoff', SIGN)
    ]],
    ['memo-of-appeal', 'Memorandum of appeal', 'Memorandum of appeal against a judgment or order.', [
      cause('APPEAL NO. ________ OF ________', parties('Appellant', 'Respondent')),
      S('', 'center', '**MEMORANDUM OF APPEAL UNDER [____]**'),
      S('The order appealed against', 'para', 'This appeal is directed against the judgment and order dated [____] passed by [____] in [____].'),
      S('Brief facts', 'numbered', '{{chronology}}'),
      S('Questions of law', 'numbered', '{{issue}}'),
      S('Grounds of appeal', 'numbered', '{{arguments}}'),
      S('Limitation', 'numbered', 'The appeal is within the period of limitation. A certified copy of the impugned order was obtained on [____].'),
      S('Authorities relied on', 'list', '{{authorities}}'),
      S('Prayer', 'para', "It is therefore most respectfully prayed that this Hon'ble Court may be pleased to:\n(a) allow the appeal and set aside the impugned judgment and order dated [____];\n(b) {{relief}}\n(c) grant such other and further relief as this Hon'ble Court deems fit."),
      S('', 'signoff', SIGN),
      S('Annexures', 'para', '{{documents}}')
    ]]
  ];

  const BUILTIN_FORMATS = BUILTIN_SPEC.map(([id, docType, description, sections]) => ({
    id: `std-${id}`, name: 'LegalAI standard', docType, description, builtin: true, style: normalizeStyle(),
    sections: sections.map((s, i) => ({ id: `std-${id}-${i}`, ...s }))
  }));

  /* ── the format library ──────────────────────────────────────────────────── */
  const allFormats = custom => [...BUILTIN_FORMATS, ...(custom || [])];
  const docTypes = formats => [...new Set(formats.map(f => f.docType))];
  const formatsFor = (formats, docType) => formats.filter(f => f.docType === docType);

  /* The user's choice wins, if that format still exists; otherwise the built-in one. */
  function defaultFormatFor(formats, defaults, docType) {
    const ofType = formatsFor(formats, docType);
    return ofType.find(f => f.id === (defaults || {})[docType]) || ofType.find(f => f.builtin) || ofType[0] || null;
  }
  const isDefault = (formats, defaults, f) => defaultFormatFor(formats, defaults, f.docType)?.id === f.id;
  const setDefault = (defaults, docType, id) => ({ ...(defaults || {}), [docType]: id });

  function removeFormat(custom, defaults, id) {
    const next = { ...(defaults || {}) };
    for (const t of Object.keys(next)) if (next[t] === id) delete next[t];
    return { custom: (custom || []).filter(f => f.id !== id), defaults: next };
  }

  function cloneFormat(f, name) {
    return { ...normalizeFormat({ ...JSON.parse(JSON.stringify(f)), id: makeId('fmt'), name: name || `${f.name} (copy)` }), builtin: false };
  }

  function blankFormat(docType = '') {
    return normalizeFormat({
      id: makeId('fmt'), name: '', docType, description: '',
      sections: [
        cause('CASE NO. ________ OF ________', parties('Applicant', 'Respondent')),
        S('Facts', 'numbered', '{{chronology}}'),
        S('Prayer', 'para', '{{relief}}'),
        S('', 'signoff', SIGN)
      ]
    });
  }

  function validateFormat(f, formats = []) {
    const errs = [];
    const name = String(f.name || '').trim(), docType = String(f.docType || '').trim();
    if (!name) errs.push('Give the format a name.');
    if (!docType) errs.push('Say which document this format is for.');
    if (!Array.isArray(f.sections) || !f.sections.length) errs.push('Add at least one section.');
    else if (f.sections.some(s => !String(s.heading || '').trim() && !String(s.body || '').trim())) errs.push('Every section needs a heading or some text — remove the empty ones.');
    const dup = formats.find(o => o.id !== f.id && o.docType.trim().toLowerCase() === docType.toLowerCase() && o.name.trim().toLowerCase() === name.toLowerCase());
    if (dup && name && docType) errs.push(`There is already a “${name}” format for ${docType}.`);
    const bad = [...new Set((f.sections || []).flatMap(s => unknownFields(`${s.heading}\n${s.body}`)))];
    if (bad.length) errs.push(`Unknown field${bad.length > 1 ? 's' : ''}: ${bad.map(b => `{{${b}}}`).join(', ')}. Pick fields from the list.`);
    return errs;
  }

  /* ── drafts ──────────────────────────────────────────────────────────────── */
  function createDraft(format, matter, { title, extras, profileId } = {}) {
    const ctx = matterContext(matter, extras);
    const fill = t => fillTemplate(t, ctx).text;
    return {
      id: makeId('d'), title: str(title, 120).trim() || format.docType, docType: format.docType, formatId: format.id, formatName: format.name,
      status: 'Draft', approvedAt: '', createdAt: (extras && extras.today) || '', profileId: str(profileId, 40),
      style: normalizeStyle(format.style),
      sections: format.sections.map(s => ({ id: makeId('s'), heading: fill(s.heading), layout: s.layout, body: fill(s.body) }))
    };
  }

  const inline = text => escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  const fontStack = f => (['Arial', 'Calibri'].includes(f) ? `'${f}', Helvetica, sans-serif` : `'${f}', 'Times New Roman', serif`);

  /* The document as a flat list of blocks: headings, centred or sign-off lines, and paragraphs with their
     number already worked out. The on-screen preview, the printout and the Word file are all made from this,
     so they can never disagree about the numbering or the layout. Each line of a section is one paragraph. */
  function layoutBlocks(draft) {
    const st = normalizeStyle(draft.style);
    const blocks = [];
    let n = 0;
    for (const sec of draft.sections || []) {
      const head = String(sec.heading || '').trim();
      if (head) blocks.push({ t: 'heading', text: st.headingCase === 'upper' ? head.toUpperCase() : head, align: st.headingAlign });
      const raw = lines(sec.body);
      if (sec.layout === 'center' || sec.layout === 'signoff') {
        const align = sec.layout === 'center' ? 'center' : 'left';
        while (raw.length && !raw[raw.length - 1].trim()) raw.pop();
        for (const l of raw) blocks.push(l.trim() ? { t: 'line', text: l.trim(), align } : { t: 'blank' });
        continue;
      }
      if (sec.layout === 'numbered' && st.paraNumbering === 'restart') n = 0;
      let k = 0;
      for (const l of raw.map(x => x.trim()).filter(Boolean)) {
        const num = sec.layout === 'numbered' ? `${++n}.` : sec.layout === 'list' ? `${++k}.` : '';
        blocks.push({ t: 'para', num, text: l, align: st.align });
      }
    }
    return { style: st, blocks };
  }

  /* The document as HTML with inline styles only, so the preview and the printout are the same thing. */
  function renderDraftHtml(draft) {
    const { style: st, blocks } = layoutBlocks(draft);
    const parts = blocks.map(b => b.t === 'heading' ? `<h3 style="margin:1.2em 0 .5em;font-size:${st.size}pt;font-weight:bold;text-align:${b.align}">${inline(b.text)}</h3>`
      : b.t === 'blank' ? '<p style="margin:0">&nbsp;</p>'
      : b.t === 'line' ? `<p style="margin:0 0 .3em;text-align:${b.align}">${inline(b.text)}</p>`
      : `<p style="margin:0 0 .6em;text-align:${b.align}">${b.num ? `${b.num}&emsp;` : ''}${inline(b.text)}</p>`);
    return `<div style="font-family:${fontStack(st.font)};font-size:${st.size}pt;line-height:${st.spacing}">${parts.join('')}</div>`;
  }

  /* ── court rule profiles ────────────────────────────────────────────────────
     Courts set their own rules for paper, margins, fonts and required parts, and they change. LegalAI ships
     no court's rules: the two built-in profiles are plain layouts. The user enters their court's rules, from the
     court's current rules and practice directions, and drafts are checked against them. */
  const PAPERS = { A4: 'A4', Legal: 'Legal (8.5 × 14 in)', Letter: 'Letter (8.5 × 11 in)' };
  const BUILTIN_PROFILES = [
    { id: 'std-a4', name: 'A4 · plain layout', builtin: true, paper: 'A4', margins: { top: 2.54, right: 2.54, bottom: 2.54, left: 2.54 }, pageNumbers: true, minSize: 0, minSpacing: 0, required: [], notes: 'A general layout. It is not any court’s rule.' },
    { id: 'std-legal', name: 'Legal size · plain layout', builtin: true, paper: 'Legal', margins: { top: 2.54, right: 2.54, bottom: 2.54, left: 2.54 }, pageNumbers: true, minSize: 0, minSpacing: 0, required: [], notes: 'A general layout. It is not any court’s rule.' }
  ];
  function normalizeProfile(p, { builtin = false } = {}) {
    p = p && typeof p === 'object' ? p : {};
    const cm = (v, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(6, Math.max(0.5, Math.round(n * 100) / 100)) : d; };
    const m = p.margins && typeof p.margins === 'object' ? p.margins : {};
    const size = Number(p.minSize);
    return {
      id: str(p.id, 40) || makeId('prof'), name: str(p.name, 80).trim(), builtin,
      paper: Object.prototype.hasOwnProperty.call(PAPERS, p.paper) ? p.paper : 'A4',
      margins: { top: cm(m.top, 2.54), right: cm(m.right, 2.54), bottom: cm(m.bottom, 2.54), left: cm(m.left, 2.54) },
      pageNumbers: p.pageNumbers !== false,
      minSize: Number.isFinite(size) ? Math.min(20, Math.max(0, size)) : 0,
      minSpacing: SPACINGS.includes(Number(p.minSpacing)) ? Number(p.minSpacing) : 0,
      required: (Array.isArray(p.required) ? p.required : []).map(x => str(x, 100).trim()).filter(Boolean).slice(0, 30),
      notes: str(p.notes, 500)
    };
  }
  function validateProfile(p, profiles = []) {
    const errs = [];
    const name = String(p.name || '').trim();
    if (!name) errs.push('Give the court’s rules a name.');
    else if (profiles.some(o => o.id !== p.id && o.name.trim().toLowerCase() === name.toLowerCase())) errs.push(`There is already a set of rules called “${name}”.`);
    return errs;
  }

  /* what the profile asks of a draft, checked against the draft */
  function profileChecks(draft, profile) {
    if (!profile) return [];
    const st = normalizeStyle(draft.style), out = [];
    if (profile.minSize) out.push({ label: 'Font size', note: `${st.size} pt, the court asks for at least ${profile.minSize} pt`, ok: st.size >= profile.minSize });
    if (profile.minSpacing) out.push({ label: 'Line spacing', note: `${st.spacing}, the court asks for at least ${profile.minSpacing}`, ok: st.spacing >= profile.minSpacing });
    const headings = (draft.sections || []).map(x => String(x.heading || '').trim().toLowerCase());
    for (const need of profile.required || []) out.push({ label: `Section: ${need}`, note: headings.some(h => h.includes(need.toLowerCase())) ? 'Present' : 'Not in this draft', ok: headings.some(h => h.includes(need.toLowerCase())) });
    return out;
  }

  /* A complete HTML file for printing (and the browser's own save-as-PDF). */
  function exportHtml(draft, profile) {
    const m = profile ? profile.margins : { top: 2.54, right: 2.54, bottom: 2.54, left: 2.54 };
    const size = { A4: '21cm 29.7cm', Legal: '21.59cm 35.56cm', Letter: '21.59cm 27.94cm' }[profile?.paper] || '21cm 29.7cm';
    return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${escapeHtml(draft.title || 'Draft')}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>@page{size:${size};margin:${m.top}cm ${m.right}cm ${m.bottom}cm ${m.left}cm}body{margin:0}</style></head>
<body>${renderDraftHtml(draft)}</body></html>`;
  }

  const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'draft';

  /* What can honestly be checked from the draft and the matter's record. */
  function draftChecks(draft, matter, profile) {
    const secs = draft.sections || [];
    const filled = secs.filter(s => String(s.body || '').trim()).length;
    const text = secs.map(s => `${s.heading}\n${s.body}`).join('\n');
    const lower = text.toLowerCase();
    const gaps = countGaps(text);
    const unknown = unknownFields(text).length;
    const auths = matter.authorities || [], docs = matter.documents || [];
    const citedA = auths.filter(a => lower.includes(String(a.title).toLowerCase())).length;
    const citedD = docs.filter(d => lower.includes(String(d.name).toLowerCase())).length;
    const checks = [
      { label: 'Sections filled', note: `${filled} of ${secs.length} have text`, ok: filled === secs.length },
      { label: 'Blanks to fill in', note: gaps ? `${gaps} “${GAP}” left` : 'None left', ok: gaps === 0 },
      { label: 'Fields resolved', note: unknown ? `${unknown} unknown {{field}} left` : 'No stray {{fields}}', ok: unknown === 0 },
      { label: 'Authorities cited', note: auths.length ? `${citedA} of ${auths.length} pinned authorities appear` : 'None pinned in Research', ok: citedA === auths.length },
      { label: 'Annexures listed', note: docs.length ? `${citedD} of ${docs.length} evidence documents appear` : 'None in Evidence', ok: citedD === docs.length },
      ...profileChecks(draft, profile),
      { label: 'Your review', note: draft.status === 'Approved' ? 'Approved — export is open' : 'Approve to unlock export', ok: draft.status === 'Approved' }
    ];
    return { filled, total: secs.length, pct: secs.length ? Math.round((100 * filled) / secs.length) : 0, checks };
  }

  return {
    GAP, FONTS, SPACINGS, LAYOUTS, DEFAULT_STYLE, PLACEHOLDERS, BUILTIN_FORMATS,
    splitParties, annexLabel, matterContext, fillTemplate, countGaps, unknownFields,
    normalizeStyle, normalizeSection, normalizeFormat, normalizeDraft,
    allFormats, docTypes, formatsFor, defaultFormatFor, isDefault, setDefault, removeFormat, cloneFormat, blankFormat, validateFormat,
    createDraft, layoutBlocks, renderDraftHtml, exportHtml, slug, draftChecks,
    PAPERS, BUILTIN_PROFILES, normalizeProfile, validateProfile, profileChecks
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Drafting;
