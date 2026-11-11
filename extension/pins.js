// Page world: marks chats from the stored list as pinned inside WhatsApp's own chat models,
// so they sort to the top of the native chat list, and takes over Pin/Unpin (the chat menu
// and the keyboard shortcut).
//
// Rule: a new pin goes to WhatsApp normally (synced to the phone) while there are fewer
// native pins than WhatsApp's own limit. Past that, it is kept only in this browser.
// WhatsApp's servers never see more pins than its limit allows.
//
// WhatsApp internals used (window.require, checked in the live page):
//   WAWebCollections.Chat            chat models; `pin` is a ms timestamp, 0 = unpinned
//   WAWebChatPinBridge.getPinLimit   (chatId) -> limit; takes a chat id, not the model
//   WAWebChatPinBridge.setPin        ({ chatId, newPinTime, ... }) -> the server call
//   WAWebSetPinChatAction.setPin     (chat, pin) -> used by the menu and the shortcut
(() => {
  const { ATTR, readPins, writePins } = __upins;
  const RAISED_LIMIT = 1000;
  const POLL_MS = 1000;
  const MISSING_AFTER = 30; // polls before reporting 'missing' (polling continues)

  /** @type {UpPins} */
  let pins = {};
  let loaded = false; // the stored list has arrived; saving before that would overwrite it
  /** @type {{ Chat: any, Bridge: any, Action: any } | null} */
  let wa = null;

  const root = document.documentElement;
  /** @param {string} s */
  const setStatus = s => root.setAttribute(ATTR.status, s);

  // ---- storage (through bridge.js) -----------------------------------------------------

  function save() {
    if (loaded) writePins(ATTR.save, pins);
  }

  /** The stored list changed (first load, or another tab). */
  function onStored() {
    const next = readPins(ATTR.pins);
    if (!next) return;
    if (!loaded) {
      // pins made before the stored list arrived are kept
      const early = Object.keys(pins).length > 0;
      loaded = true;
      setPins({ ...next, ...pins });
      if (early) save();
      return;
    }
    setPins(next);
  }

  /** Replace the whole list; unpins chats that were removed from it. @param {UpPins} next */
  function setPins(next) {
    const prev = pins;
    pins = next;
    if (!wa) return;
    for (const [id, ts] of Object.entries(prev)) {
      if (id in next) continue;
      const chat = wa.Chat.get(id);
      if (chat && chat.pin === ts) later(() => chat.set({ pin: 0 }));
    }
    applyAll();
  }

  // ---- applying pins -------------------------------------------------------------------

  // A set() made inside WhatsApp's own change event updates the model, but the chat list
  // doesn't re-sort. So every set() we make runs on its own turn.
  /** @param {() => void} fn */
  const later = fn => setTimeout(fn, 0);

  /** @param {any} chat @returns {string | null} */
  function idOf(chat) {
    const id = chat && chat.id;
    if (!id) return null;
    return typeof id === 'string' ? id : id._serialized || String(id);
  }

  /** @param {any} chat */
  function apply(chat) {
    const id = idOf(chat);
    if (!id || !(id in pins)) return;
    if (chat.pin !== pins[id]) chat.set({ pin: pins[id] });
  }

  function applyAll() {
    if (!wa) return;
    for (const chat of wa.Chat.getModelsArray()) later(() => apply(chat));
  }

  /** @param {any} chat */
  function modelFor(chat) {
    const id = idOf(chat);
    return (id && wa && wa.Chat.get(id)) || chat;
  }

  /** @param {any} chat */
  function pinLocal(chat) {
    const model = modelFor(chat);
    const id = idOf(model);
    if (!id) return;
    // newest pin first: later than every pin we hold, even within the same millisecond
    const ts = Math.max(Date.now(), ...Object.values(pins).map(t => t + 1));
    pins = { ...pins, [id]: ts };
    save();
    later(() => apply(model));
  }

  /** @param {any} chat */
  function unpinLocal(chat) {
    const model = modelFor(chat);
    const id = idOf(model);
    if (!id) return;
    const { [id]: _removed, ...rest } = pins;
    pins = rest;
    save();
    later(() => model.set({ pin: 0 }));
  }

  /** Accepts a chat model or a chat id (WhatsApp's pin-limit code passes ids). @param {any} chatOrId */
  function isNewsletter(chatOrId) {
    try {
      const wid = chatOrId && (typeof chatOrId.isNewsletter === 'function' ? chatOrId : chatOrId.id);
      return !!wid && typeof wid.isNewsletter === 'function' && !!wid.isNewsletter();
    } catch {
      return false;
    }
  }

  // ---- patching WhatsApp ---------------------------------------------------------------

  function tryLoad() {
    const req = /** @type {any} */ (window).require;
    if (typeof req !== 'function') return null;
    try {
      const Chat = req('WAWebCollections').Chat;
      const Bridge = req('WAWebChatPinBridge');
      const Action = req('WAWebSetPinChatAction');
      if (!Chat || typeof Chat.getModelsArray !== 'function' || typeof Chat.on !== 'function') return null;
      if (typeof Bridge.getPinLimit !== 'function' || typeof Bridge.setPin !== 'function') return null;
      if (typeof Action.setPin !== 'function') return null;
      return { Chat, Bridge, Action };
    } catch {
      return null; // modules not loaded yet
    }
  }

  /** @param {{ Chat: any, Bridge: any, Action: any }} w */
  function patch({ Chat, Bridge, Action }) {
    const origGetPinLimit = Bridge.getPinLimit;
    const origSetPin = Action.setPin;
    const origBridgeSetPin = Bridge.setPin;

    /** Is there a free native pin slot for `chat` (not counting itself or our pins)? @param {any} chat */
    function hasNativeRoom(chat) {
      const self = idOf(chat);
      const native = Chat.getModelsArray().filter((/** @type {any} */ c) => {
        const id = idOf(c);
        return c.pin && id !== self && !(id && id in pins) && !isNewsletter(c);
      }).length;
      return native < origGetPinLimit.call(Bridge, chat.id);
    }

    // Pin / Unpin from the chat menu and the keyboard shortcut.
    Action.setPin = function (/** @type {any} */ chat, /** @type {any} */ pin) {
      try {
        const model = modelFor(chat);
        if (!isNewsletter(model)) {
          if (pin === true && !hasNativeRoom(model)) {
            pinLocal(model);
            return Promise.resolve();
          }
          if (pin === false && (idOf(model) || '') in pins) {
            unpinLocal(model);
            return Promise.resolve();
          }
        }
      } catch (err) {
        console.error('[UnlimitedPins] setPin failed', err);
        if (pin === true) return Promise.resolve(); // never risk a server pin past the limit
      }
      return origSetPin.apply(this, arguments);
    };

    // The call that reaches the server. Same rule again, as a guard for any path to it.
    Bridge.setPin = function (/** @type {any} */ args) {
      let pinning = false;
      try {
        pinning = !!(args && args.newPinTime);
        const raw = args && args.chatId;
        const id = raw && (typeof raw === 'string' ? raw : raw._serialized || String(raw));
        const chat = id && Chat.get(id);
        if (chat && !isNewsletter(chat)) {
          if (pinning && !hasNativeRoom(chat)) {
            pinLocal(chat);
            return Promise.resolve();
          }
          if (!pinning && id in pins) {
            unpinLocal(chat);
            return Promise.resolve();
          }
        }
      } catch (err) {
        console.error('[UnlimitedPins] bridge setPin failed', err);
        if (pinning) return Promise.resolve();
      }
      return origBridgeSetPin.apply(this, arguments);
    };

    // No "you can only pin 3 chats" message for normal chats. Newsletters keep their limit.
    Bridge.getPinLimit = function (/** @type {any} */ chatId) {
      if (isNewsletter(chatId)) return origGetPinLimit.apply(this, arguments);
      return RAISED_LIMIT;
    };

    // Re-apply when WhatsApp resets a pin or loads chats.
    Chat.on('change:pin', (/** @type {any} */ chat) => later(() => apply(chat)));
    Chat.on('add', (/** @type {any} */ chat) => later(() => apply(chat)));
    Chat.on('reset', () => later(applyAll));
  }

  let polls = 0;
  function start() {
    wa = tryLoad();
    if (!wa) {
      if (++polls === MISSING_AFTER) setStatus('missing');
      setTimeout(start, POLL_MS);
      return;
    }
    patch(wa);
    applyAll();
    setStatus('ready');
  }

  setStatus('loading');
  new MutationObserver(onStored).observe(root, { attributes: true, attributeFilter: [ATTR.pins] });
  onStored(); // bridge.js may have written the list before this script ran
  start();
})();
