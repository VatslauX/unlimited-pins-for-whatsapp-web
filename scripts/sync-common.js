// Copies extension/common.js to extension/common-isolated.js (Chrome injects a file only
// once per page, so each world needs its own copy). A unit test checks they match.
const fs = require('fs');
const path = require('path');

const ext = path.resolve(__dirname, '..', 'extension');
fs.copyFileSync(path.join(ext, 'common.js'), path.join(ext, 'common-isolated.js'));
console.log('Copied common.js to common-isolated.js');
