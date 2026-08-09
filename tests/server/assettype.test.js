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
  });

  test('says nothing rather than guessing', function() {
    expect(AssetType.contentType(asset([ 0x00, 0x01, 0x02, 0x03 ]))).toEqual(null);
    expect(AssetType.contentType(asset([ 0, 0, 0, 0x20 ], 'ftyp', 'qt  '))).toEqual(null);
    expect(AssetType.contentType(Buffer.alloc(0))).toEqual(null);
    expect(AssetType.contentType(null)).toEqual(null);
  });
});
