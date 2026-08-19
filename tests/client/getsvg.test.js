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

let restorePromiseTracking = null;

// jest fails a test that produces an unhandled rejection, but an exception thrown by a widget callback is supposed to
// stay unhandled so it reaches the error reporter - so record the promises getSVG creates and inspect them afterwards
function trackPromises() {
  const promises = [];
  const originalThen = Promise.prototype.then;
  const originalReject = Promise.reject;
  Promise.prototype.then = function(...args) {
    const promise = originalThen.apply(this, args);
    promises.push(promise);
    return promise;
  };
  Promise.reject = function(...args) {
    const promise = originalReject.apply(Promise, args);
    promises.push(promise);
    return promise;
  };
  // afterEach restores this as well, so a failing expectation in between doesn't leak the patch into the other tests
  restorePromiseTracking = _=>{
    Promise.prototype.then = originalThen;
    Promise.reject = originalReject;
    restorePromiseTracking = null;
  };
  return async _=>{
    restorePromiseTracking();
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
  let consoleError, random;

  beforeEach(() => {
    jest.useFakeTimers();
    consoleError = jest.spyOn(console, 'error').mockImplementation(_=>{});
    // remove the jitter from the backoff so the tests can advance the timers to an exact attempt
    random = jest.spyOn(Math, 'random').mockReturnValue(1);
  });

  afterEach(() => {
    if(restorePromiseTracking)
      restorePromiseTracking();
    consoleError.mockRestore();
    random.mockRestore();
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

  test("serves the callbacks queued during an outage once the asset is reachable again", async () => {
    global.fetch = jest.fn(_=>Promise.reject(new TypeError('Failed to fetch')));

    const duringOutage = jest.fn();
    getSVG('/assets/offline.svg', {}, duringOutage);
    await jest.advanceTimersByTimeAsync(7500); // the four attempts take 1s + 2s + 4s

    expect(global.fetch).toHaveBeenCalledTimes(4);
    expect(console.error).toHaveBeenCalled();
    expect(duringOutage).not.toHaveBeenCalled();

    // nobody asks again - on a quiet table no widget re-renders, so the next chain has to start on its own
    global.fetch.mockClear();
    global.fetch.mockImplementation(_=>respond(svg));
    await jest.advanceTimersByTimeAsync(5000); // the cooldown after a failed chain

    expect(global.fetch).toHaveBeenCalledTimes(1);
    // the widget that asked while the network was down doesn't stay blank until the page is reloaded
    expect(duringOutage).toHaveBeenCalledWith('data:image/svg+xml,'+encodeURIComponent(svg));
  });

  test("notifies every waiting caller, no matter how many are queued", async () => {
    global.fetch = jest.fn()
      .mockImplementationOnce(_=>Promise.reject(new TypeError('Failed to fetch')))
      .mockImplementation(_=>respond(svg));

    // a deck can easily have more card faces sharing one SVG than any queue limit would allow
    const callbacks = [];
    for(let i=0; i<1500; ++i) {
      callbacks.push(jest.fn());
      getSVG('/assets/many.svg', {}, callbacks[i], { subscriber: i });
    }
    await settle();

    for(const callback of callbacks)
      expect(callback).toHaveBeenCalledWith('data:image/svg+xml,'+encodeURIComponent(svg));
  });

  test("keeps only the latest callback of a widget that renders again while the URL is down", async () => {
    global.fetch = jest.fn()
      .mockImplementationOnce(_=>Promise.reject(new TypeError('Failed to fetch')))
      .mockImplementation(_=>respond(svg));

    const subscriber = {};
    const firstRender = jest.fn(), secondRender = jest.fn();
    getSVG('/assets/rerender.svg', {}, firstRender, subscriber);
    getSVG('/assets/rerender.svg', {}, secondRender, subscriber);
    await settle();

    // the queue holds one entry per subscriber, so the outdated callback of the earlier render is not invoked
    expect(firstRender).not.toHaveBeenCalled();
    expect(secondRender).toHaveBeenCalledWith('data:image/svg+xml,'+encodeURIComponent(svg));
  });

  test("waits for the cooldown before retrying a failed download", async () => {
    global.fetch = jest.fn(_=>Promise.reject(new TypeError('Failed to fetch')));

    getSVG('/assets/cooldown.svg', {}, jest.fn());
    await jest.advanceTimersByTimeAsync(7500); // the four attempts take 1s + 2s + 4s

    expect(global.fetch).toHaveBeenCalledTimes(4);

    // re-rendering widgets ask again all the time, that must not start a new chain immediately
    global.fetch.mockClear();
    for(let i=0; i<10; ++i)
      getSVG('/assets/cooldown.svg', {}, jest.fn());
    expect(global.fetch).not.toHaveBeenCalled();

    // once the cooldown is over, a single new chain serves all of them
    await jest.advanceTimersByTimeAsync(4500);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // and the cooldown grows with every failed chain instead of polling a URL that is down at a fixed rate
    await jest.advanceTimersByTimeAsync(7000); // the second chain gives up 7s after it started
    const attempts = global.fetch.mock.calls.length;
    await jest.advanceTimersByTimeAsync(5000);
    expect(global.fetch).toHaveBeenCalledTimes(attempts);
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

  test("gives up on a URL that stays unreachable instead of polling it for the whole session", async () => {
    // a cross-origin image without CORS headers rejects like a network error and would never become valid
    global.fetch = jest.fn(_=>Promise.reject(new TypeError('Failed to fetch')));

    getSVG('https://example.com/nocors.svg', {}, jest.fn(), 'widget');
    await jest.advanceTimersByTimeAsync(600000);

    const attempts = global.fetch.mock.calls.length;
    expect(attempts).toBeLessThan(40); // seven chains of four attempts, the cooldown doubling from 5s to 160s
    await jest.advanceTimersByTimeAsync(600000);
    expect(global.fetch).toHaveBeenCalledTimes(attempts);
  });

  test("stops retrying for a widget that isn't on the table any more", async () => {
    global.fetch = jest.fn(_=>Promise.reject(new TypeError('Failed to fetch')));

    const removed = document.createElement('div');
    document.body.appendChild(removed);
    getSVG('/assets/removed.svg', {}, jest.fn(), removed);
    await jest.advanceTimersByTimeAsync(7500);

    expect(global.fetch).toHaveBeenCalledTimes(4);
    removed.remove();

    // nobody is waiting for this image any more, so no further chain is started on its own
    await jest.advanceTimersByTimeAsync(60000);
    expect(global.fetch).toHaveBeenCalledTimes(8); // the chain scheduled before the widget was removed still runs
  });

  test("serves the other waiting widgets even if one of their callbacks throws", async () => {
    global.fetch = jest.fn(_=>respond(svg));
    const collectRejections = trackPromises();

    const throwing = jest.fn(_=>{ throw new Error('widget render failed'); });
    const other = jest.fn();
    getSVG('/assets/throwingfirst.svg', {}, throwing, 'first');
    getSVG('/assets/throwingfirst.svg', {}, other, 'second');
    await settle();
    const rejections = await collectRejections();

    // the broken widget doesn't abort the dispatch, but its exception still reaches the error reporter
    expect(other).toHaveBeenCalledWith('data:image/svg+xml,'+encodeURIComponent(svg));
    expect(rejections.map(e=>e.message)).toContain('widget render failed');
  });

  test("retries a 403 instead of caching it as permanently missing", async () => {
    // an auth or CDN hiccup isn't authoritative the way a 404 is, and an asset may still be uploading
    global.fetch = jest.fn()
      .mockImplementationOnce(_=>respond('forbidden', 403))
      .mockImplementation(_=>respond(svg));

    const callback = jest.fn();
    getSVG('/assets/forbidden.svg', {}, callback);
    await settle();

    expect(global.fetch).toHaveBeenCalledTimes(2);
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
