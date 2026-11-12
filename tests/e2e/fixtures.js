// Playwright fixtures: a Chromium profile with the unpacked extension loaded, and a mock of
// web.whatsapp.com served via request routing (no network; the real WhatsApp is never contacted).
const { test: base, expect, chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const os = require('os');

// UP_EXTENSION_DIR: a scratch copy of extension/, to prove a test fails without a change
const EXT = process.env.UP_EXTENSION_DIR ? path.resolve(process.env.UP_EXTENSION_DIR) : path.resolve(__dirname, '../../extension');
const MOCK = fs.readFileSync(path.resolve(__dirname, '../fixtures/whatsapp.html'), 'utf8');
const FAKE = fs.readFileSync(path.resolve(__dirname, '../fixtures/fake-whatsapp.js'), 'utf8');
const { REACT_BUNDLE } = require('../fixtures/react-bundle');

// Chrome's id for an unpacked extension: the SHA-256 of its absolute path, first 32 hex digits
// written with the letters a-p. (No background script, so no service worker to read it from.)
const EXTENSION_ID = require('crypto').createHash('sha256').update(EXT).digest('hex').slice(0, 32)
  .replace(/./g, c => String.fromCharCode(97 + parseInt(c, 16)));

const test = base.extend({
  // one fresh browser profile per test: storage starts empty
  context: async ({}, use) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upins-'));
    const context = await chromium.launchPersistentContext(dir, {
      channel: 'chromium',
      headless: false,
      args: ['--headless=new', `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
      viewport: { width: 1000, height: 800 }
    });
    await context.route('https://web.whatsapp.com/**', route => {
      const u = new URL(route.request().url());
      if (u.pathname === '/mock/fake-whatsapp.js') return route.fulfill({ contentType: 'application/javascript', body: FAKE });
      if (u.pathname === '/mock/react.js') return route.fulfill({ contentType: 'application/javascript', body: REACT_BUNDLE });
      return route.fulfill({ contentType: 'text/html', body: MOCK });
    });
    await use(context);
    await context.close().catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
  },

  // open the mock WhatsApp Web in a new tab; waits until the extension reports ready
  whatsapp: async ({ context }, use) => {
    await use(async ({ chats, loadMs, react } = {}) => {
      const page = await context.newPage();
      await page.addInitScript(o => {
        if (o.chats) window.__MOCK_CHATS = o.chats;
        if (o.loadMs !== undefined) window.__MOCK_LOAD_MS = o.loadMs;
        if (o.react) window.__MOCK_REACT = true;
      }, { chats, loadMs, react });
      await page.goto('https://web.whatsapp.com/');
      await expect(page.locator('html')).toHaveAttribute('data-up-status', 'ready');
      return page;
    });
  }
});

/** chat ids in list order, as the mock renders them */
const order = page => page.locator('#pane-side .row').evaluateAll(rows => rows.map(r => r.getAttribute('data-id')));
/** pinned chat ids in list order */
const pinned = page => page.locator('#pane-side .row[data-pinned="true"]').evaluateAll(rows => rows.map(r => r.getAttribute('data-id')));
/** the user's actions in the mock */
const menu = (page, id) => page.evaluate(id => window.__wa.ui.menu(id), id);
const serverCalls = page => page.evaluate(() => window.__wa.serverCalls);

/** the extension's options page in a new tab */
const options = async context => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${EXTENSION_ID}/options.html`);
  return page;
};

module.exports = { test, expect, EXT, order, pinned, menu, serverCalls, options };
