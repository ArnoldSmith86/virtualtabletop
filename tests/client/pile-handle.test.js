import { widgets, addWidget, batchStart, batchEnd, widgetFilter, flushDelta } from '../../client/js/serverstate.js';
import { Widget } from '../../client/js/widgets/widget.js';
import { setViewportSize } from '../../client/js/calculateLayout.js';

import { removeWidget } from './client-util.js';

// pile.js relies on the concatenated global scope of the shipped bundle rather than
// on imports, so expose the identifiers it references before importing it.
let Pile;
beforeAll(async () => {
  globalThis.Widget = Widget;
  globalThis.widgets = widgets;
  globalThis.widgetFilter = widgetFilter;
  globalThis.batchStart = batchStart;
  globalThis.batchEnd = batchEnd;
  globalThis.flushDelta = flushDelta;
  globalThis.setDeltaCause = () => {};
  globalThis.getMaxZ = () => 0;
  globalThis.updateMaxZ = () => {};
  globalThis.mapAssetURLs = url => url;
  globalThis.playerName = 'jestPlayer';
  ({ Pile } = await import('../../client/js/widgets/pile.js'));
});

function createPile(def) {
  const pile = new Pile(def.id);
  addWidget({ ...def, type: 'pile' }, pile);
  return pile;
}

describe('Pile handle placement', () => {
  afterEach(() => setViewportSize(null));

  test('points outwards while the pile is away from the board edge', () => {
    const pile = createPile({ id: 'handle-inside', x: 970, y: 100, width: 20, height: 20 });
    expect(pile.handle.classList.contains('right')).toBe(true);
    removeWidget('handle-inside');
  });

  test('flips inwards when a smaller board moves the edge past the pile', () => {
    const pile = createPile({ id: 'handle-shrink', x: 970, y: 100, width: 20, height: 20 });
    expect(pile.handle.classList.contains('right')).toBe(true);

    // the pile still fits on a 1000 wide board (970+20), but the handle no longer does
    setViewportSize({ width: 1000, height: 1000 });
    pile.updateHandlePlacement();
    expect(pile.handle.classList.contains('right')).toBe(false);

    setViewportSize(null);
    pile.updateHandlePlacement();
    expect(pile.handle.classList.contains('right')).toBe(true);
    removeWidget('handle-shrink');
  });

  test('flips back outwards when a bigger board moves the edge away', () => {
    setViewportSize({ width: 1000, height: 1000 });
    const pile = createPile({ id: 'handle-grow', x: 970, y: 100, width: 20, height: 20 });
    expect(pile.handle.classList.contains('right')).toBe(false);

    setViewportSize({ width: 2000, height: 1000 });
    pile.updateHandlePlacement();
    expect(pile.handle.classList.contains('right')).toBe(true);
    removeWidget('handle-grow');
  });

  test('follows the bottom edge of a shorter board', () => {
    const pile = createPile({ id: 'handle-bottom', x: 100, y: 960, width: 20, height: 20, handlePosition: 'bottom left' });
    expect(pile.handle.classList.contains('bottom')).toBe(false);

    setViewportSize({ width: 1600, height: 2000 });
    pile.updateHandlePlacement();
    expect(pile.handle.classList.contains('bottom')).toBe(true);
    removeWidget('handle-bottom');
  });

  test('leaves a centered handle alone', () => {
    const pile = createPile({ id: 'handle-center', x: 970, y: 100, width: 20, height: 20, handlePosition: 'center middle' });
    expect(pile.handle.classList.contains('center')).toBe(true);
    expect(pile.handle.classList.contains('middle')).toBe(true);

    setViewportSize({ width: 1000, height: 1000 });
    pile.updateHandlePlacement();
    expect(pile.handle.classList.contains('center')).toBe(true);
    expect(pile.handle.classList.contains('middle')).toBe(true);
    expect(pile.handle.classList.contains('right')).toBe(false);
    removeWidget('handle-center');
  });
});
