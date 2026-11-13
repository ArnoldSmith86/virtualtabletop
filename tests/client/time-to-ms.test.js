import { timeToMS } from '../../client/js/domhelpers.js';

describe("Scenarios: Converting time strings to milliseconds", () => {
  test("converts minutes:seconds strings to milliseconds", () => {
    expect(timeToMS("1:30")).toBe(90000);
    expect(timeToMS("0:05")).toBe(5000);
    expect(timeToMS("10:00")).toBe(600000);
  });

  test("converts fractional seconds and rounds to the nearest millisecond", () => {
    expect(timeToMS("1:30.5")).toBe(90500);
    expect(timeToMS("0:00.1234")).toBe(123);
    expect(timeToMS("0:59.9996")).toBe(60000);
  });

  test("converts hours:minutes:seconds strings to milliseconds", () => {
    expect(timeToMS("1:00:00")).toBe(3600000);
    expect(timeToMS("0:01:30")).toBe(90000);
    expect(timeToMS("3:13:07.5")).toBe(11587500);
  });

  test("converts negative times", () => {
    expect(timeToMS("-1:30")).toBe(-90000);
    expect(timeToMS("-1:00:00")).toBe(-3600000);
  });

  test("leaves other values unchanged", () => {
    expect(timeToMS(5000)).toBe(5000);
    expect(timeToMS("start")).toBe("start");
    expect(timeToMS(null)).toBe(null);
    expect(timeToMS(undefined)).toBe(undefined);
    expect(timeToMS("1:00:00:00")).toBe("1:00:00:00");
  });
});
