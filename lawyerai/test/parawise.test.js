const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../drafting.js');

const PLAINT = `IN THE CITY CIVIL COURT, MUMBAI
CIVIL SUIT NO. 123 OF 2026

AAROHI ESTATES PVT. LTD. ...Plaintiff
Versus
PATEL ...Defendant

PLAINT UNDER ORDER VII RULE 1 CPC

1. The Plaintiff is a company incorporated under the Companies Act, 2013, having its
office at Andheri, Mumbai.

2. The Defendant is the owner of the land at Plot 12. On 12 June 2025 the parties signed a
development agreement.
10. Total consideration was Rs. 5 crore, payable in three instalments.

3) Handover was due on 30 November 2025. Time was of the essence.
(a) The Defendant gave no notice of any delay.
(b) No force majeure was pleaded.

Para 4: The Plaintiff issued a notice dated 2 December 2025, which was never replied to.
2026. The Defendant then wrote on 5 January 2026 admitting the delay.
5 - The cause of action arose on 30 November 2025.`;

test('numbered paragraphs are found whichever way they are numbered, and wrapped lines are joined', () => {
  const r = D.splitParagraphs(PLAINT);
  assert.equal(r.numbered, true);
  assert.deepEqual(r.paragraphs.map(p => p.n), [1, 2, 3, 4, 5]);
  assert.equal(r.paragraphs[0].text, 'The Plaintiff is a company incorporated under the Companies Act, 2013, having its office at Andheri, Mumbai.');
  assert.match(r.paragraphs[2].text, /^Handover was due on 30 November 2025\. Time was of the essence\. \(a\) The Defendant gave no notice of any delay\. \(b\) No force majeure was pleaded\.$/);
  assert.equal(r.paragraphs[4].text, 'The cause of action arose on 30 November 2025.');
});

test('a number inside a paragraph is not mistaken for the next paragraph', () => {
  const r = D.splitParagraphs(PLAINT);
  assert.match(r.paragraphs[1].text, /Plot 12\. On 12 June 2025 the parties signed a development agreement\. 10\. Total consideration was Rs\. 5 crore/);
  assert.match(r.paragraphs[3].text, /never replied to\. 2026\. The Defendant then wrote on 5 January 2026/);
  assert.equal(r.paragraphs.length, 5);
});

test('the cause title before paragraph 1 is ignored', () => {
  const r = D.splitParagraphs(PLAINT);
  assert.ok(!r.paragraphs.some(p => /CIVIL SUIT NO|Versus/.test(p.text)));
});

test('"(1)" and "Paragraph 1." styles work, and a skipped number is tolerated', () => {
  const a = D.splitParagraphs('(1) First point.\n(2) Second point.\n(3) Third.');
  assert.deepEqual(a.paragraphs.map(p => p.text), ['First point.', 'Second point.', 'Third.']);
  const b = D.splitParagraphs('Paragraph 1. One.\nParagraph 2. Two.');
  assert.deepEqual(b.paragraphs.map(p => p.n), [1, 2]);
  const c = D.splitParagraphs('1. One.\n2. Two.\n4. Four (the opponent skipped three).');
  assert.deepEqual(c.paragraphs.map(p => p.n), [1, 2, 4]);
});

test('a jump of more than two is treated as text, not a new paragraph', () => {
  const r = D.splitParagraphs('1. One.\n2. Two.\n9. Nine is part of two\'s text.\n3. Three.');
  assert.deepEqual(r.paragraphs.map(p => p.n), [1, 2, 3]);
  assert.match(r.paragraphs[1].text, /9\. Nine is part/);
});

test('with no numbers at all, each block of text is a paragraph, numbered by position', () => {
  const r = D.splitParagraphs('The plaintiff says A.\nStill the first block.\n\nThe plaintiff says B.\n\n\nAnd C.');
  assert.equal(r.numbered, false);
  assert.deepEqual(r.paragraphs, [{ n: 1, text: 'The plaintiff says A. Still the first block.' }, { n: 2, text: 'The plaintiff says B.' }, { n: 3, text: 'And C.' }]);
});

test('a single numbered line is not enough to call a document numbered', () => {
  const r = D.splitParagraphs('1. Only one numbered line.\n\nThen some other text.');
  assert.equal(r.numbered, false);
  assert.equal(r.paragraphs.length, 2);
});

test('empty and odd input is safe, and size is capped', () => {
  assert.deepEqual(D.splitParagraphs(''), { numbered: false, paragraphs: [] });
  assert.deepEqual(D.splitParagraphs(null), { numbered: false, paragraphs: [] });
  assert.equal(D.splitParagraphs('   \n\n  ').paragraphs.length, 0);
  assert.equal(D.splitParagraphs('1. a\r\n2. b\r\n3. c').paragraphs.length, 3, 'Windows line ends');
  const big = Array.from({ length: 500 }, (_, i) => `${(i % 999) + 1}. x`).join('\n');
  assert.ok(D.splitParagraphs(big).paragraphs.length <= 300);
  assert.ok(D.splitParagraphs(`1. ${'y'.repeat(9000)}\n2. z`).paragraphs[0].text.length <= 4000);
});

