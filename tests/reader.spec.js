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
  const display = page.locator('#selected-word');
  await expect(display).toBeEmpty();

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
  await expect(display).toHaveText('universally');
  await expect(display).toBeVisible();
  await expect(display).toHaveCSS('color', 'rgb(0, 0, 0)');
  const panel = await page.locator('#word-panel').boundingBox();
  const wordBox = await display.boundingBox();
  expect(panel.x).toBe(720);
  expect(Math.abs(wordBox.x + wordBox.width / 2 - (panel.x + panel.width / 2))).toBeLessThan(2);
  expect(Math.abs(wordBox.y + wordBox.height / 2 - (panel.y + panel.height / 2))).toBeLessThan(2);
  await clickText('acknowledged');
  await expect.poll(selection).toEqual(['acknowledged,']);
  await expect(display).toHaveText('acknowledged,');
  // The opening word spans the decorative initial and its neighboring text node.
  await clickText('I');
  await expect.poll(selection).toEqual(['IT']);
  expect(await opening.boundingBox()).toEqual(before);
  await page.keyboard.press('ArrowUp');
  await expect(display).toHaveText('is');
  await expect.poll(selection).toEqual(['is']);
  await page.keyboard.press('ArrowDown');
  await expect(display).toHaveText('IT');
  await expect.poll(selection).toEqual(['IT']);

  // Clicking the paragraph's indentation must not select a nearby word.
  await page.mouse.click(before.x + before.width - 2, before.y + before.height - 2);
  await expect.poll(selection).toEqual(['IT']);
  await page.keyboard.press('ArrowRight');
  await expect.poll(selection).toEqual([]);
  await expect(display).toBeEmpty();
  await expect.poll(async () => (await opening.boundingBox()).x).toBeLessThan(before.x - 100);
  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => Math.abs((await opening.boundingBox()).x - before.x)).toBeLessThan(2);
  await clickText('truth');
  await expect.poll(selection).toEqual(['truth']);
  await expect(display).toHaveText('truth');
  // Word navigation also works when focus is outside the book iframe.
  await page.locator('#word-panel').click();
  await page.keyboard.press('ArrowUp');
  await expect(display).toHaveText('universally');
  await page.keyboard.press('ArrowDown');
  await expect(display).toHaveText('truth');
  expect(errors).toEqual([]);
});

test('word navigation starts on the visible page and crosses page boundaries in both directions', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#reader')).toHaveAttribute('data-ready', 'true');
  const display = page.locator('#selected-word');
  const frame = page.frames().find(frame => frame !== page.mainFrame());
  const opening = frame.locator('p').filter({ hasText: 'universally acknowledged' }).first();
  const before = await opening.boundingBox();
  await page.keyboard.press('ArrowUp');
  await expect(display).toHaveText('Chapter');
  await page.keyboard.press('ArrowUp');
  await expect(display).toHaveText('I.');
  await page.keyboard.press('ArrowUp');
  await expect(display).toHaveText('IT');

  let previous;
  let crossed = false;
  for (let i = 0; i < 400; i++) {
    previous = await display.textContent();
    const position = () => frame.evaluate(() => {
      const range = [...CSS.highlights.get('selected-word')][0];
      return [range.startContainer.textContent, range.startOffset, range.endOffset];
    });
    const previousPosition = await position();
    await page.keyboard.press('ArrowUp');
    await expect.poll(position).not.toEqual(previousPosition);
    await expect.poll(() => frame.evaluate(() => [...CSS.highlights.get('selected-word')][0].toString()))
      .toBe(await display.textContent());
    if ((await opening.boundingBox()).x < before.x - 100) { crossed = true; break; }
  }
  expect(crossed).toBe(true);
  const iframe = await page.locator('#reader iframe').boundingBox();
  const reader = await page.locator('#reader').boundingBox();
  const selectedRect = await frame.evaluate(() => {
    const rect = [...CSS.highlights.get('selected-word')][0].getBoundingClientRect();
    return { x: rect.x, y: rect.y };
  });
  expect(selectedRect.x + iframe.x).toBeGreaterThanOrEqual(reader.x);
  expect(selectedRect.x + iframe.x).toBeLessThan(reader.x + reader.width);
  await page.keyboard.press('ArrowDown');
  await expect(display).toHaveText(previous);
  await expect.poll(async () => Math.abs((await opening.boundingBox()).x - before.x)).toBeLessThan(2);
  expect(errors).toEqual([]);
});

