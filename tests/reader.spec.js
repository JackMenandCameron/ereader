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

for (const focusBook of [false, true]) {
  test(`arrow keys turn pages with ${focusBook ? 'book' : 'outer document'} focus`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    await expect(page.locator('#reader')).toHaveAttribute('data-ready', 'true');
    const opening = page.frameLocator('#reader iframe').locator('p')
      .filter({ hasText: 'universally acknowledged' }).first();
    const start = await opening.boundingBox();
    if (focusBook) await opening.click();
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await opening.boundingBox()).x).toBeLessThan(start.x - 100);
    await page.keyboard.press('ArrowLeft');
    await expect.poll(async () => Math.abs((await opening.boundingBox()).x - start.x)).toBeLessThan(2);
    // Rapid alternating presses must settle back on the original page.
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await opening.boundingBox()).x).toBeLessThan(start.x - 800);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect.poll(async () => Math.abs((await opening.boundingBox()).x - start.x)).toBeLessThan(2);
    expect(errors).toEqual([]);
  });
}

test('preserves illustrated initials and hides chapter illustration captions', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.locator('#reader')).toHaveAttribute('data-ready', 'true');
  const frame = page.frameLocator('#reader iframe');
  const heading = frame.locator('#pgepubid00028');
  const paragraph = frame.locator('p.nind').filter({ hasText: 'was among the earliest' });
  await expect(paragraph).toHaveText(/^MR\. BENNET was among the earliest[\s\S]*/);
  await expect(frame.locator('.letra img')).toHaveCount(0);
  await expect(heading.locator('.caption')).toBeHidden();
  expect((await heading.innerText()).trim()).toBe('CHAPTER II.');

  // Reach Chapter II using the same keyboard navigation as the reader.
  const reader = await page.locator('#reader').boundingBox();
  for (let turn = 0; turn < 20; turn++) {
    const box = await heading.boundingBox();
    if (box.x >= reader.x && box.x < reader.x + reader.width) break;
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await heading.boundingBox()).x).toBeLessThan(box.x - 100);
  }
  const box = await paragraph.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(reader.x);
  expect(box.x).toBeLessThan(reader.x + reader.width);
  expect(box.y).toBeGreaterThanOrEqual(reader.y);
  expect(box.y).toBeLessThan(reader.y + reader.height);
});

test('click selects one whole word without changing layout, then page turns clear it', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.locator('#reader')).toHaveAttribute('data-ready', 'true');
  const frame = page.frames().find(frame => frame !== page.mainFrame());
  const opening = frame.locator('p').filter({ hasText: 'universally acknowledged' }).first();
  const before = await opening.boundingBox();

  async function clickText(text) {
    const point = await opening.evaluate((element, text) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const index = node.textContent.indexOf(text);
        if (index < 0) continue;
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + text.length);
        const rect = range.getClientRects()[0];
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      }
      throw new Error(`Missing text: ${text}`);
    }, text);
    const iframe = await page.locator('#reader iframe').boundingBox();
    await page.mouse.click(iframe.x + point.x, iframe.y + point.y);
  }
  const selection = () => frame.evaluate(() => {
    const highlight = CSS.highlights.get('selected-word');
    return highlight ? [...highlight].map(range => range.toString()) : [];
  });

  await clickText('universally');
  await expect.poll(selection).toEqual(['universally']);
  await clickText('acknowledged');
  await expect.poll(selection).toEqual(['acknowledged']);
  // The opening word spans the decorative initial and its neighboring text node.
  await clickText('I');
  await expect.poll(selection).toEqual(['IT']);
  expect(await opening.boundingBox()).toEqual(before);

  // Clicking the paragraph's indentation must not select a nearby word.
  await page.mouse.click(before.x + before.width - 2, before.y + before.height - 2);
  await expect.poll(selection).toEqual(['IT']);
  await page.keyboard.press('ArrowRight');
  await expect.poll(selection).toEqual([]);
  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => Math.abs((await opening.boundingBox()).x - before.x)).toBeLessThan(2);
  await clickText('truth');
  await expect.poll(selection).toEqual(['truth']);
  expect(errors).toEqual([]);
});
