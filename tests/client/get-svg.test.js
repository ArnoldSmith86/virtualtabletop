import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { mapAssetURLs } from '../../client/js/domhelpers.js';
import { getSVG, fetchSVG } from '../../client/js/main.js';

// main.js reaches mapAssetURLs through the concatenated bundle rather than through an import
beforeAll(() => {
  globalThis.mapAssetURLs = mapAssetURLs;
});

// jsonedit.js is a plain script that gets concatenated into the editor bundle, so evaluate just
// its file type check out of its scope and hand it the same fetchSVG the engine goes through
const jsoneditSource = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../client/js/jsonedit.js'), 'utf8');
const checkIfSVG = new Function('fetchSVG', jsoneditSource.match(/^async function checkIfSVG[\s\S]*?^}/m)[0] + `;
  return checkIfSVG;
`)(fetchSVG);

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

// a file the server didn't hand out at all, which never gets as far as a body
function mockFetchStatus(status) {
  const fetched = [];
  globalThis.fetch = url => {
    fetched.push(url);
    return Promise.resolve({ ok: false, status, headers: { get: _=>null } });
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

test('an SVG that a foreign host mislabels as a bitmap is still recognized by its bytes', async () => {
  // only vtt's own /assets/ and /i/ routes are trusted to say what they serve - anywhere else a
  // misconfigured host that answers image/png for an SVG has to keep working like it always did
  const fetched = mockFetch('<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#000000"/></svg>', 'image/png');
  const image = await loadImage('https://example.com/board.svg', { '#000000': '#ff0000' });
  expect(decodeURIComponent(image)).toContain('fill="#ff0000"');
  expect(fetched).toEqual([ 'https://example.com/board.svg', 'read as text' ]);
});

test('an image that cannot be loaded at all is used as it is', async () => {
  // fetch() rejects for an external URL blocked by CORS - which the browser still displays fine
  // as a background-image, so the widget has to end up with the plain URL rather than with nothing
  const fetched = mockFetch(new TypeError('Failed to fetch'));
  expect(await loadImage('https://example.com/board.png', { '#000000': '#ff0000' })).toBe('https://example.com/board.png');

  expect(getSVG('https://example.com/board.png', { '#000000': '#ff0000' }, _=>{})).toBe('https://example.com/board.png');
  expect(fetched).toEqual([ 'https://example.com/board.png' ]);
});

test('an image the server refuses to hand out is used as it is', async () => {
  // a deleted asset, an expired link, a 502 from a proxy - the file didn't arrive, so just like
  // the rejected fetch above nothing is known about it and the widget keeps the URL it has
  const fetched = mockFetchStatus(404);
  expect(await loadImage('/assets/5_5', { '#000000': '#ff0000' })).toBe('assets/5_5');
  expect(fetched).toEqual([ 'assets/5_5' ]);
});

test('an image that could not be read is tried again once the retry delay is over', async () => {
  const realNow = Date.now;
  let clock = 1000000;
  Date.now = _=>clock;
  try {
    const failed = mockFetch(new TypeError('Failed to fetch'));
    expect(await loadImage('/assets/6_6', { '#000000': '#ff0000' })).toBe('assets/6_6');
    expect(failed).toEqual([ 'assets/6_6' ]);

    // within the delay the file is left alone: a CSS recomputation must not become a fetch
    clock += 29000;
    expect(getSVG('/assets/6_6', { '#000000': '#ff0000' }, _=>{})).toBe('assets/6_6');
    expect(failed).toEqual([ 'assets/6_6' ]);

    // afterwards it gets another chance - a server restart or a hiccup in the network says
    // nothing about the file and must not cost a good SVG its replacements for the whole session
    clock += 2000;
    mockFetch('<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#000000"/></svg>', 'image/svg+xml');
    // while that retry is in flight the widget keeps the URL it can already display rather than
    // blinking to nothing, and is told through its callback once the file did arrive after all
    let retried = null;
    expect(getSVG('/assets/6_6', { '#000000': '#ff0000' }, result => retried = result)).toBe('assets/6_6');
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(decodeURIComponent(retried)).toContain('fill="#ff0000"');

    // a file that did load and turned out not to be an SVG is a final answer, so it is not
    const bitmap = mockFetch('\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR');
    expect(await loadImage('/assets/7_7', { '#000000': '#ff0000' })).toBe('assets/7_7');
    clock += 60000;
    expect(getSVG('/assets/7_7', { '#000000': '#ff0000' }, _=>{})).toBe('assets/7_7');
    expect(bitmap).toEqual([ 'assets/7_7', 'read as text' ]);
  } finally {
    Date.now = realNow;
  }
});

test('one file is asked for once, however it is spelled and whoever asks', async () => {
  // the engine renders the image, and the JSON editor decides from the same answer whether it
  // offers replacements for it - going through the same request means they cannot disagree
  const fetched = mockFetch('<svg xmlns="http://www.w3.org/2000/svg"/>', 'image/svg+xml');
  expect(decodeURIComponent(await loadImage('/i/piece.svg', { '#000000': '#ff0000' }))).toContain('<svg');
  expect(await checkIfSVG('i/piece.svg')).toBe(true);
  expect(await fetchSVG('/i/piece.svg')).toContain('<svg');
  expect(fetched).toEqual([ 'i/piece.svg', 'read as text' ]);
});

// the JSON editor gates its 'Show colors in SVG image' command on the same answer the engine
// uses, so that a widget can't be offered replacements the engine will never apply
test('the JSON editor recognizes exactly the files the engine can replace in', async () => {
  mockFetch('<svg xmlns="http://www.w3.org/2000/svg"/>', 'image/svg+xml');
  expect(await checkIfSVG('/assets/8_8')).toBe(true);

  // a bitmap that happens to contain the three letters "svg" somewhere is not an SVG
  mockFetch('\x89PNG\r\n\x1a\n<!-- svg -->');
  expect(await checkIfSVG('/assets/9_9')).toBe(false);

  // a file that could not be read at all says nothing about what it is - fetchSVG() retries it,
  // so the answer is undefined rather than a verdict the editor would remember
  mockFetch(new TypeError('Failed to fetch'));
  expect(await checkIfSVG('https://example.com/blocked.svg')).toBe(undefined);
});
