import { parseContainerQueries, evaluateCondition } from '../client/js/containerQueryFallback.js';
import minifyHTML from '../server/minify.mjs';

describe('evaluateCondition', () => {
  const size = { width: 500, height: 300 };

  test('evaluates a single feature', () => {
    expect(evaluateCondition('(max-width: 600px)', size)).toBe(true);
    expect(evaluateCondition('(max-width: 400px)', size)).toBe(false);
    expect(evaluateCondition('(min-height: 300px)', size)).toBe(true);
    expect(evaluateCondition('(min-height: 301px)', size)).toBe(false);
  });

  test('combines features with and/or', () => {
    expect(evaluateCondition('((max-width: 400px) or (max-height: 375px))', size)).toBe(true);
    expect(evaluateCondition('((max-width: 400px) or (max-height: 200px))', size)).toBe(false);
    expect(evaluateCondition('((min-width: 400px) and (min-height: 200px))', size)).toBe(true);
    expect(evaluateCondition('((min-width: 400px) and (min-height: 400px))', size)).toBe(false);
  });

  // the shape the state details overlay uses: two upper bounds or one nested pair of lower ones
  test('evaluates nested conditions', () => {
    const condition = '((max-width: 1260px) or (max-height: 787px) or ((min-width: 1421px) and (min-height: 888px)))';
    expect(evaluateCondition(condition, size)).toBe(true);
    expect(evaluateCondition(condition, { width: 1500, height: 900 })).toBe(true);
    expect(evaluateCondition(condition, { width: 1300, height: 800 })).toBe(false);
  });

  // anything not understood must not turn a block on: the browser is then left with the
  // layout it has without the fallback rather than with a random one
  test('does not match features it cannot evaluate', () => {
    expect(evaluateCondition('(max-width: 30em)', size)).toBe(false);
    expect(evaluateCondition('(aspect-ratio: 16/10)', size)).toBe(false);
    expect(evaluateCondition('style(--columns: 10)', size)).toBe(false);
  });
});

describe('parseContainerQueries', () => {
  const css = `
    #roomArea {
      container: roomArea / size;
      overflow: clip;
    }
    #symbolPickerOverlay { container-name: symbolPicker; }
    @container roomArea ((max-width: 600px) or (max-height: 375px)) {
      #statesList { overflow: unset; }
      #statesOverlay { overflow: auto; }
    }
    #statesList .title { top: 0; }
    @container symbolPicker (max-height: 375px), symbolPicker (max-width: 600px) {
      #symbolPickerOverlay h1 { margin: 0 40px 10px; }
    }
  `;

  test('finds the elements that declare themselves as containers', () => {
    expect(parseContainerQueries(css).containers).toEqual([
      { name: 'roomArea', selector: '#roomArea' },
      { name: 'symbolPicker', selector: '#symbolPickerOverlay' }
    ]);
  });

  test('finds each block with its queries and its extent', () => {
    const { blocks } = parseContainerQueries(css);
    expect(blocks.length).toBe(2);
    expect(blocks[0].queries).toEqual([ { name: 'roomArea', condition: '((max-width: 600px) or (max-height: 375px))' } ]);
    expect(blocks[0].css).toContain('#statesOverlay { overflow: auto; }');
    // the rules between the two blocks stay outside of them, which is what keeps the
    // cascade intact when the stylesheet is split along these boundaries
    expect(css.slice(blocks[0].end, blocks[1].start)).toContain('#statesList .title');
  });

  test('keeps every query of a comma separated list', () => {
    expect(parseContainerQueries(css).blocks[1].queries).toEqual([
      { name: 'symbolPicker', condition: '(max-height: 375px)' },
      { name: 'symbolPicker', condition: '(max-width: 600px)' }
    ]);
  });

  test('reads minified css as well', () => {
    const { containers, blocks } = parseContainerQueries('#a{color:red}#roomArea{container:roomArea/size}@container roomArea (max-width:500px){#b{margin:0}}#c{color:blue}');
    expect(containers).toEqual([ { name: 'roomArea', selector: '#roomArea' } ]);
    expect(blocks[0].queries).toEqual([ { name: 'roomArea', condition: '(max-width:500px)' } ]);
    expect(blocks[0].css).toBe('#b{margin:0}');
  });

  // an @container the parser does not recognise is left in the sheet, where the browsers this
  // is for drop it - so the block simply has no fallback and nothing says so
  test('leaves an @container inside another at-rule alone', () => {
    const { blocks } = parseContainerQueries('@media print{@container roomArea (max-width:500px){#b{margin:0}}}@container roomArea (max-width:400px){#c{margin:0}}');
    expect(blocks.length).toBe(1);
    expect(blocks[0].css).toBe('#c{margin:0}');
  });
});

