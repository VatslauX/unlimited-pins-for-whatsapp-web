// Static checks on the extension source: things a store reviewer (or attacker) would look for.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const EXT = path.resolve(__dirname, '../../extension');
const jsFiles = fs.readdirSync(EXT, { recursive: true }).map(String).filter(f => f.endsWith('.js'));
const src = Object.fromEntries(jsFiles.map(f => [f, fs.readFileSync(path.join(EXT, f), 'utf8')]));
// source without comments, for checks on what the code does (comments may name what it avoids)
const code = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

test('no eval / new Function / string timers', () => {
  for (const [f, s] of Object.entries(src)) {
    assert.doesNotMatch(s, /\beval\s*\(|\bFunction\s*\(|set(Timeout|Interval)\s*\(\s*['"`]/, f);
  }
});

test('no network calls and no remote code', () => {
  for (const [f, s] of Object.entries(src)) {
    for (const m of s.matchAll(/https?:\/\/[^\s'"`)]+/g)) assert.fail(`${f} references ${m[0]}`);
    assert.doesNotMatch(s, /importScripts|document\.createElement\(\s*['"]script/, f);
    // the extension talks to no server at all, WhatsApp's included
    assert.doesNotMatch(s, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|\bimport\s*\(/, f);
  }
});

test('no postMessage and no console.log/info/debug', () => {
  for (const [f, s] of Object.entries(src)) {
    assert.doesNotMatch(s, /console\.(log|info|debug)/, `${f} logs to console`);
    assert.doesNotMatch(s, /postMessage/, `${f} uses postMessage`);
  }
});

test('pins are stored only in storage.local (chat ids contain phone numbers)', () => {
  for (const [f, s] of Object.entries(src)) {
    assert.doesNotMatch(code(s), /storage\.(sync|session|managed)|localStorage|sessionStorage|indexedDB/, f);
  }
});

test('only bridge.js and the options page use chrome.*', () => {
  for (const [f, s] of Object.entries(src)) {
    if (f === 'bridge.js' || f === 'options.js') continue;
    assert.doesNotMatch(code(s), /\bchrome\./, f);
  }
});

test('innerHTML is only ever cleared, never assigned content', () => {
  for (const [f, s] of Object.entries(src)) {
    for (const m of s.matchAll(/(innerHTML|outerHTML)\s*\+?=\s*([^;\n]*)/g)) {
      assert.match(m[2].trim(), /^(''|"")$/, `${f}: ${m[0].slice(0, 60)}`);
    }
    assert.doesNotMatch(s, /insertAdjacentHTML|document\.write|setHTMLUnsafe|parseHTMLUnsafe|createContextualFragment/, f);
  }
});

test('the original server pin call is reached only after the native-room check', () => {
  // pins.js may call WhatsApp's original setPin for a pin only when hasNativeRoom() allowed it;
  // every early `return` for pin === true / pinning goes to pinLocal() or resolves without a call.
  const s = src['pins.js'];
  assert.match(s, /if \(pin === true && !hasNativeRoom\(model\)\)/);
  assert.match(s, /if \(pinning && !hasNativeRoom\(chat\)\)/);
  assert.match(s, /if \(pin === true\) return Promise\.resolve\(\); \/\/ never risk/);
  assert.match(s, /if \(pinning\) return Promise\.resolve\(\);/);
});

test('extension source is English only (no Cyrillic)', () => {
  for (const f of fs.readdirSync(EXT, { recursive: true }).map(String).filter(f => /\.(js|html|json|css)$/.test(f))) {
    const lines = fs.readFileSync(path.join(EXT, f), 'utf8').split('\n');
    lines.forEach((l, i) => assert.doesNotMatch(l, /[Ѐ-ӿ]/, `${f}:${i + 1}`));
  }
});

test('shared helpers are loaded first in both worlds', () => {
  const m = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
  for (const cs of m.content_scripts) assert.strictEqual(cs.js[0], cs.world === 'MAIN' ? 'common.js' : 'common-isolated.js');
});

test('rows.js changes only how the chat list looks: no pins, no status', () => {
  const s = code(src['rows.js']);
  assert.doesNotMatch(s, /ATTR\.(pins|save|status)|setPin|WAWebCollections|WAWebChatPinBridge/);
});

test('the settings panel loads only its own script files: no inline script, no remote resources', () => {
  const html = fs.readFileSync(path.join(EXT, 'options.html'), 'utf8');
  // parsed like a browser would (any letter case, any attribute order), not with a regex
  const doc = new JSDOM(html).window.document;
  const scripts = [...doc.querySelectorAll('script')];
  assert.deepEqual(scripts.map(s => s.getAttribute('src')), ['common-isolated.js', 'options.js']);
  for (const s of scripts) assert.equal(s.textContent.trim(), '', 'no inline script');
  for (const el of doc.querySelectorAll('*')) {
    for (const a of el.attributes) {
      assert.ok(!/^on/i.test(a.name), `inline handler ${a.name} on <${el.tagName.toLowerCase()}>`);
      // src/href only to extension files: no scheme (https:, data:, ...) and no //host
      if (/^(src|href)$/i.test(a.name)) assert.doesNotMatch(a.value.trim(), /^([a-z][a-z0-9+.-]*:|\/\/)/i, `${a.name}="${a.value}"`);
    }
  }
  assert.doesNotMatch(html, /https?:\/\//i, 'no remote URLs');
});

test('common-isolated.js is an exact copy of common.js (run npm run sync-common)', () => {
  assert.strictEqual(src['common-isolated.js'], src['common.js']);
});
