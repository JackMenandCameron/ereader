# Reader — milestone 3

Run `npm install`, then `npm run dev`, and open http://127.0.0.1:5173.

A plain HTML/CSS/JavaScript app using EPUB.js and Vite, loading the existing
`pnp.epub` locally without uploads or CDN dependencies. Opens Chapter I of
Pride and Prejudice, skipping the cover/front matter and hiding illustrations.

One viewport-sized text page occupies the left half of the desktop window;
the right half stays empty until the speed-reading milestone. Narrow screens
use the full width. Right/left arrow keys turn one page forward/backward,
including after clicking inside the book. Click a word to select it with red
text and no background fill; selecting another word replaces the highlight,
and turning pages clears it. No playback yet.

`src/word-selection.js` uses text ranges and the CSS Custom Highlight API
(requires a current browser), avoiding markup changes or pagination shifts.
Inline fragments are joined for word detection, including illustrated initials.
The selection retains its text and EPUB CFI location for the next milestone.

Verification: `npm test` checks desktop/mobile rendering, visible opening text,
black text, browser errors, a failed book request, keyboard page navigation,
illustrated initials, hidden captions, and click-to-select word highlighting. For a fresh setup, run
`npx playwright install chromium` first. `npm run build` creates `dist/`.

The xmldom override updates EPUB.js's legacy XML dependency to a patched version.
