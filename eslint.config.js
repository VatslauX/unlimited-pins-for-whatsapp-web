// Lint for mistakes only (unused code, undefined names); tsc checks types, style is free.
const js = require('@eslint/js');
const globals = require('globals');

// global that common.js defines for the other scripts
const shared = { __upins: 'readonly' };

module.exports = [
  { ignores: ['node_modules/', 'dist/', 'test-results/', 'playwright-report/', '.claude/'] },
  js.configs.recommended,
  {
    files: ['extension/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: { ...globals.browser, ...shared, chrome: 'readonly', module: 'readonly' }
    },
    rules: {
      'no-unused-vars': ['error', { caughtErrors: 'none', vars: 'local', varsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: true }]
    }
  },
  {
    // Node, plus browser code inside page.evaluate() and the mock page
    files: ['tests/**/*.js', 'scripts/**/*.js', '*.config.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node, ...globals.browser, ...shared, chrome: 'readonly' }
    },
    rules: {
      'no-unused-vars': ['error', { caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-empty-pattern': 'off' // Playwright fixtures take ({}, use)
    }
  }
];
