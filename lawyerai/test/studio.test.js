import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const Studio = createRequire(import.meta.url)('../studio.js');

test('a page header escapes its title, lede and chips but passes the eyebrow and actions through as given', () => {
  const h = Studio.head({ eyebrow: 'Court &amp; clients', title: 'Limitation & <b>deadlines</b>', lede: 'A "quoted" <i>lede</i>', chips: [{ text: '<x>', tone: 'amber' }, null], actions: '<button>Go</button>' });
  assert.match(h, /<p class="eyebrow">Court &amp; clients<\/p>/);
  assert.match(h, /<h1>Limitation &amp; &lt;b&gt;deadlines&lt;\/b&gt;<\/h1>/);
  assert.match(h, /A &quot;quoted&quot; &lt;i&gt;lede&lt;\/i&gt;/);
  assert.match(h, /<span class="chip chip-amber">&lt;x&gt;<\/span>/);
  assert.match(h, /<div class="ds-head-act"><button>Go<\/button><\/div>/);
  assert.equal((h.match(/class="chip/g) || []).length, 1);                    // a null chip is skipped
});

test('a section is one panel, and there is no numbered dot anywhere', () => {
  const s = Studio.sec({ title: 'Documents <1>', sub: 'Help & more', action: '<a>Add</a>', body: '<p>rows</p>' });
  assert.match(s, /<h2>Documents &lt;1&gt;<\/h2>/);
  assert.match(s, /<p class="ds-step-sub">Help &amp; more<\/p>/);
  assert.match(s, /<div class="ds-step-act"><a>Add<\/a><\/div>/);
  assert.equal((s.match(/class="ds-panel/g) || []).length, 1);
  assert.doesNotMatch(s, /ds-n/);
  assert.match(Studio.sec({ title: 'T', body: 'x', pad: true }), /ds-panel pad/);
  assert.match(Studio.sec({ title: 'T', body: 'x', flush: true }), /ds-panel flush/);
  assert.doesNotMatch(Studio.sec({ title: 'T', body: 'x', panel: false }), /ds-panel/);
});

test('a section with neither a title nor an action has no heading row', () => {
  assert.doesNotMatch(Studio.sec({ body: 'x' }), /ds-step-h/);
  assert.match(Studio.sec({ action: '<a>x</a>', body: 'x' }), /ds-step-h/);
});

test('parts, key/value rows and the empty note are escaped', () => {
  assert.match(Studio.part('A & B', '<a>x</a>'), /<h3>A &amp; B<\/h3><div class="ds-step-act"><a>x<\/a><\/div>/);
  assert.match(Studio.kv([['Objective', 'already <b>safe</b>'], ['Court', 'Bombay']]), /<dt>Objective<\/dt><dd>already <b>safe<\/b><\/dd>/);
  assert.match(Studio.empty('None <yet>'), /None &lt;yet&gt;/);
});

test('a rail tool is a button with its name and what it does, or a link, or disabled', () => {
  const b = Studio.tool({ id: 'x', icon: 'check', name: 'Citation <check>', fn: 'Looks up "cases"' });
  assert.match(b, /<button type="button" class="ds-tool" data-rail="x"/);
  assert.match(b, /aria-label="Citation &lt;check&gt;: Looks up &quot;cases&quot;"/);
  assert.match(b, /<b>Citation &lt;check&gt;<\/b>Looks up &quot;cases&quot;/);
  const l = Studio.tool({ id: 'y', icon: 'calendar', name: 'Calendar', fn: 'Open it', href: '#/calendar' });
  assert.match(l, /^<a class="ds-tool" href="#\/calendar"/);
  const off = Studio.tool({ id: 'z', icon: 'x', name: 'History', fn: 'Versions', off: true, offNote: 'Start a draft first.', href: '#/h' });
  assert.match(off, /^<button/);                                                // a disabled tool is never a link
  assert.match(off, / disabled>/);
  assert.match(off, /Start a draft first\./);
  assert.doesNotMatch(off, /Versions<\/span>/);
});

test('AI tools are marked, and a badge shows only when there is something to count', () => {
  assert.match(Studio.tool({ id: 'a', icon: 'spark', name: 'Argue', fn: 'f', ai: true }), /class="ds-tool ai".*<i>AI<\/i>/);
  assert.match(Studio.tool({ id: 'n', icon: 'edit', name: 'Notes', fn: 'f', badge: 3 }), /<em>3<\/em>/);
  assert.doesNotMatch(Studio.tool({ id: 'n', icon: 'edit', name: 'Notes', fn: 'f', badge: 0 }), /<em/);
  const live = Studio.tool({ id: 'n', icon: 'edit', name: 'Notes', fn: 'f', badge: 0, badgeId: 'myBadge' });
  assert.match(live, /<em id="myBadge" hidden><\/em>/);                         // kept in the page so it can be updated
});

test('a rail skips empty groups, and a page gets room for the rail only when it has one', () => {
  const r = Studio.rail([{ group: 'A', tools: [] }, { group: 'B', tools: [{ id: 'b', icon: 'x', name: 'B', fn: 'f' }] }, { group: 'C', tools: [{ id: 'c', icon: 'x', name: 'C', fn: 'f' }] }, null]);
  assert.equal((r.match(/class="ds-group"/g) || []).length, 2);
  assert.equal((r.match(/class="ds-sep"/g) || []).length, 1);
  assert.match(Studio.page('<p>x</p>', [{ group: 'B', tools: [{ id: 'b', icon: 'x', name: 'B', fn: 'f' }] }]), /^<div class="ds has-rail"><p>x<\/p><\/div><nav class="ds-rail"/);
  const bare = Studio.page('<p>x</p>', [{ group: 'B', tools: [] }]);
  assert.equal(bare, '<div class="ds"><p>x</p></div>');
  assert.equal(Studio.page('<p>x</p>'), '<div class="ds"><p>x</p></div>');
});

test('every matter page gets the same three matter tools, pointing at that matter', () => {
  const g = Studio.matterTools({ id: 'm7' });
  assert.equal(g.group, 'Matter');
  assert.deepEqual(g.tools.map(t => t.id), ['matter-ask', 'matter-evidence', 'matter-limit']);
  assert.equal(g.tools[0].href, '#/matters/m7/chat');
  assert.equal(g.tools[2].href, '#/deadlines?matter=m7');
  assert.equal(g.tools[1].href, undefined);                                     // adding evidence opens a form
});

test('the page loads studio.js before app.js, which registers its rail tools as it loads', async () => {
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const order = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
  assert.ok(order.indexOf('studio.js') >= 0 && order.indexOf('studio.js') < order.indexOf('app.js'));
  assert.ok(order.indexOf('app.js') < order.indexOf('workbench.js') && order.indexOf('workbench.js') < order.indexOf('draft-studio.js'));
});
