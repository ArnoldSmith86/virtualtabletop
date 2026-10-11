import { stringifyForDisplay } from '../../client/js/domhelpers.js';

// A routine can build a value that contains itself (#1415). Such a value cannot be stored in a
// property, but it still has to be printable - the routine log is where the user finds out.

describe("Scenarios: Values that contain themselves", () => {
  describe("Given a value that can be serialized", () => {
    test("Then stringifyForDisplay prints it", () => {
      expect(stringifyForDisplay({ a: [ 1, 'two', null ] })).toBe('{"a":[1,"two",null]}');
    });
  });

  describe("Given a value that contains itself", () => {
    test("Then stringifyForDisplay marks the place where the loop closes", () => {
      const value = {};
      value.me = value;
      expect(stringifyForDisplay(value)).toBe('{"me":"<contains itself>"}');
    });

    test("Then a loop closing at the root of an array is marked as well", () => {
      const value = [];
      value.push(value);
      expect(stringifyForDisplay(value)).toBe('["<contains itself>"]');
    });

    test("Then everything around the loop stays readable", () => {
      const value = { list: [ 1, 2 ] };
      value.list.push(value);
      expect(stringifyForDisplay(value)).toBe('{"list":[1,2,"<contains itself>"]}');
    });

    test("Then the same object appearing twice next to itself is not a loop", () => {
      const shared = { a: 1 };
      const value = { list: [ shared, shared ] };
      value.self = value;
      expect(stringifyForDisplay(value)).toBe('{"list":[{"a":1},{"a":1}],"self":"<contains itself>"}');
    });

    test("Then indentation is applied like in JSON.stringify", () => {
      const value = { a: 1 };
      value.me = value;
      expect(stringifyForDisplay(value, 2)).toBe('{\n  "a": 1,\n  "me": "<contains itself>"\n}');
    });
  });

  describe("Given a value that cannot be serialized for another reason", () => {
    test("Then stringifyForDisplay explains why", () => {
      expect(JSON.parse(stringifyForDisplay({ big: BigInt(1) })).error).toMatch(/BigInt/);
    });
  });
});
