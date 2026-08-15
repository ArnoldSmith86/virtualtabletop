import { mapAssetURLs } from '../../client/js/domhelpers.js';
import { getSVG } from '../../client/js/main.js';

// main.js reaches mapAssetURLs through the concatenated bundle rather than through an import
beforeAll(() => {
  globalThis.mapAssetURLs = mapAssetURLs;
});

// getSVG() fetches the image once and hands every later call the replaced copy out of its
// cache, so each test uses its own URL to stay independent of the ones before it.
function mockFetch(body, contentType) {
  const fetched = [];
  globalThis.fetch = url => {
    fetched.push(url);
    if(body instanceof Error)
      return Promise.reject(body);
    return Promise.resolve({
      ok: true,
      headers: { get: name => name == 'content-type' ? (contentType || 'application/octet-stream') : null },
      body: { cancel: () => fetched.push('cancelled') },
      text: () => (fetched.push('read as text'), Promise.resolve(body))
    });
  };
  return fetched;
}

// the first call only starts the fetch and returns an empty string; the callback fires once the
// file is there, which is when the widget recomputes its CSS
async function loadImage(url, replaces) {
  let fromCallback = null;
  getSVG(url, replaces, result => fromCallback = result);
  await new Promise(resolve => setTimeout(resolve, 0));
  return fromCallback;
}

test('an SVG has its replacements applied', async () => {
  mockFetch('<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#000000"/></svg>', 'image/svg+xml');
  const image = await loadImage('/assets/1_1', { '#000000': '#ff0000' });
  expect(image).toBe(getSVG('/assets/1_1', { '#000000': '#ff0000' }));
  expect(decodeURIComponent(image)).toBe('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#ff0000"/></svg>');
});

test('an SVG whose root element carries a namespace prefix is still an SVG', async () => {
  mockFetch('<svg:svg xmlns:svg="http://www.w3.org/2000/svg"><svg:rect fill="#000000"/></svg:svg>', 'image/svg+xml');
  const image = await loadImage('/assets/3_3', { '#000000': '#ff0000' });
  expect(decodeURIComponent(image)).toContain('fill="#ff0000"');
});

test('an image that is not an SVG is used as it is instead of being wrapped into a data URL', async () => {
  const fetched = mockFetch('\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR');
  expect(await loadImage('/assets/2_2', { '#000000': '#ff0000' })).toBe('assets/2_2');

  // and it stays that way without fetching it a second time
  expect(getSVG('/assets/2_2', { '#000000': '#ff0000' }, _=>{})).toBe('assets/2_2');
  expect(fetched).toEqual([ 'assets/2_2', 'read as text' ]);
});

test('a bitmap is recognized by its content type without being read as text', async () => {
  const fetched = mockFetch('should not be read', 'image/png');
  expect(await loadImage('/assets/4_4', { '#000000': '#ff0000' })).toBe('assets/4_4');
  expect(fetched).toEqual([ 'assets/4_4', 'cancelled' ]);
});

test('an image that cannot be loaded at all is used as it is', async () => {
  // fetch() rejects for an external URL blocked by CORS - which the browser still displays fine
  // as a background-image, so the widget has to end up with the plain URL rather than with nothing
  const fetched = mockFetch(new TypeError('Failed to fetch'));
  expect(await loadImage('https://example.com/board.png', { '#000000': '#ff0000' })).toBe('https://example.com/board.png');

  expect(getSVG('https://example.com/board.png', { '#000000': '#ff0000' }, _=>{})).toBe('https://example.com/board.png');
  expect(fetched).toEqual([ 'https://example.com/board.png' ]);
});
