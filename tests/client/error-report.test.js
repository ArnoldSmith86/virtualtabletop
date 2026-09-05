import { jest } from '@jest/globals'; // the ES module build has no globals of its own

import { $, $a, unescapeID } from '../../client/js/domhelpers.js';
import { describeError, isNonFatalError } from '../../client/js/tracing.js';

describe("Scenarios: Describing a client error for the error report", () => {
  describe("Given an Error object", () => {
    test("Then message and stack are used", () => {
      const error = new Error('something broke');
      expect(describeError(error, 'fallback')).toBe(`something broke\n${error.stack}`);
    });
  });

  describe("Given no error object at all", () => {
    test("Then the fallback is used instead of throwing", () => {
      expect(describeError(undefined, 'Script error.\n    at :0:0')).toBe('Script error.\n    at :0:0');
      expect(describeError(null, 'Unhandled promise rejection')).toBe('Unhandled promise rejection');
    });
  });

  describe("Given an error-like object without a stack", () => {
    test("Then no 'undefined' line is added", () => {
      expect(describeError({ message: 'something broke' }, 'fallback')).toBe('something broke');
      expect(describeError({ stack: 'at foo' }, 'fallback')).toBe('at foo');
    });
  });

  describe("Given a thrown value that is not an Error", () => {
    test("Then the value is appended to the fallback", () => {
      expect(describeError('oops', 'Unhandled promise rejection')).toBe('Unhandled promise rejection\noops');
      expect(describeError(42, 'Unhandled promise rejection')).toBe('Unhandled promise rejection\n42');
    });

    test("Then an object is serialized instead of becoming [object Object]", () => {
      expect(describeError({ status: 500 }, 'Unhandled promise rejection')).toBe('Unhandled promise rejection\n{"status":500}');
    });

    test("Then a value whose properties throw when read still describes the error", () => {
      const hostile = new Proxy({}, { get() { throw new Error('getter exploded'); } });
      expect(describeError(hostile, 'Unhandled promise rejection')).toBe('Unhandled promise rejection\n[object that could not be converted to text]');
      expect(describeError({ get message() { throw new Error('nope'); } }, 'Unhandled promise rejection')).toBe('Unhandled promise rejection\n[object Object]');
    });

    test("Then values that cannot be serialized still describe the error", () => {
      const cyclic = { a: 1 };
      cyclic.self = cyclic;
      expect(describeError(cyclic, 'Unhandled promise rejection')).toBe('Unhandled promise rejection\n[object Object]');
      expect(describeError(Symbol('nope'), 'Unhandled promise rejection')).toBe('Unhandled promise rejection\nSymbol(nope)');
    });
  });
});

describe("Scenarios: Deciding whether an error event should crash the client", () => {
  describe("Given a browser event that does not indicate a broken client", () => {
    test("Then it is treated as non-fatal", () => {
      expect(isNonFatalError('ResizeObserver loop completed with undelivered notifications.')).toBe(true);
      expect(isNonFatalError('ResizeObserver loop limit exceeded')).toBe(true);
      expect(isNonFatalError('Script error.')).toBe(true);
      expect(isNonFatalError('Script error')).toBe(true);
    });
  });

  describe("Given a real error", () => {
    test("Then it is reported even if the message looks harmless", () => {
      expect(isNonFatalError('Uncaught TypeError: x is not a function')).toBe(false);
      expect(isNonFatalError('Script error.', new Error('Script error.'))).toBe(false);
      expect(isNonFatalError('ResizeObserver loop completed', new Error('boom'))).toBe(false);
      expect(isNonFatalError(undefined)).toBe(false);
    });
  });
});

// A failure the client carries on from is only reported through this one path, so what it sends
// and, more importantly, that it can never become the crash it was reporting are worth pinning.
describe("Scenarios: Reporting a failure the client survived", () => {
  let fetchCalls;

  // tracing.js reads the details it collects from the concatenated global scope of the shipped
  // bundle rather than through imports, so expose them before the module is loaded
  beforeEach(() => {
    globalThis.$ = $;
    globalThis.$a = $a;
    globalThis.unescapeID = unescapeID;
    globalThis.widgets = new Map();
    globalThis.undoProtocol = [];
    globalThis.delta = {};
    globalThis.mouseStatus = {};
    globalThis.mouseTarget = null;
    globalThis.lastExecutedOperation = null;
    globalThis.playerName = 'tester';
    fetchCalls = [];
    globalThis.fetch = function(url, options) {
      fetchCalls.push({ url, options });
      return Promise.resolve();
    };
    jest.resetModules(); // the "only once" flag lives in the module, so every test needs a fresh one
  });

  async function reportErrorSilently(description) {
    (await import('../../client/js/tracing.js')).reportErrorSilently(description);
  }

  describe("Given a widget that could not be torn down", () => {
    test("Then the report is sent as a non-fatal one with the client details", async () => {
      await reportErrorSilently('Could not remove widget aWidget\n    at applyRemove');

      expect(fetchCalls.length).toBe(1);
      expect(fetchCalls[0].url).toBe('clientError');
      expect(fetchCalls[0].options.method).toBe('PUT');
      const report = JSON.parse(fetchCalls[0].options.body);
      expect(report.type).toBe('nonFatal');
      expect(report.message).toBe('Could not remove widget aWidget\n    at applyRemove');
      expect(report.url).toBe(location.href);
      expect(report.html).toContain('topSurface');
    });

    test("Then only the first one of a page load is sent", async () => {
      await reportErrorSilently('the first widget');
      await reportErrorSilently('the second widget');

      expect(fetchCalls.length).toBe(1);
      expect(JSON.parse(fetchCalls[0].options.body).message).toBe('the first widget');
    });

    test("Then widget states that reference each other are still serialized", async () => {
      const state = { id: 'aWidget' };
      state.itself = state;
      globalThis.widgets = new Map([ [ 'aWidget', { state } ] ]);

      await reportErrorSilently('Could not remove widget aWidget');

      expect(JSON.parse(fetchCalls[0].options.body).widgetsState).toEqual([ { id: 'aWidget', itself: '[cyclic]' } ]);
    });
  });

  describe("Given that the report itself fails", () => {
    test("Then collecting details that throws does not break the client", async () => {
      delete globalThis.widgets;

      await expect(reportErrorSilently('Could not remove widget aWidget')).resolves.toBeUndefined();
      expect(fetchCalls).toEqual([]);
    });

    test("Then a request that throws does not break the client", async () => {
      globalThis.fetch = function() {
        throw new Error('no network');
      };

      await expect(reportErrorSilently('Could not remove widget aWidget')).resolves.toBeUndefined();
    });

    test("Then a request that is rejected is not left unhandled", async () => {
      globalThis.fetch = function() {
        return Promise.reject(new Error('no network'));
      };

      await expect(reportErrorSilently('Could not remove widget aWidget')).resolves.toBeUndefined();
      await new Promise(resolve=>setTimeout(resolve, 0));
    });
  });
});
