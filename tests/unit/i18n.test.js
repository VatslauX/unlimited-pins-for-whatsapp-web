// Translations: every language has every text, with the same placeholders, and no text is unused.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const EXT = path.resolve(__dirname, '../../extension');
const LOC = path.join(EXT, '_locales');
const read = lang => JSON.parse(fs.readFileSync(path.join(LOC, lang, 'messages.json'), 'utf8'));
const en = read('en');
const langs = fs.readdirSync(LOC);
const placeholders = s => (s.match(/\$\d/g) || []).sort().join(',');

test('default locale is English and the manifest uses it', () => {
  const m = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
  assert.strictEqual(m.default_locale, 'en');
  assert.ok(langs.length > 1);
});

test('every language has the same keys and placeholders as English', () => {
  for (const lang of langs) {
    const msgs = read(lang);
    assert.deepStrictEqual(Object.keys(msgs).sort(), Object.keys(en).sort(), `${lang}: keys differ from en`);
    for (const [k, v] of Object.entries(msgs)) {
      assert.ok(typeof v.message === 'string' && v.message.trim(), `${lang}.${k}: empty`);
      assert.strictEqual(placeholders(v.message), placeholders(en[k].message), `${lang}.${k}: placeholders differ`);
      assert.doesNotMatch(v.message, /\$(?!\d)/, `${lang}.${k}: a literal $ must be written $$`);
    }
  }
});

test('every key used in the manifest exists, and every key is used', () => {
  const manifest = fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8');
  const used = new Set([...manifest.matchAll(/__MSG_([A-Za-z]+)__/g)].map(m => m[1]));
  for (const k of used) assert.ok(en[k], `missing in en: ${k}`);
  for (const k of Object.keys(en)) assert.ok(used.has(k), `unused text: ${k}`);
});
