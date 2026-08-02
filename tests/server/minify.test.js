import minifyHTML from '../../server/minify.mjs';

// Both minification passes (terser on the bundle and html-minifier-terser on the surrounding
// document) have to honour the minifyJavascript config, otherwise a local checkout ships a
// minified client and debugging it in the browser becomes impossible.
describe('minifyHTML with minifyJavascript disabled', () => {
  let build;

  beforeAll(async () => {
    process.env.MINIFYJAVASCRIPT = 'false';  // an env override arrives as a string, not a boolean
    build = await minifyHTML();
  }, 30000);

  afterAll(() => {
    delete process.env.MINIFYJAVASCRIPT;
  });

  test('keeps the inline client JS readable', () => {
    const script = build.min.match(/<script type=module>([\s\S]*?)<\/script>/)[1];
    expect(script).toMatch(/function \w+\([\w, ]*\) \{\n/);
    expect(script).toContain('\n\n');
  });

  test('keeps the editor JS readable', () => {
    expect(build.editorJSmin).toMatch(/function \w+\([\w, ]*\) \{\n/);
    expect(build.editorJSmin).toContain('\n\n');
  });
});
