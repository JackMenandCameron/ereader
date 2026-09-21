import { test, expect } from '@playwright/test';
import { readingTokens, readingDelay } from '../src/reading-tokens.js';

test('preserves quotes, punctuation, contractions, and hyphenated words', () => {
  const text = '“Hello,” she said. (Don’t go!) Well-known words…';
  const tokens = readingTokens(text);
  expect(tokens.map(token => token.text)).toEqual([
    '“Hello,”', 'she', 'said.', '(Don’t', 'go!)', 'Well-known', 'words…',
  ]);
  for (const token of tokens) expect(text.slice(token.start, token.end)).toBe(token.text);
  expect(tokens.map(token => readingDelay(token))).toEqual([300, 200, 400, 200, 400, 200, 600]);
});

test('attaches spaced punctuation and ignores whitespace-only blocks', () => {
  expect(readingTokens('“ Hello ! ” Next.').map(token => token.text)).toEqual(['“ Hello ! ”', 'Next.']);
  expect(readingTokens('\n  \t')).toEqual([]);
  expect(readingTokens('...')).toEqual([]);
  expect(readingTokens('Hello\nworld').map(token => token.text)).toEqual(['Hello', 'world']);
});

test('clause punctuation adds a shorter pause without delaying internal punctuation', () => {
  const tokens = readingTokens('Wait, “yes;” (now:) stop— or – continue well-known 1,000 12:30 end,');
  expect(tokens.map(token => readingDelay(token))).toEqual([300, 300, 300, 300, 300, 200, 200, 200, 200, 600]);
  expect(readingDelay({ sentenceEnd: true, clauseEnd: true })).toBe(400);
  expect(readingDelay({ paragraphEnd: true, clauseEnd: true })).toBe(600);
});

test('speed changes scale word and punctuation delays together', () => {
  expect(readingDelay({}, 600)).toBe(100);
  expect(readingDelay({ clauseEnd: true }, 600)).toBe(150);
  expect(readingDelay({ sentenceEnd: true }, 600)).toBe(200);
  expect(readingDelay({ paragraphEnd: true }, 600)).toBe(300);
  expect(readingDelay({}, 150)).toBe(400);
});
