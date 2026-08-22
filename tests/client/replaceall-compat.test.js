import fs from 'fs';
import path from 'path';

import { mapAssetURLs, unmapAssetURLs, escapeID, unescapeID } from '../../client/js/domhelpers.js';

const computeOps = (() => {
  const source = fs.readFileSync('client/js/compute.js', 'utf8').replace(/^export .*$/m, '');
  return new Function(`${source}\nreturn compute_ops;`)();
})();

function clientSources(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(directory, entry.name);
    if(entry.isDirectory())
      return clientSources(full);
    return entry.isFile() && entry.name.endsWith('.js') ? [ full ] : [];
  });
}

// String.prototype.replaceAll arrived in Chrome 85, Safari 13.1 and Firefox 77, which
// is younger than the browsers the client is served to - a call to it takes down the
// whole room, so the client spells the same thing out with replace() and split()/join().
describe("Scenarios: The client does not depend on String.prototype.replaceAll", () => {
  test("no client source calls .replaceAll()", () => {
    const offenders = clientSources('client/js').flatMap(file => {
      return fs.readFileSync(file, 'utf8').split('\n')
        .map((line, index) => ({ file, line: index + 1, text: line.trim() }))
        .filter(({ text }) => /\.replaceAll\s*\(/.test(text));
    });
    expect(offenders.map(o => `${o.file}:${o.line} ${o.text}`)).toEqual([]);
  });

  describe("with the method missing, as on those browsers", () => {
    const native = String.prototype.replaceAll;
    beforeAll(() => { delete String.prototype.replaceAll; });
    afterAll(() => { String.prototype.replaceAll = native; });

    test("asset URLs are still mapped to relative and back", () => {
      expect(mapAssetURLs('<img src="/assets/1_2"><img src="/i/a.svg">')).toBe('<img src="assets/1_2"><img src="i/a.svg">');
      expect(unmapAssetURLs('<img src="assets/1_2"><img src="i/a.svg">')).toBe('<img src="/assets/1_2"><img src="/i/a.svg">');
    });

    test("widget IDs are still escaped and unescaped", () => {
      expect(escapeID('a_b c')).toBe('a__b_x0020_c');
      expect(unescapeID(escapeID('a_b c'))).toBe('a_b c');
    });
  });
});

// The routine operation is documented as replacing every occurrence of a literal
// string, which includes the $ patterns replace() understands in the replacement.
describe("Scenarios: The replaceAll routine operation", () => {
  const replaceAll = computeOps.find(op => op.name == 'replaceAll').call;

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
