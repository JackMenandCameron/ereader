import { listBooks, getBook, importBook, removeBook } from './local-books.js';
import { createStateStore, validateState } from './state.js';
import { applyTheme } from './themes.js';
import './style.css';

const app = document.querySelector('#app');
const warning = document.createElement('p');
warning.id = 'storage-warning';
warning.role = 'status';
warning.hidden = true;
document.body.append(warning);
const store = createStateStore(message => {
  warning.textContent = `${message} `;
  const exportButton = document.createElement('button');
  exportButton.type = 'button';
  exportButton.textContent = 'Export backup';
  exportButton.addEventListener('click', exportBackup);
  warning.append(exportButton);
  warning.hidden = false;
});
applyTheme(store.read().settings.theme);
const path = location.pathname.replace(/\/+$/, '') || '/';

route().catch(error => {
  console.error(error);
  app.innerHTML = '<main class="library"><h1>Unable to open library</h1><p id="library-error" role="status"></p></main>';
  document.querySelector('#library-error').textContent = 'Browser book storage is unavailable. Check browser permissions and reload.';
});

async function route() {
  if (path === '/') return location.replace('/ereader');
  if (path === '/settings') return renderSettings();
  if (path === '/ereader') return renderLibrary();
  const match = path.match(/^\/ereader\/([a-z0-9-]+)$/);
  const book = match ? await getBook(match[1]) : null;
  if (!book) {
    app.innerHTML = '<main class="library"><h1>Book not found</h1><p>Import this EPUB in this browser to read it.</p><a href="/ereader">Library</a></main>';
    return;
  }
  app.innerHTML = `
    <main class="reader-layout">
      <section id="page" aria-label="Book page">
        <p id="status" role="status">Loading book…</p><div id="reader"></div>
      </section>
      <aside id="word-panel" aria-label="Selected word"><span id="selected-word"></span></aside>
    </main>`;
  try {
    const { openReader } = await import('./reader.js');
    await openReader(book, store);
  } catch (error) {
    console.error(error);
    document.querySelector('#status').textContent = 'Unable to open the book. Reload to try again.';
  }
}

async function renderLibrary() {
  document.title = 'Library — Reader';
  app.innerHTML = `<main class="library">
    <h1>Library</h1>
    <p><a href="/settings">Settings</a></p>
    <ul id="books"></ul>
    <p id="empty-library" hidden>No books yet.</p>
    <p><label>Add EPUB <input id="add-book" type="file" accept=".epub,application/epub+zip" multiple></label></p>
    <p id="library-status" role="status"></p>
  </main>`;
  async function refresh() {
    const books = await listBooks();
    const list = document.querySelector('#books');
    list.replaceChildren();
    document.querySelector('#empty-library').hidden = books.length > 0;
    for (const book of books) {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = `/ereader/${book.id}`;
      link.textContent = `${book.title} — ${book.author}`;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Remove';
      remove.setAttribute('aria-label', `Remove ${book.title}`);
      remove.addEventListener('click', async () => {
        if (!confirm(`Remove “${book.title}” from this browser? Saved progress will be kept for reimporting.`)) return;
        try { await removeBook(book.id); await refresh(); }
        catch { document.querySelector('#library-status').textContent = 'Unable to remove this book.'; }
      });
      item.append(link, ' ', remove);
      list.append(item);
    }
  }
  await refresh();
  document.querySelector('#add-book').addEventListener('change', async event => {
    const input = event.target;
    const files = [...input.files];
    input.disabled = true;
    const message = document.querySelector('#library-status');
    const results = [];
    try {
      for (const file of files) {
        message.textContent = `Adding ${file.name}…`;
        try {
          const result = await importBook(file);
          results.push(`${file.name}: ${result.duplicate ? 'already in library' : 'added'}.`);
        } catch (error) { results.push(`${file.name}: unable to add (${error.message}).`); }
      }
      await refresh();
      // A browser may grant eviction protection; denial never prevents importing.
      if (files.length) navigator.storage?.persist?.().catch(() => {});
      message.textContent = results.join(' ');
    } finally { input.disabled = false; input.value = ''; }
  });
}

function renderSettings() {
  document.title = 'Settings — Reader';
  app.innerHTML = `<main class="library">
    <h1>Settings</h1>
    <p><a href="/ereader">Library</a></p>
    <p><label for="theme">Theme</label> <select id="theme"><option value="light">Light</option><option value="nord">Nord</option></select></p>
    <p><label>Words per minute <input id="wpm" type="number" min="50" max="1200" step="1"></label></p>
    <p><label><input id="pauses" type="checkbox"> Pause for punctuation and paragraphs</label></p>
    <h2>Backup</h2>
    <p>Books stay in this browser’s IndexedDB; progress and settings use localStorage. No books are uploaded.</p>
    <p>Backups contain settings and progress, not EPUB files. Keep your originals; import the same files to restore their saved positions.</p>
    <p>Clearing browser data can remove books and progress. Storage is separate for each browser profile, not an account.</p>
    <button id="export" type="button">Export backup</button>
    <p><label>Import backup <input id="import" type="file" accept="application/json,.json"></label></p>
    <p id="backup-status" role="status"></p>
    <p>Space: play/pause · ↑/↓: words · ←/→: pages · Shift+↑/↓: speed</p>
  </main>`;
  const state = store.read();
  const theme = document.querySelector('#theme');
  theme.value = state.settings.theme;
  theme.addEventListener('change', () => {
    store.settings({ theme: theme.value });
    applyTheme(theme.value);
  });
  const wpm = document.querySelector('#wpm');
  const pauses = document.querySelector('#pauses');
  wpm.value = state.settings.wpm;
  pauses.checked = state.settings.punctuationPauses;
  wpm.addEventListener('change', () => {
    if (wpm.value !== '' && wpm.checkValidity()) store.settings({ wpm: Number(wpm.value) });
    else wpm.value = store.read().settings.wpm;
  });
  pauses.addEventListener('change', () => store.settings({ punctuationPauses: pauses.checked }));
  document.querySelector('#export').addEventListener('click', exportBackup);
  document.querySelector('#import').addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file) return;
    const message = document.querySelector('#backup-status');
    try {
      if (file.size > 1_000_000) throw new Error('Backup is too large.');
      const text = await file.text();
      // Validate before asking to replace settings and matching book positions.
      validateState(JSON.parse(text));
      if (!confirm('Replace settings and saved positions for books in this backup?')) return;
      if (!store.import(text)) throw new Error('Import could not be saved in this browser.');
      warning.hidden = true;
      const state = store.read();
      wpm.value = state.settings.wpm;
      pauses.checked = state.settings.punctuationPauses;
      theme.value = state.settings.theme;
      applyTheme(theme.value);
      message.textContent = 'Backup imported.';
    } catch (error) {
      message.textContent = `Unable to import backup: ${error.message}`;
    } finally { event.target.value = ''; }
  });
}

function exportBackup() {
  const url = URL.createObjectURL(new Blob([store.export()], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `ereader-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
