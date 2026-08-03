import { calculateLayout, calculateEditModuleClasses, DEFAULT_VIEWPORT, setViewportSize, viewportConfig } from '../client/js/calculateLayout.js';

describe('calculateLayout', () => {
  const viewport16x10 = { targetWidth: 1600, targetHeight: 1000 };

  test('fills the height and leaves the margin to a side toolbar on wide screens', () => {
    const result = calculateLayout(1700, 1000, viewport16x10);
    expect(result.layoutClass).toBe('');
    expect(result.scale).toBe(1);
  });

  test('upgrades to a wide side toolbar once the margin is big enough', () => {
    const result = calculateLayout(3200, 1000, viewport16x10);
    expect(result.layoutClass).toBe('wideToolbar');
    expect(result.scale).toBe(1);
  });

  test('fills the width and puts the toolbar at the bottom on tall screens', () => {
    const result = calculateLayout(1000, 2000, viewport16x10);
    expect(result.layoutClass).toBe('horizontalToolbar');
    expect(result.scale).toBe(0.625);
  });

  // aspectTooGood is what makes the hide toolbar button appear, so it has to stay reachable
  test('shrinks the board to make room for the toolbar when the window matches the board aspect', () => {
    const result = calculateLayout(1600, 1000, viewport16x10);
    expect(result.layoutClass).toBe('aspectTooGood');
    expect(result.scale).toBe((1600-44)/1600);
  });

  test('keeps the full scale in an aspectTooGood layout while the toolbar is hidden', () => {
    const result = calculateLayout(1600, 1000, viewport16x10, { toolbarHidden: true });
    expect(result.layoutClass).toBe('aspectTooGood');
    expect(result.scale).toBe(1);
  });

  test('uses the board aspect ratio of the game, not 16:10', () => {
    const portrait = { targetWidth: 1000, targetHeight: 1600 };
    expect(calculateLayout(1600, 1000, portrait).layoutClass).toBe('wideToolbar');
    expect(calculateLayout(1000, 1600, portrait).layoutClass).toBe('aspectTooGood');
    expect(calculateLayout(900, 1600, portrait).layoutClass).toBe('horizontalToolbar');
  });

  test('keeps the scale it is given (edit mode) but still picks a layout', () => {
    const result = calculateLayout(1700, 1000, viewport16x10, { scale: 0.5 });
    expect(result.scale).toBe(0.5);
    expect(result.layoutClass).toBe('wideToolbar');
  });

  // the layout math is meant to be main's setScale, only parameterized by the board size -
  // this is what setScale did with the numbers hardcoded, so it has to agree everywhere
  test('picks the same class and scale the hardcoded 1600x1000 math did', () => {
    const hardcoded = (w, h, toolbarHidden) => {
      let scale = w/h < 1600/1000 ? w/1600 : h/1000;
      let layoutClass = '';
      if(w-scale*1600 + h-scale*1000 < 44) {
        layoutClass = 'aspectTooGood';
        if(!toolbarHidden)
          scale = (w-44)/1600;
      } else if(w - scale*1600 > 200) {
        layoutClass = 'wideToolbar';
      } else if(w/h < 1600/1000) {
        layoutClass = 'horizontalToolbar';
      }
      return { scale, layoutClass };
    };

    const mismatches = [];
    for(let w = 200; w <= 4000; w += 7)
      for(let h = 150; h <= 2500; h += 13)
        for(const toolbarHidden of [ false, true ]) {
          const expected = hardcoded(w, h, toolbarHidden);
          const actual = calculateLayout(w, h, viewport16x10, { toolbarHidden });
          if(actual.layoutClass != expected.layoutClass || actual.scale != expected.scale)
            mismatches.push(`${w}x${h}${toolbarHidden ? ' hidden' : ''}: ${actual.layoutClass}/${actual.scale} instead of ${expected.layoutClass}/${expected.scale}`);
        }
    expect(mismatches).toEqual([]);
  });
});

describe('calculateEditModuleClasses', () => {
  const viewport16x10 = { targetWidth: 1600, targetHeight: 1000 };

  // what the media queries this replaces matched, expressed in js
  const mediaQueryClasses = (w, h) => {
    const classes = [];
    if((h >= w && w >= 1000) || w/h <= 16/20)  // (orientation: portrait) and (min-width: 1000px), (max-aspect-ratio: 16/20)
      classes.push('editModulesAbove');
    if(w <= 1000 && w/h >= 16/20)              // (max-width: 1000px) and (min-aspect-ratio: 16/20)
      classes.push('editModulesOverlay');
    return classes;
  };

  test('sets the same classes the media queries matched for the default board', () => {
    const mismatches = [];
    for(let w = 200; w <= 3000; w += 8)
      for(let h = 150; h <= 2000; h += 11)
        if(String(calculateEditModuleClasses(w, h, viewport16x10)) != String(mediaQueryClasses(w, h)))
          mismatches.push(`${w}x${h}: ${calculateEditModuleClasses(w, h, viewport16x10)} instead of ${mediaQueryClasses(w, h)}`);
    expect(mismatches).toEqual([]);
  });

  test('flips at the shape of the board, not at a hardcoded 16:20', () => {
    // a wide board leaves room above and below itself, so the panel goes there
    // instead of taking width away from an already short room
    const wide = { targetWidth: 3200, targetHeight: 1000 };
    expect(calculateEditModuleClasses(1400, 1200, viewport16x10)).toEqual([]);
    expect(calculateEditModuleClasses(1400, 1200, wide)).toEqual([ 'editModulesAbove' ]);
  });
});

describe('setViewportSize', () => {
  afterEach(() => setViewportSize(null));

  test('applies the aspect ratio from the game settings', () => {
    setViewportSize({ width: 1000, height: 1600 });
    expect(viewportConfig).toEqual({ targetWidth: 1000, targetHeight: 1600 });
  });

  test('falls back to the default viewport for games without an aspect ratio', () => {
    setViewportSize({ width: 1000, height: 1600 });
    setViewportSize(undefined);
    expect(viewportConfig).toEqual(DEFAULT_VIEWPORT);
  });

  test('does not let a broken game file break the layout', () => {
    setViewportSize({ width: 0, height: 'nonsense' });
    expect(viewportConfig).toEqual(DEFAULT_VIEWPORT);
    setViewportSize({ width: -5, height: 1e9 });
    expect(viewportConfig).toEqual({ targetWidth: 100, targetHeight: 10000 });
  });
});
