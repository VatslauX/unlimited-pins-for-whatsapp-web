// Settings panel (toolbar popup and options page): the chat list row size. Saved in
// chrome.storage.local under 'rowSize'; bridge.js passes it to open WhatsApp Web tabs, which
// follow it right away.
(() => {
  const { ROW_SIZES, rowSize } = __upins;
  const KEY = 'rowSize';

  const manifest = chrome.runtime.getManifest();
  const setText = (/** @type {string} */ id, /** @type {string} */ text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  setText('name', manifest.name);
  setText('version', manifest.version);

  for (const el of document.querySelectorAll('[data-i18n]')) {
    const text = chrome.i18n.getMessage(el.getAttribute('data-i18n') || '');
    if (text) el.textContent = text;
  }

  /** @param {unknown} size anything stored; not a valid size shows the default */
  function show(size) {
    const input = /** @type {HTMLInputElement | null} */ (document.getElementById(`size-${rowSize(size)}`));
    if (input) input.checked = true;
  }

  for (const size of ROW_SIZES) {
    const input = document.getElementById(`size-${size}`);
    if (input) input.addEventListener('change', () => { chrome.storage.local.set({ [KEY]: size }).catch(() => {}); });
  }

  chrome.storage.local.get(KEY).then(r => show(r[KEY]), () => show(ROW_SIZES[0]));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[KEY]) show(changes[KEY].newValue);
  });
})();
