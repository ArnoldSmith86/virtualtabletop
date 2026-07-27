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

  describe("Given a thrown value that is not an Error", () => {
    test("Then the value is appended to the fallback", () => {
      expect(describeError('oops', 'Unhandled promise rejection')).toBe('Unhandled promise rejection\noops');
      expect(describeError(42, 'Unhandled promise rejection')).toBe('Unhandled promise rejection\n42');
    });
  });
});
