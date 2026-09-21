import { test, expect } from '@playwright/test';

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`renders a text page at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    await expect(page.locator('#reader')).toHaveAttribute('data-ready', 'true');
    await expect(page.locator('#status')).toBeHidden();
    const frame = page.frameLocator('#reader iframe');
    const opening = frame.locator('p').filter({ hasText: 'universally acknowledged' }).first();
    await expect(opening).toBeVisible();
    const readerBox = await page.locator('#reader').boundingBox();
    const textBox = await opening.boundingBox();
    expect(textBox.x).toBeGreaterThanOrEqual(readerBox.x);
    expect(textBox.x).toBeLessThan(readerBox.x + readerBox.width);
    expect(textBox.y).toBeGreaterThanOrEqual(readerBox.y);
    expect(textBox.y).toBeLessThan(readerBox.y + readerBox.height);
    await expect(opening).toHaveCSS('color', 'rgb(0, 0, 0)');
    expect(errors).toEqual([]);
  });
}

test('shows a message if the EPUB cannot load', async ({ page }) => {
  await page.route('**/pnp.epub', route => route.fulfill({ status: 404 }));
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('Unable to open');
});
