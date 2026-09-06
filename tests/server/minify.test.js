import fs from 'fs';
import zlib from 'zlib';

import { buildHTML } from '../../server/minify.mjs';

// A readable build keeps multi-line function bodies and blank lines, a minified one has neither.
const readableJS = /function \w+\([\w, ]*\) \{\n/;

// the build itself, not the cached path in front of it: what these tests check is what the
// minifiers produce, and reading it back from an entry an earlier run stored would only ever
// confirm that the cache round trip works
async function buildWith(minifyJavascript) {
  process.env.MINIFYJAVASCRIPT = minifyJavascript;
  try {
    return await buildHTML();
  } finally {
    delete process.env.MINIFYJAVASCRIPT;
  }
}

function inlineClientJS(build) {
  return build.min.match(/<script type=module>([\s\S]*?)<\/script>/)[1];
}

// The two halves of the edit mode API, read from the source instead of listed here so that the
// tests below cover every name and not just the ones somebody remembered to add.
function windowAPINames() {
  const assign = fs.readFileSync('client/js/main.js', 'utf8').match(/Object\.assign\(window, \{([\s\S]*?)\}\);/)[1];
  return assign.split(',').map(name => name.trim()).filter(name => /^[\w$]+$/.test(name));
}

// Files are concatenated as they are, so everything a bundle declares for itself starts at the
// beginning of a line - anything indented belongs to a scope inside one of them. Only the name a
// declaration starts with is read, so a second one in the same `let a, b` and a destructured
// binding are not covered: this catches the shape the bundles are written in, it is not a proof.
function topLevelDeclarationNames(js) {
  return [ ...new Set([ ...js.matchAll(/^(?:export\s+)?(?:async\s+)?(?:function|class|let|const|var)\s+([\w$]+)/gm) ].map(match => match[1])) ];
}

// validator/validate_gamefile.js also runs outside the browser (validate_gamefile_node.js), so it
// declares the helpers it needs itself rather than relying on the handover. Its asArray is not the
// same function as the handed over one - it turns null and undefined into an empty array where
// domhelpers.js wraps them - and being a declaration, it is the one the whole editor bundle uses.
const SHADOWED_ON_PURPOSE = [ 'asArray' ];

function topLevelFunctionNames(js) {
  return [ ...new Set([ ...js.matchAll(/^(?:async\s+)?function\s+([\w$]+)/gm) ].map(match => match[1])) ];
}

// terser leaves `export function foo` alone and collects the rest into an `export{a as foo}` list,
// so reading the names out of a bundle has to cover both forms and the renamed left half.
function exportedNames(js) {
  const names = new Set();
  for(const [ , name ] of js.matchAll(/export\s+(?:async\s+)?(?:function|class|const|let|var)\s+([\w$]+)/g))
    names.add(name);
  for(const [ , list ] of js.matchAll(/export\s*\{([^}]*)\}/g))
    for(const name of list.split(',').map(entry => entry.trim().split(/\s+as\s+/).pop()).filter(name => /^[\w$]+$/.test(name)))
      names.add(name);
  return [ ...names ];
}