const kind = D.DOC_KINDS.plaint;
const opts = { doc: kind.doc, as: kind.as, other: kind.other };

test('each stance is worded as a pleading would word it', () => {
  const line = (stance, note) => D.paraReplyLine({ n: 3, stance, note }, opts);
  assert.equal(line('admitted'), 'The contents of paragraph 3 of the plaint are admitted.');
  assert.equal(line('denied'), 'The contents of paragraph 3 of the plaint are denied.');
  assert.equal(line('denied', 'The agreement was never signed.'), 'The contents of paragraph 3 of the plaint are denied. The agreement was never signed.');
  assert.equal(line('partly', 'the agreement was signed'), 'The contents of paragraph 3 of the plaint are admitted only to the extent that the agreement was signed. The rest is denied.');
  assert.equal(line('unknown'), 'The contents of paragraph 3 of the plaint are not within the knowledge of the Defendant and are therefore denied. The Plaintiff is put to strict proof thereof.');
  assert.equal(line('legal'), 'Paragraph 3 of the plaint contains legal submissions and calls for no reply. To the extent a reply is required, it is denied.');
});

test('a reply that needs the lawyer’s words, or has no stance yet, is a visible blank — never an invented answer', () => {
  assert.match(D.paraReplyLine({ n: 4, stance: 'partly' }, opts), /to the extent that \[____\]\. The rest is denied\./);
  assert.equal(D.paraReplyLine({ n: 5, stance: '' }, opts), 'Paragraph 5 of the plaint: [____]');
  assert.equal(D.paraReplyLine({ n: 5, stance: 'nonsense' }, opts), 'Paragraph 5 of the plaint: [____]');
  assert.equal(D.paraReplyLine({ n: 5 }, opts), 'Paragraph 5 of the plaint: [____]');
});

test('replying to a notice reads naturally', () => {
  const n = D.DOC_KINDS.notice;
  const line = D.paraReplyLine({ n: 2, stance: 'unknown' }, { doc: n.doc, as: n.as, other: n.other });
  assert.equal(line, 'The contents of paragraph 2 of the notice are not within the knowledge of my client and are therefore denied. The sender of the notice is put to strict proof thereof.');
});

test('the replies come out one per line, in order, ready for the reply section', () => {
  const rows = [{ n: 1, stance: 'admitted' }, { n: 2, stance: 'denied', note: 'Wrong.' }, { n: 3 }];
  assert.equal(D.paraReplies(rows, opts), 'The contents of paragraph 1 of the plaint are admitted.\nThe contents of paragraph 2 of the plaint are denied. Wrong.\nParagraph 3 of the plaint: [____]');
  assert.equal(D.countGaps(D.paraReplies(rows, opts)), 1, 'the unanswered paragraph is counted as a blank');
  assert.equal(D.paraReplies([], opts), '');
});

test('the written statement and the reply to a notice take the replies as plain lines, and keep a scaffold when there are none', () => {
  const matter = { title: 'Aarohi v. Patel', court: 'City Civil Court', facts: {}, timeline: [], authorities: [], arguments: [], counterArgs: [], documents: [] };
  for (const id of ['std-written-statement', 'std-reply-notice']) {
    const f = D.BUILTIN_FORMATS.find(x => x.id === id);
    const sec = f.sections.find(s => s.body === '{{para_replies}}');
    assert.ok(sec, `${id} has a reply section`);
    assert.equal(sec.layout, 'para', 'lines are not renumbered: the other side’s numbers are the reference');
    const text = replyText(D.createDraft(f, matter, { extras: { paraReplies: 'The contents of paragraph 1 of the plaint are denied.' } }), sec.heading);
    assert.equal(text, 'The contents of paragraph 1 of the plaint are denied.');
    const none = replyText(D.createDraft(f, matter), sec.heading);
    assert.match(none, /Paragraph \[____\] is \[admitted \/ denied\] because \[____\]\./, 'a scaffold when the tool was not used');
  }
  function replyText(draft, heading) { return draft.sections.find(s => s.heading === heading).body; }
});

test('para_replies is a known field, so formats that use it are valid', () => {
  assert.ok(D.PLACEHOLDERS.some(p => p.key === 'para_replies'));
  const f = { ...D.blankFormat('My reply'), name: 'Mine', sections: [{ heading: 'Reply', layout: 'para', body: '{{para_replies}}' }] };
  assert.deepEqual(D.validateFormat(f, []), []);
});

test('the document kinds carry the labels and a matching format type', () => {
  for (const k of Object.values(D.DOC_KINDS)) assert.ok(k.label && k.doc && k.as && k.other && k.docType);
  assert.ok(D.BUILTIN_FORMATS.some(f => f.docType === D.DOC_KINDS.plaint.docType));
  assert.ok(D.BUILTIN_FORMATS.some(f => f.docType === D.DOC_KINDS.notice.docType));
  assert.deepEqual(Object.keys(D.STANCES), ['admitted', 'denied', 'partly', 'unknown', 'legal']);
});
