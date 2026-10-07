const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../drafting.js');

const rebuild = (ops, side) => ops.filter(o => o.t === 'eq' || o.t === side).map(o => o.text).join('');
const sec = (id, heading, body, layout = 'numbered') => ({ id, heading, layout, body });
const draft = (sections, extra = {}) => ({ id: 'd1', title: 'Bail application', status: 'Draft', approvedAt: '', style: {}, sections, versions: [], comments: [], ...extra });

/* ── the word diff ─────────────────────────────────────────────────────── */
test('identical text is all unchanged; empty against empty is nothing', () => {
  assert.deepEqual(D.diffText('same words here', 'same words here'), [{ t: 'eq', text: 'same words here' }]);
  assert.deepEqual(D.diffText('', ''), []);
});

test('an inserted, a deleted and a replaced word are each shown as exactly that', () => {
  assert.deepEqual(D.diffText('The applicant has cooperated.', 'The applicant has fully cooperated.'),
    [{ t: 'eq', text: 'The applicant has ' }, { t: 'ins', text: 'fully ' }, { t: 'eq', text: 'cooperated.' }]);
  assert.deepEqual(D.diffText('The applicant has fully cooperated.', 'The applicant has cooperated.'),
    [{ t: 'eq', text: 'The applicant has ' }, { t: 'del', text: 'fully ' }, { t: 'eq', text: 'cooperated.' }]);
  const r = D.diffText('Rs. 5 crore was paid', 'Rs. 7 crore was paid');
  assert.deepEqual(r, [{ t: 'eq', text: 'Rs. ' }, { t: 'del', text: '5' }, { t: 'ins', text: '7' }, { t: 'eq', text: ' crore was paid' }]);
});

test('a changed comma is a changed comma, not a changed sentence', () => {
  const r = D.diffText('Yes, he came.', 'Yes. He came.');
  assert.ok(r.filter(o => o.t !== 'eq').every(o => o.text.length <= 3), JSON.stringify(r));
  assert.equal(rebuild(r, 'del'), 'Yes, he came.');
  assert.equal(rebuild(r, 'ins'), 'Yes. He came.');
});

test('Devanagari text and line breaks diff correctly', () => {
  const a = 'आवेदक ने जांच में सहयोग किया।\nदूसरी पंक्ति।', b = 'आवेदक ने जांच में पूरा सहयोग किया।\nदूसरी पंक्ति।';
  const r = D.diffText(a, b);
  assert.equal(rebuild(r, 'del'), a);
  assert.equal(rebuild(r, 'ins'), b);
  assert.deepEqual(r.filter(o => o.t === 'ins'), [{ t: 'ins', text: 'पूरा ' }]);
});

test('whatever the two texts are, the old side rebuilds the old text and the new side the new one', () => {
  let seed = 12345;
  const rnd = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const words = ['the', 'applicant', 'was', 'not', 'in', 'custody', ',', '.', 'Rs.', '5', 'crore', '\n', 'आवेदक', 'सहयोग', ' ', '  ', 'FIR', '(a)'];
  const make = () => Array.from({ length: rnd(40) }, () => words[rnd(words.length)] + (rnd(3) ? ' ' : '')).join('');
  for (let i = 0; i < 400; i++) {
    const a = make(), b = rnd(4) ? a.split(' ').filter(() => rnd(6)).join(' ') + make().slice(0, rnd(30)) : make();
    const r = D.diffText(a, b);
    assert.equal(rebuild(r, 'del'), a, `old side, case ${i}`);
    assert.equal(rebuild(r, 'ins'), b, `new side, case ${i}`);
    assert.ok(r.every((o, k) => o.text && (k === 0 || r[k - 1].t !== o.t)), 'no empty or repeated pieces');
  }
});

test('a text too large to align is shown as replaced, and is still exact', () => {
  const a = Array.from({ length: 3200 }, (_, i) => `a${i}`).join(' '), b = Array.from({ length: 3200 }, (_, i) => `b${i}`).join(' ');
  const r = D.diffText(a, b);
  assert.equal(rebuild(r, 'del'), a);
  assert.equal(rebuild(r, 'ins'), b);
  assert.ok(r.length <= 3, 'one block out, one block in');
});

test('a small edit in the middle of a long text is found precisely, not shown as a rewrite', () => {
  const para = Array.from({ length: 1500 }, (_, i) => `word${i}`).join(' ');
  const edited = para.replace('word700 ', 'word700 added ');
  const r = D.diffText(para, edited);
  assert.deepEqual(r.filter(o => o.t !== 'eq'), [{ t: 'ins', text: 'added ' }]);
});

/* ── sections ───────────────────────────────────────────────────────────── */
const before = [sec('a', 'Facts', 'One.\nTwo.'), sec('b', 'Grounds', 'Cooperated.'), sec('c', 'Prayer', 'Grant bail.', 'para'), sec('d', 'Annexures', 'A. FIR')];

