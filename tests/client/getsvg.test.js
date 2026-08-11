import { jest } from '@jest/globals';

import { getSVG } from '../../client/js/main.js';
import { mapAssetURLs } from '../../client/js/domhelpers.js';

// in the browser all client modules share one global scope, so main.js uses this without importing it
global.mapAssetURLs = mapAssetURLs;

const svg = '<svg><rect fill="#ff0000"/></svg>';

function respond(text, status = 200) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, text: _=>Promise.resolve(text) });
}

// resolve all pending promise callbacks and run the timers the retry backoff scheduled
async function settle() {
  await jest.advanceTimersByTimeAsync(60000);
}

describe("Scenarios: Downloading SVGs", () => {
  let consoleError;

  beforeEach(() => {
    jest.useFakeTimers();
    consoleError = jest.spyOn(console, 'error').mockImplementation(_=>{});
  });

  afterEach(() => {
    consoleError.mockRestore();
    jest.useRealTimers();
  });

  test("uses the SVG once a retry succeeds", async () => {
    global.fetch = jest.fn()
      .mockImplementationOnce(_=>Promise.reject(new TypeError('Failed to fetch')))
      .mockImplementationOnce(_=>Promise.reject(new TypeError('Failed to fetch')))
      .mockImplementation(_=>respond(svg));

    const callback = jest.fn();
    expect(getSVG('/assets/retry.svg', { '#ff0000': '#00ff00' }, callback)).toBe('');
    await settle();

    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(callback).toHaveBeenCalledWith('data:image/svg+xml,'+encodeURIComponent('<svg><rect fill="#00ff00"/></svg>'));

    // the SVG is cached, so a later call neither downloads again nor invokes the callback
    global.fetch.mockClear();
    expect(getSVG('/assets/retry.svg', {}, callback)).toBe('data:image/svg+xml,'+encodeURIComponent(svg));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("clears the cache entry after all attempts failed", async () => {
    global.fetch = jest.fn(_=>Promise.reject(new TypeError('Failed to fetch')));

    getSVG('/assets/offline.svg', {}, jest.fn());
    await settle();

    expect(global.fetch).toHaveBeenCalledTimes(4);
    expect(console.error).toHaveBeenCalled();

    // a later call starts a fresh download because the failure could have been transient
    global.fetch.mockClear();
    global.fetch.mockImplementation(_=>respond(svg));
    const callback = jest.fn();
    getSVG('/assets/offline.svg', {}, callback);
    await settle();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('data:image/svg+xml,'+encodeURIComponent(svg));
  });

  test("does not retry or re-download a 404", async () => {
    global.fetch = jest.fn(_=>respond('not found', 404));

    getSVG('/assets/missing.svg', {}, jest.fn());
    await settle();

    expect(global.fetch).toHaveBeenCalledTimes(1);

    // the permanent failure is cached as an empty SVG instead of causing another request storm
    global.fetch.mockClear();
    expect(getSVG('/assets/missing.svg', {})).toBe('data:image/svg+xml,');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("retries a 500", async () => {
    global.fetch = jest.fn()
      .mockImplementationOnce(_=>respond('server error', 500))
      .mockImplementation(_=>respond(svg));

    const callback = jest.fn();
    getSVG('/assets/servererror.svg', {}, callback);
    await settle();

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenCalledWith('data:image/svg+xml,'+encodeURIComponent(svg));
  });
});
