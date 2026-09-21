import { test, expect } from './fixtures.js';
import { STORAGE_KEY, validateState } from '../src/state.js';

test('older state gets the light theme without losing settings or progress', () => {
  const old = { version: 1, settings: { wpm: 450, punctuationPauses: false }, books: {
    pnp: { cfi: 'epubcfi(/6/4!/4/2)', kind: 'page', updatedAt: '2026-01-01T00:00:00Z' },
  } };
  const migrated = validateState(old);
  expect(migrated.settings).toEqual({ ...old.settings, theme: 'light' });
  expect(migrated.books).toEqual(old.books);
  expect(() => validateState({ ...old, settings: { ...old.settings, theme: 'missing' } })).toThrow('Unsupported theme');
});

test('Nord is saved and applied to the library, reader iframe, and selection', async ({ page }) => {
  await page.goto('/settings');
  await page.getByLabel('Theme', { exact: true }).selectOption('nord');
  await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(46, 52, 64)');
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toHaveCSS('color', 'rgb(236, 239, 244)');
  await page.reload();
  await expect(page.getByLabel('Theme', { exact: true })).toHaveValue('nord');
  await page.goto('/ereader/pnp');
  await expect(page.locator('#reader')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByRole('link', { name: 'Library', exact: true })).toHaveCount(0);
  const frame = page.frameLocator('#reader iframe');
  await expect(frame.locator('body')).toHaveCSS('background-color', 'rgb(46, 52, 64)');
  await expect(frame.locator('p').filter({ hasText: 'universally acknowledged' }).first()).toHaveCSS('color', 'rgb(236, 239, 244)');
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#selected-word')).toHaveText('Chapter');
  await expect(page.locator('#selected-word')).toHaveCSS('color', 'rgb(236, 239, 244)');
  const highlightColor = await frame.locator('body').evaluate(body =>
    getComputedStyle(body, '::highlight(selected-word)').color);
  expect(highlightColor).toBe('rgb(191, 97, 106)');
  await page.reload();
  await expect(page.locator('#reader')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#selected-word')).toHaveText('Chapter');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'nord');
  await page.goto('/settings');
  await page.getByLabel('Theme', { exact: true }).selectOption('light');
  await page.goto('/ereader/pnp');
  await expect(page.locator('#reader')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(frame.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(page.locator('#selected-word')).toHaveText('Chapter');
});

test('importing a Nord backup applies the theme immediately', async ({ page }) => {
  await page.goto('/settings');
  const backup = { version: 1, settings: { wpm: 300, punctuationPauses: true, theme: 'nord' }, books: {} };
  page.once('dialog', dialog => dialog.accept());
  await page.getByLabel('Import backup').setInputFiles({
    name: 'nord.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect(page.locator('#backup-status')).toHaveText('Backup imported.');
  await expect(page.getByLabel('Theme', { exact: true })).toHaveValue('nord');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'nord');
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).settings.theme, STORAGE_KEY)).toBe('nord');
});
