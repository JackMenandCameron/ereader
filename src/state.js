import { themes } from './themes.js';

export const STORAGE_KEY = 'ereader:state:v1';
const defaults = () => ({ version: 1, settings: { wpm: 300, punctuationPauses: true, theme: 'light' }, books: {} });

export function validateState(value) {
  if (!value || value.version !== 1 || !value.settings || !value.books ||
      typeof value.books !== 'object' || Array.isArray(value.books)) throw new Error('Unsupported backup format.');
  // Older v1 saves/backups predate themes; preserve them with the light default.
  const { wpm, punctuationPauses, theme = 'light' } = value.settings;
  if (!Object.hasOwn(themes, theme)) throw new Error('Unsupported theme.');
  if (!Number.isInteger(wpm) || wpm < 50 || wpm > 1200 || typeof punctuationPauses !== 'boolean') {
    throw new Error('Invalid reading settings.');
  }
  const books = {};
  for (const [id, progress] of Object.entries(value.books)) {
    if (!/^[a-z0-9-]+$/.test(id) || ['__proto__', 'constructor', 'prototype'].includes(id) ||
        !progress || typeof progress.cfi !== 'string' || progress.cfi.length > 4096 ||
        !/^epubcfi\(.+\)$/.test(progress.cfi) || !['word', 'page'].includes(progress.kind) ||
        typeof progress.updatedAt !== 'string' || !Number.isFinite(Date.parse(progress.updatedAt))) {
      throw new Error('Invalid book progress.');
    }
    books[id] = { cfi: progress.cfi, kind: progress.kind, updatedAt: progress.updatedAt };
  }
  return { version: 1, settings: { wpm, punctuationPauses, theme }, books };
}

export function createStateStore(onWarning = () => {}) {
  let memory = defaults();
  let blocked = false;
  function read() {
    if (blocked) return memory;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      memory = raw === null ? defaults() : validateState(JSON.parse(raw));
    } catch {
      // Keep unreadable data untouched instead of silently overwriting it.
      blocked = true;
      onWarning('Browser storage is unavailable or unreadable. Changes will last only for this visit; export a backup before leaving.');
    }
    return memory;
  }
  function write(state) {
    memory = state;
    if (blocked) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch {
      blocked = true;
      onWarning('Progress could not be saved in this browser. Export a backup before leaving.');
    }
  }
  return {
    read,
    settings(patch) {
      const state = read();
      write(validateState({ ...state, settings: { ...state.settings, ...patch } }));
    },
    progress(id, cfi, kind) {
      const state = read();
      write(validateState({ ...state, books: { ...state.books,
        [id]: { cfi, kind, updatedAt: new Date().toISOString() },
      } }));
    },
    export() { return JSON.stringify(read(), null, 2); },
    import(text) {
      const incoming = validateState(JSON.parse(text));
      const current = read();
      // Explicitly confirmed imports may replace unreadable state, but never
      // remove progress for books absent from the backup.
      blocked = false;
      write({ ...incoming, books: { ...current.books, ...incoming.books } });
      return !blocked;
    },
  };
}
