import ePub from 'epubjs';
import { createWordSelection } from './word-selection.js';
import { createPlayback } from './playback.js';
import { readingDelay } from './reading-tokens.js';
import { themes } from './themes.js';

export async function openReader(entry, store) {
  const status = document.querySelector('#status');
  const book = ePub();
  const savedState = store.read();
  const theme = themes[savedState.settings.theme];
  let canSave = false;
  await book.open(entry.data, 'binary');
  const navigation = await book.loaded.navigation;
  document.title = `${book.packaging.metadata.title} — Reader`;

  const rendition = book.renderTo('reader', {
    width: '100%',
    height: '100%',
    flow: 'paginated',
    spread: 'none',
    allowScriptedContent: false,
  });

  const wordDisplay = document.querySelector('#selected-word');
  const wordSelection = createWordSelection(selection => {
    wordDisplay.textContent = selection?.text ?? '';
    if (canSave && selection) store.progress(entry.id, selection.cfi, 'word');
  }, theme.highlight);

  // Manual navigation and playback share a queue to avoid overlapping renders.
  let turns = Promise.resolve();
  function enqueue(action) {
    const result = turns.then(action);
    turns = result.catch(() => {});
    return result;
  }
  function showNavigationError(error) {
    playback.pause();
    console.error(error);
    status.textContent = 'Unable to move through the book. Try again.';
    status.hidden = false;
  }
  let wordsPerMinute = savedState.settings.wpm;
  const playback = createPlayback({
    hasSelection: () => wordSelection.selected !== null,
    getDelay: () => readingDelay(savedState.settings.punctuationPauses ? wordSelection.selected : null, wordsPerMinute),
    advance: isCurrent => enqueue(async () => {
      if (!isCurrent()) return false;
      const advanced = await wordSelection.move(1, rendition);
      status.hidden = true;
      return advanced;
    }),
    onError: showNavigationError,
  });
  document.addEventListener('pointerdown', playback.pause);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) playback.pause();
  });
  window.addEventListener('pagehide', playback.pause);

  rendition.hooks.content.register(contents => {
    contents.document.addEventListener('pointerdown', playback.pause);
    // Decorative initials contain real text: preserve it before hiding images.
    for (const initial of contents.document.querySelectorAll('.letra')) {
      for (const image of initial.querySelectorAll('img[alt]')) {
        image.replaceWith(contents.document.createTextNode(image.getAttribute('alt')));
      }
      // Source formatting must not separate the initial from the rest of its word.
      initial.textContent = initial.textContent.trim();
    }
    wordSelection.attach(contents);
  });

  rendition.themes.default({
    'html': { 'color-scheme': `${theme.scheme} !important` },
    'body': { 'color': `${theme.foreground} !important`, 'background': `${theme.background} !important`,
      'font-family': 'Georgia, serif !important', 'font-size': '18px !important',
      'line-height': '1.6 !important' },
    '*': { 'color': `${theme.foreground} !important`, 'background-color': 'transparent !important' },
    'h2': { 'break-before': 'column', 'break-after': 'avoid', 'margin': '0 0 1em !important', 'font-size': '1.2em !important' },
    'h2 br': { 'display': 'none' },
    '.letra': { 'float': 'none !important', 'font-size': 'inherit !important', 'margin': '0 !important' },
    'p': { 'text-align': 'left !important' },
    // This milestone is text-only; omit the edition's decorative illustrations.
    'img, svg, figure, .figcenter, .caption': { 'display': 'none !important' },
    'a': { 'text-decoration': 'none !important', 'pointer-events': 'none' },
  });

  // Start at the story rather than the cover or publisher's front matter.
  const firstChapter = navigation.toc.find(item => /^chapter\s+(i|1)\.?$/i.test(item.label.trim()));
  const savedProgress = savedState.books[entry.id];
  let restored = false;
  if (savedProgress) {
    try {
      await rendition.display(savedProgress.cfi);
      if (savedProgress.kind === 'word') wordSelection.restore(rendition, savedProgress.cfi);
      restored = true;
    } catch (error) { console.warn('Saved position could not be restored.', error); }
  }
  if (!restored) await rendition.display(firstChapter?.href);
  canSave = true;
  rendition.on('relocated', location => {
    if (canSave && !wordSelection.selected && location.start?.cfi) {
      store.progress(entry.id, location.start.cfi, 'page');
    }
  });
  if (savedProgress && !restored) {
    const warning = document.querySelector('#storage-warning');
    warning.textContent = 'Saved position could not be restored; opened the beginning instead.';
    warning.hidden = false;
  }
  status.hidden = true;
  document.querySelector('#reader').dataset.ready = 'true';

  function onKeyDown(event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.target?.closest('input, textarea, select, button, [contenteditable]')) return;
    if (event.shiftKey) {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      event.preventDefault();
      if (event.repeat) return;
      wordsPerMinute = Math.max(50, Math.min(1200,
        wordsPerMinute + (event.key === 'ArrowUp' ? 50 : -50)));
      store.settings({ wpm: wordsPerMinute });
      return;
    }
    if (!['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', ' '].includes(event.key)) return;
    event.preventDefault();
    if (event.repeat) return;

    if (event.key === ' ') {
      playback.toggle();
      return;
    }
    playback.pause();
    const direction = event.key;
    enqueue(async () => {
      if (direction === 'ArrowUp' || direction === 'ArrowDown') {
        await wordSelection.move(direction === 'ArrowUp' ? 1 : -1, rendition);
        status.hidden = true;
        return;
      }
      const location = rendition.currentLocation();
      if (direction === 'ArrowRight' && !location.atEnd) {
        wordSelection.clear();
        await rendition.next();
      }
      if (direction === 'ArrowLeft' && !location.atStart) {
        wordSelection.clear();
        await rendition.prev();
      }
      status.hidden = true;
    }).catch(showNavigationError);
  }

  document.addEventListener('keydown', onKeyDown);
  // EPUB.js forwards key events from the book's iframe when it has focus.
  rendition.on('keydown', onKeyDown);
}

