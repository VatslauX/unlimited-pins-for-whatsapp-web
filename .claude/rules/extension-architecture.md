---
paths:
  - "extension/**/*"
---

# Extension architecture

## Execution worlds

The manifest declares two content-script worlds:

- **Isolated world:** `common-isolated.js`, `bridge.js`, and `rows.css` (CSS only). Only these can use `chrome.storage`.
- **Page world (`world: "MAIN"`):** `common.js`, `pins.js`, `rows.js`. These can reach WhatsApp's own module loader (`window.require`) but not `chrome.*`.
- **Settings panel** (`options.html`, both the toolbar popup `action.default_popup` and the options page `options_ui`): `common-isolated.js` and `options.js`. It is an extension page, not a content script; it uses `chrome.storage.local`, `chrome.i18n` and `chrome.runtime.getManifest()` (name and version in its header). It is the only other place that uses `chrome.*`.
- Each world has its own TypeScript project (`tsconfig.isolated.json`, `tsconfig.page.json`, `tsconfig.options.json`). Keep the `files` entries in the matching `tsconfig.*.json` aligned with the manifest; the unit tests check this.

## Shared code

`common.js` exposes frozen global `__upins`; Chrome injects a file only once per page, so `common-isolated.js` is its copy. Edit `common.js`, then run `npm run sync-common`.

## Between the worlds

No `postMessage`. The worlds exchange the pin list (`{ chatId: pinTimeMs }`) through attributes on `<html>` (`ATTR` in `common.js`):

- `data-up-pins`: `bridge.js` writes the stored list on load and when another tab changes it. `pins.js` watches it.
- `data-up-save`: `pins.js` writes its whole list after every change. `bridge.js` watches it and stores it.
- `data-up-status`: `pins.js` writes `loading`, then `ready` once patched, or `missing` after 30 s without WhatsApp's modules (it keeps polling).
- `data-up-size`: `bridge.js` writes the row size from `storage.local` (`rowSize`) on load and when it changes. `rowSize()` in `common.js` turns anything else into `original`.
- `data-up-rows` and `data-up-archived`: `rows.js` writes the row size the chat list and the archived list are actually drawn with (`original` until that list has drawn at the new height). Each list has its own, so one list drawn at 76 px never turns off the other's CSS. `rows.css` keys on them.

The page can read and write these attributes. `readPins` rejects the whole value on any bad entry, so a partly valid list never replaces the stored one. `bridge.js` tags each write with a per-tab id and ignores its own change events; without that, pinning A then B quickly could echo a stale `{A}` back and unpin B. `pins.js` doesn't save before the stored list has arrived; a pin made earlier is merged into it.

## WhatsApp internals (`pins.js`)

Checked in the live page (2026-11-10). If WhatsApp renames them, `tryLoad` fails, the status stays `loading`/`missing`, and WhatsApp behaves as usual.

- `WAWebCollections.Chat`: chat models. `pin` is a ms timestamp, 0 = unpinned; the list sorts by it. `on('change:pin' | 'add' | 'reset')`.
- `WAWebChatPinBridge.getPinLimit(chatId)`: takes a chat **id** (it calls `isNewsletter()` on it), not the model. The chat menu checks it before calling the action; `pins.js` raises it for non-newsletters so the "only 3" dialog doesn't appear.
- `WAWebSetPinChatAction.setPin(chat, pin)`: called by both the chat menu and the pin keyboard shortcut.
- `WAWebChatPinBridge.setPin({ chatId, newPinTime, _lastPinTime, timestamp })`: the call that reaches WhatsApp's servers.
- Module exports are writable and WhatsApp looks them up on every call, so replacing an export after load takes effect.

## Chat list row size (`rows.js`, `rows.css`)

Checked in the live page (2026-11-12). Rows are 76 px in WhatsApp's list data (`ROW_CHATS`, `height: 76`), and WhatsApp places each row itself, so CSS alone can't shrink them.

- `WAWebFlatList.react.FlatList`: the virtual list. `rows.js` replaces `mod.FlatList` with a wrapper that changes the heights of `ROW_CHATS` rows in the `chat-list` and `archived-chatlist` lists only (56 px Medium, 36 px Compact). Other lists are left alone.
- `react`: WhatsApp's React 19, for the wrapper's hooks. The wrapper reads the size through `useSyncExternalStore`, so a change in `data-up-size` redraws open lists at once.
- `data-up-rows` / `data-up-archived` are set in a layout effect after the list drew at the new height, so `rows.css` never applies to rows still at 76 px. If no row matches (`ROW_CHATS` at `defaultItemHeight`, e.g. WhatsApp renamed the type), the props pass through untouched and that list's attribute stays `original`.
- The wrapper is installed whatever the size, so a size picked later changes open lists at once. A list already drawn before the patch gets the new component type at WhatsApp's next redraw and remounts once (its scroll resets). This is rare, because the module loads about 2.5 s before the list first draws. `rows.js` polls every 200 ms for 10 s, then every second.
- `rows.css` anchors on `data-testid` attributes (`chat-list`, `cell-frame-container`, `cell-frame-title`, `cell-frame-secondary`) and clips rows (`overflow: hidden`) if the layout changes.
- If the list module is missing, `rows.js` polls and does nothing. Pins are never touched by this path.

## The pin rule

A new pin goes to WhatsApp unchanged while fewer native pins (pinned chats not in our list, newsletters excluded) exist than the original limit. Otherwise it is local: stored, and set on the model only. Unpinning a chat in our list is local; unpinning a native pin goes to WhatsApp. Both `Action.setPin` and `Bridge.setPin` apply this rule, so no path sends a pin past the limit. On an exception while pinning, they resolve without calling the original.

## Applying pins

Every `chat.set()` the extension makes runs in a `setTimeout(…, 0)`: a `set()` made inside WhatsApp's own change event updates the model but the chat list doesn't re-sort. Stored pins are re-applied on `change:pin` (WhatsApp reset it), `add` (a chat loaded later), and `reset`. A new local pin gets a time later than every pin in the list, so it sorts first.
