import JSZip from 'jszip';

// A tiny synthetic book; no personal EPUB is required by the test suite.
export async function makeBook() {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip');
  zip.file('META-INF/container.xml', `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);
  zip.file('book.opf', `<?xml version="1.0"?><package version="3.0" unique-identifier="id" xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">reader-test</dc:identifier><dc:title>Sample Book</dc:title><dc:creator>Example Author</dc:creator><dc:language>en</dc:language></metadata><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/></manifest><spine><itemref idref="chapter"/></spine></package>`);
  zip.file('nav.xhtml', `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><ol><li><a href="chapter.xhtml#pgepubid00022">Chapter I.</a></li><li><a href="chapter.xhtml#pgepubid00028">Chapter II.</a></li></ol></nav></body></html>`);
  zip.file('chapter.xhtml', `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Sample Book</title><style>p {text-indent:4%;margin:.2em 0;} .nind {text-indent:0%;} .letra {float:left;font-size:250%;} h2 {text-align:center;}</style></head><body>
    <h2 id="pgepubid00022">Chapter I.</h2>
    <p class="nind"><span class="letra">I</span>T is a truth universally acknowledged, that a single man in possession of a good fortune must be in want of a wife.</p>
    <p>However little known the feelings or views of such a man may be, the story continues here with example text for a reader.</p>
    ${Array.from({ length: 24 }, () => '<p>The reader follows a quiet path through the garden. “Look,” she said, “there is another page.” Words appear one at a time, while the story remains beside them.</p>').join('')}
    <h2 id="pgepubid00028"><span class="caption">I hope Mr. Bingley will like it.</span>CHAPTER II.</h2>
    <p class="nind"><span class="letra"><img alt="M" src="data:image/png;base64,iVBORw0KGgo="/></span>R. BENNET was among the earliest of those who waited. This paragraph tests an illustrated initial.</p>
    <p>The next paragraph has more words to read.</p>
  </body></html>`);
  return zip.generateAsync({ type: 'nodebuffer' });
}