// The parser reads the stylesheets as text, so every way it can stop recognising a block is
// silent: the block keeps its at-rule, the browsers this is for drop it, and the only symptom
// is the layout these tests exist to fix coming back. CI runs a browser that has container
// queries and would not see any of it, so the shipped stylesheets are checked here instead.
describe('the stylesheets the client is served', () => {
  let sheets;

  beforeAll(async () => {
    process.env.MINIFYJAVASCRIPT = 'false';  // only the CSS is read below, and terser is slow
    try {
      const build = await minifyHTML();
      sheets = {
        // as inlined into room.html, i.e. after clean-css and after html-minifier-terser's own
        // pass over the <style> element - the exact text the fallback parses in the browser
        room: build.min.match(/<style>([\s\S]*?)<\/style>/)[1],
        // edit mode appends its sheet from a template literal in initializeEditMode
        editor: build.editorJSmin.match(/style\.appendChild\(document\.createTextNode\(`([\s\S]*?)`\)\)/)[1]
      };
    } finally {
      delete process.env.MINIFYJAVASCRIPT;
    }
  }, 300000);

  test('are read out of the build, not out of an empty match', () => {
    expect(sheets.room.length).toBeGreaterThan(10000);
    expect(sheets.editor.length).toBeGreaterThan(10000);
  });

  // an unnamed query, or one nested in another at-rule, is skipped rather than reported
  test('have every @container block recognised', () => {
    const counted = {}, recognised = {};
    for(const name in sheets) {
      counted[name] = (sheets[name].match(/@container/g) || []).length;
      recognised[name] = parseContainerQueries(sheets[name]).blocks.length;
    }
    expect(recognised).toEqual(counted);
    expect(counted.room).toBeGreaterThan(0);
    expect(counted.editor).toBeGreaterThan(0);
  });

  test('declare every container their queries name', () => {
    const containers = {};
    const undeclared = [];
    for(const name of [ 'room', 'editor' ]) {  // the order the client reads them in: the
      const { containers: declared, blocks } = parseContainerQueries(sheets[name]);  // editor
      for(const container of declared)                       // sheet queries #roomArea without
        containers[container.name] = container.selector;     // declaring it as a container
      for(const block of blocks)
        for(const query of block.queries)
          if(!containers[query.name])
            undeclared.push(`${name}: ${query.name}`);
    }
    expect(undeclared).toEqual([]);
    expect(Object.keys(containers).length).toBeGreaterThan(1);
    // document.querySelector takes the first match in the document, not in the selector list,
    // so a selector clean-css merged with another one would resolve to the wrong element
    for(const name in containers)
      expect(containers[name]).toMatch(/^[.#]?[-\w]+$/);
  });

  test('can be split along the block boundaries without unbalancing a rule', () => {
    for(const name in sheets) {
      const { blocks } = parseContainerQueries(sheets[name]);
      const pieces = [];
      let cursor = 0;
      for(const block of blocks) {
        pieces.push(sheets[name].slice(cursor, block.start), block.css);
        cursor = block.end;
      }
      pieces.push(sheets[name].slice(cursor));

      for(const piece of pieces) {
        let depth = 0, lowest = 0;
        for(const brace of piece.match(/[{}]/g) || [])
          lowest = Math.min(lowest, depth += brace == '{' ? 1 : -1);
        expect([ name, depth, lowest ]).toEqual([ name, 0, 0 ]);
      }
    }
  });
});
