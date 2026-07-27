import { describeError } from '../../client/js/tracing.js';

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
