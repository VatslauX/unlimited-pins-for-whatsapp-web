// rows.js + bridge.js in JSDOM tabs whose chat list is drawn with React like WhatsApp's (see
// fake-whatsapp.js): the row size from storage reaches the list, changes it live, and touches
// nothing else.
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createWorld, until, settle } = require('./harness');

/** @type {ReturnType<typeof createWorld>[]} */
const worlds = [];
const world = o => { const w = createWorld(o); worlds.push(w); return w; };
afterEach(() => {
  for (const w of worlds.splice(0)) {
    w.closeAll();
    assert.deepEqual(w.errors, [], 'no errors in the page');
  }
});

/** row heights (px) and tops of a list, in order */
const rows = (tab, testid = 'chat-list') => [...tab.doc.querySelectorAll(`[data-testid="${testid}"] [role="row"]`)]
  .map(r => `${r.style.height} ${r.style.transform}`);
const heights = (tab, testid) => [...new Set(rows(tab, testid).map(r => r.split(' ')[0]))];
const drawn = tab => until(() => rows(tab).length > 0, 'chat list drawn');

test('by default the chat list keeps WhatsApp\'s own 76 px rows', async () => {
  const w = world();
  const tab = w.open({ react: true });
  await drawn(tab);
  await until(() => tab.attr('data-up-rows') === 'original', 'rows original');
  assert.equal(tab.attr('data-up-size'), 'original');
  assert.deepEqual(heights(tab), ['76px']);
  assert.deepEqual(rows(tab).slice(0, 2), ['76px translateY(0px)', '76px translateY(76px)']);
});

test('a stored size draws the list at that height from the first draw', async () => {
  for (const [size, px] of [['medium', 56], ['compact', 36]]) {
    const w = world();
    await w.setRowSize(size);
    const tab = w.open({ react: true, listAfterMs: 50 });
    await drawn(tab);
    await until(() => tab.attr('data-up-rows') === size, `rows ${size}`);
    assert.deepEqual(heights(tab), [`${px}px`], size);
    assert.equal(rows(tab)[1], `${px}px translateY(${px}px)`, 'rows placed at the new height');
    assert.equal(tab.doc.querySelector('[data-testid="chat-list"] [role="grid"]').style.height, `${px * 8}px`);
  }
});

test('changing the size in the options page changes an open tab right away, with no redraw from WhatsApp', async () => {
  const w = world();
  const tab = w.open({ react: true });
  await drawn(tab);
  await until(() => tab.attr('data-up-rows') === 'original', 'rows original');
  await w.setRowSize('compact');
  await until(() => heights(tab)[0] === '36px', 'compact rows');
  assert.equal(tab.attr('data-up-rows'), 'compact');
  await w.setRowSize('medium');
  await until(() => heights(tab)[0] === '56px', 'medium rows');
  await w.setRowSize('original');
  await until(() => heights(tab)[0] === '76px', 'original rows');
  assert.equal(tab.attr('data-up-rows'), 'original');
});

test('a list drawn before rows.js hooked in takes the size at WhatsApp\'s next redraw', async () => {
  const w = world();
  await w.setRowSize('compact');
  // modules at 100 ms, list right away: drawn before rows.js's next poll (every 200 ms)
  const tab = w.open({ react: true, loadAfterMs: 100, listAfterMs: 0 });
  await drawn(tab);
  assert.deepEqual(heights(tab), ['76px']);
  await settle(300); // rows.js has hooked in by now
  assert.equal(tab.attr('data-up-rows'), null, 'no row CSS before the list is drawn small');
  tab.wa.ui.redraw(); // a new message, a filter click
  await until(() => heights(tab)[0] === '36px', 'compact after redraw');
  assert.equal(tab.attr('data-up-rows'), 'compact');
});

test('every open tab follows the size', async () => {
  const w = world();
  const a = w.open({ react: true }), b = w.open({ react: true });
  await drawn(a); await drawn(b);
  await w.setRowSize('compact');
  await until(() => heights(a)[0] === '36px' && heights(b)[0] === '36px', 'both compact');
});

test('a stored value that is not a size keeps the original rows', async () => {
  const w = world();
  await w.setRowSize('tiny');
  const tab = w.open({ react: true });
  await drawn(tab);
  await until(() => tab.attr('data-up-rows') === 'original', 'rows original');
  assert.equal(tab.attr('data-up-size'), 'original');
  assert.deepEqual(heights(tab), ['76px']);
});

test('other lists drawn with the same component are left alone', async () => {
  const w = world();
  await w.setRowSize('compact');
  const tab = w.open({ react: true });
  await drawn(tab);
  await until(() => heights(tab)[0] === '36px', 'compact rows');
  assert.deepEqual(heights(tab, 'other-list'), ['40px']);
});

test('the list keeps following chats and pins at a smaller size', async () => {
  const w = world();
  await w.setRowSize('medium');
  const tab = w.open({ react: true });
  await tab.ready();
  await drawn(tab);
  await tab.wa.ui.menu('a@c.us'); // a 4th pin: local
  await until(() => tab.doc.querySelector('[data-testid="chat-list"] [role="row"]').getAttribute('data-id') === 'a@c.us', 'a first');
  assert.deepEqual(heights(tab), ['56px']);
  assert.deepEqual(tab.wa.serverCalls, []);
});

test('the archived chats list follows the size too', async () => {
  const w = world();
  await w.setRowSize('compact');
  const tab = w.open({ react: true });
  await drawn(tab);
  await until(() => heights(tab, 'archived-chatlist')[0] === '36px', 'archived compact');
  assert.equal(tab.attr('data-up-archived'), 'compact');
  assert.equal(tab.attr('data-up-rows'), 'compact');
});

test('an archived list rows.js can\'t resize doesn\'t turn off the chat list\'s CSS, nor gets it', async () => {
  const w = world();
  await w.setRowSize('compact');
  const tab = w.open({ react: true, archivedRowType: 'ROW_ARCHIVED_V2' });
  await drawn(tab);
  await until(() => heights(tab)[0] === '36px', 'chat list compact');
  await until(() => tab.attr('data-up-archived') === 'original', 'archived original');
  tab.wa.ui.redraw();
  await settle(100);
  assert.equal(tab.attr('data-up-rows'), 'compact', 'chat list keeps its CSS');
  assert.deepEqual(heights(tab, 'archived-chatlist'), ['76px']);
});

test('list data rows.js doesn\'t know (WhatsApp renamed the row type) is left alone, and so is the CSS', async () => {
  const w = world();
  await w.setRowSize('compact');
  const tab = w.open({ react: true, rowType: 'ROW_CHAT_V2' });
  await drawn(tab);
  await until(() => tab.attr('data-up-rows') === 'original', 'rows original');
  await settle(100);
  assert.deepEqual(heights(tab), ['76px']);
  assert.equal(tab.attr('data-up-rows'), 'original', 'no row CSS on 76 px rows');
});

test('without the list module, rows.js does nothing and pins still work', async () => {
  const w = world();
  await w.setRowSize('compact');
  const tab = w.open(); // no React list: WhatsApp renamed its modules
  await tab.ready();
  await settle(300);
  assert.equal(tab.attr('data-up-rows'), null);
  assert.equal(tab.attr('data-up-size'), 'compact');
});
