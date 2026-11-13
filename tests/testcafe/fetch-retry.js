// Node reuses the connection to the server between requests, and one that the server has closed in the
// meantime makes the next fetch() reject with a network-level 'TypeError: fetch failed' before the request
// is ever sent. A connection that drops after the response headers rejects the same way, in the body read
// instead of the request - so both happen inside the retried operation here. Neither is a test failure, it
// just kills whichever test runs next, most often in the beforeEach hook, so the operation is retried with
// a short backoff. An HTTP error status is passed through untouched: that one is a real failure the tests
// have to see. The callers only ever want the response body, so retrying the read is free of side effects -
// a partial body is discarded and both endpoints are GETs of room state. The error that survives the last
// attempt names the request and how often it was tried, because on its own 'TypeError: fetch failed' tells
// a CI log neither which request died nor that anything retried it.
export async function fetchTextWithRetry(url, options, attempts=3) {
  for(let attempt=1; ; attempt++) {
    try {
      const response = await fetch(url, options);
      return await response.text();
    } catch(e) {
      if(attempt == attempts) {
        e.message += ` (${options && options.method || 'GET'} ${url}, ${attempts} attempts)`;
        throw e;
      }
      await new Promise(resolve => setTimeout(resolve, 100 * attempt));
    }
  }
}
