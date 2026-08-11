import { dropTargets } from '../../client/js/main.js';
import { widgets, addWidget, batchStart, batchEnd, widgetFilter, flushDelta } from '../../client/js/serverstate.js';
import { Widget } from '../../client/js/widgets/widget.js';

import { createWidget, removeWidget } from './client-util.js';

// A pile in a holder that arranges piles spreads its own cards, the way the holder says.
// pile.js relies on the concatenated global scope of the shipped bundle rather than on
// imports, so expose the identifiers it references before importing it.
let Pile;
beforeAll(async () => {
  globalThis.Widget = Widget;
  globalThis.widgets = widgets;
  globalThis.dropTargets = dropTargets;
  globalThis.widgetFilter = widgetFilter;
  globalThis.batchStart = batchStart;
  globalThis.batchEnd = batchEnd;
  globalThis.flushDelta = flushDelta;
  globalThis.setDeltaCause = () => {};
  globalThis.getMaxZ = () => 0;
  globalThis.updateMaxZ = () => {};
  globalThis.mapAssetURLs = url => url;
  globalThis.playerName = 'jestPlayer';
  // jsdom has no CSS layout and no DOMMatrix, which the handle placement of a pile with a
  // parent walks through - an identity transform is enough for the offsets asserted here
  globalThis.DOMPoint = globalThis.DOMPoint || class { constructor(x=0, y=0) { Object.assign(this, { x, y, z: 0, w: 1 }); } };
  globalThis.DOMMatrix = globalThis.DOMMatrix || class {
    constructor() { Object.assign(this, { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, is2D: true }); }
    multiplySelf() { return this; }
    preMultiplySelf() { return this; }
    translateSelf() { return this; }
    inverse() { return this; }
    transformPoint(point) { return new globalThis.DOMPoint(point.x, point.y); }
  };
  ({ Pile } = await import('../../client/js/widgets/pile.js'));
});

// The real Holder is not a module either, and everything asserted here only needs a parent
// that answers to the two properties the pile reads from it.
function createHolder(definition) {
  const holder = createWidget({ type: 'holder', ...definition });
  holder.receiveCard = async () => {};
  return holder;
}

function createPile(definition) {
  const pile = new Pile(definition.id);
  addWidget({ ...definition, type: 'pile' }, pile);
  return pile;
}

// cards bottom to top: the pile lays them out by z
function withCards(pileID, count) {
  for(let i=0; i<count; ++i)
    createWidget({ id: `${pileID}-card-${i}`, type: 'card', parent: pileID, z: i+1 });
  return widgets.get(pileID);
}

function positions(pileID, count) {
  return Array.from({ length: count }, (_, i)=>widgets.get(`${pileID}-card-${i}`).get('y'));
}

afterEach(() => {
  for(const id of [ ...widgets.keys() ])
    removeWidget(id);
});

describe('a pile spreading its cards', () => {
  test('stacks them on the same spot without a stack offset', async () => {
    const pile = withCards(createPile({ id: 'plain' }).get('id'), 3);
    await pile.arrangeChildren();
    expect(positions('plain', 3)).toEqual([ 0, 0, 0 ]);
  });

  test('spreads them by its stack offset, bottom card first', async () => {
    const pile = withCards(createPile({ id: 'spread', stackOffsetY: 40 }).get('id'), 3);
    await pile.arrangeChildren();
    expect(positions('spread', 3)).toEqual([ 0, 40, 80 ]);
  });

  test('keeps the offset for the topmost spreadMin cards and compresses the rest', async () => {
    const pile = withCards(createPile({ id: 'min', stackOffsetY: 40, spreadMin: 3 }).get('id'), 5);
    await pile.arrangeChildren();
    expect(positions('min', 5)).toEqual([ 0, 4, 8, 48, 88 ]);
  });

  test('reports how much room it takes up, so the holder can place the next pile', () => {
    const pile = withCards(createPile({ id: 'extent', stackOffsetY: 40, spreadMin: 3 }).get('id'), 5);
    expect(pile.spreadExtent('Y')).toBe(88 + 100);
    expect(pile.spreadExtent('X')).toBe(100);
  });

  test('takes a card dropped onto any of its spread cards, not just onto its corner', async () => {
    const pile = withCards(createPile({ id: 'snap', x: 10, y: 20, stackOffsetY: 40 }).get('id'), 3);
    await pile.arrangeChildren();
    expect(pile.pileSnapPositions()).toEqual([ [ 10, 100 ], [ 10, 60 ], [ 10, 20 ] ]);
  });

  test('offers only its own position while its cards lie on top of each other', () => {
    const pile = withCards(createPile({ id: 'nosnap', x: 10, y: 20 }).get('id'), 3);
    expect(pile.pileSnapPositions()).toEqual([ [ 10, 20 ] ]);
  });
});

describe('a pile in a holder that arranges piles', () => {
  test('is laid out the way the holder lays out its cards', async () => {
    createHolder({ id: 'tableau', allowPiles: true, stackOffsetY: 30, spreadMin: 2 });
    const pile = withCards(createPile({ id: 'inherit', parent: 'tableau' }).get('id'), 4);

    expect(pile.get('stackOffsetY')).toBe(30);
    expect(pile.get('spreadMin')).toBe(2);
    await pile.arrangeChildren();
    expect(positions('inherit', 4)).toEqual([ 0, 3, 6, 36 ]);
  });

  test('keeps its own offset when it has one', async () => {
    createHolder({ id: 'tableau', allowPiles: true, stackOffsetY: 30 });
    const pile = withCards(createPile({ id: 'own', parent: 'tableau', stackOffsetY: 10 }).get('id'), 3);

    await pile.arrangeChildren();
    expect(positions('own', 3)).toEqual([ 0, 10, 20 ]);
  });

  test('inherits nothing from a holder that does not arrange piles', () => {
    createHolder({ id: 'hand', stackOffsetY: 30, spreadMin: 2 });
    const pile = createPile({ id: 'plain', parent: 'hand' });

    expect(pile.get('stackOffsetY')).toBe(0);
    expect(pile.get('spreadMin')).toBe(null);
  });
});
