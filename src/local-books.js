const DB_NAME = 'ereader-library';
const STORE = 'books';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Close other reader tabs and try again.'));
  });
}

async function transaction(mode, action) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = action(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); resolve(request.result); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('Library storage failed.')); };
    tx.onerror = () => {}; // The abort event reports failed requests.
  });
}

export const getBook = id => transaction('readonly', store => store.get(id));
export const removeBook = id => transaction('readwrite', store => store.delete(id));
export async function listBooks() {
  // A cursor avoids loading every EPUB's bytes into memory at the same time.
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const books = [];
    const tx = db.transaction(STORE, 'readonly');
    const cursor = tx.objectStore(STORE).openCursor();
    cursor.onsuccess = () => {
      const current = cursor.result;
      if (!current) return;
      const { id, title, author } = current.value;
      books.push({ id, title, author });
      current.continue();
    };
    tx.oncomplete = () => { db.close(); resolve(books.sort((a, b) => a.title.localeCompare(b.title))); };
    tx.onabort = () => { db.close(); reject(tx.error); };
  });
}

export async function importBook(file) {
  if (!/\.epub$/i.test(file.name)) throw new Error('Choose an EPUB file.');
  if (file.size > 100 * 1024 * 1024) throw new Error('EPUB files must be smaller than 100 MB.');
  const data = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', data);
  const digest = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
  // Retain existing progress for the edition used by the early prototype.
  // This fingerprint contains no book content; the EPUB must still be imported.
  const id = digest === 'bbd82efa5e3e8d8a302a39c5e20d7d6d250804c7003c63378946d85f1176ccb6'
    ? 'pnp' : `book-${digest}`;
  if (await getBook(id)) return { id, duplicate: true };
  const { default: ePub } = await import('epubjs');
  const book = ePub();
  try {
    await book.open(data, 'binary');
    if (!book.spine.length) throw new Error('The EPUB has no reading content.');
    const metadata = book.packaging.metadata;
    const entry = {
      id, title: metadata.title || file.name.replace(/\.epub$/i, ''),
      author: metadata.creator || 'Unknown author', data,
    };
    await transaction('readwrite', store => store.put(entry));
    return { id, duplicate: false };
  } finally { book.destroy(); }
}
