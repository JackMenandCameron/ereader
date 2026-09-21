// Keep punctuation and hyphenated words intact, with offsets into the source
// text so highlights can span inline markup without changing the book's DOM.
export function readingTokens(text) {
  const tokens = [];
  let pendingStart;
  for (const match of text.matchAll(/\S+/gu)) {
    const start = match.index;
    const end = start + match[0].length;
    const hasWord = /[\p{L}\p{N}]/u.test(match[0]);
    if (hasWord) {
      tokens.push({ start: pendingStart ?? start, end });
      pendingStart = undefined;
    } else if (/^[“‘«‹([{]+$/u.test(match[0]) || !tokens.length) {
      pendingStart ??= start;
    } else {
      tokens.at(-1).end = end;
    }
  }
  if (pendingStart !== undefined && tokens.length) tokens.at(-1).end = text.trimEnd().length;
  return tokens.map((token, index) => {
    const value = text.slice(token.start, token.end).replace(/\s+/gu, ' ');
    return {
      ...token,
      text: value,
      sentenceEnd: /[.!?…][\s”’"'»\)\]}]*$/u.test(value),
      clauseEnd: /[,;:—–][\s”’"'»\)\]}]*$/u.test(value),
      paragraphEnd: index === tokens.length - 1,
    };
  });
}

export function readingDelay(selection, wpm = 300) {
  const base = 60_000 / wpm;
  if (selection?.paragraphEnd) return base * 3;
  if (selection?.sentenceEnd) return base * 2;
  if (selection?.clauseEnd) return base * 1.5;
  return base;
}
