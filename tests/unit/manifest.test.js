// Manifest checks: least privilege and Chrome Web Store requirements.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const EXT = path.resolve(__dirname, '../../extension');
const m = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));

test('Manifest V3', () => assert.strictEqual(m.manifest_version, 3));

test('requires Chrome 111+ (content scripts in world: MAIN)', () => {
  assert.ok(+m.minimum_chrome_version >= 111, `minimum_chrome_version is ${m.minimum_chrome_version}`);
});

test('only the storage permission, no host_permissions', () => {
  assert.deepStrictEqual(m.permissions, ['storage']);
  assert.strictEqual(m.host_permissions, undefined);
  assert.strictEqual(m.optional_permissions, undefined);
});

test('no web-accessible resources, no externally_connectable, no background', () => {
  assert.strictEqual(m.web_accessible_resources, undefined);
  assert.strictEqual(m.externally_connectable, undefined);
  assert.strictEqual(m.background, undefined);
});

test('every referenced file exists', () => {
  const files = [...Object.values(m.icons || {}), ...m.content_scripts.flatMap(c => [...c.js, ...(c.css || [])]), m.options_ui.page];
  for (const f of files) assert.ok(fs.existsSync(path.join(EXT, f)), `missing ${f}`);
});

test('the settings panel opens from the toolbar icon and as the options page, and loads the scripts tsconfig.options.json checks', () => {
  assert.deepStrictEqual(m.action, { default_popup: 'options.html' });
  assert.deepStrictEqual(m.options_ui, { page: 'options.html', open_in_tab: false });
  const html = fs.readFileSync(path.join(EXT, 'options.html'), 'utf8');
  const loaded = [...new JSDOM(html).window.document.querySelectorAll('script')].map(s => s.getAttribute('src'));
  const ts = JSON.parse(fs.readFileSync(path.join(EXT, '..', 'tsconfig.options.json'), 'utf8').replace(/^\s*\/\/.*$/gm, ''))
    .files.filter(f => f.startsWith('extension/')).map(f => f.slice('extension/'.length));
  assert.deepStrictEqual(ts, loaded);
});

test('content scripts run only on WhatsApp Web, top frame only', () => {
  for (const cs of m.content_scripts) {
    assert.deepStrictEqual(cs.matches, ['https://web.whatsapp.com/*']);
    assert.ok(!cs.all_frames, 'all_frames must be off');
    assert.ok(!cs.match_about_blank && !cs.match_origin_as_fallback);
  }
});

test('one isolated world and one page world', () => {
  assert.deepStrictEqual(m.content_scripts.map(c => c.world || 'ISOLATED'), ['ISOLATED', 'MAIN']);
});

const NOT_AFFILIATED = {
  en: 'Not affiliated with WhatsApp.', nl: 'Niet gelieerd aan WhatsApp.', de: 'Nicht mit WhatsApp verbunden.',
  fr: 'Non affilié à WhatsApp.', es: 'Sin relación con WhatsApp.', it: 'Non affiliato a WhatsApp.', pt: 'Sem afiliação ao WhatsApp.'
};

test('named as unofficial and not implying WhatsApp affiliation', () => {
  assert.match(m.name, /^Unlimited Pins for WhatsApp Web \(unofficial\)$/);
  assert.ok(m.name.length <= 45, 'store name should be short');
  // the description is translated (_locales); every language must carry the disclaimer
  assert.strictEqual(m.description, '__MSG_extDescription__');
  for (const lang of fs.readdirSync(path.join(EXT, '_locales'))) {
    const d = JSON.parse(fs.readFileSync(path.join(EXT, '_locales', lang, 'messages.json'), 'utf8')).extDescription.message;
    assert.ok(NOT_AFFILIATED[lang], `${lang}: add its "not affiliated" phrase to this test`);
    assert.ok(d.endsWith(NOT_AFFILIATED[lang]), `${lang}: description must end with "${NOT_AFFILIATED[lang]}"`);
    assert.ok(d.length <= 132, `${lang}: description is ${d.length} chars (store limit 132)`);
  }
  assert.ok(!m.homepage_url || !/whatsapp\.com/i.test(m.homepage_url), 'homepage_url must not point to WhatsApp');
});

test('type-check projects list the same scripts as each manifest world', () => {
  const tsFiles = name => JSON.parse(fs.readFileSync(path.join(EXT, '..', name), 'utf8').replace(/^\s*\/\/.*$/gm, ''))
    .files.filter(f => f.startsWith('extension/')).map(f => f.slice('extension/'.length));
  for (const cs of m.content_scripts) {
    const project = cs.world === 'MAIN' ? 'tsconfig.page.json' : 'tsconfig.isolated.json';
    assert.deepStrictEqual(tsFiles(project), cs.js, `${project} must list the ${cs.world || 'isolated'} world's scripts in manifest order`);
  }
});
