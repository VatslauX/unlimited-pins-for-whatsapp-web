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

  // Feedback: a new GitHub issue on the project's homepage (manifest homepage_url), with the
  // extension version, Chrome version and UI language filled in; nothing about the user, their
  // chats or their settings. Opened only when clicked; the extension itself sends nothing.
  const feedback = /** @type {HTMLAnchorElement | null} */ (document.getElementById('feedback'));
  try {
    const home = new URL(manifest.homepage_url || '');
    if (feedback && home.protocol === 'https:' && home.hostname === 'github.com') {
      const chromeVersion = (navigator.userAgent.match(/Chrome\/(\d+)/) || [])[1] || '?';
      const body = ['**What happened**', '', '', '**What you expected**', '', '', '---',
        `Extension ${manifest.version} · Chrome ${chromeVersion} · ${chrome.i18n.getUILanguage()}`].join('\n');
      feedback.href = `${home.origin}${home.pathname.replace(/\/$/, '')}/issues/new?body=${encodeURIComponent(body)}`;
      feedback.hidden = false;
    }
  } catch { /* no usable homepage: no link */ }

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
