// pins.js + bridge.js together, in JSDOM tabs against the fake WhatsApp (see harness.js):
// the native-room rule, what reaches the "server", storage, reloads, other tabs, and resyncs.
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createWorld, until, settle, CHATS, T0 } = require('./harness');

/** @type {ReturnType<typeof createWorld>[]} */
const worlds = [];
const world = o => { const w = createWorld(o); worlds.push(w); return w; };
afterEach(() => {
  for (const w of worlds.splice(0)) {
    w.closeAll();
    assert.deepEqual(w.errors, [], 'no errors in the page');
  }
});
const storedIds = w => Object.keys((w.stored() || {}).pins || {}).sort();
// the default list without its third native pin: one native slot is free
const TWO_NATIVE = CHATS.map(c => (c.id === 'p3@g.us' ? { ...c, pin: 0 } : c));

test('status goes from loading to ready once WhatsApp has loaded its modules', async () => {
  const w = world();
  const tab = w.open({ loadAfterMs: 1200 });
  assert.equal(tab.status(), 'loading');
  await until(() => tab.status() === 'ready', 'ready', 5000);
});

test('with 3 native pins, the menu pins a 4th chat locally: top of the list, nothing sent', async () => {
  const w = world();
  const tab = w.open();
  await tab.ready();
  await tab.wa.ui.menu('a@c.us');
  await until(() => tab.wa.pinned().includes('a@c.us'), 'a pinned');
  assert.equal(tab.wa.order()[0], 'a@c.us', 'newest pin first');
  assert.deepEqual(tab.wa.serverCalls, []);
  assert.deepEqual(tab.wa.dialogs, [], 'no "only 3 pins" dialog');
  await until(() => storedIds(w).includes('a@c.us'), 'stored');
  assert.deepEqual(storedIds(w), ['a@c.us']);
});

test('pins 5 chats past the limit and keeps the native 3 untouched', async () => {
  const w = world();
  const tab = w.open();
  await tab.ready();
  for (const id of ['a@c.us', 'b@c.us', 'c@g.us', 'd@lid']) await tab.wa.ui.menu(id);
  await until(() => tab.wa.pinned().length === 7, '7 pinned');
  assert.deepEqual(tab.wa.serverCalls, []);
  assert.deepEqual([...tab.wa.server.keys()].sort(), ['p1@c.us', 'p2@c.us', 'p3@g.us']);
});

test('with a free native slot, a pin goes to WhatsApp normally: one server call, not stored', async () => {
  const w = world();
  const tab = w.open({ chats: TWO_NATIVE });
  await tab.ready();
  await tab.wa.ui.menu('a@c.us');
  await until(() => tab.wa.pinned().includes('a@c.us'), 'a pinned');
  assert.equal(tab.wa.serverCalls.length, 1);
  assert.equal(tab.wa.serverCalls[0].chatId, 'a@c.us');
  await settle();
  assert.deepEqual(storedIds(w), []);
  // now the slots are full again: the next pin is local
  await tab.wa.ui.menu('b@c.us');
  await until(() => storedIds(w).includes('b@c.us'), 'b stored');
  assert.equal(tab.wa.serverCalls.length, 1);
});

test('local pins do not count as native: a free slot still goes to WhatsApp', async () => {
  const w = world({ stored: { by: 'x', pins: { 'b@c.us': T0 + 10 } } });
  const tab = w.open({ chats: TWO_NATIVE });
  await tab.ready();
  await until(() => tab.wa.pinned().includes('b@c.us'), 'stored pin applied');
  await tab.wa.ui.menu('a@c.us');
  await until(() => tab.wa.serverCalls.length === 1, 'server call');
  assert.deepEqual(tab.wa.dialogs, []);
});

test('the keyboard shortcut pins and unpins a local pin', async () => {
  const w = world();
  const tab = w.open();
  await tab.ready();
  await tab.wa.ui.shortcut('a@c.us');
  await until(() => tab.wa.pinned().includes('a@c.us') && storedIds(w).includes('a@c.us'), 'a pinned');
  await tab.wa.ui.shortcut('a@c.us');
  await until(() => !tab.wa.pinned().includes('a@c.us') && !storedIds(w).includes('a@c.us'), 'a unpinned');
  assert.deepEqual(tab.wa.serverCalls, []);
});

test('unpinning a native pin still goes to WhatsApp', async () => {
  const w = world();
  const tab = w.open();
  await tab.ready();
  await tab.wa.ui.menu('p1@c.us');
  await until(() => tab.wa.serverCalls.length === 1, 'server call');
  assert.deepEqual(tab.wa.serverCalls[0], { chatId: 'p1@c.us', newPinTime: 0 });
  assert.ok(!tab.wa.pinned().includes('p1@c.us'));
});

test('a direct server pin call past the limit is kept local (the guard on WAWebChatPinBridge.setPin)', async () => {
  const w = world();
  const tab = w.open();
  await tab.ready();
  const B = tab.win.require('WAWebChatPinBridge');
  await B.setPin({ chatId: tab.wa.Chat.get('a@c.us').id, newPinTime: Date.now() });
  await until(() => tab.wa.pinned().includes('a@c.us'), 'a pinned');
  assert.deepEqual(tab.wa.serverCalls, []);
  await until(() => storedIds(w).includes('a@c.us'), 'stored');
});

