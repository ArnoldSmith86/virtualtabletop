import JSDOMEnvironment from 'jest-environment-jsdom';

// The server modules are tested in the jsdom environment as well, and some of them use
// node's built-in fetch, which jsdom does not provide. Handing it (and the classes it
// works with) to the tests keeps them from having to mock it away.
export default class JSDOMEnvironmentWithFetch extends JSDOMEnvironment {
  constructor(...args) {
    super(...args);
    for(const global of [ 'fetch', 'Headers', 'Request', 'Response', 'AbortController', 'AbortSignal' ])
      this.global[global] = globalThis[global];
  }
}
