---
paths:
  - "tests/integration/**/*.js"
  - "tests/e2e/**/*.js"
  - "tests/fixtures/**/*"
---

# Integration and E2E test fixtures

## The fake WhatsApp

`tests/fixtures/fake-whatsapp.js` fakes the internals `pins.js` uses, shaped like the live page (see "WhatsApp internals" in `.claude/rules/extension-architecture.md`). Keep it faithful: `getPinLimit` takes a chat id and throws for a model, `require()` throws for a module not loaded yet (`loadAfterMs`), the chat menu checks the limit before calling the action, and the menu and the action look modules up through `require()` on every call. A `set()` made inside a change event updates the model silently, and the e2e mock list redraws on `change:pin` with a listener registered before the extension's, so a pin the extension sets inside WhatsApp's event shows up stale (as in the live page). The integration tests read models, not the rendered list, so only e2e catches that. `serverCalls` records what reached the "server"; `server` holds WhatsApp's own pin state, which `ui.resync()` writes back to every chat. When WhatsApp's real behavior turns out different, change the fake first.

## Integration tests

`tests/integration/*.test.js` run the real scripts of both worlds, in manifest order, in one JSDOM page per tab (`tests/integration/harness.js`):

- `createWorld({ stored, latency })` is one browser profile: a fake `chrome.storage.local` shared by its tabs, values JSON-copied, `onChanged` asynchronous in every tab. `stored` is the initial `pins` value; `latency` delays every storage call. `world.stored()`, `world.writes`, `world.errors` (must be empty: the `afterEach` checks it).
- `world.open({ chats, loadAfterMs })` returns a tab: `tab.wa` (the fake: `ui.menu`, `ui.shortcut`, `ui.resync`, `pinned()`, `order()`, `serverCalls`, `dialogs`), `tab.attr(name)`, `tab.status()`, `tab.ready()`, `tab.close()`. Closing a tab and opening another is a reload.
- Real timers. Wait with `until(() => condition)`; use `settle(ms)` only to give something a chance to happen before asserting it didn't.
- To prove a test fails without a change, point `UP_EXTENSION_DIR` at a scratch copy of `extension/`; never deliberately break the working source tree.

## E2E tests

`tests/e2e/fixtures.js` launches persistent Chromium (`--headless=new`) with the unpacked extension and a fresh profile per test, and routes all `web.whatsapp.com` requests to `tests/fixtures/whatsapp.html` (which loads `fake-whatsapp.js` from `/mock/`). Tests never touch the real WhatsApp.

- `whatsapp({ chats, loadMs })` opens a tab and waits for `data-up-status="ready"`. Helpers: `order`, `pinned` (read the rendered list), `menu(page, id)`, `serverCalls(page)`. `page.reload()` reloads with the same profile, so stored pins persist.
- Wait for conditions with `expect(locator)` and `expect.poll`, not `page.waitForTimeout()`.
- E2E covers what JSDOM can't: Chrome's real two worlds, `chrome.storage.local`, reloads and tabs. Logic across inputs and races belongs in integration tests.