test('pins survive a reload', async () => {
  const w = world();
  const tab = w.open();
  await tab.ready();
  await tab.wa.ui.menu('a@c.us');
  await tab.wa.ui.menu('b@c.us');
  await until(() => storedIds(w).length === 2, 'both stored');
  tab.close();
  const again = w.open({ loadAfterMs: 300 }); // WhatsApp loads after the extension, like a real reload
  await again.ready();
  await until(() => again.wa.pinned().length === 5, '5 pinned after reload');
  assert.deepEqual(again.wa.order().slice(0, 2), ['b@c.us', 'a@c.us']);
  assert.deepEqual(again.wa.serverCalls, []);
});

test('an unpin survives a reload too', async () => {
  const w = world({ stored: { by: 'x', pins: { 'a@c.us': T0 + 10 } } });
  const tab = w.open();
  await tab.ready();
  await until(() => tab.wa.pinned().includes('a@c.us'), 'applied');
  await tab.wa.ui.menu('a@c.us');
  await until(() => !storedIds(w).includes('a@c.us'), 'removed');
  tab.close();
  const again = w.open();
  await again.ready();
  await settle(50);
  assert.ok(!again.wa.pinned().includes('a@c.us'));
});

test('a local pin comes back when WhatsApp resets pins from its own data', async () => {
  const w = world();
  const tab = w.open();
  await tab.ready();
  await tab.wa.ui.menu('a@c.us');
  await until(() => tab.wa.pinned().includes('a@c.us'), 'pinned');
  tab.wa.ui.resync();
  assert.ok(!tab.wa.pinned().includes('a@c.us'), 'the reset happened');
  await until(() => tab.wa.pinned().includes('a@c.us'), 'restored');
  assert.deepEqual(tab.wa.serverCalls, []);
});

test('a chat that loads later gets its stored pin', async () => {
  const w = world({ stored: { by: 'x', pins: { 'late@c.us': T0 + 10 } } });
  const tab = w.open();
  await tab.ready();
  tab.wa.Chat.add({ id: 'late@c.us', t: 1 });
  await until(() => tab.wa.pinned().includes('late@c.us'), 'late chat pinned');
});

test('pins and unpins reach another open tab', async () => {
  const w = world();
  const one = w.open(), two = w.open();
  await one.ready(); await two.ready();
  await one.wa.ui.menu('a@c.us');
  await until(() => two.wa.pinned().includes('a@c.us'), 'pin reaches tab two');
  await one.wa.ui.menu('a@c.us');
  await until(() => !two.wa.pinned().includes('a@c.us'), 'unpin reaches tab two');
});

test('pinning two chats quickly keeps both (no stale echo)', async () => {
  const w = world({ latency: 20 });
  const tab = w.open();
  await tab.ready();
  await until(() => tab.attr('data-up-pins') !== null, 'stored list loaded');
  await tab.wa.ui.menu('a@c.us');
  await tab.wa.ui.menu('b@c.us');
  await until(() => storedIds(w).length === 2, 'both stored');
  await settle(100);
  assert.ok(tab.wa.pinned().includes('a@c.us') && tab.wa.pinned().includes('b@c.us'));
  assert.deepEqual(storedIds(w), ['a@c.us', 'b@c.us']);
});

test('a pin made before the stored list arrives is kept and merged', async () => {
  const w = world({ stored: { by: 'x', pins: { 'b@c.us': T0 + 10 } }, latency: 300 });
  const tab = w.open();
  await tab.ready();
  assert.equal(tab.attr('data-up-pins'), null, 'storage not read yet');
  await tab.wa.ui.menu('a@c.us');
  await until(() => storedIds(w).length === 2, 'merged and stored', 5000);
  assert.deepEqual(storedIds(w), ['a@c.us', 'b@c.us']);
});

test('newsletters keep WhatsApp\'s own limit', async () => {
  const chats = [
    { id: 'n1@newsletter', pin: T0 + 2, t: 1 }, { id: 'n2@newsletter', pin: T0 + 1, t: 2 }, { id: 'n3@newsletter', t: 3 }, ...CHATS.filter(c => !c.id.endsWith('@newsletter'))
  ];
  const w = world();
  const tab = w.open({ chats });
  await tab.ready();
  await tab.wa.ui.menu('n3@newsletter');
  await settle(50);
  assert.deepEqual(tab.wa.dialogs, ['limit']);
  assert.ok(!tab.wa.pinned().includes('n3@newsletter'));
  assert.deepEqual(storedIds(w), []);
});

test('bad data from the page or storage is ignored', async () => {
  const w = world({ stored: { by: 'x', pins: { 'a@c.us': T0 + 10, 'bad id': T0, 'b@c.us': 'soon' } } });
  const tab = w.open();
  await tab.ready();
  await until(() => tab.wa.pinned().includes('a@c.us'), 'valid entry applied');
  assert.ok(!tab.wa.pinned().includes('b@c.us'));
  // the page writes junk into the attributes: nothing breaks, nothing is stored
  tab.doc.documentElement.setAttribute('data-up-pins', '{not json');
  tab.doc.documentElement.setAttribute('data-up-save', '[1,2,3]');
  await settle(50);
  assert.ok(tab.wa.pinned().includes('a@c.us'), 'junk did not unpin anything');
  assert.deepEqual(w.stored().pins, { 'a@c.us': T0 + 10, 'bad id': T0, 'b@c.us': 'soon' }, 'junk was not stored');
});

test('without WhatsApp\'s modules the extension reports missing and changes nothing', async () => {
  const w = world();
  const tab = w.open({ loadAfterMs: 60000 });
  await until(() => tab.status() === 'missing', 'missing', 40000);
  assert.deepEqual(tab.wa.serverCalls, []);
}, { timeout: 45000 });
