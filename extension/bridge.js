// Isolated world: owns chrome.storage.local and moves the pin list between storage and
// pins.js (page world) through attributes on <html> (see ATTR in common.js).
//
// storage.local, not storage.sync: chat ids contain phone numbers, and sync would copy
// them into the user's Google account.
(() => {
  const { ATTR, sanitize, readPins, writePins } = __upins;
  const KEY = 'pins';
  // Marks this tab's own writes, so their change events are not echoed back to the page.
  // Without it, pinning A then B quickly could echo the stale {A} back and unpin B.
  const tab = Math.random().toString(36).slice(2);

  /** @param {unknown} stored */
  const pinsOf = stored => sanitize(stored && typeof stored === 'object' ? /** @type {any} */ (stored).pins : null);

  async function load() {
    try {
      const r = await chrome.storage.local.get(KEY);
      writePins(ATTR.pins, pinsOf(r[KEY]));
    } catch {} // extension updated or removed: nothing to load
  }

  // After the extension is updated or removed, chrome.* in an already open tab throws at once.
  new MutationObserver(() => {
    const pins = readPins(ATTR.save);
    if (!pins) return;
    try {
      chrome.storage.local.set({ [KEY]: { by: tab, pins } }).catch(() => {});
    } catch {}
  }).observe(document.documentElement, { attributes: true, attributeFilter: [ATTR.save] });

  // Keep other open WhatsApp tabs in sync.
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes[KEY]) return;
      const next = /** @type {any} */ (changes[KEY].newValue);
      if (next && next.by === tab) return;
      writePins(ATTR.pins, pinsOf(next));
    });
  } catch {}

  load();
})();