test('unchanged, changed, added and removed sections are told apart, in the new order', () => {
  const after = [sec('a', 'Facts', 'One.\nTwo.'), sec('b', 'Grounds', 'Fully cooperated.'), sec('n', 'Declaration', 'None pending.'), sec('c', 'Prayer', 'Grant bail.', 'para')];
  const r = D.diffSections(before, after);
  assert.deepEqual(r.map(e => `${e.id}:${e.status}`), ['a:same', 'b:changed', 'n:added', 'c:same', 'd:removed']);
  assert.equal(rebuild(r[1].ops, 'del'), 'Cooperated.');
  assert.equal(rebuild(r[1].ops, 'ins'), 'Fully cooperated.');
  assert.deepEqual(r[2].ops, [{ t: 'ins', text: 'None pending.' }]);
  assert.deepEqual(r[4].ops, [{ t: 'del', text: 'A. FIR' }]);
});

test('a removed section stays where it was, between its neighbours', () => {
  const after = [sec('a', 'Facts', 'One.\nTwo.'), sec('c', 'Prayer', 'Grant bail.', 'para'), sec('d', 'Annexures', 'A. FIR')];
  assert.deepEqual(D.diffSections(before, after).map(e => `${e.id}:${e.status}`), ['a:same', 'b:removed', 'c:same', 'd:same']);
});

test('a changed heading or layout alone counts as a change', () => {
  const r = D.diffSections([sec('a', 'Facts', 'x')], [sec('a', 'Brief facts', 'x', 'para')]);
  assert.equal(r[0].status, 'changed');
  assert.deepEqual(r[0].heading, { old: 'Facts', new: 'Brief facts', changed: true });
  assert.equal(r[0].layoutChanged, true);
  assert.deepEqual(r[0].ops, [{ t: 'eq', text: 'x' }]);
});

test('comparing does not alter either version', () => {
  const a = JSON.stringify(before), after = [sec('a', 'Facts', 'changed')];
  const b = JSON.stringify(after);
  D.diffSections(before, after);
  assert.equal(JSON.stringify(before), a);
  assert.equal(JSON.stringify(after), b);
});

test('the summary counts sections and words', () => {
  const after = [sec('a', 'Facts', 'One.\nTwo and three.'), sec('n', 'New', 'Four five.')];
  const st = D.diffStats(D.diffSections(before, after));
  assert.equal(st.changed, 1);
  assert.equal(st.added, 1);
  assert.equal(st.removed, 3);
  assert.equal(st.wordsAdded, 2 + 2);                 // "and three" in Facts, and "Four five" in the new section
  assert.equal(st.wordsRemoved, 1 + 2 + 2);           // "Cooperated" (Grounds), "Grant bail" (Prayer), "A. FIR" (Annexures)
});

/* ── versions ───────────────────────────────────────────────────────────── */
test('a draft made from a format starts with a "created" version', () => {
  const f = D.BUILTIN_FORMATS[0];
  const d = D.createDraft(f, { title: 'A v. B', court: 'C', facts: {}, timeline: [], authorities: [], arguments: [], counterArgs: [], documents: [] }, { extras: { today: '11 September 2026' } });
  assert.equal(d.versions.length, 1);
  assert.equal(d.versions[0].label, 'Created from “LegalAI standard”');
  assert.equal(d.versions[0].by, 'LegalAI');
  assert.equal(d.versions[0].at, '11 September 2026');
  assert.equal(d.versions[0].sections.length, d.sections.length);
  assert.deepEqual(d.comments, []);
});

test('saving a version copies the text, newest first, and a later edit does not change it', () => {
  const d = draft([sec('a', 'Facts', 'one')]);
  assert.equal(D.pushVersion(d, 'First', { by: 'Shreyas', at: '1 Sep' }), true);
  d.sections[0].body = 'two';
  assert.equal(D.pushVersion(d, 'Second', { by: 'Shreyas', at: '2 Sep' }), true);
  assert.deepEqual(d.versions.map(v => v.label), ['Second', 'First']);
  assert.equal(d.versions[1].sections[0].body, 'one', 'the old version is untouched by the later edit');
  d.versions[0].sections[0].body = 'tampered';
  assert.equal(d.sections[0].body, 'two', 'and a version is not the live text');
});

test('an unchanged draft is not saved twice, unless a marker is wanted', () => {
  const d = draft([sec('a', 'Facts', 'one')]);
  assert.equal(D.pushVersion(d, 'One'), true);
  assert.equal(D.pushVersion(d, 'Again'), false);
  assert.equal(d.versions.length, 1);
  assert.equal(D.pushVersion(d, 'Approved', { force: true }), true);
  assert.equal(d.versions.length, 2);
  d.title = 'Renamed';
  assert.equal(D.pushVersion(d, 'Title only'), true, 'a title change is a change');
});

