const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../drafting.js');

/* a small matter shaped like the workspace's own sample data */
const matter = () => ({
  id: 'mx', title: 'Sharma v. State of Maharashtra', court: 'Bombay High Court', caseNo: 'MAT-2026-0148', area: 'Criminal · Anticipatory Bail',
  facts: { objective: 'Secure interim protection.', relief: 'Anticipatory bail under Section 482 BNSS.', issue: 'Whether custodial interrogation is necessary.' },
  nextHearing: { date: '11 Sep 2026', time: '10:30 AM', purpose: 'Bail hearing', court2: 'Courtroom 52' },
  authorities: [{ title: 'Sushila Aggarwal v. State (NCT of Delhi)', meta: '2020 · 5 SCC 1' }, { title: 'Section 482 BNSS', meta: '' }],
  arguments: [{ point: 'The applicant has cooperated.', support: 'Two statements were recorded.' }, { point: 'No risk of flight.', support: '' }],
  counterArgs: [{ point: 'Quantum of loss is large.', rebuttal: 'Quantum is not custody.' }],
  documents: [{ name: 'FIR_No_211_2026.pdf' }, { name: 'Bank_summary.pdf' }],
  timeline: [{ date: '07 Feb', title: 'Transaction recorded', note: 'Bank summary links it.' }, { date: '11 Sep', title: 'Hearing preparation complete', note: '', omitFromDrafts: true }]
});
const extras = { cnr: 'MHCC01-001234-2026', today: '11 September 2026' };
const fmt = id => D.BUILTIN_FORMATS.find(f => f.id === id);

test('parties are split on v. / vs / versus, and a title without one is kept whole', () => {
  assert.deepEqual(D.splitParties('Sharma v. State of Maharashtra'), { applicant: 'Sharma', respondent: 'State of Maharashtra' });
  assert.deepEqual(D.splitParties('Aarohi Estates Pvt. Ltd. vs Patel'), { applicant: 'Aarohi Estates Pvt. Ltd.', respondent: 'Patel' });
  assert.deepEqual(D.splitParties('Re: Kulkarni'), { applicant: 'Re: Kulkarni', respondent: '' });
});

test('annexure labels run A..Z then AA, AB', () => {
  assert.equal(D.annexLabel(0), 'A');
  assert.equal(D.annexLabel(25), 'Z');
  assert.equal(D.annexLabel(26), 'AA');
  assert.equal(D.annexLabel(27), 'AB');
});

test('the matter context carries the record, and leaves out events marked for omission', () => {
  const c = D.matterContext(matter(), extras);
  assert.equal(c.applicant, 'Sharma');
  assert.equal(c.cnr, 'MHCC01-001234-2026');
  assert.equal(c.chronology, '07 Feb: Transaction recorded — Bank summary links it.');
  assert.equal(c.authorities, 'Sushila Aggarwal v. State (NCT of Delhi) (2020 · 5 SCC 1)\nSection 482 BNSS');
  assert.equal(c.arguments, 'The applicant has cooperated. Two statements were recorded.\nNo risk of flight.');
  assert.equal(c.counter_arguments, 'Quantum of loss is large. Reply: Quantum is not custody.');
  assert.equal(c.documents, 'Annexure A – FIR_No_211_2026.pdf\nAnnexure B – Bank_summary.pdf');
  assert.equal(c.hearing, 'Bail hearing on 11 Sep 2026 at 10:30 AM, Courtroom 52');
});

test('a matter with an empty record gives empty fields, not "undefined"', () => {
  const c = D.matterContext({ title: 'X v. Y', facts: {}, authorities: [], documents: [] });
  for (const k of ['objective', 'relief', 'issue', 'chronology', 'authorities', 'arguments', 'documents', 'hearing']) assert.equal(c[k], '', k);
});

test('fillTemplate fills fields, upper-cases on request, and turns empty fields into visible blanks', () => {
  const ctx = { court: 'Bombay High Court', relief: '' };
  const r = D.fillTemplate('IN THE {{court|upper}} / {{ court }} / {{relief}}', ctx);
  assert.equal(r.text, 'IN THE BOMBAY HIGH COURT / Bombay High Court / [____]');
  assert.equal(r.gaps, 1);
});

test('fillTemplate leaves unknown fields in place and reports them, including prototype names', () => {
  const r = D.fillTemplate('{{nope}} {{constructor}}', { court: 'x' });
  assert.equal(r.text, '{{nope}} {{constructor}}');
  assert.deepEqual(r.unknown, ['nope', 'constructor']);
  assert.deepEqual(D.unknownFields('{{court}} {{nope}}'), ['nope']);
});

test('there are built-in formats for many kinds of document, each valid and using only known fields', () => {
  assert.ok(D.docTypes(D.BUILTIN_FORMATS).length >= 10);
  const ids = new Set();
  for (const f of D.BUILTIN_FORMATS) {
    assert.ok(!ids.has(f.id), `duplicate id ${f.id}`);
    ids.add(f.id);
    assert.equal(f.builtin, true);
    assert.deepEqual(D.validateFormat(f, []), [], f.docType);
  }
});

