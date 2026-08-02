import { calculateLayout, DEFAULT_VIEWPORT, setViewportSize, viewportConfig } from '../client/js/calculateLayout.js';

describe('calculateLayout', () => {
  const viewport16x10 = { targetWidth: 1600, targetHeight: 1000 };

  test('fills the height and leaves the margin to a side toolbar on wide screens', () => {
    const result = calculateLayout(1700, 1000, viewport16x10);
    expect(result.layoutMode).toBe('side');
    expect(result.scale).toBe(1);
  });

  test('upgrades to a wide side toolbar once the margin is big enough', () => {
    const result = calculateLayout(3200, 1000, viewport16x10);
    expect(result.layoutMode).toBe('wide-side');
    expect(result.scale).toBe(1);
  });

  test('fills the width and puts the toolbar at the bottom on tall screens', () => {
    const result = calculateLayout(1000, 2000, viewport16x10);
    expect(result.layoutMode).toBe('bottom');
    expect(result.scale).toBe(0.625);
  });

  // the tight layout is what makes the hide toolbar button appear, so it has to stay reachable
  test('shrinks the board to make room for the toolbar when the window matches the board aspect', () => {
    const result = calculateLayout(1600, 1000, viewport16x10);
    expect(result.layoutMode).toBe('tight');
    expect(result.scale).toBe((1600-44)/1600);
  });

  test('keeps the full scale in a tight layout while the toolbar is hidden', () => {
    const result = calculateLayout(1600, 1000, viewport16x10, { toolbarHidden: true });
    expect(result.layoutMode).toBe('tight');
    expect(result.scale).toBe(1);
  });

  test('uses the board aspect ratio of the game, not 16:10', () => {
    const portrait = { targetWidth: 1000, targetHeight: 1600 };
    expect(calculateLayout(1600, 1000, portrait).layoutMode).toBe('wide-side');
    expect(calculateLayout(1000, 1600, portrait).layoutMode).toBe('tight');
    expect(calculateLayout(900, 1600, portrait).layoutMode).toBe('bottom');
  });

  test('keeps the scale it is given (edit mode) but still picks a layout', () => {
    const result = calculateLayout(1700, 1000, viewport16x10, { scale: 0.5 });
    expect(result.scale).toBe(0.5);
    expect(result.layoutMode).toBe('wide-side');
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
