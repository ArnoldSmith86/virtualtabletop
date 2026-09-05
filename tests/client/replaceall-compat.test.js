import { compute_ops } from '../../client/js/compute.js';
import { mapAssetURLs, unmapAssetURLs, escapeID, unescapeID } from '../../client/js/domhelpers.js';

describe("Scenarios: The client runs without String.prototype.replaceAll", () => {
  const native = String.prototype.replaceAll;
  beforeAll(() => { delete String.prototype.replaceAll; });
  afterAll(() => { Object.defineProperty(String.prototype, 'replaceAll', { value: native, writable: true, configurable: true }); });

  test("asset URLs are still mapped to relative and back", () => {
    expect(mapAssetURLs('<img src="/assets/1_2"><img src="/i/a.svg">')).toBe('<img src="assets/1_2"><img src="i/a.svg">');
    expect(unmapAssetURLs('<img src="assets/1_2"><img src="i/a.svg">')).toBe('<img src="/assets/1_2"><img src="/i/a.svg">');
  });

  test("widget IDs are still escaped and unescaped", () => {
    expect(escapeID('a_b c')).toBe('a__b_x0020_c');
    expect(unescapeID(escapeID('a_b c'))).toBe('a_b c');
  });
});

// The routine operation is documented as replacing every occurrence of a literal
// string, which includes the $ patterns replace() understands in the replacement.
describe("Scenarios: The replaceAll routine operation", () => {
  const replaceAll = compute_ops.find(op => op.name == 'replaceAll').call;

  test.each([
    [ 'a.b.c', '.', '-' ],
    [ 'a[b]c', '[b]', 'Z' ],
    [ 'a\\b\\c', '\\', '/' ],
    [ 'aaa', 'aa', 'b' ],
    [ 'abc', 'x', 'y' ],
    [ 'a1b1c', 1, 2 ],
    [ 'abc', '', '-' ],
  ])("%p with every %p replaced by %p", (x, y, z) => {
    expect(replaceAll(null, x, y, z)).toBe(String(x).replaceAll(y, z));
  });

  test("keeps the $ patterns of the replacement", () => {
    expect(replaceAll(null, 'aXbXc', 'X', '$&$&')).toBe('aXXbXXc');
    expect(replaceAll(null, 'a b', ' ', '$$')).toBe('a$b');
  });
});
