import { parseContainerQueries, evaluateCondition } from '../client/js/containerQueryFallback.js';

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
});
