# Reader

A minimal static EPUB reader with Light and Nord themes: the book on the left,
one selected word on the right. No accounts, database server, or book uploads.

## Run

```sh
npm install
npm run dev
```

- `/ereader`: your browser's library, Add EPUB, removal controls, and a Settings link.
- `/settings`: theme, reading speed, punctuation pauses, and backup export/import.
- `/ereader/<book-id>`: reader, without navigation links or a toolbar.
- `/`: redirects to `/ereader`.

Use browser Back or enter `/ereader` to return from reading. Narrow screens show
only the book. EPUB imports require a secure context (HTTPS, or localhost for
development) for content hashing.

## Personal books and storage

The app ships with **no EPUBs**. Users choose their own local files, which are
parsed and stored in **IndexedDB** (`ereader-library`, `books` object store) in
that browser profile. File contents are never uploaded. Different browsers,
devices, origins, and browser profiles have separate libraries; this is not
account-based storage. Users sharing one browser profile share its library.

`src/local-books.js` manages imports, metadata, lookup, and removal. Each file
gets a SHA-256-based ID: importing identical bytes again does not duplicate it,
and removing/reimporting the same file restores its saved progress. Imports
are limited to 100 MB per file. The prototype's original edition keeps its
legacy `pnp` ID based on a fingerprint, preserving earlier saved progress when
the user imports that edition; the fingerprint does not include book content.
A book URL alone does not share its contents with another user.

`src/state.js` stores validated version-1 settings and per-book EPUB CFI
positions under `ereader:state:v1` in **localStorage**. A CFI identifies text
rather than a viewport-dependent page number. Words save as they change;
manual page navigation saves the page's starting position. Reopening is paused.
Unreadable state is not silently overwritten; a warning offers backup export.
Light is the default for older saves without a theme.

Settings-page backups contain **settings and progress, not EPUB files**. Keep
original EPUB files separately. Import the same files in another browser along
with the JSON backup to restore positions. Backup import validates the file,
asks for confirmation, and retains progress for books absent from the backup.

The app requests persistent storage after import when supported, but permission
is not guaranteed. Clearing site data, browser policies, storage eviction, or
private browsing can still remove books and progress. Keep a stable production
origin: preview URLs and different domains have separate storage. There is no
automatic cloud sync. Concurrent reading of the same book uses the latest write.

### Repository note

`*.epub` is ignored and the original local `pnp.epub` is no longer tracked or
bundled. It remains on the developer's disk. **Earlier Git commits still contain
that file**: removing it from the current tree does not remove it from history.
If publishing the source repository without any historical EPUB content, use
a fresh repository from the current tree or explicitly rewrite history before
publishing. No history rewrite has been performed automatically.

## Reading controls

- Click a word: highlight it in red and show it in the word panel.
- Up/down: next/previous word, crossing pages automatically.
- Left/right: next/previous page, clearing the selection.
- Space: toggle playback, initially 300 WPM.
- Shift+Up/down: adjust speed by 50 WPM, bounded to 50–1200 WPM.

Without a selection, up starts at the first visible word and down at the last.
Clicking, manual navigation, or hiding the tab pauses playback. A speed change
applies after the currently scheduled interval.

Punctuation stays with its word. At 300 WPM, normal words display for 200 ms,
comma/semicolon/colon/dash endings for 300 ms, sentence endings for 400 ms, and
paragraph/heading endings for 600 ms. Delays scale with speed, do not stack,
and can be disabled in Settings. Effective average WPM is lower with pauses.

## Static deployment

For Netlify or Cloudflare Pages:

1. Connect a repository or upload `dist/` after running `npm run build`.
2. Build command: `npm run build`; output directory: `dist`.
3. Use a Node version supported by Vite (Node 22.12+ recommended).
4. Verify direct navigation/reload of `/settings` and `/ereader/<book-id>`.

`public/_redirects` supplies deep-link rewrites for those hosts. This setup
assumes deployment at the domain root, with assets served from `/assets`.
Other hosts need equivalent rewrites to `index.html`. GitHub Pages needs a
separate workaround for these clean URLs. No backend/functions are required,
and nothing has been deployed automatically.

```sh
npm run build
npm run preview
```

The production output contains application code, styles, HTML, and redirects,
not imported or local EPUBs. A content security policy restricts remote resource
loads; EPUB scripts are disabled. These measures do not constitute a complete
security audit of EPUB parsing. Do not expose the development server publicly.

## Implementation and limitations

Plain HTML/CSS/JavaScript, Vite, and EPUB.js. The word highlight uses the CSS
Custom Highlight API and text ranges, preserving inline markup and indentation;
a current browser is required. The xmldom override patches EPUB.js's legacy XML
dependency.

The reader retains the prototype's text-only presentation: it hides images and
captions, restores illustrated initials using `.letra`, and starts at Chapter I
when available. This cleanup is edition-specific; arbitrary EPUBs, especially
fixed-layout books, can need further support. DRM-protected EPUBs and PDFs are
not supported.

## Verify

```sh
npx playwright install chromium
npm test
npm run build
```

Tests generate a small synthetic EPUB at runtime, so no personal book files are
needed in the repository. Coverage includes rendering, navigation, punctuation,
playback, speed changes, themes, settings routes, imports/removal/deduplication,
profile isolation, saved positions, backups, and storage failures.