test('only the latest versions are kept', () => {
  const d = draft([sec('a', 'Facts', '0')]);
  for (let i = 1; i <= 30; i++) { d.sections[0].body = String(i); D.pushVersion(d, `v${i}`); }
  assert.equal(d.versions.length, D.MAX_VERSIONS);
  assert.equal(d.versions[0].label, 'v30');
  assert.equal(d.versions[d.versions.length - 1].label, `v${30 - D.MAX_VERSIONS + 1}`);
  D.pushVersion(d, 'tight', { max: 3, force: true });
  assert.equal(d.versions.length, 3);
});

test('restoring brings back the text and title, reopens an approved draft, and keeps section ids', () => {
  const d = draft([sec('a', 'Facts', 'original'), sec('b', 'Prayer', 'bail')]);
  D.pushVersion(d, 'Good', { force: true });
  const id = d.versions[0].id;
  d.sections = [sec('a', 'Facts', 'rewritten'), sec('z', 'Extra', 'x')]; d.title = 'Other'; d.status = 'Approved'; d.approvedAt = '1 Sep';
  assert.equal(D.restoreVersion(d, id), true);
  assert.deepEqual(d.sections.map(s => [s.id, s.body]), [['a', 'original'], ['b', 'bail']]);
  assert.equal(d.title, 'Bail application');
  assert.equal(d.status, 'Draft');
  assert.equal(d.approvedAt, '');
  d.sections[0].body = 'edited after restore';
  assert.equal(d.versions[0].sections[0].body, 'original', 'a restored draft is a copy, not the version itself');
  assert.equal(D.restoreVersion(d, 'nope'), false);
});

test('versions read back from storage are cleaned', () => {
  const d = D.normalizeDraft({ versions: [{ label: 'x'.repeat(500), by: 5, sections: [{ id: 'a', heading: 1, layout: 'weird', body: 'b' }, null] }, null, 'junk'], comments: 'no' });
  assert.equal(d.versions.length, 3);
  assert.equal(d.versions[0].label.length, 120);
  assert.equal(d.versions[0].sections[0].layout, 'para');
  assert.deepEqual(d.comments, []);
  assert.equal(D.normalizeDraft({ versions: Array.from({ length: 100 }, () => ({})) }).versions.length, D.MAX_VERSIONS + 8);
});

/* ── review comments ────────────────────────────────────────────────────── */
test('a comment is on a section, with who said it and when; empty ones and unknown sections are refused', () => {
  const d = draft([sec('a', 'Facts', 'x'), sec('b', 'Prayer', 'y')]);
  const c = D.addComment(d, { sectionId: 'b', author: 'Gargee S.', text: '  Cite Arnesh Kumar here.  ', at: '11 Sep 10:30' });
  assert.equal(c.text, 'Cite Arnesh Kumar here.');
  assert.equal(c.author, 'Gargee S.');
  assert.equal(c.resolved, false);
  assert.equal(D.addComment(d, { sectionId: 'b', text: '   ' }), null);
  assert.equal(D.addComment(d, { sectionId: 'missing', text: 'x' }), null);
  assert.ok(D.addComment(d, { sectionId: '', text: 'General point.' }), 'a comment on the whole draft');
  assert.equal(d.comments.length, 2);
});

test('replies, resolving, reopening and removing', () => {
  const d = draft([sec('a', 'Facts', 'x')]);
  const c = D.addComment(d, { sectionId: 'a', author: 'Gargee S.', text: 'Add the date.' });
  assert.equal(D.replyToComment(d, c.id, { author: 'Shreyas A.', text: 'Done.', at: 't' }), true);
  assert.equal(D.replyToComment(d, c.id, { text: ' ' }), false);
  assert.equal(D.replyToComment(d, 'nope', { text: 'x' }), false);
  assert.equal(c.replies.length, 1);
  assert.equal(D.openComments(d).length, 1);
  assert.equal(D.setCommentResolved(d, c.id, true, 'Shreyas A.'), true);
  assert.equal(D.openComments(d).length, 0);
  assert.equal(c.resolvedBy, 'Shreyas A.');
  D.setCommentResolved(d, c.id, false);
  assert.equal(c.resolvedBy, '');
  assert.equal(D.openComments(d).length, 1);
  assert.equal(D.removeComment(d, c.id), true);
  assert.equal(D.removeComment(d, c.id), false);
  assert.equal(d.comments.length, 0);
});

test('comments read back from storage are cleaned, and the number is capped', () => {
  const d = D.normalizeDraft({ comments: [{ text: '  hi ', author: 7, resolved: 'yes', replies: [{ text: 'r' }, { text: '' }, null] }, { text: '' }, null, ...Array.from({ length: 400 }, () => ({ text: 'x' }))] });
  assert.equal(d.comments[0].text, 'hi');
  assert.equal(d.comments[0].resolved, true);
  assert.equal(d.comments[0].replies.length, 1);
  assert.ok(d.comments.length <= 200);
  assert.ok(d.comments.every(c => c.text));
});
