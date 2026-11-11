// Shared helpers, loaded first in both worlds — see manifest.json. Exposed as a read-only
// global `__upins`; in Node (unit tests) it is exported instead. No chrome.* here.
// Chrome injects a file only once per page, so the isolated world loads an identical copy,
// common-isolated.js. Edit this file, then run `npm run sync-common` (a test checks they match).
/** @typedef {Record<string, number>} UpPins chat id -> pin time (ms) */
(() => {
  // Attributes on <html> that carry data between the two worlds. The page can read and
  // write them too, so every reader validates what it gets.
  const ATTR = Object.freeze({
    pins: 'data-up-pins', // isolated -> page: the stored pin list
    save: 'data-up-save', // page -> isolated: the pin list to store
    status: 'data-up-status' // page: 'loading' | 'ready' | 'missing'
  });
  const STATUS = Object.freeze(['loading', 'ready', 'missing']);
  const MAX_PINS = 500;
  // WhatsApp chat ids: "<digits or token>@c.us", "...@g.us", "...@lid", "...@newsletter", ...
  const CHAT_ID = /^[\w.:-]{1,80}@[a-z][a-z.]{0,29}$/;
  // pin times are millisecond timestamps (2001 .. 2286)
  const MIN_TS = 1e12, MAX_TS = 1e13;

  /** @param {unknown} id */
  function isChatId(id) {
    return typeof id === 'string' && CHAT_ID.test(id);
  }

  /** @param {unknown} ts */
  function isPinTime(ts) {
    return typeof ts === 'number' && Number.isInteger(ts) && ts >= MIN_TS && ts < MAX_TS;
  }

  /**
   * A valid pin list from anything: bad entries are dropped, at most MAX_PINS kept.
   * @param {unknown} value
   * @returns {UpPins}
   */
  function sanitize(value) {
    /** @type {UpPins} */
    const out = {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
    let n = 0;
    for (const [id, ts] of Object.entries(value)) {
      if (n >= MAX_PINS) break;
      if (isChatId(id) && isPinTime(ts)) { out[id] = ts; n++; }
    }
    return out;
  }

  /**
   * The pin list in attribute `name` on <html>, or null when absent or not entirely valid.
   * The page can write these attributes, so one bad entry rejects the whole value: a
   * partly valid list must never replace the stored one.
   * @param {string} name
   * @returns {UpPins | null}
   */
  function readPins(name) {
    const raw = document.documentElement.getAttribute(name);
    if (raw === null) return null;
    let value;
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const pins = sanitize(value);
    return Object.keys(pins).length === Object.keys(value).length ? pins : null;
  }

  /**
   * @param {string} name
   * @param {UpPins} pins
   */
  function writePins(name, pins) {
    document.documentElement.setAttribute(name, JSON.stringify(sanitize(pins)));
  }

  const api = Object.freeze({ ATTR, STATUS, MAX_PINS, isChatId, isPinTime, sanitize, readPins, writePins });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else if (!(/** @type {any} */ (globalThis).__upins)) Object.defineProperty(globalThis, '__upins', { value: api });
})();
