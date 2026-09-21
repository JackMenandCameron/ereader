# Reader — milestone 4

Run `npm install`, then `npm run dev`, and open http://127.0.0.1:5173.

A plain HTML/CSS/JavaScript app using EPUB.js and Vite, loading the existing
`pnp.epub` locally without uploads or CDN dependencies. Opens Chapter I of
Pride and Prejudice, skipping the cover/front matter and hiding illustrations.

One viewport-sized text page occupies the left half of the desktop window;
the right half displays the selected word in large, centered black text.
The panel is blank until a word is selected and clears on page turns.
Narrow screens use the full width for the book and hide the word panel. Right/left arrow keys turn one page forward/backward,
including after clicking inside the book. Click a word to select it with red
text and no background fill; selecting another word replaces the highlight,
and manual left/right page turns clear it. Up selects the next word; down
selects the previous word, moving pages automatically when needed. Without a
selection, up starts at the first visible word and down at the last visible
word. Space toggles playback at a default base pace of 300 WPM, starting
from the selection or the first visible word. Shift+Up increases speed by 50 WPM;
Shift+Down decreases it by 50 WPM, bounded to 50–1200 WPM. These shortcuts do
not pause playback or change the selection. The current word finishes its
scheduled interval; subsequent words use the new speed. Speed resets on reload.
Punctuation delays scale with speed. At 300 WPM, ordinary words display for 200 ms,
words ending in commas, semicolons, colons, or em/en dashes for 300 ms,
sentence endings for 400 ms, and paragraph/heading endings for 600 ms (not
cumulative). These pauses lower the effective average reading speed.
Punctuation stays attached to words, including quotes, periods, and parentheses;
hyphenated words and contractions remain intact. The book retains its source
paragraph indentation, while the right-hand word stays centered. Clicking, manual arrow navigation,
or hiding the tab pauses playback; reaching the end also stops it.
The red highlight and right-hand display stay synchronized.

`src/word-selection.js` uses text ranges and the CSS Custom Highlight API
(requires a current browser), avoiding markup changes or pagination shifts.
Inline fragments are joined for word detection, including illustrated initials.
The selection retains its text and EPUB CFI location for the next milestone.

Verification: `npm test` checks desktop/mobile rendering, visible opening text,
black text, browser errors, a failed book request, keyboard page navigation,
illustrated initials, hidden captions, click-to-select word highlighting,
synchronized display in the right-hand panel, word navigation across pages,
playback timing, pause/resume, manual-navigation interruption, punctuation,
paragraph pauses, and preservation of source indentation. For a fresh setup, run
`npx playwright install chromium` first. `npm run build` creates `dist/`.

The xmldom override updates EPUB.js's legacy XML dependency to a patched version.
