// A fake of the WhatsApp Web internals pins.js uses, shaped like the live page (checked 2026-11-10):
//   window.require(name)               throws for a module that isn't loaded (yet)
//   WAWebCollections.Chat              models with `id` (a Wid), `pin` (ms, 0 = unpinned), set(), on()
//   WAWebChatPinBridge.getPinLimit     takes a chat id (Wid); a chat model has no isNewsletter(), so it throws
//   WAWebChatPinBridge.setPin          ({ chatId, newPinTime, _lastPinTime, timestamp }): the server call
//   WAWebSetPinChatAction.setPin       (chat, pin): what the menu and the keyboard shortcut call
// The chat menu checks the limit itself before calling the action, and shows a dialog when full.
// Both the menu and the action look modules up through require() on every call, like WhatsApp's
// own o("...") calls, so a patched export is what they get.
//
// Used by tests/integration (in JSDOM) and served to the e2e mock page (tests/fixtures/whatsapp.html).
(function (root) {
  /**
   * @param {{ chats: { id: string, name?: string, pin?: number, t?: number }[], window: any, loadAfterMs?: number }} o
   */
  function createWhatsApp({ chats, window, loadAfterMs = 0 }) {
    const LIMIT = 3, NEWSLETTER_LIMIT = 2;
    /** @type {Record<string, ((chat: any) => void)[]>} */
    const handlers = {};
    // Like the live page: a set() made inside a change event updates the model, but no event
    // follows, so the chat list doesn't re-sort (pins.js must make its set() calls later).
    let emitting = 0;
    const emit = (ev, arg) => {
      emitting++;
      try { (handlers[ev] || []).slice().forEach(fn => fn(arg)); } finally { emitting--; }
    };
    const models = new Map();
    const server = new Map(); // what WhatsApp's servers have: chat id -> pin time
    const serverCalls = [];
    const dialogs = [];

    class Wid {
      constructor(s) { this._serialized = s; }
      isNewsletter() { return this._serialized.endsWith('@newsletter'); }
      toString() { return this._serialized; }
    }

    function makeChat({ id, name = id, pin = 0, t = 0 }) {
      const chat = {
        id: new Wid(id), name, pin, t,
        set(attrs) {
          const pinChanged = 'pin' in attrs && attrs.pin !== chat.pin;
          Object.assign(chat, attrs);
          if (pinChanged && !emitting) { emit('change:pin', chat); emit('change', chat); }
        }
      };
      return chat;
    }
    for (const c of chats) {
      models.set(c.id, makeChat(c));
      if (c.pin) server.set(c.id, c.pin);
    }

    const isNewsletterChat = c => c.id.isNewsletter();
    const pinnedCount = newsletters => [...models.values()].filter(c => c.pin && isNewsletterChat(c) === newsletters).length;

    const Chat = {
      getModelsArray: () => [...models.values()].sort((a, b) => (b.pin || 0) - (a.pin || 0) || b.t - a.t),
      get: id => models.get(String(id)),
      on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); },
      add(c) { const m = makeChat(c); models.set(c.id, m); emit('add', m); return m; }
    };

    const Bridge = {
      getPinLimit(chatId) { return chatId.isNewsletter() ? NEWSLETTER_LIMIT : LIMIT; },
      getNumConversationsPinned: () => pinnedCount(false),
      setPin(args) {
        serverCalls.push({ chatId: String(args.chatId), newPinTime: args.newPinTime });
        if (args.newPinTime) server.set(String(args.chatId), args.newPinTime); else server.delete(String(args.chatId));
        return Promise.resolve();
      }
    };

    const require = name => mod(name);
    const Action = {
      setPin(chat, pin) {
        const B = require('WAWebChatPinBridge');
        if (pin && pinnedCount(isNewsletterChat(chat)) >= B.getPinLimit(chat.id)) { dialogs.push('limit'); return Promise.resolve(); }
        const ts = pin ? Date.now() : 0;
        chat.set({ pin: ts });
        return B.setPin({ chatId: chat.id, newPinTime: ts, _lastPinTime: 0, timestamp: Date.now() });
      }
    };

    const modules = { WAWebCollections: { Chat }, WAWebChatPinBridge: Bridge, WAWebSetPinChatAction: Action };
    let loaded = loadAfterMs <= 0;
    if (!loaded) window.setTimeout(() => { loaded = true; }, loadAfterMs);
    function mod(name) {
      if (!loaded || !(name in modules)) throw new Error(`Requiring unknown module "${name}"`);
      return modules[name];
    }
    window.require = require;

    // What the user does
    const ui = {
      /** the chat menu's Pin / Unpin item */
      menu(id) {
        const chat = Chat.get(id), pin = !chat.pin;
        if (pin && pinnedCount(isNewsletterChat(chat)) >= require('WAWebChatPinBridge').getPinLimit(chat.id)) { dialogs.push('limit'); return Promise.resolve(); }
        return require('WAWebSetPinChatAction').setPin(chat, pin);
      },
      /** the pin keyboard shortcut on the open chat: toggles, through the same action */
      shortcut(id) {
        const chat = Chat.get(id);
        return require('WAWebSetPinChatAction').setPin(chat, !chat.pin);
      },
      /** WhatsApp re-reads pins from its own data (after a sync): every chat gets the server's value */
      resync() {
        for (const c of models.values()) c.set({ pin: server.get(String(c.id)) || 0 });
      },
      /** a new message: the chat moves up in time */
      message(id) { Chat.get(id).set({ t: Date.now() }); }
    };

    return {
      Chat, Bridge, Action, ui, server, serverCalls, dialogs,
      /** chat ids in list order */
      order: () => Chat.getModelsArray().map(c => String(c.id)),
      /** pinned chat ids in list order */
      pinned: () => Chat.getModelsArray().filter(c => c.pin).map(c => String(c.id))
    };
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { createWhatsApp };
  else root.createWhatsApp = createWhatsApp;
})(this);
