// Page world: draws the chat list with shorter rows when a smaller row size is chosen in the
// settings panel. Pins are not touched here.
//
// WhatsApp draws only the visible rows and places each one itself, at the height its list data
// gives (76 px). So CSS alone can't shrink the rows; this script hands the list a smaller height,
// and rows.css then fits each row's content into it. rows.css keys on ATTR.rows (chat list) and
// ATTR.archivedRows (archived list), each set only after that list was drawn at the new height:
// if this script can't hook in, nothing changes.
//
// WhatsApp internals used (window.require, checked in the live page 2026-11-12):
//   WAWebFlatList.react.FlatList  the virtual list component; looked up on every render, so a
//                                  replaced export is what the chat list renders next time.
//                                  Props: testid ('chat-list', 'archived-chatlist', ...),
//                                  data [{ type: 'ROW_CHATS', height: 76, itemKey, data }],
//                                  defaultItemHeight (76)
//   react                          WhatsApp's own React (19)
(() => {
  const { ATTR, rowSize } = __upins;
  const POLL_MS = 200; // the list module loads about 2.5 s before the chat list first draws
  const SLOW_AFTER = 50; // polls (10 s); then every SLOW_POLL_MS, in case WhatsApp renamed it
  const SLOW_POLL_MS = 1000;
  // the lists rows.js resizes (FlatList testid), each with its own attribute, so one list drawn
  // at WhatsApp's height never turns off the CSS of the other
  /** @type {Record<string, string>} */
  const LISTS = { 'chat-list': ATTR.rows, 'archived-chatlist': ATTR.archivedRows };
  /** @type {Record<string, number>} row height per size; 'original' keeps WhatsApp's own */
  const HEIGHT = { medium: 56, compact: 36 };

  const root = document.documentElement;
  const chosen = () => rowSize(root.getAttribute(ATTR.rowSize));

  // one observer for every list instance
  /** @type {Set<() => void>} */
  const listeners = new Set();
  new MutationObserver(() => listeners.forEach(fn => fn()))
    .observe(root, { attributes: true, attributeFilter: [ATTR.rowSize] });
  /** @param {() => void} fn */
  const subscribe = fn => { listeners.add(fn); return () => { listeners.delete(fn); }; };

  let reported = false;

  /**
   * The list data with every chat row at `height`. The same array when no row matches (WhatsApp
   * changed its list data, or the size is original), so nothing else changes either.
   * @param {any} data @param {number | undefined} height @param {unknown} defaultHeight
   */
  function resize(data, height, defaultHeight) {
    if (!height || !Array.isArray(data) || typeof defaultHeight !== 'number') return data;
    try {
      let changed = false;
      const out = data.map(item => {
        if (!item || item.type !== 'ROW_CHATS' || item.height !== defaultHeight) return item;
        changed = true;
        return { ...item, height };
      });
      return changed ? out : data;
    } catch (err) {
      if (!reported) { reported = true; console.error('[UnlimitedPins] row size failed', err); }
      return data; // WhatsApp's own rows rather than a broken list
    }
  }

  function tryLoad() {
    const req = /** @type {any} */ (window).require;
    if (typeof req !== 'function') return null;
    try {
      const mod = req('WAWebFlatList.react');
      const React = req('react');
      if (!mod || typeof mod.FlatList !== 'function') return null;
      if (!React || typeof React.createElement !== 'function' || typeof React.useSyncExternalStore !== 'function'
        || typeof React.useMemo !== 'function' || typeof React.useLayoutEffect !== 'function') return null;
      return { mod, React };
    } catch {
      return null; // modules not loaded yet
    }
  }

  /** @param {{ mod: any, React: any }} w */
  function patch({ mod, React }) {
    const FlatList = mod.FlatList;

    // Hooks run on every render of every list, in the same order; only the chat lists change.
    /** @param {any} props */
    function RowSizeFlatList(props) {
      const size = React.useSyncExternalStore(subscribe, chosen);
      const attr = typeof props.testid === 'string' && Object.hasOwn(LISTS, props.testid) ? LISTS[props.testid] : null;
      const height = attr ? HEIGHT[size] : undefined;
      const data = React.useMemo(() => resize(props.data, height, props.defaultItemHeight),
        [props.data, height, props.defaultItemHeight]);
      const resized = data !== props.data;
      // An empty list (a filter with no chats) keeps the chosen size, so the CSS doesn't flicker.
      const empty = Array.isArray(props.data) && props.data.length === 0;
      const drawn = resized || (empty && !!height) ? size : 'original';
      React.useLayoutEffect(() => {
        if (attr) root.setAttribute(attr, drawn);
      }, [attr, drawn]);
      // nothing resized ('original', or list data rows.js doesn't know): WhatsApp's own props
      return React.createElement(FlatList, resized ? { ...props, data, defaultItemHeight: height } : props);
    }
    Object.assign(RowSizeFlatList, FlatList);
    mod.FlatList = RowSizeFlatList;
  }

  // Every list drawn with FlatList goes through the wrapper, whatever the size, so a size picked
  // later changes open lists at once. A list already drawn before the patch is drawn anew once,
  // at WhatsApp's next redraw (rare: the module loads well before the chat list).
  let polls = 0;
  function start() {
    const w = tryLoad();
    if (!w) {
      // fast while WhatsApp starts, then like pins.js
      setTimeout(start, ++polls < SLOW_AFTER ? POLL_MS : SLOW_POLL_MS);
      return;
    }
    patch(w);
  }

  start();
})();
