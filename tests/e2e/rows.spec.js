// The row size end to end, in Chrome: the options page saves it to chrome.storage.local, open
// WhatsApp Web tabs follow it right away, rows.css fits the rows, and it stays after a reload.
const { test, expect, options } = require('./fixtures');

const chatRows = page => page.locator('[data-testid="chat-list"] [role="row"]');
const firstRow = page => chatRows(page).first();
const avatar = page => page.locator('[data-testid="chat-list"] [data-testid="cell-frame-container"] > div:first-child').first();
const zoom = page => avatar(page).evaluate(el => getComputedStyle(el).zoom);

test('the settings panel shows the name and version and starts at Original, in English', async ({ context }) => {
  const opts = await options(context);
  await expect(opts.getByLabel('Original')).toBeChecked();
  await expect(opts.getByText('Row size', { exact: true })).toBeVisible();
  await expect(opts.getByLabel('Compact')).not.toBeChecked();
  await expect(opts.locator('#name')).toHaveText('Unlimited Pins for WhatsApp Web (unofficial)');
  const { version } = require('../../extension/manifest.json');
  await expect(opts.locator('.version')).toHaveText(`Version ${version}`);
});

test('a stored value that is not a size shows Original', async ({ context }) => {
  const opts = await options(context);
  await opts.evaluate(() => chrome.storage.local.set({ rowSize: 'tiny' }));
  await opts.reload();
  await expect(opts.getByLabel('Original')).toBeChecked();
});

test('picking Compact shrinks the rows of an open WhatsApp tab at once, and it stays after a reload', async ({ context, whatsapp }) => {
  const page = await whatsapp({ react: true });
  await expect(firstRow(page)).toHaveCSS('height', '76px');
  expect(await zoom(page)).toBe('1');

  const opts = await options(context);
  await opts.getByText('Compact').click();
  await expect(opts.getByLabel('Compact')).toBeChecked();

  await expect(page.locator('html')).toHaveAttribute('data-up-rows', 'compact');
  await expect(firstRow(page)).toHaveCSS('height', '36px');
  await expect(chatRows(page).nth(1)).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 36)');
  expect(await zoom(page)).toBe('0.5');
  // name and last message on one line
  await expect(page.locator('[data-testid="chat-list"] [data-testid="cell-frame-secondary"]').first().locator('..'))
    .toHaveCSS('flex-direction', 'row');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-up-rows', 'compact');
  await expect(firstRow(page)).toHaveCSS('height', '36px');

  const again = await options(context);
  await expect(again.getByLabel('Compact')).toBeChecked();
});

test('Medium: shorter rows and a smaller photo; Original brings WhatsApp back unchanged', async ({ context, whatsapp }) => {
  const page = await whatsapp({ react: true });
  const opts = await options(context);
  await opts.getByText('Medium').click();
  await expect(firstRow(page)).toHaveCSS('height', '56px');
  expect(await zoom(page)).toBe('0.75');

  await opts.getByText('Original').click();
  await expect(page.locator('html')).toHaveAttribute('data-up-rows', 'original');
  await expect(firstRow(page)).toHaveCSS('height', '76px');
  expect(await zoom(page)).toBe('1');
});
