// React for the fake WhatsApp page: WhatsApp Web draws its chat list with its own React (19),
// which rows.js reaches through window.require('react'). This wraps the React production builds
// from node_modules in a tiny module loader, as one script that sets window.__mockReact =
// { React, createRoot } in whatever page runs it: a JSDOM tab (integration) or the e2e mock page.
const fs = require('fs');
const path = require('path');

const NM = path.resolve(__dirname, '../../node_modules');
const FILES = {
  react: 'react/cjs/react.production.js',
  scheduler: 'scheduler/cjs/scheduler.production.js',
  'react-dom': 'react-dom/cjs/react-dom.production.js',
  'react-dom/client': 'react-dom/cjs/react-dom-client.production.js'
};

const defs = Object.entries(FILES).map(([name, file]) =>
  `${JSON.stringify(name)}: function (module, exports, require) {\n${fs.readFileSync(path.join(NM, file), 'utf8')}\n}`);

const REACT_BUNDLE = `(function () {
  var defs = {${defs.join(',\n')}};
  var cache = {};
  function req(name) {
    if (cache[name]) return cache[name].exports;
    if (!defs[name]) throw new Error('mock react: no module ' + name);
    var m = cache[name] = { exports: {} };
    defs[name](m, m.exports, req);
    return m.exports;
  }
  window.__mockReact = { React: req('react'), createRoot: req('react-dom/client').createRoot };
})();`;

module.exports = { REACT_BUNDLE };
