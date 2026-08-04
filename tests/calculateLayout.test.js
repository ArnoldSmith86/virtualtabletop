import { calculateLayout, calculateEditModuleClasses, isEditSidebarNarrow, isOrientationMismatch, DEFAULT_VIEWPORT, normalizeBoardSize, setViewportSize, viewportConfig } from '../client/js/calculateLayout.js';

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

// this replaces `@media (orientation: portrait)` on the "please rotate your device" nag, so
// for the default board it has to match that media query window size for window size
describe('isOrientationMismatch', () => {
  const landscapeBoard = { targetWidth: 1600, targetHeight: 1000 };
  const portraitBoard  = { targetWidth: 1000, targetHeight: 1600 };
  const squareBoard    = { targetWidth: 1200, targetHeight: 1200 };

  test('matches the portrait media query it replaces for the default board', () => {
    expect(isOrientationMismatch(400, 800, landscapeBoard)).toBe(true);
    expect(isOrientationMismatch(800, 800, landscapeBoard)).toBe(true);
    expect(isOrientationMismatch(800, 799, landscapeBoard)).toBe(false);
    expect(isOrientationMismatch(1920, 1080, landscapeBoard)).toBe(false);
  });

  // the case the board size setting exists for: rotating away from it would only make it worse
  test('never asks to rotate away from a portrait or square board', () => {
    expect(isOrientationMismatch(620, 1000, portraitBoard)).toBe(false);
    expect(isOrientationMismatch(620, 1000, squareBoard)).toBe(false);
  });

  // a letterboxed portrait board on a desktop is perfectly playable, so no nag either way
  test('does not nag a portrait board on a landscape window', () => {
    expect(isOrientationMismatch(1920, 1080, portraitBoard)).toBe(false);
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

// replaces `@media (max-width: 1600px)` on the editor sidebar: the labels may stay as long as
// the 92px they cost are not what the room is short of
describe('isEditSidebarNarrow', () => {
  const viewport16x10 = { targetWidth: 1600, targetHeight: 1000 };
  const portraitBoard = { targetWidth: 1000, targetHeight: 1600 };
  const wideBoard     = { targetWidth: 3200, targetHeight: 1000 };

  test('keeps the labels while the room is limited by the window height', () => {
    expect(isEditSidebarNarrow(1920, 1080, viewport16x10)).toBe(false);
    // the media query took them away here even though the room is 90px short of the sidebar
    expect(isEditSidebarNarrow(1600, 900, viewport16x10)).toBe(false);
  });

  test('drops them once they would make the board smaller', () => {
    expect(isEditSidebarNarrow(1280, 800, viewport16x10)).toBe(true);
    // a wide board runs out of width in a window the default board has plenty of room in
    expect(isEditSidebarNarrow(1920, 1080, wideBoard)).toBe(true);
  });

  test('lets a portrait board keep them in a window the default board loses them in', () => {
    expect(isEditSidebarNarrow(1280, 800, portraitBoard)).toBe(false);
  });

  test('is implied by both module panel layouts, which need the room the sidebar has', () => {
    expect(calculateEditModuleClasses(1900, 1900, portraitBoard)).toEqual([ 'editModulesAbove' ]);
    expect(isEditSidebarNarrow(1900, 1900, portraitBoard)).toBe(true);
    expect(calculateEditModuleClasses(900, 900, viewport16x10)).toEqual([ 'editModulesOverlay' ]);
    expect(isEditSidebarNarrow(900, 900, viewport16x10)).toBe(true);
  });
});

describe('setViewportSize', () => {
  afterEach(() => setViewportSize(null));

  test('applies the board size from the game settings', () => {
    setViewportSize({ width: 1000, height: 1600 });
    expect(viewportConfig).toEqual({ targetWidth: 1000, targetHeight: 1600 });
  });

  // the state and the meta message both carry the board size, so whoever applies it first
  // has to be the one that reports the change - the other one must not re-layout again
  test('reports whether the board size actually changed', () => {
    expect(setViewportSize({ width: 1000, height: 1600 })).toBe(true);
    expect(setViewportSize({ width: 1000, height: 1600 })).toBe(false);
    expect(setViewportSize(null)).toBe(true);
    expect(setViewportSize(undefined)).toBe(false);
    // clamped to the same board, so nothing to re-layout
    expect(setViewportSize({ width: 1600, height: 1e9 })).toBe(true);
    expect(setViewportSize({ width: 1600, height: 99999 })).toBe(false);
  });

  test('falls back to the default viewport for games without a board size', () => {
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

// the server stores what this returns, so a game file can never describe a board that
// nobody renders - it is the same function the client applies to what it receives
describe('normalizeBoardSize', () => {
  test('passes a usable board size through', () => {
    expect(normalizeBoardSize({ width: 1000, height: 1600 })).toEqual({ width: 1000, height: 1600 });
  });

  test('clamps to the allowed range and rounds', () => {
    expect(normalizeBoardSize({ width: 10, height: 1e9 })).toEqual({ width: 100, height: 10000 });
    expect(normalizeBoardSize({ width: '1600.4', height: 999.5 })).toEqual({ width: 1600, height: 1000 });
  });

  test('replaces unusable dimensions with the default ones', () => {
    expect(normalizeBoardSize({ width: 'nonsense', height: 1600 })).toEqual({ width: 1600, height: 1600 });
    expect(normalizeBoardSize({})).toEqual({ width: 1600, height: 1000 });
  });

  test('has no board size to store for anything that is not a pair of numbers', () => {
    expect(normalizeBoardSize(null)).toBe(null);
    expect(normalizeBoardSize(undefined)).toBe(null);
    expect(normalizeBoardSize('1600x1000')).toBe(null);
  });
});
