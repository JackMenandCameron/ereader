import { test, expect } from '@playwright/test';
import { makeBook } from './book-fixture.js';

const upload = async page => page.getByLabel('Add EPUB').setInputFiles({
  name: 'sample.epub', mimeType: 'application/epub+zip', buffer: await makeBook(),
});

test('empty library imports locally, survives reload, deduplicates and removes books', async ({ page, browser }) => {
  await page.goto('/ereader');
  await expect(page.getByText('No books yet.')).toBeVisible();
  await expect(page.getByLabel('Words per minute')).toHaveCount(0);
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByLabel('Words per minute')).toBeVisible();
  await page.getByRole('link', { name: 'Library', exact: true }).click();
  const requests = [];
  page.on('request', request => requests.push(request));
  const file = { name: 'sample.epub', mimeType: 'application/epub+zip', buffer: await makeBook() };
  await page.getByLabel('Add EPUB').setInputFiles(file);
  await expect(page.locator('#library-status')).toContainText('added.');
  const book = page.getByRole('link', { name: 'Sample Book — Example Author' });
  const href = await book.getAttribute('href');
  expect(href).toMatch(/^\/ereader\/book-[a-f0-9]{64}$/);
  await page.getByLabel('Add EPUB').setInputFiles(file);
  await expect(page.locator('#library-status')).toContainText('already in library');
  await expect(book).toHaveCount(1);
  await page.reload();
  await book.click();
  await expect(page.locator('#reader')).toHaveAttribute('data-ready', 'true');
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#selected-word')).toHaveText('Chapter');
  await page.reload();
  await expect(page.locator('#reader')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#selected-word')).toHaveText('Chapter');
  expect(requests.some(request => request.method() === 'POST' || /\.epub(?:\?|$)/.test(request.url()))).toBe(false);
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await otherPage.goto(new URL(href, page.url()).href);
  await expect(otherPage.getByRole('heading')).toHaveText('Book not found');
  await other.close();
  await page.goto('/ereader');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Remove Sample Book' }).click();
  await expect(page.getByText('No books yet.')).toBeVisible();
  await page.getByLabel('Add EPUB').setInputFiles(file);
  await expect(book).toHaveAttribute('href', href);
  await book.click();
  await expect(page.locator('#reader')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#selected-word')).toHaveText('Chapter');
});

test('invalid EPUB imports fail without adding a book', async ({ page }) => {
  await page.goto('/ereader');
  await page.getByLabel('Add EPUB').setInputFiles({ name: 'broken.epub', mimeType: 'application/epub+zip', buffer: Buffer.from('not an epub') });
  await expect(page.locator('#library-status')).toContainText('unable to add');
  await expect(page.getByText('No books yet.')).toBeVisible();
  await expect(page.getByLabel('Add EPUB')).toBeEnabled();
  await upload(page);
  await expect(page.getByRole('link', { name: 'Sample Book — Example Author' })).toBeVisible();
});
