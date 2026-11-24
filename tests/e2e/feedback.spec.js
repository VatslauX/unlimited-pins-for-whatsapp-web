// The settings panel's feedback link: a new GitHub issue on the manifest's homepage_url, with
// only the extension version, Chrome version and UI language filled in.
const { test, expect, options } = require('./fixtures');
const { version, homepage_url: home } = require('../../extension/manifest.json');

test('the feedback link opens a new GitHub issue with the versions, and nothing about the user', async ({ context }) => {
  const opts = await options(context);
  const link = opts.locator('#feedback');
  await expect(link).toBeVisible();
  await expect(link).toHaveText('Feedback or report a problem');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  const href = new URL(await link.getAttribute('href') || '');
  expect(`${href.origin}${href.pathname}`).toBe(`${home}/issues/new`);
  expect([...href.searchParams.keys()]).toEqual(['body']); // no chat, account or settings data
  const body = href.searchParams.get('body') || '';
  expect(body.split('\n').at(-1)).toMatch(new RegExp(`^Extension ${version.replace(/\./g, '\\.')} · Chrome \\d+ · en`));
});
