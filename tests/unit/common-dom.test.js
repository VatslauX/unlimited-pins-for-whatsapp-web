// common.js helpers that read and write <html> attributes, with a JSDOM document as the global
// `document` (set before the require; the helpers look it up on each call).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://web.whatsapp.com/' });
global.document = dom.window.document;
const up = require(path.resolve(__dirname, '../../extension/common.js'));
const T = 1774270178963;
const root = document.documentElement;
const read = raw => { root.setAttribute('data-up-save', raw); return up.readPins('data-up-save'); };

test('readPins returns null when the attribute is absent', () => {
  root.removeAttribute('data-up-save');
  assert.equal(up.readPins('data-up-save'), null);
});

test('readPins accepts a fully valid list, the empty list included', () => {
  assert.deepEqual(read(JSON.stringify({ 'a@c.us': T, 'b@g.us': T + 1 })), { 'a@c.us': T, 'b@g.us': T + 1 });
  assert.deepEqual(read('{}'), {});
});

test('readPins rejects the whole value on any bad entry, or anything that is not an object', () => {
  for (const raw of ['{not json', '[]', '[1,2]', 'null', '42', '"x"', JSON.stringify({ 'a@c.us': T, 'bad id': T }), JSON.stringify({ 'a@c.us': 'soon' })])
    assert.equal(read(raw), null, raw);
});

test('writePins writes a sanitized list that readPins reads back', () => {
  up.writePins('data-up-pins', { 'a@c.us': T, 'bad id': T });
  assert.equal(root.getAttribute('data-up-pins'), JSON.stringify({ 'a@c.us': T }));
  assert.deepEqual(up.readPins('data-up-pins'), { 'a@c.us': T });
});
