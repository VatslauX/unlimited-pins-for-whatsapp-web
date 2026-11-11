---
paths:
  - "extension/**/*"
---

# Extension architecture

## Execution worlds

The manifest declares two content-script worlds:

- **Isolated world:** `common-isolated.js`, `bridge.js`. Only these can use `chrome.storage`.
- **Page world (`world: "MAIN"`):** `common.js`, `pins.js`. These can reach WhatsApp's own module loader (`window.require`) but not `chrome.*`.
- Each world has its own TypeScript project. Keep the `files` entries in the matching `tsconfig.*.json` aligned with the manifest; the unit tests check this.

## Shared code

`common.js` exposes frozen global `__upins`; Chrome injects a file only once per page, so `common-isolated.js` is its copy. Edit `common.js`, then run `npm run sync-common`.

## Between the worlds

No `postMessage`. The worlds exchange the pin list (`{ chatId: pinTimeMs }`) through attributes on `<html>` (`ATTR` in `common.js`):

- `data-up-pins`: `bridge.js` writes the stored list on load and when another tab changes it. `pins.js` watches it.
- `data-up-save`: `pins.js` writes its whole list after every change. `bridge.js` watches it and stores it.
- `data-up-status`: `pins.js` writes `loading`, then `ready` once patched, or `missing` after 30 s without WhatsApp's modules (it keeps polling).

The page can read and write these attributes. `readPins` rejects the whole value on any bad entry, so a partly valid list never replaces the stored one. `bridge.js` tags each write with a per-tab id and ignores its own change events; without that, pinning A then B quickly could echo a stale `{A}` back and unpin B. `pins.js` doesn't save before the stored list has arrived; a pin made earlier is merged into it.

## WhatsApp internals (`pins.js`)

Checked in the live page (2026-11-10). If WhatsApp renames them, `tryLoad` fails, the status stays `loading`/`missing`, and WhatsApp behaves as usual.

- `WAWebCollections.Chat`: chat models. `pin` is a ms timestamp, 0 = unpinned; the list sorts by it. `on('change:pin' | 'add' | 'reset')`.
- `WAWebChatPinBridge.getPinLimit(chatId)`: takes a chat **id** (it calls `isNewsletter()` on it), not the model. The chat menu checks it before calling the action; `pins.js` raises it for non-newsletters so the "only 3" dialog doesn't appear.
- `WAWebSetPinChatAction.setPin(chat, pin)`: called by both the chat menu and the pin keyboard shortcut.
- `WAWebChatPinBridge.setPin({ chatId, newPinTime, _lastPinTime, timestamp })`: the call that reaches WhatsApp's servers.
- Module exports are writable and WhatsApp looks them up on every call, so replacing an export after load takes effect.

## The pin rule

A new pin goes to WhatsApp unchanged while fewer native pins (pinned chats not in our list, newsletters excluded) exist than the original limit. Otherwise it is local: stored, and set on the model only. Unpinning a chat in our list is local; unpinning a native pin goes to WhatsApp. Both `Action.setPin` and `Bridge.setPin` apply this rule, so no path sends a pin past the limit. On an exception while pinning, they resolve without calling the original.

## Applying pins

Every `chat.set()` the extension makes runs in a `setTimeout(…, 0)`: a `set()` made inside WhatsApp's own change event updates the model but the chat list doesn't re-sort. Stored pins are re-applied on `change:pin` (WhatsApp reset it), `add` (a chat loaded later), and `reset`. A new local pin gets a time later than every pin in the list, so it sorts first.
