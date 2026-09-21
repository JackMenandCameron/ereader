# Reader — milestone 1

Run `npm install`, then `npm run dev`, and open http://127.0.0.1:5173.

A plain HTML/CSS/JavaScript app using EPUB.js and Vite, loading the existing
`pnp.epub` locally without uploads or CDN dependencies. Opens Chapter I of
Pride and Prejudice, skipping the cover/front matter and hiding illustrations.

One viewport-sized text page occupies the left half of the desktop window;
the right half stays empty until the speed-reading milestone. Narrow screens
use the full width. No navigation, highlighting, or playback yet.

Verification: `npm test` checks desktop/mobile rendering, visible opening text,
black text, browser errors, and a failed book request. For a fresh setup, run
`npx playwright install chromium` first. `npm run build` creates `dist/`.

The xmldom override updates EPUB.js's legacy XML dependency to a patched version.
