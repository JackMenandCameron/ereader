import ePub from 'epubjs';
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
    'img, svg, figure, .figcenter': { 'display': 'none !important' },
    'a': { 'text-decoration': 'none !important', 'pointer-events': 'none' },
  });

  // Start at the story rather than the cover or publisher's front matter.
  const firstChapter = navigation.toc.find(item => /^chapter\s+(i|1)\.?$/i.test(item.label.trim()));
  await rendition.display(firstChapter?.href);
  status.hidden = true;
  document.querySelector('#reader').dataset.ready = 'true';
}

openBook().catch(error => {
  console.error(error);
  status.textContent = 'Unable to open the book. Reload to try again.';
});
