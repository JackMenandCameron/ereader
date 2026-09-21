import { test as base, expect } from '@playwright/test';
import { makeBook } from './book-fixture.js';

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.goto('/ereader');
    // Seed a deterministic ID for reader regression tests only.
    await page.evaluate(async bytes => {
      const request = indexedDB.open('ereader-library', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('books', { keyPath: 'id' });
      const db = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise((resolve, reject) => {
        const tx = db.transaction('books', 'readwrite');
        tx.objectStore('books').put({ id: 'pnp', title: 'Sample Book', author: 'Example Author', data: new Uint8Array(bytes).buffer });
        tx.oncomplete = resolve;
        tx.onabort = () => reject(tx.error);
      });
      db.close();
    }, [...await makeBook()]);
    await use(page);
  },
});
export { expect };