test('every built-in format makes a draft from a real matter without leftover {{fields}}', () => {
  for (const f of D.BUILTIN_FORMATS) {
    const d = D.createDraft(f, matter(), { extras });
    const text = d.sections.map(s => `${s.heading}\n${s.body}`).join('\n');
    assert.ok(!/\{\{/.test(text), `${f.docType} still has a {{field}}`);
    assert.equal(d.sections.length, f.sections.length);
    const toCourt = !/notice/i.test(f.docType);                         // a notice goes to the other side, not to a court
    assert.equal(/BOMBAY HIGH COURT/i.test(text), toCourt, `${f.docType}: court named only when it is filed in court`);
  }
});

test('a draft is a copy: editing the format afterwards does not change it', () => {
  const f = D.cloneFormat(fmt('std-anticipatory-bail'), 'Mine');
  const d = D.createDraft(f, matter(), { extras });
  const before = JSON.stringify(d);
  f.sections[0].body = 'changed';
  f.style.size = 16;
  assert.equal(JSON.stringify(d), before);
  assert.equal(d.formatId, f.id);
  assert.equal(d.formatName, 'Mine');
});

test('the draft keeps the format’s own style and a blank where the matter has nothing', () => {
  const f = D.cloneFormat(fmt('std-plaint'));
  f.style = { ...f.style, font: 'Arial', size: 14, spacing: 2 };
  const d = D.createDraft(f, { title: 'A v. B', court: 'Civil Court', facts: {}, timeline: [] }, { extras });
  assert.equal(d.style.font, 'Arial');
  assert.equal(d.style.size, 14);
  const prayer = d.sections.find(s => s.heading === 'Prayer');
  assert.match(prayer.body, /\(a\) \[____\]/);
});

test('numbering: continuous runs through the document, restart begins again, lists always restart', () => {
  const mk = paraNumbering => ({
    style: { paraNumbering },
    sections: [
      { heading: 'Facts', layout: 'numbered', body: 'one\ntwo' },
      { heading: 'Authorities', layout: 'list', body: 'a\nb' },
      { heading: 'Grounds', layout: 'numbered', body: 'three\n\nfour' }
    ]
  });
  const nums = html => [...html.matchAll(/>(\d+)\.&emsp;/g)].map(m => m[1]).join(',');
  assert.equal(nums(D.renderDraftHtml(mk('continuous'))), '1,2,1,2,3,4');
  assert.equal(nums(D.renderDraftHtml(mk('restart'))), '1,2,1,2,1,2');
});

test('rendering escapes the text, supports **bold**, upper-cases headings and honours the layout', () => {
  const html = D.renderDraftHtml({
    style: { headingCase: 'upper', headingAlign: 'left', align: 'left', size: 13, spacing: 2, font: 'Georgia' },
    sections: [
      { heading: 'Facts', layout: 'para', body: '<script>alert(1)</script> **bold** & more' },
      { heading: '', layout: 'center', body: '**IN THE COURT**\n\nParty' },
      { heading: '', layout: 'signoff', body: 'Place: ____\n\n' }
    ]
  });
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('<b>bold</b> &amp; more'));
  assert.ok(html.includes('>FACTS</h3>'));
  assert.ok(html.includes('text-align:left">FACTS'));
  assert.ok(html.includes('font-size:13pt;line-height:2'));
  assert.ok(html.includes("font-family:'Georgia'"));
  assert.ok(html.includes('text-align:center"><b>IN THE COURT</b>'));
  assert.ok(html.includes('<p style="margin:0">&nbsp;</p>'));         // a blank line inside a centred block is kept
  assert.ok(!html.endsWith('&nbsp;</p></div>'), 'blank lines at the end of a block are dropped');
});

test('style values from storage are clamped to what the editor offers', () => {
  const s = D.normalizeStyle({ font: 'Comic Sans', size: 400, spacing: 3, align: 'right', paraNumbering: 'x', headingCase: 1, headingAlign: null });
  assert.deepEqual(s, { ...D.DEFAULT_STYLE, size: 20 });             // junk falls back to the defaults; a huge size is capped
  assert.equal(D.normalizeStyle({ size: 1 }).size, 8);
  assert.equal(D.normalizeStyle({ size: 11.3 }).size, 11.5);
  assert.deepEqual(D.normalizeStyle(null), D.DEFAULT_STYLE);
});

test('a stored format cannot claim to be built-in, and junk sections are cleaned', () => {
  const f = D.normalizeFormat({ id: 'x', name: ' N ', docType: ' T ', builtin: true, sections: [null, { heading: 5, layout: 'weird', body: 'b' }] });
  assert.equal(f.builtin, false);
  assert.equal(f.name, 'N');
  assert.equal(f.docType, 'T');
  assert.equal(f.sections.length, 2);
  assert.equal(f.sections[1].layout, 'para');
  assert.equal(D.normalizeDraft({ status: 'whatever' }).status, 'Draft');
  assert.equal(D.normalizeDraft({ status: 'Approved' }).status, 'Approved');
});

test('the default format is the user’s choice, else the built-in; a stale choice is ignored', () => {
  const mine = D.cloneFormat(fmt('std-legal-notice'), 'My notice');
  const all = D.allFormats([mine]);
  assert.equal(D.defaultFormatFor(all, {}, 'Legal notice').id, 'std-legal-notice');
  const defaults = D.setDefault({}, 'Legal notice', mine.id);
  assert.equal(D.defaultFormatFor(all, defaults, 'Legal notice').id, mine.id);
  assert.ok(D.isDefault(all, defaults, mine));
  assert.ok(!D.isDefault(all, defaults, fmt('std-legal-notice')));
  assert.equal(D.defaultFormatFor(D.allFormats([]), defaults, 'Legal notice').id, 'std-legal-notice');
  assert.equal(D.defaultFormatFor(all, {}, 'No such document'), null);
});

test('a user’s own document type works the same way as a built-in one', () => {
  const f = { ...D.blankFormat('Rejoinder'), name: 'Mine' };
  const all = D.allFormats([f]);
  assert.ok(D.docTypes(all).includes('Rejoinder'));
  assert.equal(D.defaultFormatFor(all, {}, 'Rejoinder').id, f.id);
});

test('deleting a format also drops it as a default', () => {
  const mine = D.cloneFormat(fmt('std-affidavit'), 'Mine');
  const r = D.removeFormat([mine], D.setDefault({ Other: 'keep' }, 'Affidavit', mine.id), mine.id);
  assert.deepEqual(r.custom, []);
  assert.deepEqual(r.defaults, { Other: 'keep' });
});

test('validation catches what would make a format unusable', () => {
  const ok = { ...D.blankFormat('Rejoinder'), name: 'Mine' };
  assert.deepEqual(D.validateFormat(ok, []), []);
  assert.match(D.validateFormat({ ...ok, name: ' ' }, [])[0], /name/);
  assert.match(D.validateFormat({ ...ok, docType: '' }, [])[0], /which document/);
  assert.match(D.validateFormat({ ...ok, sections: [] }, [])[0], /at least one section/);
  assert.match(D.validateFormat({ ...ok, sections: [{ heading: '', body: ' ' }] }, [])[0], /empty/);
  assert.match(D.validateFormat({ ...ok, sections: [{ heading: 'x', body: '{{nope}}' }] }, []).join(), /\{\{nope\}\}/);
  const other = { ...ok, id: 'other' };
  assert.match(D.validateFormat(ok, [other])[0], /already a/);
  assert.deepEqual(D.validateFormat(ok, [ok]), []);                  // saving a format over itself is fine
});

test('cloning gives a new, editable, non-built-in format with its own sections', () => {
  const src = fmt('std-affidavit');
  const c = D.cloneFormat(src);
  assert.notEqual(c.id, src.id);
  assert.equal(c.builtin, false);
  assert.equal(c.name, 'LegalAI standard (copy)');
  c.sections[0].body = 'changed';
  assert.notEqual(src.sections[0].body, 'changed');
});

test('checks count what is really in the draft', () => {
  const m = matter();
  const d = D.createDraft(fmt('std-anticipatory-bail'), m, { extras });
  const r = D.draftChecks(d, m);
  const by = l => r.checks.find(c => c.label === l);
  assert.equal(r.total, d.sections.length);
  assert.equal(by('Authorities cited').ok, true);                      // both pinned authorities appear in the text
  assert.equal(by('Annexures listed').ok, true);
  assert.equal(by('Your review').ok, false);
  d.sections[2].body = '[____]\n[____]';
  assert.equal(D.draftChecks(d, m).checks.find(c => c.label === 'Blanks to fill in').note, '2 “[____]” left');
  d.sections[3].body = '   ';
  assert.ok(D.draftChecks(d, m).pct < 100);
  d.status = 'Approved';
  assert.equal(D.draftChecks(d, m).checks.find(c => c.label === 'Your review').ok, true);
  d.sections[4].body = '{{typo}}';
  assert.equal(D.draftChecks(d, m).checks.find(c => c.label === 'Fields resolved').ok, false);
});

test('a matter with nothing pinned is not told its draft cites too little', () => {
  const m = { ...matter(), authorities: [], documents: [] };
  const r = D.draftChecks(D.createDraft(fmt('std-anticipatory-bail'), m, { extras }), m);
  assert.equal(r.checks.find(c => c.label === 'Authorities cited').ok, true);
  assert.equal(r.checks.find(c => c.label === 'Annexures listed').ok, true);
});

test('the export is a complete document Word can open, with the draft’s title escaped', () => {
  const d = D.createDraft(fmt('std-affidavit'), matter(), { title: 'A & <B>', extras });
  const html = D.exportHtml(d);
  assert.ok(html.startsWith('<!DOCTYPE html>'));
  assert.ok(html.includes('<meta charset="utf-8">'));
  assert.ok(html.includes('urn:schemas-microsoft-com:office:word'));
  assert.ok(html.includes('<title>A &amp; &lt;B&gt;</title>'));
  assert.ok(html.includes('AFFIDAVIT IN SUPPORT OF'));
  assert.equal(D.slug('A & <B> — Bail!'), 'a-b-bail');
  assert.equal(D.slug('???'), 'draft');
});
