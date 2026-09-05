import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { compute_ops } from '../../client/js/compute.js';
import { mapAssetURLs, unmapAssetURLs, escapeID, unescapeID } from '../../client/js/domhelpers.js';

const repositoryRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Everything that is served to the browser, taken from the bundle lists of server/minify.mjs
// rather than from a directory walk: what the browser gets is not only client/, it is also the
// validator shipped in the editor bundle and the two dependencies loaded as they are. Read as
// text rather than imported: minify.mjs pulls in the server config and the three minifiers.
function servedSources() {
  const minify = fs.readFileSync(path.join(repositoryRoot, 'server/minify.mjs'), 'utf8');
  const listed = [ ...minify.matchAll(/'([\w./-]+\.(?:js|html))'/g) ].map(match => match[1]);
  return [ ...new Set(listed) ].filter(file => fs.existsSync(path.join(repositoryRoot, file)));
}

// The support line is the browserslist key in package.json, and npm run browsercompat checks the
// client against it - but only for what can be resolved without knowing any types, so a method
// called on a value (foo.replaceAll(), bar.at()) is invisible to it. This list names those, and
// it is deliberately stricter than the browserslist line: crash reports from the live site still
// come from Chrome 80 clients, and replaceAll is the one that takes the whole room down in
// mapAssetURLs before a single game is on the shelf instead of only breaking its own feature.
const bannedClientAPIs = [
  { api: 'String.prototype.replaceAll', arrivedIn: 'Chrome 85, Safari 13.1, Firefox 77', pattern: /\.replaceAll\s*\(/ }
];

describe("Scenarios: The client stays away from the APIs that break its oldest clients", () => {
  const sources = servedSources();

  // A regex over minify.mjs is only as good as the way that file spells its lists, so make a
  // silently shrinking scan fail here instead of letting a banned call through unnoticed.
  test("the scan reads the whole list of served files", () => {
    expect(sources).toEqual(expect.arrayContaining([
      'client/room.html',
      'client/js/main.js',
      'client/js/editor/sidebar/properties.js',
      'validator/validate_gamefile.js',
      'node_modules/dompurify/dist/purify.js',
      'node_modules/fflate/umd/index.js'
    ]));
    expect(sources.length).toBeGreaterThan(80);
  });

  test.each(bannedClientAPIs)("no served source calls $api (added in $arrivedIn)", ({ pattern }) => {
    const offenders = sources.flatMap(file => {
      return fs.readFileSync(path.join(repositoryRoot, file), 'utf8').split('\n')
        .map((text, index) => ({ file, line: index + 1, text: text.trim() }))
        .filter(({ text }) => pattern.test(text));
    });
    expect(offenders.map(o => `${o.file}:${o.line} ${o.text}`)).toEqual([]);
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
