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

// jest fails a test that produces an unhandled rejection, but an exception thrown by a widget callback is supposed to
// stay unhandled so it reaches the error reporter - so record the promises getSVG creates and inspect them afterwards
function trackPromises() {
  const promises = [];
  const originalThen = Promise.prototype.then;
  Promise.prototype.then = function(...args) {
    const promise = originalThen.apply(this, args);
    promises.push(promise);
    return promise;
  };
  return async _=>{
    Promise.prototype.then = originalThen;
    const rejections = [];
    jest.useRealTimers();
    await new Promise(resolve=>setTimeout(resolve, 10)); // let node notice the unhandled rejection
    for(const promise of promises)
      promise.catch(e=>rejections.push(e));
    await new Promise(resolve=>setTimeout(resolve, 10)); // and then that it is handled after all
    jest.useFakeTimers();
    return rejections;
  };
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

  test("serves the callbacks queued during an outage once a later call succeeds", async () => {
    global.fetch = jest.fn(_=>Promise.reject(new TypeError('Failed to fetch')));

    const duringOutage = jest.fn();
    getSVG('/assets/offline.svg', {}, duringOutage);
    await settle();

    expect(global.fetch).toHaveBeenCalledTimes(4);
    expect(console.error).toHaveBeenCalled();
    expect(duringOutage).not.toHaveBeenCalled();

    // a later call starts a fresh download because the failure could have been transient
    global.fetch.mockClear();
    global.fetch.mockImplementation(_=>respond(svg));
    const callback = jest.fn();
    getSVG('/assets/offline.svg', {}, callback);
    await settle();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('data:image/svg+xml,'+encodeURIComponent(svg));
    // the widget that asked while the network was down doesn't stay blank
    expect(duringOutage).toHaveBeenCalledWith('data:image/svg+xml,'+encodeURIComponent(svg));
  });

  test("waits for the cooldown before retrying a failed download", async () => {
    global.fetch = jest.fn(_=>Promise.reject(new TypeError('Failed to fetch')));

    getSVG('/assets/cooldown.svg', {}, jest.fn());
    await jest.advanceTimersByTimeAsync(7500); // the four attempts take at most 1s + 2s + 4s

    expect(global.fetch).toHaveBeenCalledTimes(4);

    // re-rendering widgets ask again all the time, that must not start a new chain immediately
    global.fetch.mockClear();
    getSVG('/assets/cooldown.svg', {}, jest.fn());
    getSVG('/assets/cooldown.svg', {}, jest.fn());
    expect(global.fetch).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(5000);
    getSVG('/assets/cooldown.svg', {}, jest.fn());
    expect(global.fetch).toHaveBeenCalledTimes(1);
    await settle();
  });

  test("serves a caller that arrives while a retry is pending", async () => {
    global.fetch = jest.fn()
      .mockImplementationOnce(_=>Promise.reject(new TypeError('Failed to fetch')))
      .mockImplementation(_=>respond(svg));

    const first = jest.fn(), late = jest.fn();
    getSVG('/assets/pending.svg', {}, first);
    await jest.advanceTimersByTimeAsync(100); // the first attempt failed, the retry is scheduled

    expect(getSVG('/assets/pending.svg', {}, late)).toBe('');
    expect(global.fetch).toHaveBeenCalledTimes(1); // the second caller joins the running download
    await settle();

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(first).toHaveBeenCalledWith('data:image/svg+xml,'+encodeURIComponent(svg));
    expect(late).toHaveBeenCalledWith('data:image/svg+xml,'+encodeURIComponent(svg));
  });

  test("does not treat an exception in a widget callback as a download failure", async () => {
    global.fetch = jest.fn(_=>respond(svg));
    const collectRejections = trackPromises();

    const throwing = jest.fn(_=>{ throw new Error('widget render failed'); });
    getSVG('/assets/throwing.svg', {}, throwing);
    await settle();
    const rejections = await collectRejections();

    expect(throwing).toHaveBeenCalled();
    // the exception is not swallowed by the download error handling but stays unhandled for the error reporter
    expect(rejections.map(e=>e.message)).toContain('widget render failed');
    expect(console.error).not.toHaveBeenCalled();
    // it did not restart the download and the successfully downloaded SVG is still cached
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(getSVG('/assets/throwing.svg', {})).toBe('data:image/svg+xml,'+encodeURIComponent(svg));
    expect(global.fetch).toHaveBeenCalledTimes(1);
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
