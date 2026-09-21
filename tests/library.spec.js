import { test, expect } from './fixtures.js';
import { STORAGE_KEY } from '../src/state.js';

const state = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);

test('library routes, saved settings and word position survive reopening, paused', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/ereader$/);
  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByLabel('Words per minute').fill('450');
  await page.getByLabel('Words per minute').blur();
  await page.getByLabel('Pause for punctuation and paragraphs').uncheck();
  await page.getByRole('link', { name: 'Library', exact: true }).click();
  await page.getByRole('link', { name: 'Sample Book — Example Author' }).click();
  await expect(page).toHaveURL(/\/ereader\/pnp$/);
  await expect(page.locator('#reader')).toHaveAttribute('data-ready', 'true');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#selected-word')).toHaveText('IT');
  const saved = await state(page);
  expect(saved.settings).toEqual({ wpm: 450, punctuationPauses: false, theme: 'light' });
  expect(saved.books.pnp.kind).toBe('word');
  await page.reload();
  await expect(page.locator('#reader')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#selected-word')).toHaveText('IT');
  await page.clock.install({ time: new Date('2030-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2030-01-01T00:00:00Z'));
  await page.clock.runFor(2000);
  await expect(page.locator('#selected-word')).toHaveText('IT');
  await page.keyboard.press('Shift+ArrowUp');
  expect((await state(page)).settings.wpm).toBe(500);
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#selected-word')).toHaveText('is');
  await expect(page.getByRole('link', { name: 'Library', exact: true })).toHaveCount(0);
  await page.goto('/settings');
  await expect(page.getByLabel('Words per minute')).toHaveValue('500');
  await expect(page.getByLabel('Pause for punctuation and paragraphs')).not.toBeChecked();
});

test('manual page progress survives a reload', async ({ page }) => {
  await page.goto('/ereader/pnp');
  await expect(page.locator('#reader')).toHaveAttribute('data-ready', 'true');
  await expect.poll(async () => (await state(page))?.books.pnp.kind).toBe('page');
  const initialCfi = (await state(page)).books.pnp.cfi;
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await state(page))?.books.pnp.cfi).not.toBe(initialCfi);
  const saved = (await state(page)).books.pnp;
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#selected-word')).not.toBeEmpty();
  const firstWord = await page.locator('#selected-word').textContent();
  // Restore the page-only checkpoint, then verify the same first visible word.
  await page.evaluate(({ key, saved }) => {
    const value = JSON.parse(localStorage.getItem(key));
    value.books.pnp = saved;
    localStorage.setItem(key, JSON.stringify(value));
  }, { key: STORAGE_KEY, saved });
  await page.reload();
  await expect(page.locator('#reader')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#selected-word')).toBeEmpty();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#selected-word')).toHaveText(firstWord);
});

test('backup export/import is validated and confirmation protects existing data', async ({ page }) => {
  await page.goto('/settings');
  await page.getByLabel('Words per minute').fill('600');
  await page.getByLabel('Words per minute').blur();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup' }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const backup = Buffer.concat(chunks);
  expect(JSON.parse(backup).settings.wpm).toBe(600);
  await page.getByLabel('Words per minute').fill('300');
  await page.getByLabel('Words per minute').blur();
  const upload = buffer => page.getByLabel('Import backup').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer });
  const dismissed = new Promise(resolve => page.once('dialog', async dialog => {
    await dialog.dismiss();
    resolve();
  }));
  await upload(backup);
  await dismissed;
  await expect(page.getByLabel('Import backup')).toHaveValue('');
  await expect(page.getByLabel('Words per minute')).toHaveValue('300');
  page.once('dialog', dialog => dialog.accept());
  await upload(backup);
  await expect(page.locator('#backup-status')).toHaveText('Backup imported.');
  await expect(page.getByLabel('Words per minute')).toHaveValue('600');
  await upload(Buffer.from('{"version":99}'));
  await expect(page.locator('#backup-status')).toContainText('Unable to import');
  expect((await state(page)).settings.wpm).toBe(600);
});

test('unreadable storage is not overwritten and the reader still works', async ({ page }) => {
  await page.addInitScript(key => localStorage.setItem(key, '{broken'), STORAGE_KEY);
  await page.goto('/ereader/pnp');
  await expect(page.locator('#storage-warning')).toContainText('unavailable or unreadable');
  await expect(page.locator('#reader')).toHaveAttribute('data-ready', 'true');
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#selected-word')).toHaveText('Chapter');
  expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBe('{broken');
});

test('storage access errors show a warning instead of preventing reading', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new Error('Storage denied'); };
  });
  await page.goto('/ereader/pnp');
  await expect(page.locator('#reader')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#storage-warning')).toBeVisible();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#selected-word')).toHaveText('Chapter');
});

test('unknown book links show a route back to the library', async ({ page }) => {
  await page.goto('/ereader/missing');
  await expect(page.getByRole('heading')).toHaveText('Book not found');
  await page.getByRole('link', { name: 'Library' }).click();
  await expect(page.getByRole('heading', { name: 'Library', exact: true })).toBeVisible();
});
