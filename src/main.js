import ePub from 'epubjs';
import { createWordSelection } from './word-selection.js';
import { createPlayback } from './playback.js';
import bookUrl from '../pnp.epub?url';
import './style.css';

const status = document.querySelector('#status');
const book = ePub();

async function openBook() {
  // Fetch explicitly so a missing file produces a visible error.
  const response = await fetch(bookUrl);
  if (!response.ok) throw new Error(`Book request failed (${response.status})`);
  await book.open(await response.arrayBuffer(), 'binary');
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
  });

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
  const playback = createPlayback({
    hasSelection: () => wordSelection.selected !== null,
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
    'body': { 'color': '#000 !important', 'background': '#fff !important',
      'font-family': 'Georgia, serif !important', 'font-size': '18px !important',
      'line-height': '1.6 !important' },
    '*': { 'color': '#000 !important', 'background-color': 'transparent !important' },
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
  await rendition.display(firstChapter?.href);
  status.hidden = true;
  document.querySelector('#reader').dataset.ready = 'true';

  function onKeyDown(event) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.target?.closest('input, textarea, select, [contenteditable]')) return;
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

openBook().catch(error => {
  console.error(error);
  status.textContent = 'Unable to open the book. Reload to try again.';
});
