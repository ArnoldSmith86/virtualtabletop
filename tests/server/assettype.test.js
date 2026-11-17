import AssetType from '../../server/assettype.mjs';

// Builds a buffer that starts with the given signature bytes/strings and is padded to a
// realistic length - the sniffer reads up to offset 12, so a two-byte fixture would pass for
// the wrong reason.
function asset(...parts) {
  const head = parts.map(part=>typeof part == 'string' ? Buffer.from(part, 'latin1') : Buffer.from(part));
  return Buffer.concat([ ...head, Buffer.alloc(32) ]);
}

describe('server/assettype.mjs', function() {
  test('names the formats the public library actually ships', function() {
    expect(AssetType.contentType(asset([ 0xff, 0xd8, 0xff, 0xe0 ]))).toEqual('image/jpeg');
    expect(AssetType.contentType(asset([ 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a ]))).toEqual('image/png');
    expect(AssetType.contentType(asset('GIF89a'))).toEqual('image/gif');
    expect(AssetType.contentType(asset('RIFF', [ 0, 0, 0, 0 ], 'WEBPVP8 '))).toEqual('image/webp');
    expect(AssetType.contentType(asset('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toEqual('image/svg+xml');
    expect(AssetType.contentType(asset('<?xml version="1.0"?><svg></svg>'))).toEqual('image/svg+xml');
  });

  // both of these were served as image/jpeg by the single-byte version: an mp3 frame header and
  // a JPEG marker both start with 0xff, and RIFF was assumed to always mean WebP
  test('tells the audio formats apart from the images they used to be confused with', function() {
    expect(AssetType.contentType(asset('ID3', [ 3, 0, 0 ]))).toEqual('audio/mpeg');
    expect(AssetType.contentType(asset([ 0xff, 0xfb, 0x90, 0x00 ]))).toEqual('audio/mpeg');
    expect(AssetType.contentType(asset('RIFF', [ 0, 0, 0, 0 ], 'WAVEfmt '))).toEqual('audio/wav');
    expect(AssetType.contentType(asset('OggS'))).toEqual('audio/ogg');
    expect(AssetType.contentType(asset('fLaC'))).toEqual('audio/flac');
  });

  // the point of the exercise: a format nobody uses today still arrives with a Content-Type
  test('names the formats an asset could arrive in tomorrow', function() {
    expect(AssetType.contentType(asset([ 0, 0, 0, 0x20 ], 'ftyp', 'avif'))).toEqual('image/avif');
    expect(AssetType.contentType(asset([ 0, 0, 0, 0x18 ], 'ftyp', 'mp42'))).toEqual('video/mp4');
    expect(AssetType.contentType(asset([ 0x1a, 0x45, 0xdf, 0xa3 ]))).toEqual('video/webm');
    expect(AssetType.contentType(asset('BM', [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 ], [ 40, 0, 0, 0 ]))).toEqual('image/bmp');
  });

  // a deck that imports a family from Google Fonts stores one font file per style as an asset, and those
  // are served through the same route as every other one
  test('names the font formats a deck can import', function() {
    expect(AssetType.contentType(asset([ 0x00, 0x01, 0x00, 0x00 ], [ 0x00, 0x11, 0x01, 0x00 ]))).toEqual('font/ttf');
    expect(AssetType.contentType(asset('true', [ 0, 0, 0, 0 ]))).toEqual('font/ttf');
    expect(AssetType.contentType(asset('OTTO'))).toEqual('font/otf');
    expect(AssetType.contentType(asset('ttcf'))).toEqual('font/collection');
    expect(AssetType.contentType(asset('wOFF'))).toEqual('font/woff');
    expect(AssetType.contentType(asset('wOF2'))).toEqual('font/woff2');
  });

  // "BM" is two bytes that anything can begin with, so the DIB header size behind them decides
  test('does not call every asset that begins BM a bitmap', function() {
    expect(AssetType.contentType(asset('BMorewhateverthisis'))).toEqual(null);
  });

  // an asset is served from our own origin, so image/svg+xml is permission to run script there.
  // The library's SVGs open in all of these ways; markup that is not an SVG gets no type at all.
  test('calls an SVG an SVG and other markup nothing', function() {
    expect(AssetType.contentType(asset([ 0xef, 0xbb, 0xbf ], '<?xml version="1.0"?>\n<!-- a comment -->\n<svg/>'))).toEqual('image/svg+xml');
    expect(AssetType.contentType(asset('<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN">\n<svg></svg>'))).toEqual('image/svg+xml');
    expect(AssetType.contentType(asset('\n  <svg version="1.1"></svg>'))).toEqual('image/svg+xml');
    expect(AssetType.contentType(asset('<html><body><script>alert(1)</script></body></html>'))).toEqual(null);
    expect(AssetType.contentType(asset('<?xml version="1.0"?><rss><item/></rss>'))).toEqual(null);
    expect(AssetType.contentType(asset('<html>', ' '.repeat(1100), '<svg></svg>'))).toEqual(null);
    expect(AssetType.contentType(asset('<!-- <svg> in a comment is not one -->\n<html></html>'))).toEqual(null);
  });

  // an editor writes its name into a comment above the tag, and a hand written file often carries
  // a licence header there - neither is a reason to stop serving a picture that used to render
  test('reads past whatever an editor put in front of the tag', function() {
    expect(AssetType.contentType(asset('<!-- Generator: Adobe Illustrator 19.0.0 --><svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toEqual('image/svg+xml');
    expect(AssetType.contentType(asset(`<?xml version="1.0"?>\n<!-- ${'GPL-3.0 '.repeat(400)}-->\n<svg></svg>`))).toEqual('image/svg+xml');
    expect(AssetType.contentType(asset('<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd" [\n<!ENTITY ns_svg "http://www.w3.org/2000/svg">\n]>\n<svg></svg>'))).toEqual('image/svg+xml');
    expect(AssetType.contentType(asset('<!DOCTYPE svg [<!ENTITY box "M 0 0 h 10]v 10">]>\n<svg></svg>'))).toEqual('image/svg+xml');
  });

  // an XML pipeline may bind the SVG namespace to a prefix and write the root element under it -
  // a different spelling of the same picture, which rendered before the sniffer looked at the tag
  test('reads a root element that carries a namespace prefix', function() {
    expect(AssetType.contentType(asset('<svg:svg xmlns:svg="http://www.w3.org/2000/svg"></svg:svg>'))).toEqual('image/svg+xml');
    expect(AssetType.contentType(asset('<?xml version="1.0"?><s:svg xmlns:s="http://www.w3.org/2000/svg"/>'))).toEqual('image/svg+xml');
    expect(AssetType.contentType(asset('<!DOCTYPE s:svg [<!ENTITY ns "http://www.w3.org/2000/svg">]><s:svg/>'))).toEqual('image/svg+xml');
    expect(AssetType.contentType(asset('<svgmap version="1.1"></svgmap>'))).toEqual(null);
    expect(AssetType.contentType(asset('<x:svgz xmlns:x="urn:whatever"/>'))).toEqual(null);
  });

  // the bytes in front of the tag are written by whoever uploaded the asset and read again on
  // every request for it, so markup that makes a pattern backtrack over its own run costs the
  // single threaded server that time on each one
  test('gives up on markup meant to make it backtrack instead of chewing through it', function() {
    const fillers = [ 'a'.repeat(65536), '[]'.repeat(32768), `${'a'.repeat(30000)}[x]${'b'.repeat(30000)}`,
                      `["${'a'.repeat(65000)}`, `[${'"x]y"'.repeat(13000)}` ];
    for(const filler of fillers) {
      const started = Date.now();
      expect(AssetType.contentType(asset(`<!doctype svg ${filler}`))).toEqual(null);
      expect(Date.now()-started).toBeLessThan(1000);
    }
  });

  test('says nothing rather than guessing', function() {
    expect(AssetType.contentType(asset([ 0x00, 0x01, 0x02, 0x03 ]))).toEqual(null);
    expect(AssetType.contentType(asset([ 0, 0, 0, 0x20 ], 'ftyp', 'qt  '))).toEqual(null);
    expect(AssetType.contentType(Buffer.alloc(0))).toEqual(null);
    expect(AssetType.contentType(null)).toEqual(null);
  });
});
