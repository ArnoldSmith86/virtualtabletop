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
});

describe('minifyHTML with minifyJavascript enabled', () => {
  let build;

  beforeAll(async () => {
    build = await buildWith('true');
  }, 60000);

  test('minifies the inline client JS', () => {
    expect(inlineClientJS(build)).not.toMatch(readableJS);
  });

  test('minifies the editor JS', () => {
    expect(build.editorJSmin).not.toMatch(readableJS);
  });
});
