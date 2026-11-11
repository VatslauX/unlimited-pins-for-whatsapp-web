// Renders scripts/icon.svg to extension/icons/icon{16,32,48,128}.png.
// Needs rsvg-convert (macOS: brew install librsvg). Run after editing the SVG.
const { execFileSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');
const svg = path.join(root, 'scripts', 'icon.svg');
for (const size of [16, 32, 48, 128]) {
  const out = path.join(root, 'extension', 'icons', `icon${size}.png`);
  execFileSync('rsvg-convert', ['-w', String(size), '-h', String(size), '-o', out, svg]);
  console.log('Wrote', path.relative(root, out));
}