// Both minification passes (terser on the bundle and html-minifier-terser on the surrounding
// document) have to honour the minifyJavascript config, otherwise a local checkout ships a
// minified client and debugging it in the browser becomes impossible - and a production build
// that stops minifying ships a client that is about 50% bigger.
describe('minifyHTML with minifyJavascript disabled', () => {
  let build;

  beforeAll(async () => {
    build = await buildWith('false');  // an env override arrives as a string, not a boolean
  }, 180000);

  test('keeps the inline client JS readable', () => {
    const script = inlineClientJS(build);
    expect(script).toMatch(readableJS);
    expect(script).toContain('\n\n');
  });

  test('keeps the editor JS readable', () => {
    expect(build.editorJSmin).toMatch(readableJS);
    expect(build.editorJSmin).toContain('\n\n');
  });

  // Edit mode reads its half of the API off the window, which is a plain global lookup - so a top
  // level declaration of the same name anywhere in the editor bundle wins over it, silently and
  // for the whole bundle at once. A name that is handed over therefore must not be declared on the
  // other side of the boundary.
  test('does not shadow a handed over name in the editor bundle', () => {
    const names = windowAPINames();
    expect(names.length).toBeGreaterThan(50);  // the block was found, not an empty match
    const declared = topLevelDeclarationNames(build.editorJSmin);
    expect(declared.length).toBeGreaterThan(100);  // same for the bundle
    expect(names.filter(name => declared.includes(name) && !SHADOWED_ON_PURPOSE.includes(name))).toEqual([]);
  });

  // The way back is the same lookup: what edit mode exports ends up on the window as well, and the
  // client bundle reads those names as globals - loadTraceFile, which the F9 handler calls, is one
  // of them.
  test('does not shadow a name edit mode hands back in the client bundle', () => {
    const names = exportedNames(build.editorJSmin);
    expect(names.length).toBeGreaterThan(20);  // the exports were found, not an empty match
    const declared = topLevelDeclarationNames(inlineClientJS(build));
    expect(names.filter(name => declared.includes(name))).toEqual([]);
  });

  // Nothing imports the client bundle, so its exports only stop terser from dropping code that
  // is not called anymore. They are removed in both builds so that the two behave the same.
  test('drops the exports of the client bundle', () => {
    expect(inlineClientJS(build)).not.toMatch(/^export[ {]/m);
  });
});

describe('minifyHTML with minifyJavascript enabled', () => {
  let build;
  let readableBuild;

  beforeAll(async () => {
    // the readable build still has the names and the export statements, so it is where the lists
    // of what has to survive - or disappear from - the minified one come from
    readableBuild = await buildWith('false');
    build = await buildWith('true');
  }, 180000);

  test('minifies the inline client JS', () => {
    expect(inlineClientJS(build)).not.toMatch(readableJS);
  });

  test('minifies the editor JS', () => {
    expect(build.editorJSmin).not.toMatch(readableJS);
  });

  // Renaming the top level is where most of the compression of this bundle comes from, and it
  // silently stops happening as soon as anything in it uses a direct eval - terser then leaves
  // every name that eval could see alone. A few names survive because they are also used as a
  // property or in a string somewhere, hence the ratio instead of an empty list.
  test('renames the top level of the client bundle', () => {
    const minified = inlineClientJS(build);
    const internal = topLevelFunctionNames(inlineClientJS(readableBuild))
      .filter(name => !windowAPINames().includes(name));
    expect(internal.length).toBeGreaterThan(100);  // the readable build was read, not an empty match
    const survivors = internal.filter(name => new RegExp(`\\b${name}\\b`).test(minified));
    expect(survivors.length).toBeLessThan(internal.length / 10);
  });

  // Top level names get renamed, which is only safe as long as the names that cross the bundle
  // boundary survive: the keys main.js copies onto window for edit mode and the exports edit mode
  // hands back. Both are what terser considers external, so it keeps them - but a future option
  // that mangles them too would break edit mode and nothing else.
  test('keeps the names the client bundle hands to edit mode', () => {
    const script = inlineClientJS(build);
    const names = windowAPINames();
    expect(names.length).toBeGreaterThan(50);  // the block was found, not an empty match
    const missing = names.filter(name => !script.includes(`,${name}:`) && !script.includes(`{${name}:`));
    expect(missing).toEqual([]);
  });

  test('keeps the names edit mode hands back to the client bundle', () => {
    const exportedByEditMode = exportedNames(readableBuild.editorJSmin);
    const stillExported = exportedNames(build.editorJSmin);
    expect(exportedByEditMode.length).toBeGreaterThan(10);
    for(const name of exportedByEditMode)
      expect(stillExported).toContain(name);  // exported, not just mentioned somewhere
  });

  // fflate is served from node_modules as it is, only pre-compressed
  test('gzips fflate without changing it', () => {
    const fflate = fs.readFileSync('node_modules/fflate/umd/index.js');
    expect(build.fflateMin.equals(fflate)).toBe(true);
    expect(zlib.gunzipSync(build.fflateGzipped).equals(fflate)).toBe(true);
  });
});
