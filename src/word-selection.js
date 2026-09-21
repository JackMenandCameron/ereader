// Use ranges rather than wrapping words, preserving the EPUB's layout and markup.
export function createWordSelection() {
  const segmenter = new Intl.Segmenter('en', { granularity: 'word' });
  let activeWindow;
  let selected = null;

  function clear() {
    activeWindow?.CSS.highlights.delete('selected-word');
    activeWindow = undefined;
    selected = null;
  }

  function attach(contents) {
    const doc = contents.document;
    const win = doc.defaultView;
    const style = doc.createElement('style');
    style.textContent = '::highlight(selected-word) { background-color: transparent; color: #f00; }';
    doc.head.append(style);

    doc.addEventListener('click', event => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      // Leave native drag-to-select behavior alone.
      if (!win.getSelection().isCollapsed) return;

      const caret = doc.caretPositionFromPoint?.(event.clientX, event.clientY);
      const fallback = !caret && doc.caretRangeFromPoint?.(event.clientX, event.clientY);
      const node = caret?.offsetNode || fallback?.startContainer;
      const offset = caret?.offset ?? fallback?.startOffset;
      if (!node || node.nodeType !== win.Node.TEXT_NODE) return;
      const block = node.parentElement.closest('p, h1, h2, h3, h4, h5, h6, li, td, blockquote, div');
      if (!block) return;

      // Join inline text so initials and italicized fragments remain whole words.
      const walker = doc.createTreeWalker(block, win.NodeFilter.SHOW_TEXT, {
        acceptNode(text) {
          for (let element = text.parentElement; element; element = element.parentElement) {
            const css = win.getComputedStyle(element);
            if (css.display === 'none' || css.visibility === 'hidden') return win.NodeFilter.FILTER_REJECT;
            if (element === block) break;
          }
          return win.NodeFilter.FILTER_ACCEPT;
        },
      });
      const nodes = [];
      let text = '';
      let clickedOffset;
      while (walker.nextNode()) {
        const current = walker.currentNode;
        if (current === node) clickedOffset = text.length + offset;
        nodes.push({ node: current, start: text.length, end: text.length + current.length });
        text += current.textContent;
      }
      if (clickedOffset === undefined) return;

      for (const part of segmenter.segment(text)) {
        if (!part.isWordLike) continue;
        const start = part.index;
        const end = start + part.segment.length;
        if (clickedOffset < start || clickedOffset > end) continue;
        const first = nodes.find(item => item.end > start);
        const last = nodes.find(item => item.end >= end);
        const range = doc.createRange();
        range.setStart(first.node, start - first.start);
        range.setEnd(last.node, end - last.start);
        // Caret hit-testing can snap blank-space clicks to nearby text.
        const hit = [...range.getClientRects()].some(rect =>
          event.clientX >= rect.left && event.clientX <= rect.right &&
          event.clientY >= rect.top && event.clientY <= rect.bottom);
        if (!hit) continue;

        clear();
        win.CSS.highlights.set('selected-word', new win.Highlight(range));
        activeWindow = win;
        selected = { text: part.segment, cfi: contents.cfiFromRange(range) };
        return;
      }
    });
  }

  return { attach, clear, get selected() { return selected; } };
}
