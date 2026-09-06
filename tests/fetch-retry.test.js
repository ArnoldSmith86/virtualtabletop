import { fetchTextWithRetry } from './testcafe/fetch-retry.js';

// The TestCafe REST helpers all go through this wrapper, so what it retries - and what it
// must not retry - decides whether a dropped connection ends up as a red CI run.

const originalFetch = globalThis.fetch;

function response(text, status=200) {
  return { status, text: async () => text };
}

// undici reports every network-level problem this way, both for the request and for the body read
function networkError() {
  return Object.assign(new TypeError('fetch failed'), { cause: new Error('other side closed') });
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// returns the number of calls the stub received alongside the wrapper's result
function stub(...outcomes) {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    const outcome = outcomes[calls.length-1];
    if(typeof outcome == 'function')
      return outcome();
    throw outcome;
  };
  return calls;
}

test('returns the response body without retrying a healthy request', async () => {
  const calls = stub(() => response('{"a":1}'));
  expect(await fetchTextWithRetry('/state')).toBe('{"a":1}');
  expect(calls.length).toBe(1);
});

test('retries a request rejected before it was sent', async () => {
  const calls = stub(networkError(), () => response('state'));
  expect(await fetchTextWithRetry('/state')).toBe('state');
  expect(calls.length).toBe(2);
});

test('retries a connection that drops during the body read', async () => {
  const calls = stub(
    () => ({ status: 200, text: async () => { throw networkError(); } }),
    () => response('state')
  );
  expect(await fetchTextWithRetry('/state')).toBe('state');
  expect(calls.length).toBe(2);
});

test('rethrows once the attempts are used up', async () => {
  const calls = stub(networkError(), networkError(), networkError());
  await expect(fetchTextWithRetry('/state')).rejects.toThrow('fetch failed');
  expect(calls.length).toBe(3);
});

test('passes an HTTP error status through instead of retrying it', async () => {
  const calls = stub(() => response('room not found', 404));
  expect(await fetchTextWithRetry('/state')).toBe('room not found');
  expect(calls.length).toBe(1);
});

test('repeats the request unchanged, so a PUT body survives the retry', async () => {
  const calls = stub(networkError(), () => response(''));
  await fetchTextWithRetry('/state', { method: 'PUT', body: '{"widgets":{}}' });
  expect(calls.map(call => call.options.body)).toEqual([ '{"widgets":{}}', '{"widgets":{}}' ]);
});
