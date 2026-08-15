import { mapAssetURLs } from '../../client/js/domhelpers.js';
import { getSVG } from '../../client/js/main.js';

// main.js reaches mapAssetURLs through the concatenated bundle rather than through an import
beforeAll(() => {
  globalThis.mapAssetURLs = mapAssetURLs;
});

// getSVG() fetches the image once and hands every later call the replaced copy out of its
// cache, so each test uses its own URL to stay independent of the ones before it.
function mockFetch(body) {
  const fetched = [];
  globalThis.fetch = url => {
    fetched.push(url);
    return Promise.resolve({ text: () => Promise.resolve(body) });
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
  mockFetch('<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#000000"/></svg>');
  const image = await loadImage('/assets/1_1', { '#000000': '#ff0000' });
  expect(image).toBe(getSVG('/assets/1_1', { '#000000': '#ff0000' }));
  expect(decodeURIComponent(image)).toBe('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#ff0000"/></svg>');
});

test('an image that is not an SVG is used as it is instead of being wrapped into a data URL', async () => {
  const fetched = mockFetch('\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR');
  expect(await loadImage('/assets/2_2', { '#000000': '#ff0000' })).toBe('assets/2_2');

  // and it stays that way without fetching it a second time
  expect(getSVG('/assets/2_2', { '#000000': '#ff0000' }, _=>{})).toBe('assets/2_2');
  expect(fetched).toEqual([ 'assets/2_2' ]);
});
