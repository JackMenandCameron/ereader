import { readingTokens } from './reading-tokens.js';

// Text ranges preserve the EPUB's markup and pagination.
export function createWordSelection(onChange = () => {}) {
  const indexes = new WeakMap();
  let active = null;
  let selected = null;
  let moving = false;

  function clear() {
    active?.contents.document.defaultView?.CSS.highlights.delete('selected-word');
    active = null;
    selected = null;
    onChange(null);
  }

  function wordsFor(contents) {
    if (indexes.has(contents)) return indexes.get(contents);
    const doc = contents.document;
    const win = doc.defaultView;
    const walker = doc.createTreeWalker(doc.body, win.NodeFilter.SHOW_TEXT);
    const words = [];
    let block;
    let nodes = [];
    let text = '';
    function flush() {
      for (const token of readingTokens(text)) {
        const first = nodes.find(item => item.end > token.start);
        const last = nodes.find(item => item.end >= token.end);
        const range = doc.createRange();
        range.setStart(first.node, token.start - first.start);
        range.setEnd(last.node, token.end - last.start);
        words.push({ ...token, range });
      }
      nodes = [];
      text = '';
    }
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.parentElement.closest('script, style')) continue;
      let hidden = false;
      for (let element = node.parentElement; element; element = element.parentElement) {
        const css = win.getComputedStyle(element);
        if (css.display === 'none' || css.visibility === 'hidden') { hidden = true; break; }
      }
      if (hidden) continue;
      const parent = node.parentElement.closest('p, h1, h2, h3, h4, h5, h6, li, td, blockquote, div') || doc.body;
      if (parent !== block) { flush(); block = parent; }
      nodes.push({ node, start: text.length, end: text.length + node.length });
      text += node.textContent;
    }
    flush();
    indexes.set(contents, words);
    return words;
  }

  function select(contents, index) {
    const word = wordsFor(contents)[index];
    clear();
    const win = contents.document.defaultView;
    win.CSS.highlights.set('selected-word', new win.Highlight(word.range));
    active = { contents, index };
    selected = {
      text: word.text, cfi: contents.cfiFromRange(word.range),
      sentenceEnd: word.sentenceEnd, clauseEnd: word.clauseEnd,
      paragraphEnd: word.paragraphEnd,
    };
    onChange(selected);
  }

  function isVisible(contents, word) {
    const iframe = contents.document.defaultView.frameElement.getBoundingClientRect();
    const viewport = document.querySelector('#reader').getBoundingClientRect();
    return [...word.range.getClientRects()].some(rect =>
      rect.width > 0 && rect.height > 0 &&
      rect.right + iframe.left > viewport.left && rect.left + iframe.left < viewport.right &&
      rect.bottom + iframe.top > viewport.top && rect.top + iframe.top < viewport.bottom);
  }

  async function move(direction, rendition) {
    moving = true;
    try {
      let contents = active?.contents || rendition.getContents()[0];
      if (!contents) return false;
      let words = wordsFor(contents);
      let index;
      if (active) {
        index = active.index + direction;
      } else {
        const visible = words.map((word, index) => ({ word, index }))
          .filter(({ word }) => isVisible(contents, word));
        const edge = direction > 0 ? visible[0] : visible.at(-1);
        if (edge) { select(contents, edge.index); return true; }
        index = direction > 0 ? words.length : -1;
      }
      // EPUB sections can span many pages; skip sections with no readable text.
      while (index < 0 || index >= words.length) {
        const section = rendition.book.spine.get(contents.sectionIndex);
        const adjacent = direction > 0 ? section.next() : section.prev();
        if (!adjacent) return false;
        await rendition.display(adjacent.href);
        contents = rendition.getContents()[0];
        words = wordsFor(contents);
        index = direction > 0 ? 0 : words.length - 1;
      }
      if (!isVisible(contents, words[index])) {
        await rendition.display(contents.cfiFromRange(words[index].range));
      }
      select(contents, index);
      return true;
    } finally {
      moving = false;
    }
  }

  function attach(contents) {
    const doc = contents.document;
    const win = doc.defaultView;
    const style = doc.createElement('style');
    style.textContent = '::highlight(selected-word) { background-color: transparent; color: #f00; }';
    doc.head.append(style);
    doc.addEventListener('click', event => {
      if (moving || event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      if (!win.getSelection().isCollapsed) return;
      const caret = doc.caretPositionFromPoint?.(event.clientX, event.clientY);
      const fallback = !caret && doc.caretRangeFromPoint?.(event.clientX, event.clientY);
      const node = caret?.offsetNode || fallback?.startContainer;
      const offset = caret?.offset ?? fallback?.startOffset;
      if (!node || node.nodeType !== win.Node.TEXT_NODE) return;
      const index = wordsFor(contents).findIndex(({ range }) => {
        if (!range.isPointInRange(node, offset)) return false;
        return [...range.getClientRects()].some(rect =>
          event.clientX >= rect.left && event.clientX <= rect.right &&
          event.clientY >= rect.top && event.clientY <= rect.bottom);
      });
      if (index >= 0) select(contents, index);
    });
  }

  return { attach, clear, move, get selected() { return selected; } };
}
