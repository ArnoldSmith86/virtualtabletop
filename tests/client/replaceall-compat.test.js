import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { compute_ops } from '../../client/js/compute.js';
import { mapAssetURLs, unmapAssetURLs, escapeID, unescapeID } from '../../client/js/domhelpers.js';

const clientDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../client');

// Everything that is served to the browser: the modules below client/js and the inline scripts
// of the HTML files loading them.
function clientSources(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(directory, entry.name);
    if(entry.isDirectory())
      return clientSources(full);
    return entry.isFile() && /\.(js|html)$/.test(entry.name) ? [ full ] : [];
  });
}

// Every API here is younger than the browsers the client is served to, so calling one throws and
// takes down the whole room instead of just the feature using it - the client spells them out.
const bannedClientAPIs = [
  { api: 'String.prototype.replaceAll', arrivedIn: 'Chrome 85, Safari 13.1, Firefox 77', pattern: /\.replaceAll\s*\(/ }
];

describe("Scenarios: The client stays away from APIs its browsers do not have", () => {
  const sources = clientSources(clientDirectory);

  test.each(bannedClientAPIs)("no client source calls $api (added in $arrivedIn)", ({ pattern }) => {
    const offenders = sources.flatMap(file => {
      return fs.readFileSync(file, 'utf8').split('\n')
        .map((text, index) => ({ file: path.relative(clientDirectory, file), line: index + 1, text: text.trim() }))
        .filter(({ text }) => pattern.test(text));
    });
    expect(offenders.map(o => `client/${o.file}:${o.line} ${o.text}`)).toEqual([]);
  });

  describe("with String.prototype.replaceAll missing, as on those browsers", () => {
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