for (const focusBook of [false, true]) {
  test(`space toggles 300 WPM playback with ${focusBook ? 'book' : 'outer document'} focus`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(page.locator('#reader')).toHaveAttribute('data-ready', 'true');
    const display = page.locator('#selected-word');
    if (focusBook) {
      const heading = page.frameLocator('#reader iframe').locator('#pgepubid00022');
      await heading.click();
    }
    // Start with the same known selection in either focus context.
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowUp');
    await expect(display).toHaveText('Chapter');
    await page.clock.install({ time: new Date('2030-01-01T00:00:00Z') });
    await page.clock.pauseAt(new Date('2030-01-01T00:00:00Z'));
    await page.keyboard.press('Space');
    await page.clock.runFor(199);
    await expect(display).toHaveText('Chapter');
    await page.clock.runFor(1);
    await expect(display).toHaveText('I.');
    await page.clock.runFor(599);
    await expect(display).toHaveText('I.');
    await page.clock.runFor(1);
    await expect(display).toHaveText('IT');
    await page.keyboard.press('Space');
    await page.clock.runFor(1000);
    await expect(display).toHaveText('IT');
    await page.keyboard.press('Space');
    await page.clock.runFor(200);
    await expect(display).toHaveText('is');
    await page.keyboard.press('ArrowDown');
    await expect(display).toHaveText('IT');
    await page.clock.runFor(1000);
    await expect(display).toHaveText('IT');
    await page.keyboard.press('Space');
    await page.locator('#word-panel').click();
    await page.clock.runFor(1000);
    await expect(display).toHaveText('IT');
  });
}

test('space starts from the first visible word without a selection', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#reader')).toHaveAttribute('data-ready', 'true');
  await page.clock.install({ time: new Date('2030-01-01T00:00:00Z') });
    await page.clock.pauseAt(new Date('2030-01-01T00:00:00Z'));
  await page.keyboard.press('Space');
  await expect(page.locator('#selected-word')).toHaveText('Chapter');
  await page.clock.runFor(200);
  await expect(page.locator('#selected-word')).toHaveText('I.');
  await page.keyboard.press('Space');
});

test('punctuation stays in the panel and paragraph endings get a longer pause', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.locator('#reader')).toHaveAttribute('data-ready', 'true');
  const frame = page.frameLocator('#reader iframe');
  const opening = frame.locator('p').filter({ hasText: 'universally acknowledged' }).first();
  const nextParagraph = frame.locator('p').filter({ hasText: 'However little known' }).first();
  await expect(opening).toHaveCSS('text-indent', '0%');
  await expect(nextParagraph).toHaveCSS('text-indent', '4%');
  const point = await opening.evaluate(element => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const start = node.textContent.indexOf('wife.');
      if (start < 0) continue;
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, start + 5);
      const rect = range.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    }
  });
  const iframe = await page.locator('#reader iframe').boundingBox();
  await page.mouse.click(iframe.x + point.x, iframe.y + point.y);
  const display = page.locator('#selected-word');
  await expect(display).toHaveText('wife.');
  await page.clock.install({ time: new Date('2030-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2030-01-01T00:00:00Z'));
  await page.keyboard.press('Space');
  await page.clock.runFor(599);
  await expect(display).toHaveText('wife.');
  await page.clock.runFor(1);
  await expect(display).toHaveText('However');
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowDown');
  await expect(display).toHaveText('wife.');
});

for (const focusBook of [false, true]) {
  test(`shift arrows change speed without moving words or pausing (${focusBook ? 'book' : 'outer'} focus)`, async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#reader')).toHaveAttribute('data-ready', 'true');
    const display = page.locator('#selected-word');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await expect(display).toHaveText('IT');
    if (focusBook) await page.locator('#reader iframe').evaluate(iframe => iframe.contentWindow.focus());
    for (let i = 0; i < 6; i++) await page.keyboard.press('Shift+ArrowUp');
    await expect(display).toHaveText('IT');
    await page.clock.install({ time: new Date('2030-01-01T00:00:00Z') });
    await page.clock.pauseAt(new Date('2030-01-01T00:00:00Z'));
    await page.keyboard.press('Space');
    await page.clock.runFor(99);
    await expect(display).toHaveText('IT');
    await page.clock.runFor(1);
    await expect(display).toHaveText('is');
    for (let i = 0; i < 6; i++) await page.keyboard.press('Shift+ArrowDown');
    await expect(display).toHaveText('is');
    // The word already on screen finishes its scheduled interval; subsequent
    // words use the new speed, without stopping playback.
    await page.clock.runFor(100);
    await expect(display).toHaveText('a');
    await page.clock.runFor(199);
    await expect(display).toHaveText('a');
    await page.clock.runFor(1);
    await expect(display).toHaveText('truth');
    await page.keyboard.press('Space');
  });
}
