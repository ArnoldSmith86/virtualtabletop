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

function editorExportNames(readableBuild) {
  const names = new Set();
  for(const [ , name ] of readableBuild.editorJSmin.matchAll(/^export\s+(?:async\s+)?(?:function|class|const|let|var)\s+([\w$]+)/gm))
    names.add(name);
  for(const [ , list ] of readableBuild.editorJSmin.matchAll(/^export\s*\{([^}]*)\}/gm))
    for(const name of list.split(',').map(name => name.trim()).filter(name => /^[\w$]+$/.test(name)))
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
  let exportedByEditMode;

  beforeAll(async () => {
    // the readable build still has the export statements, so it is where the list of names that
    // have to survive the minified one comes from
    exportedByEditMode = editorExportNames(await buildWith('false'));
    build = await buildWith('true');
  }, 60000);

  test('minifies the inline client JS', () => {
    expect(inlineClientJS(build)).not.toMatch(readableJS);
  });

  test('minifies the editor JS', () => {
    expect(build.editorJSmin).not.toMatch(readableJS);
  });

  // Top level names get renamed, which is only safe as long as the names that cross the bundle
  // boundary survive: the keys main.js copies onto window for edit mode and the exports edit mode
  // hands back. Both are what terser considers external, so it keeps them - but a future option
  // that mangles them too would break edit mode and nothing else.
  test('keeps the names the client bundle hands to edit mode', () => {
    const script = inlineClientJS(build);
    const names = windowAPINames();
    expect(names.length).toBeGreaterThan(50);  // the block was found, not an empty match
    for(const name of names)
      expect(script).toMatch(new RegExp(`[,{]${name.replace(/\$/g, '\\$')}:`));
  });

  test('keeps the names edit mode hands back to the client bundle', () => {
    expect(exportedByEditMode.length).toBeGreaterThan(10);
    for(const name of exportedByEditMode)
      expect(build.editorJSmin).toMatch(new RegExp(`\\b${name}\\b`));
  });

  // fflate is served from node_modules as it is, only pre-compressed
  test('gzips fflate without changing it', () => {
    const fflate = fs.readFileSync('node_modules/fflate/umd/index.js');
    expect(build.fflateMin.equals(fflate)).toBe(true);
    expect(zlib.gunzipSync(build.fflateGzipped).equals(fflate)).toBe(true);
  });
});
