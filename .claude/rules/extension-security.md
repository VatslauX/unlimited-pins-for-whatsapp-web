---
paths:
  - "extension/**/*"
  - "tests/unit/**/*.test.js"
---

# Extension security and store invariants

These are store-review and user-safety requirements. Do not loosen them:

- Permissions are only `["storage"]`; do not add `host_permissions`, `web_accessible_resources`, `externally_connectable`, or a background script. Content scripts match only `https://web.whatsapp.com/*` in the top frame.
- Never send a chat pin to WhatsApp's servers past WhatsApp's own limit (see "The pin rule" in `extension-architecture.md`). Sending pins past the limit could get the user's account flagged.
- No network access at all: no `fetch`, `XMLHttpRequest`, `sendBeacon`, `WebSocket`, `EventSource`, remote URLs, or injected `<script>`. No `eval`, `new Function`, or string timers.
- No `postMessage`, `console.log`, `console.info`, or `console.debug`. `console.error` only for unexpected exceptions; never log chat ids.
- Pins and the row size are stored only in `chrome.storage.local`. Never `storage.sync` (chat ids contain phone numbers; sync would copy them into the user's Google account), `localStorage`, `sessionStorage`, or IndexedDB. Only `bridge.js` and the options page (`options.js`) use `chrome.*`.
- The settings panel (`options.html`) loads only extension files: no inline `<script>` or `on*` handlers, no remote resources.
- Validate everything read from the `<html>` attributes or from storage with `common.js` (`readPins`, `sanitize`, `rowSize`).
- `innerHTML` may only be assigned `''`. Do not use `insertAdjacentHTML`, `setHTMLUnsafe`, or `document.write`.
- Source in `extension/` is English only (no Cyrillic). Keep `minimum_chrome_version` at 111 or higher.
- Keep the name `Unlimited Pins for WhatsApp Web (unofficial)`. Every localized description must end with its "Not affiliated with WhatsApp" phrase and stay within 132 characters.
