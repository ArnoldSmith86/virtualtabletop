import fs from 'fs';
import zlib from 'zlib';

import minifyHTML from '../../server/minify.mjs';

// A readable build keeps multi-line function bodies and blank lines, a minified one has neither.
const readableJS = /function \w+\([\w, ]*\) \{\n/;

async function buildWith(minifyJavascript) {
  process.env.MINIFYJAVASCRIPT = minifyJavascript;
  try {
    return await minifyHTML();
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
  }, 60000);

  test('keeps the inline client JS readable', () => {
    const script = inlineClientJS(build);
    expect(script).toMatch(readableJS);
    expect(script).toContain('\n\n');
  });

  test('keeps the editor JS readable', () => {
    expect(build.editorJSmin).toMatch(readableJS);
    expect(build.editorJSmin).toContain('\n\n');
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
  }, 60000);

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
