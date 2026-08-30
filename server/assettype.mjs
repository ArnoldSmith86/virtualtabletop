// Library assets are stored content-addressed and without a file extension, so the only thing
// that can name their type when they are served (/assets/:name in server.mjs) is the content
// itself. This used to be a chain of single-byte comparisons that knew five formats and sent
// everything else with no Content-Type at all - which is how an asset in a format we do not
// happen to recognise silently becomes "whatever the browser guesses", and how the 773 bundled
// mp3s were served as image/jpeg (an mp3 frame header starts with 0xff, just like a JPEG).
//
// The list is deliberately wider than what the library uses today: recognising a format we do
// not produce costs one entry and stops a future asset from breaking in that same silent way.

// Compares a byte sequence at a fixed offset. Strings are read as latin1 so that the container
// tags below ("RIFF", "ftyp", ...) can be written as the text they are.
function matches(content, offset, signature) {
  if(typeof signature == 'string')
    return content.toString('latin1', offset, offset + signature.length) == signature;
  return signature.every((byte, index)=>content[offset+index] === byte);
}

// The brand of an ISO base media file (mp4 and everything derived from it) sits right after the
// "ftyp" tag. Only the brands we could plausibly be handed are named; anything else stays
// unknown rather than being guessed at as video/mp4.
const isoBrands = {
  avif: 'image/avif',
  avis: 'image/avif',
  heic: 'image/heic',
  heix: 'image/heic',
  mif1: 'image/heif',
  isom: 'video/mp4',
  iso2: 'video/mp4',
  mp41: 'video/mp4',
  mp42: 'video/mp4',
  M4V:  'video/mp4',
  M4A:  'audio/mp4'
};

// Ordered: the first match wins, so the specific patterns come before the loose ones. JPEG in
// particular has to be tested before the mp3 frame header, and both RIFF forms before either.
const signatures = [
  { type: 'image/jpeg',    test: c=>matches(c, 0, [ 0xff, 0xd8, 0xff ]) },
  { type: 'image/png',     test: c=>matches(c, 0, [ 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a ]) },
  { type: 'image/gif',     test: c=>matches(c, 0, 'GIF8') },
  { type: 'image/webp',    test: c=>matches(c, 0, 'RIFF') && matches(c, 8, 'WEBP') },
  { type: 'audio/wav',     test: c=>matches(c, 0, 'RIFF') && matches(c, 8, 'WAVE') },
  // "BM" alone is two very ordinary bytes, so the size of the DIB header behind it has to be one
  // of the handful that exist before we call something a bitmap
  { type: 'image/bmp',     test: c=>matches(c, 0, 'BM') && c.length >= 18 && [ 12, 16, 40, 52, 56, 64, 108, 124 ].includes(c.readUInt32LE(14)) },
  { type: 'audio/ogg',     test: c=>matches(c, 0, 'OggS') },
  { type: 'audio/flac',    test: c=>matches(c, 0, 'fLaC') },
  { type: 'video/webm',    test: c=>matches(c, 0, [ 0x1a, 0x45, 0xdf, 0xa3 ]) },
  // an mp3 either carries an ID3 tag or starts straight on a frame header: eleven set sync bits
  { type: 'audio/mpeg',    test: c=>matches(c, 0, 'ID3') || (c[0] === 0xff && (c[1] & 0xe0) === 0xe0) },
  // SVGs are the only text format in here, and they are stored with or without an xml prolog
  { type: 'image/svg+xml', test: isSVG }
];

// What XML allows to stand before the root element, each written as the whole run to skip: a
// comment - which is where Illustrator writes its "Generator" line and where a licence header
// usually goes - a processing instruction, the <?xml ...?> prolog among them, and a doctype
// with or without an internal subset. The subset ends at the first ] that is not inside a quoted
// string, because an entity value is allowed to contain one. Whoever uploads an asset writes
// these bytes and the sniffer runs on every request for it, so no two parts of a pattern may be
// able to consume the same run - every alternative starts on a character the others exclude - so
// an unterminated doctype fails in one pass over the 64KB below rather than backtracking
// through it.
const beforeRootElement = [
  /^<!--[\s\S]*?-->/,
  /^<\?[\s\S]*?\?>/,
  /^<!doctype\s+(?:[a-zA-Z_][\w.-]*:)?svg[^[>]*(?:\[(?:[^\]"']|"[^"]*"|'[^']*')*\][^>]*)?>/i
];

// Assets are served from the site's own origin and anyone can PUT one, so what we call an SVG
// gets to run script there - "it starts with a <" is not enough to earn that. Everything XML
// allows in front of the root element is skipped, and what is left has to be the <svg> tag
// itself, under whatever namespace prefix the document binds it to - "<svg:svg xmlns:svg=...>",
// the way some XML pipelines write it. Every one of the 1800 markup assets in the library passes;
// anything else keeps the no Content-Type answer the caller gives unknown bytes. The window is
// generous because a licence header can be a few KB and the tag has to still be inside it.
function isSVG(content) {
  let rest = content.toString('utf8', 0, 65536).replace(/^\uFEFF/, '').trimStart();
  for(;;) {
    const skip = beforeRootElement.map(part=>rest.match(part)).find(Boolean);
    if(!skip)
      return /^<(?:[a-zA-Z_][\w.-]*:)?svg[\s/>]/i.test(rest);
    rest = rest.slice(skip[0].length).trimStart();
  }
}

// Returns the Content-Type for an asset buffer, or null when the bytes say nothing recognisable.
// The caller decides what to do with that - server.mjs logs it and sets no type, which leaves
// express to send it as application/octet-stream: no rendering, but no guessing either.
function contentType(content) {
  if(!content || content.length < 4)
    return null;

  if(matches(content, 4, 'ftyp')) {
    const brand = content.toString('latin1', 8, 12).replace(/[\s\0]+$/, '');
    if(isoBrands[brand])
      return isoBrands[brand];
  }

  for(const { type, test } of signatures)
    if(test(content))
      return type;

  return null;
}

export default {
  contentType
}
