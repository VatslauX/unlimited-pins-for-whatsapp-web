// The real extension in Chromium against the mock WhatsApp Web: both worlds, chrome.storage.local,
// reloads and tabs. See tests/fixtures/whatsapp.html for the mock.
const { test, expect, order, pinned, menu, serverCalls } = require('./fixtures');

const T0 = 1774270178963;

test('the extension loads and reports ready', async ({ whatsapp }) => {
  const page = await whatsapp();
  await expect(page.locator('html')).toHaveAttribute('data-up-status', 'ready');
});

test('a 4th pin goes to the top, sends nothing, and survives a reload', async ({ whatsapp }) => {
  const page = await whatsapp();
  await menu(page, 'a@c.us');
  await expect.poll(() => order(page)).toEqual(['a@c.us', 'p1@c.us', 'p2@c.us', 'p3@g.us', 'b@c.us', 'c@g.us', 'd@lid']);
  expect(await serverCalls(page)).toEqual([]);
  expect(await page.evaluate(() => window.__wa.dialogs)).toEqual([]);

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-up-status', 'ready');
  await expect.poll(() => pinned(page)).toEqual(['a@c.us', 'p1@c.us', 'p2@c.us', 'p3@g.us']);
  expect(await serverCalls(page)).toEqual([]);
});

test('an unpinned local pin stays unpinned after a reload', async ({ whatsapp }) => {
  const page = await whatsapp();
  await menu(page, 'a@c.us');
  await expect.poll(() => pinned(page)).toContain('a@c.us');
  await menu(page, 'a@c.us');
  await expect.poll(() => pinned(page)).not.toContain('a@c.us');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-up-status', 'ready');
  // give a wrongly stored pin every chance to come back before checking it didn't
  await expect.poll(() => page.locator('html').getAttribute('data-up-pins')).toBe('{}');
  expect(await pinned(page)).toEqual(['p1@c.us', 'p2@c.us', 'p3@g.us']);
});

test('with a free native slot, a pin goes to WhatsApp exactly once', async ({ whatsapp }) => {
  const page = await whatsapp({
    chats: [
      { id: 'p1@c.us', name: 'Native one', pin: T0 + 2, t: 100 },
      { id: 'p2@c.us', name: 'Native two', pin: T0 + 1, t: 90 },
      { id: 'a@c.us', name: 'Alice', t: 70 },
      { id: 'b@c.us', name: 'Bob', t: 60 }
    ]
  });
  await menu(page, 'a@c.us');
  await expect.poll(() => serverCalls(page)).toHaveLength(1);
  expect((await serverCalls(page))[0].chatId).toBe('a@c.us');
  await menu(page, 'b@c.us'); // the slots are full now: local
  await expect.poll(() => pinned(page)).toContain('b@c.us');
  expect(await serverCalls(page)).toHaveLength(1);
});

test('a pin in one tab shows up in another', async ({ whatsapp }) => {
  const one = await whatsapp(), two = await whatsapp();
  await menu(one, 'b@c.us');
  await expect.poll(() => pinned(two)).toContain('b@c.us');
  await menu(one, 'b@c.us');
  await expect.poll(() => pinned(two)).not.toContain('b@c.us');
});

test('a local pin comes back after WhatsApp resets its pins', async ({ whatsapp }) => {
  const page = await whatsapp();
  await menu(page, 'c@g.us');
  await expect.poll(() => pinned(page)).toContain('c@g.us');
  await page.evaluate(() => window.__wa.ui.resync());
  await expect.poll(() => pinned(page)).toContain('c@g.us');
  expect(await serverCalls(page)).toEqual([]);
});

test('works when WhatsApp loads its modules late', async ({ whatsapp }) => {
  const page = await whatsapp({ loadMs: 2500 });
  await menu(page, 'd@lid');
  await expect.poll(() => pinned(page)).toContain('d@lid');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-up-status', 'ready', { timeout: 10000 });
  await expect.poll(() => pinned(page)).toContain('d@lid');
});
