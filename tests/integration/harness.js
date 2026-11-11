// Integration harness: runs the real extension scripts of both worlds in JSDOM pages, against the
// fake WhatsApp internals (tests/fixtures/fake-whatsapp.js) and a fake chrome.storage.local that
// all tabs of one "browser profile" share. No browser; real timers.
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { createWhatsApp } = require('../fixtures/fake-whatsapp');

const EXT = process.env.UP_EXTENSION_DIR ? path.resolve(process.env.UP_EXTENSION_DIR) : path.resolve(__dirname, '../../extension');
const manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
// content scripts in manifest order, per world
const scripts = world => manifest.content_scripts.find(c => (c.world || 'ISOLATED') === world).js
  .map(f => fs.readFileSync(path.join(EXT, f), 'utf8'));

const T0 = 1774270178963;
/** Default chat list: three native pins (like the live account) and five unpinned chats. */
const CHATS = [
  { id: 'p1@c.us', pin: T0 + 3, t: 100 },
  { id: 'p2@c.us', pin: T0 + 2, t: 90 },
  { id: 'p3@g.us', pin: T0 + 1, t: 80 },
  { id: 'a@c.us', t: 70 },
  { id: 'b@c.us', t: 60 },
  { id: 'c@g.us', t: 50 },
  { id: 'd@lid', t: 40 },
  { id: 'n1@newsletter', t: 30 }
];

/** Wait until `fn()` is truthy (a condition, not a guessed duration). */
async function until(fn, what = 'condition', timeout = 3000) {
  const end = Date.now() + timeout;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise(r => setTimeout(r, 5));
  }
}

/** Let pending timers, observers and storage events run. */
const settle = (ms = 30) => new Promise(r => setTimeout(r, ms));

/**
 * One browser profile: shared storage, any number of tabs.
 * @param {{ stored?: any, latency?: number }} [o] stored: the initial value of the 'pins' key
 */
function createWorld({ stored, latency = 0 } = {}) {
  const data = stored === undefined ? {} : { pins: JSON.parse(JSON.stringify(stored)) };
  const listeners = new Set();
  const writes = [];
  const errors = [];
  const tabs = [];
  const copy = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const later = fn => new Promise(r => setTimeout(() => r(fn()), latency));

  const local = {
    get: key => later(() => (typeof key === 'string' ? (key in data ? { [key]: copy(data[key]) } : {}) : copy(data))),
    set: items => later(() => {
      writes.push(copy(items));
      const changes = {};
      for (const [k, v] of Object.entries(items)) {
        changes[k] = { oldValue: copy(data[k]), newValue: copy(v) };
        data[k] = copy(v);
      }
      // like Chrome: onChanged fires asynchronously, in every tab
      setTimeout(() => listeners.forEach(fn => fn(copy(changes), 'local')), 0);
    })
  };

  const world = {
    writes, errors, tabs,
    /** what storage holds now */
    stored: () => copy(data.pins),
    /** change storage from outside (e.g. another device's tab) */
    set: value => local.set({ pins: value }),
    /**
     * Open WhatsApp Web in a new tab, with the extension loaded.
     * @param {{ chats?: any[], loadAfterMs?: number }} [o]
     */
    open({ chats = CHATS, loadAfterMs = 0 } = {}) {
      const virtualConsole = new VirtualConsole();
      virtualConsole.on('error', (...a) => errors.push(a.map(String).join(' ')));
      virtualConsole.on('jsdomError', e => errors.push(String(e && e.stack || e)));
      const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
        url: 'https://web.whatsapp.com/', runScripts: 'outside-only', virtualConsole
      });
      const win = dom.window;
      const wa = createWhatsApp({ chats: copy(chats), window: win, loadAfterMs });
      const tabListeners = new Set();
      win.chrome = {
        storage: {
          local,
          onChanged: { addListener: fn => { tabListeners.add(fn); listeners.add(fn); } }
        }
      };
      // the isolated world first, like the manifest; both worlds share this window here
      for (const s of scripts('ISOLATED')) win.eval(s);
      for (const s of scripts('MAIN')) win.eval(s);
      const tab = {
        win, wa,
        doc: win.document,
        attr: name => win.document.documentElement.getAttribute(name),
        status: () => win.document.documentElement.getAttribute('data-up-status'),
        ready: () => until(() => tab.status() === 'ready', 'status ready'),
        close() { tabListeners.forEach(fn => listeners.delete(fn)); win.close(); }
      };
      tabs.push(tab);
      return tab;
    },
    closeAll() { tabs.splice(0).forEach(t => t.close()); }
  };
  return world;
}

module.exports = { EXT, CHATS, T0, createWorld, until, settle };
