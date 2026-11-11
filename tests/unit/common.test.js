// common.js helpers that need no page: chat id and pin time checks, and the pin list sanitizer.
// Everything that crosses between the worlds goes through sanitize(), so it must reject anything odd.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const up = require(path.resolve(__dirname, '../../extension/common.js'));
const T = 1774270178963; // a real pin time seen in WhatsApp Web

test('isChatId accepts WhatsApp chat ids and rejects the rest', () => {
  for (const id of ['31612345678@c.us', '120363000000000000@g.us', '123456789012345@lid', '120363000000000000@newsletter', 'status@broadcast'])
    assert.ok(up.isChatId(id), id);
  for (const id of ['', '@c.us', 'x', '31612345678', 'a b@c.us', '<img>@c.us', 'x@C.US', 'x@c.us\n', 'x'.repeat(81) + '@c.us', 42, null, undefined, {}])
    assert.ok(!up.isChatId(id), String(id));
});

test('isPinTime accepts millisecond timestamps only', () => {
  for (const ts of [T, 1e12, Date.now()]) assert.ok(up.isPinTime(ts), String(ts));
  for (const ts of [0, -1, 1794262144, 1e13, 1.5e12 + 0.5, NaN, Infinity, '1774270178963', null])
    assert.ok(!up.isPinTime(ts), String(ts));
});

test('sanitize keeps valid entries and drops the rest', () => {
  assert.deepEqual(up.sanitize({ 'a@c.us': T, 'bad id': T, 'b@g.us': 0, 'c@lid': T + 1 }), { 'a@c.us': T, 'c@lid': T + 1 });
});

test('sanitize returns {} for anything that is not a plain object', () => {
  for (const v of [null, undefined, 0, 'x', true, [], [['a@c.us', T]]]) assert.deepEqual(up.sanitize(v), {}, String(v));
});

test('sanitize ignores inherited keys and caps the list', () => {
  const proto = Object.create({ 'inherited@c.us': T });
  assert.deepEqual(up.sanitize(proto), {});
  const many = Object.fromEntries(Array.from({ length: up.MAX_PINS + 20 }, (_, i) => [`${i}@c.us`, T + i]));
  assert.equal(Object.keys(up.sanitize(many)).length, up.MAX_PINS);
});

test('sanitize does not let __proto__ through', () => {
  const v = JSON.parse(`{"__proto__": ${T}, "a@c.us": ${T}}`);
  const out = up.sanitize(v);
  assert.deepEqual(Object.keys(out), ['a@c.us']);
  assert.equal(Object.getPrototypeOf(out), Object.prototype);
});

test('the attribute names are distinct data- attributes', () => {
  const names = Object.values(up.ATTR);
  assert.equal(new Set(names).size, names.length);
  for (const n of names) assert.match(n, /^data-up-[a-z]+$/);
});
