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
// With `react` ({ React, createRoot }, see react-bundle.js) it also draws the chat list the way
// WhatsApp does, for rows.js (checked 2026-11-12):
//   react                          WhatsApp's React, from require()
//   WAWebFlatList.react.FlatList   a virtual list that places each row itself, absolutely, at the
//                                  height its data gives: data [{ type: 'ROW_CHATS', height: 76,
//                                  itemKey, data }], defaultItemHeight 76, testid 'chat-list'.
//                                  The chat list looks FlatList up on every render, so a replaced
//                                  export is used from its next render on. Other lists (testid
//                                  'other-list' here) use the same component.
// The list first draws `listAfterMs` after the modules load (about 2.5 s in the live page).
//
// Used by tests/integration (in JSDOM) and served to the e2e mock page (tests/fixtures/whatsapp.html).
(function (root) {
  /**
   * @param {{ chats: { id: string, name?: string, pin?: number, t?: number }[], window: any, loadAfterMs?: number,
   *   react?: { React: any, createRoot: any }, listAfterMs?: number, rowType?: string, archivedRowType?: string }} o
   *   rowType: the chat rows' type in the list data (as if WhatsApp renamed 'ROW_CHATS');
   *   archivedRowType: the same for the archived list only (default: rowType)
   */
  function createWhatsApp({ chats, window, loadAfterMs = 0, react, listAfterMs = 0, rowType = 'ROW_CHATS', archivedRowType = rowType }) {
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
    const list = react ? chatList(react) : null;
    if (list) Object.assign(modules, list.modules);
    let loaded = loadAfterMs <= 0;
    const onLoad = () => { if (list) window.setTimeout(list.mount, listAfterMs); };
    if (loaded) onLoad();
    else window.setTimeout(() => { loaded = true; onLoad(); }, loadAfterMs);
    function mod(name) {
      if (!loaded || !(name in modules)) throw new Error(`Requiring unknown module "${name}"`);
      return modules[name];
    }
    window.require = require;

    /** The chat list drawn with React, like WhatsApp's. @param {{ React: any, createRoot: any }} r */
    function chatList({ React, createRoot }) {
      const h = React.createElement;
      const ROW = 76;
      // places every row itself at the height its data gives, like WhatsApp's virtual list
      function FlatList(props) {
        let y = 0;
        const rows = props.data.map((item, i) => {
          const top = y;
          y += item.height;
          return h('div', {
            key: item.itemKey, role: props.itemRole, 'data-testid': `list-item-${i}`, 'data-id': item.itemKey,
            style: { position: 'absolute', width: '100%', height: `${item.height}px`, transform: `translateY(${top}px)` }
          }, props.renderItem(item));
        });
        return h('div', { 'data-testid': props.testid },
          h('div', { role: 'grid', style: { position: 'relative', height: `${y}px` } }, rows));
      }
      // a chat cell with WhatsApp's data-testid structure (rows.css anchors on it); styled with
      // classes, like WhatsApp's, so rows.css can override them
      const CSS = '.fw-cell{display:flex;min-height:72px}.fw-photo{width:48px;height:48px;border-radius:50%;background:#ccc}'
        + '.fw-text{display:flex;flex-direction:column;flex:1;min-width:0}';
      const cell = chat => h('div', { role: 'gridcell' }, h('div', null,
        h('div', { 'data-testid': 'cell-frame-container', className: 'fw-cell' },
          h('div', null, h('div', { className: 'fw-photo' })),
          h('div', { className: 'fw-text' },
            h('div', { role: 'gridcell' }, h('div', { 'data-testid': 'cell-frame-title' }, chat.name)),
            h('div', { 'data-testid': 'cell-frame-secondary' }, 'last message')))));
      let redraw = () => {};
      function ChatList() {
        const [, bump] = React.useReducer(x => x + 1, 0);
        React.useEffect(() => { redraw = bump; }, []);
        // looked up on every render, like WhatsApp's o("WAWebFlatList.react")
        const { FlatList: List } = require('WAWebFlatList.react');
        const data = Chat.getModelsArray().map(c => ({ type: rowType, height: ROW, itemKey: String(c.id), data: c }));
        // the archived chats: WhatsApp draws them in a list of their own (here: the last two chats)
        const archived = data.slice(-2).map(item => ({ ...item, type: archivedRowType }));
        const other = [{ type: 'OTHER', height: 40, itemKey: 'o1', data: null }, { type: 'OTHER', height: 40, itemKey: 'o2', data: null }];
        return h('div', null,
          h(List, { testid: 'chat-list', data, defaultItemHeight: ROW, itemRole: 'row', renderItem: item => cell(item.data) }),
          h(List, { testid: 'archived-chatlist', data: archived, defaultItemHeight: ROW, itemRole: 'row', renderItem: item => cell(item.data) }),
          h(List, { testid: 'other-list', data: other, defaultItemHeight: 40, itemRole: 'row', renderItem: () => 'other' }));
      }
      const handlers = ['change', 'add'];
      handlers.forEach(ev => Chat.on(ev, () => redraw()));
      return {
        modules: { react: React, 'WAWebFlatList.react': { FlatList, DEFAULT_ITEM_HEIGHT: 72 } },
        mount() {
          const style = window.document.createElement('style');
          style.textContent = CSS;
          window.document.head.appendChild(style);
          const el = window.document.createElement('div');
          el.id = 'chat-list-root';
          window.document.body.appendChild(el);
          createRoot(el).render(h(ChatList));
        },
        /** the chat list's parent renders again (a new message, a filter click) */
        redraw: () => redraw()
      };
    }

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
      message(id) { Chat.get(id).set({ t: Date.now() }); },
      /** the chat list's parent renders again (a new message, a filter click); needs `react` */
      redraw() { if (list) list.redraw(); }
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
