import { dropTargets, exceedsDropLimit } from '../../client/js/main.js';
import { widgets, addWidget, batchStart, batchEnd, widgetFilter, flushDelta, arrangementStateVersion } from '../../client/js/serverstate.js';
import { Widget } from '../../client/js/widgets/widget.js';
import { sortWidgets } from '../../client/js/main.js';

import { createWidget, removeWidget } from './client-util.js';

// The layout property: what each layout derives for the holder, when the auto
// layout applies and how it arranges, the grid, and the group operations MOVE
// position and SORT groupBy build on. holder.js relies on the concatenated
// global scope of the shipped bundle rather than on imports, so expose the
// identifiers it references before importing it.
let Holder, Pile;
let pileCounter = 0;
// the random layout draws from the shared rand(); a seeded stand-in keeps the
// scatter deterministic and lets tests assert how much randomness a pass used
let randState = 1;
let randCalls = 0;
beforeAll(async () => {
  globalThis.rand = () => {
    ++randCalls;
    randState = (randState * 1103515245 + 12345) % 2147483648;
    return randState / 2147483648;
  };
  globalThis.Widget = Widget;
  globalThis.ImageWidget = class ImageWidget extends Widget {
    getImage() { return ''; }
    updateIcon() {}
  };
  globalThis.widgets = widgets;
  globalThis.dropTargets = dropTargets;
  globalThis.widgetFilter = widgetFilter;
  globalThis.batchStart = batchStart;
  globalThis.batchEnd = batchEnd;
  globalThis.flushDelta = flushDelta;
  globalThis.arrangementStateVersion = arrangementStateVersion;
  globalThis.legacyMode = () => false;
  globalThis.compareDropTarget = w => w.get('type') == 'card' || w.get('type') == 'pile';
  globalThis.asArray = v => Array.isArray(v) ? v : [ v ];
  globalThis.tracingEnabled = false;
  globalThis.sendTraceEvent = () => {};
  globalThis.setDeltaCause = () => {};
  globalThis.rescaleDragAnchor = () => {};
  globalThis.removeWidgetLocal = id => removeWidget(id);
  // bringToFront() decides the stacking order makeGroup preserves, so it has
  // to see the real maximum rather than a constant
  globalThis.getMaxZ = () => Math.max(0, ...[ ...widgets.values() ].map(w=>w.get('z') || 0));
  globalThis.updateMaxZ = () => {};
  globalThis.defaultPileSnapRange = 10;
  globalThis.mapAssetURLs = url => url;
  globalThis.setTextAndAdjustFontSize = () => {};
  globalThis.playerName = 'jestPlayer';
  globalThis.sortWidgets = sortWidgets;
  globalThis.exceedsDropLimit = exceedsDropLimit;
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
  ({ Holder } = await import('../../client/js/widgets/holder.js'));
  globalThis.addWidgetLocal = async definition => {
    const id = definition.id || `jest-pile-${++pileCounter}`;
    const widget = definition.type == 'pile' ? new Pile(id) : new Widget(id);
    addWidget({ ...definition, id }, widget);
    return id;
  };
});

const CARD_WIDTH = 100;
const CARD_HEIGHT = 100;

function createHolder(definition) {
  const holder = new Holder(definition.id);
  addWidget({ ...definition, type: 'holder' }, holder);
  return holder;
}

function createCard(id, definition) {
  return createWidget({ id, type: 'card', width: CARD_WIDTH, height: CARD_HEIGHT, ...definition });
}

// count cards in a compact pile at x/y (they take the holder's stack offset,
// which is 0 wherever these tests do not fan them)
async function createPile(id, holder, x, y, count, cardProperties = {}) {
  const pile = new Pile(id);
  addWidget({ id, type: 'pile', parent: holder.get('id'), x, y }, pile);
  for(let i=0; i<count; ++i)
    createCard(`${id}-card-${i}`, { parent: id, z: i+1, ...cardProperties });
  await pile.arrangeChildren(false);
  return pile;
}

function positionsByZ(holder) {
  return holder.arrangedChildren().sort((a, b)=>a.get('z') - b.get('z')).map(c=>[ c.get('x'), c.get('y') ]);
}

afterEach(() => {
  for(const id of [ ...widgets.keys() ])
    removeWidget(id);
  globalThis.legacyMode = () => false;
  randState = 1;
  randCalls = 0;
});

describe('what each layout derives for the holder', () => {
  test('the default layout of a new holder is auto', () => {
    expect(createHolder({ id: 'h' }).get('layout')).toBe('auto');
  });

  test('a game with the classicHolderLayout legacy mode keeps the classic default', () => {
    globalThis.legacyMode = name => name == 'classicHolderLayout';
    const holder = createHolder({ id: 'h' });
    expect(holder.get('layout')).toBe('custom');
    expect(holder.usesAutoLayout()).toBe(false);
    // and an empty holder in such a game arranges nothing
    expect(holder.spreadsChildren()).toBe(false);
  });

  test('a holder in a legacy game can still opt into auto explicitly', () => {
    globalThis.legacyMode = name => name == 'classicHolderLayout';
    expect(createHolder({ id: 'h', layout: 'auto' }).usesAutoLayout()).toBe(true);
  });

  test('a null layout means unset, so the default applies', () => {
    // a null value in a delta deletes the property, so this is what a game
    // that writes layout: null actually gets
    expect(createHolder({ id: 'h', layout: null }).get('layout')).toBe('auto');
  });

  test('pile stacks everything: the stack offsets answer 0 whatever is written', () => {
    const holder = createHolder({ id: 'h', layout: 'pile', stackOffsetX: 40, allowPiles: true });
    expect(holder.get('stackOffsetX')).toBe(0);
    expect(holder.get('stackOffsetY')).toBe(0);
    expect(holder.get('allowPiles')).toBe(false);
    expect(holder.get('alignChildren')).toBe(true);
    expect(holder.spreadsChildren()).toBe(false);
  });

  test('pile keeps preventPiles as a knob, so a PCIO stack without a stack tab works', () => {
    expect(createHolder({ id: 'h', layout: 'pile', preventPiles: true }).get('preventPiles')).toBe(true);
    expect(createHolder({ id: 'h2', layout: 'pile' }).get('preventPiles')).toBe(false);
  });

  test('singleSpread without any offset gets the classic hand fan', () => {
    const holder = createHolder({ id: 'h', layout: 'singleSpread' });
    expect(holder.get('stackOffsetX')).toBe(40);
    expect(holder.get('stackOffsetY')).toBe(0);
  });

  test('singleSpread with an offset of its own follows it', () => {
    const holder = createHolder({ id: 'h', layout: 'singleSpread', stackOffsetY: 30 });
    expect(holder.get('stackOffsetX')).toBe(0);
    expect(holder.get('stackOffsetY')).toBe(30);
  });

  test('multipleSpread arranges piles, shows the drop shadow and spaces the groups a default gap apart', () => {
    const holder = createHolder({ id: 'h', layout: 'multipleSpread' });
    expect(holder.get('allowPiles')).toBe(true);
    expect(holder.get('dropShadow')).toBe(true);
    expect(holder.get('pilesGapX')).toBe(8);
    expect(holder.arrangesPiles()).toBe(true);
  });

  test('multipleSpread leaves the gap alone as soon as the game spaces the groups itself', () => {
    expect(createHolder({ id: 'h', layout: 'multipleSpread', pilesOffsetX: 60 }).get('pilesGapX')).toBe(null);
    expect(createHolder({ id: 'h2', layout: 'multipleSpread', pilesGapX: 0 }).get('pilesGapX')).toBe(0);
  });

  test('grid prevents piles, freeform drops alignment', () => {
    expect(createHolder({ id: 'h', layout: 'grid' }).get('preventPiles')).toBe(true);
    expect(createHolder({ id: 'h', layout: 'grid' }).supportsPiles()).toBe(false);
    expect(createHolder({ id: 'h2', layout: 'freeform' }).get('alignChildren')).toBe(false);
  });

  test('custom follows the raw properties exactly', () => {
    const holder = createHolder({ id: 'h', layout: 'custom', stackOffsetX: 20, preventPiles: true });
    expect(holder.get('stackOffsetX')).toBe(20);
    expect(holder.get('preventPiles')).toBe(true);
    expect(holder.get('allowPiles')).toBe(false);
  });

  test('auto only allows piles while the holder fits just one card', () => {
    const big = createHolder({ id: 'big', width: 600, height: 300 });
    createCard('bigc', { parent: 'big', z: 1 });
    expect(big.get('allowPiles')).toBe(false);
    const small = createHolder({ id: 'small', width: 120, height: 120 });
    createCard('smallc', { parent: 'small', z: 1 });
    expect(small.get('allowPiles')).toBe(true);
    // an empty holder has no card to measure against, so it starts out the
    // classic way - the first drop decides
    expect(createHolder({ id: 'empty', width: 600, height: 300 }).get('allowPiles')).toBe(true);
  });

  test('allowPiles: false written on an auto holder turns piles off without switching auto off', () => {
    const holder = createHolder({ id: 'h', width: 120, height: 120, allowPiles: false });
    createCard('c1', { parent: 'h', z: 1 });
    expect(holder.usesAutoLayout()).toBe(true);
    expect(holder.get('allowPiles')).toBe(false);
  });
});

describe('when the auto layout applies', () => {
  test('it steps aside while any classic arrangement property is written to a non-default value', () => {
    for(const deferring of [ { stackOffsetX: 40 }, { dropOffsetY: 10 }, { alignChildren: false }, { preventPiles: true }, { allowPiles: true }, { pilesGapX: 20 }, { spreadMin: 3 } ]) {
      const holder = createHolder({ id: 'h', ...deferring });
      expect(holder.get('layout')).toBe('auto');
      expect(holder.effectiveLayout()).toBe('custom');
      expect(holder.usesAutoLayout()).toBe(false);
      removeWidget('h');
    }
  });

  test('a written value that equals the classic default was a no-op classically, so it stays one', () => {
    // writing allowPiles: false (or any other default) into a classic holder
    // changed nothing - so it does not switch the auto layout off either
    for(const harmless of [ { allowPiles: false }, { stackOffsetX: 0 }, { alignChildren: true }, { preventPiles: false }, { dropOffsetX: 4 } ]) {
      const holder = createHolder({ id: 'h', ...harmless });
      expect(holder.effectiveLayout()).toBe('auto');
      expect(holder.usesAutoLayout()).toBe(true);
      removeWidget('h');
    }
  });

  test('so JSON written against the classic properties keeps meaning what it always did', () => {
    const holder = createHolder({ id: 'h', stackOffsetX: 40 });
    expect(holder.get('stackOffsetX')).toBe(40);
    expect(holder.get('dropOffsetX')).toBe(4);
    expect(holder.spreadDirection()).toEqual([ 'X', 1 ]);
  });

  test('clearing the property hands the holder back to auto', async () => {
    const holder = createHolder({ id: 'h', stackOffsetX: 40 });
    await holder.set('stackOffsetX', null);
    expect(holder.usesAutoLayout()).toBe(true);
  });

  test('it also steps aside when a classic property arrives through inheritFrom', () => {
    createHolder({ id: 'template', stackOffsetX: 40 });
    const holder = createHolder({ id: 'h', inheritFrom: 'template' });
    expect(holder.get('stackOffsetX')).toBe(40);
    expect(holder.effectiveLayout()).toBe('custom');
    expect(holder.usesAutoLayout()).toBe(false);
  });

  test('but an inherited value that equals the classic default leaves auto in charge', () => {
    createHolder({ id: 'template', allowPiles: false });
    const holder = createHolder({ id: 'h', width: 600, height: 300, inheritFrom: 'template' });
    expect(holder.usesAutoLayout()).toBe(true);
  });
});

describe('the auto layout arranging its children', () => {
  test('a holder without room to spread centers where drops land', () => {
    const holder = createHolder({ id: 'h', width: 120, height: 120 });
    createCard('c1', { parent: 'h', z: 1 });
    expect(holder.autoSpreads()).toBe(false);
    expect(holder.get('dropOffsetX')).toBe(10);
    expect(holder.get('dropOffsetY')).toBe(10);
    expect(holder.spreadsChildren()).toBe(false);
  });

  test('the default-sized holder with default-sized cards centers to the classic 4/4', () => {
    const holder = createHolder({ id: 'h' });
    createCard('c1', { parent: 'h', z: 1, width: 103, height: 160 });
    expect(holder.autoSpreads()).toBe(false);
    expect(holder.get('dropOffsetX')).toBe(4);
    expect(holder.get('dropOffsetY')).toBe(4);
  });

  test('a single card in a big holder sits in the middle', async () => {
    const holder = createHolder({ id: 'h', width: 600, height: 600 });
    createCard('c1', { parent: 'h', z: 1 });
    await holder.updateAfterShuffle();
    expect(positionsByZ(holder)).toEqual([ [ 250, 250 ] ]);
  });

  test('a wide holder lines the cards up in one centered row', async () => {
    const holder = createHolder({ id: 'h', width: 600, height: 120 });
    for(let i=0; i<3; ++i)
      createCard(`c${i}`, { parent: 'h', z: i+1 });
    await holder.updateAfterShuffle();
    expect(positionsByZ(holder)).toEqual([ [ 146, 10 ], [ 250, 10 ], [ 354, 10 ] ]);
  });

  test('a tall holder stacks them into one centered column instead', async () => {
    const holder = createHolder({ id: 'h', width: 120, height: 600 });
    for(let i=0; i<3; ++i)
      createCard(`c${i}`, { parent: 'h', z: i+1 });
    await holder.updateAfterShuffle();
    expect(positionsByZ(holder)).toEqual([ [ 10, 146 ], [ 10, 250 ], [ 10, 354 ] ]);
  });

  test('the spacing squishes before anything spills out of the holder', async () => {
    const holder = createHolder({ id: 'h', width: 300, height: 120 });
    for(let i=0; i<3; ++i)
      createCard(`c${i}`, { parent: 'h', z: i+1 });
    await holder.updateAfterShuffle();
    expect(positionsByZ(holder)).toEqual([ [ 4, 10 ], [ 100, 10 ], [ 196, 10 ] ]);
  });

  test('a holder with room on both axes wraps into the rows that show the most of each card', async () => {
    const holder = createHolder({ id: 'h', width: 320, height: 320 });
    for(let i=0; i<4; ++i)
      createCard(`c${i}`, { parent: 'h', z: i+1 });
    await holder.updateAfterShuffle();
    expect(positionsByZ(holder)).toEqual([ [ 58, 58 ], [ 162, 58 ], [ 58, 162 ], [ 162, 162 ] ]);
  });

  test('a pile in a holder with the room to spread is emptied out, one card per slot', async () => {
    const holder = createHolder({ id: 'h', width: 600, height: 120 });
    await createPile('group', holder, 4, 4, 3);
    createCard('loose', { parent: 'h', z: 10 });
    await holder.updateAfterShuffle();
    // a spreading auto layout allows no piles, so the group became loose cards
    expect(widgetFilter(w=>w.get('type') == 'pile').length).toBe(0);
    expect(holder.children().length).toBe(4);
    expect(holder.children().every(c=>c.get('parent') == 'h')).toBe(true);
    // all four of them lined up in the centered row
    const xs = holder.arrangedChildren().map(c=>c.get('x')).sort((a, b)=>a - b);
    expect(xs).toEqual([ 94, 198, 302, 406 ]);
  });

  test('a holder without the room to spread keeps a pile and centers it', async () => {
    const holder = createHolder({ id: 'h', width: 120, height: 120 });
    await createPile('group', holder, 4, 4, 3);
    await holder.updateAfterShuffle();
    expect(widgetFilter(w=>w.get('type') == 'pile').length).toBe(1);
    expect(positionsByZ(holder)).toEqual([ [ 10, 10 ] ]);
    // children() still counts the cards inside it
    expect(holder.children().length).toBe(3);
  });

  test('growing such a holder past one card empties the pile onto the row', async () => {
    const holder = createHolder({ id: 'h', width: 120, height: 120 });
    await createPile('group', holder, 10, 10, 3);
    await holder.updateAfterShuffle();
    expect(widgetFilter(w=>w.get('type') == 'pile').length).toBe(1);
    await holder.set('width', 600);
    expect(widgetFilter(w=>w.get('type') == 'pile').length).toBe(0);
    expect(holder.children().length).toBe(3);
    expect(holder.children().every(c=>c.get('parent') == 'h')).toBe(true);
  });

  test('shrinking the holder gathers the cards back into one pile', async () => {
    const holder = createHolder({ id: 'h', width: 600, height: 120 });
    for(let i=0; i<3; ++i)
      createCard(`c${i}`, { parent: 'h', z: i+1 });
    await holder.updateAfterShuffle();
    await holder.set('width', 120);
    expect(holder.autoSpreads()).toBe(false);
    const piles = widgetFilter(w=>w.get('type') == 'pile');
    expect(piles.length).toBe(1);
    expect([ ...piles[0].children() ].reverse().map(c=>c.get('id'))).toEqual([ 'c0', 'c1', 'c2' ]);
    expect(positionsByZ(holder)).toEqual([ [ 10, 10 ] ]);
    // and growing it again empties the pile back onto the row, in order
    await holder.set('width', 600);
    expect(widgetFilter(w=>w.get('type') == 'pile').length).toBe(0);
    const row = holder.arrangedChildren().sort((a, b)=>a.get('x') - b.get('x'));
    expect(row.map(c=>c.get('id'))).toEqual([ 'c0', 'c1', 'c2' ]);
    expect(row.map(c=>[ c.get('x'), c.get('y') ])).toEqual([ [ 146, 10 ], [ 250, 10 ], [ 354, 10 ] ]);
  });

  test('a pile and a loose card in a small holder gather into one pile', async () => {
    const holder = createHolder({ id: 'h', width: 120, height: 120 });
    await createPile('group', holder, 10, 10, 2);
    createCard('loose', { parent: 'h', z: 10 });
    await holder.updateAfterShuffle();
    const piles = widgetFilter(w=>w.get('type') == 'pile');
    expect(piles.length).toBe(1);
    expect(holder.children().length).toBe(3);
    expect([ ...piles[0].children() ].reverse().map(c=>c.get('id'))).toEqual([ 'group-card-0', 'group-card-1', 'loose' ]);
  });

  test('cards of different owners gather into one pile per owner', async () => {
    const holder = createHolder({ id: 'h', width: 120, height: 120 });
    createCard('a1', { parent: 'h', z: 1, owner: 'alice' });
    createCard('a2', { parent: 'h', z: 2, owner: 'alice' });
    createCard('b1', { parent: 'h', z: 3, owner: 'bob' });
    createCard('b2', { parent: 'h', z: 4, owner: 'bob' });
    await holder.updateAfterShuffle();
    const piles = widgetFilter(w=>w.get('type') == 'pile');
    expect(piles.length).toBe(2);
    expect(piles.map(p=>p.get('owner')).sort()).toEqual([ 'alice', 'bob' ]);
    for(const pile of piles)
      expect(new Set(pile.children().map(c=>c.get('owner'))).size).toBe(1);
  });

  test('a written allowPiles: false keeps the shrunken holder from forming one', async () => {
    const holder = createHolder({ id: 'h', width: 600, height: 120, allowPiles: false });
    for(let i=0; i<3; ++i)
      createCard(`c${i}`, { parent: 'h', z: i+1 });
    await holder.updateAfterShuffle();
    await holder.set('width', 120);
    expect(widgetFilter(w=>w.get('type') == 'pile').length).toBe(0);
    expect(positionsByZ(holder)).toEqual([ [ 10, 10 ], [ 10, 10 ], [ 10, 10 ] ]);
  });

  test('a card being dragged is left out of the gather', async () => {
    const holder = createHolder({ id: 'h', width: 120, height: 120 });
    createCard('c0', { parent: 'h', z: 1 });
    createCard('c1', { parent: 'h', z: 2 });
    createCard('held', { parent: 'h', z: 3, dragging: 'jestPlayer' });
    await holder.updateAfterShuffle();
    const piles = widgetFilter(w=>w.get('type') == 'pile');
    expect(piles.length).toBe(1);
    expect([ ...piles[0].children() ].reverse().map(c=>c.get('id'))).toEqual([ 'c0', 'c1' ]);
    expect(widgets.get('held').get('parent')).toBe('h');
  });

  test('a card received lands at the spot of the row it was dropped on', async () => {
    const holder = createHolder({ id: 'h', width: 600, height: 120 });
    for(let i=0; i<3; ++i)
      createCard(`c${i}`, { parent: 'h', z: i+1 });
    await holder.updateAfterShuffle();
    const dropped = createCard('dropped', { parent: 'h', z: 10 });
    // dropped between the first and the second card
    await holder.receiveCard(dropped, [ 200, 10 ]);
    const order = holder.arrangedChildren().sort((a, b)=>a.get('x') - b.get('x')).map(c=>c.get('id'));
    expect(order).toEqual([ 'c0', 'dropped', 'c1', 'c2' ]);
  });

  test('a MOVE into an auto holder spreads the cards out instead of grouping them', async () => {
    const holder = createHolder({ id: 'h', width: 600, height: 120 });
    const cards = [ createCard('m1', { parent: 'h', z: 1 }), createCard('m2', { parent: 'h', z: 2 }) ];
    await holder.groupDroppedCards(cards);
    expect(widgetFilter(w=>w.get('type') == 'pile').length).toBe(0);
  });

  test('a wide card at the end of a row squishes the row instead of spilling out', async () => {
    const holder = createHolder({ id: 'h', width: 380, height: 140 });
    createCard('c0', { parent: 'h', z: 1 });
    createCard('c1', { parent: 'h', z: 2 });
    createCard('wide', { parent: 'h', z: 3, width: 180 });
    await holder.updateAfterShuffle();
    // the row is measured against each entry's own extent, so the wide card
    // gets the room it needs and everything before it packs closer
    expect(positionsByZ(holder)).toEqual([ [ 4, 20 ], [ 100, 20 ], [ 196, 20 ] ]);
    expect(widgets.get('wide').get('x') + 180).toBeLessThanOrEqual(380);
  });

  test('a wide card among many stays inside the holder even when it is not the last', async () => {
    const holder = createHolder({ id: 'h', width: 500, height: 120 });
    for(let i=0; i<8; ++i)
      createCard(`c${i}`, { parent: 'h', z: i+1 });
    createCard('wide', { parent: 'h', z: 9, width: 250 });
    createCard('last', { parent: 'h', z: 10 });
    await holder.updateAfterShuffle();
    // the wide entry ends further right than the last one, so the content box
    // has to be measured to its far edge, not the last entry's
    for(const c of holder.arrangedChildren())
      expect(c.get('x') + c.get('width')).toBeLessThanOrEqual(500);
    expect(Math.min(...holder.arrangedChildren().map(c=>c.get('x')))).toBe(4);
    expect(widgets.get('wide').get('x') + 250).toBe(496);
  });

  test('a tall card among many stays inside a column the same way', async () => {
    const holder = createHolder({ id: 'h', width: 140, height: 500 });
    for(let i=0; i<8; ++i)
      createCard(`c${i}`, { parent: 'h', z: i+1 });
    createCard('tall', { parent: 'h', z: 9, height: 250 });
    createCard('last', { parent: 'h', z: 10 });
    await holder.updateAfterShuffle();
    for(const c of holder.arrangedChildren())
      expect(c.get('y') + c.get('height')).toBeLessThanOrEqual(500);
    expect(Math.min(...holder.arrangedChildren().map(c=>c.get('y')))).toBe(4);
    expect(widgets.get('tall').get('y') + 250).toBe(496);
  });
});

describe('the grid layout', () => {
  test('derives the columns with the least overlap and fills row by row', async () => {
    const holder = createHolder({ id: 'h', layout: 'grid', width: 320, height: 320 });
    for(let i=0; i<4; ++i)
      createCard(`c${i}`, { parent: 'h', z: i+1 });
    await holder.updateAfterShuffle();
    expect(positionsByZ(holder)).toEqual([ [ 4, 4 ], [ 112, 4 ], [ 4, 112 ], [ 112, 112 ] ]);
  });

  test('gridColumns pins the column count', async () => {
    const holder = createHolder({ id: 'h', layout: 'grid', gridColumns: 4, width: 440, height: 320 });
    for(let i=0; i<4; ++i)
      createCard(`c${i}`, { parent: 'h', z: i+1 });
    await holder.updateAfterShuffle();
    expect(positionsByZ(holder)).toEqual([ [ 4, 4 ], [ 112, 4 ], [ 220, 4 ], [ 328, 4 ] ]);
  });

  test('gridRows pins the row count instead', async () => {
    const holder = createHolder({ id: 'h', layout: 'grid', gridRows: 1, width: 440, height: 320 });
    for(let i=0; i<4; ++i)
      createCard(`c${i}`, { parent: 'h', z: i+1 });
    await holder.updateAfterShuffle();
    expect(positionsByZ(holder)).toEqual([ [ 4, 4 ], [ 112, 4 ], [ 220, 4 ], [ 328, 4 ] ]);
  });

  test('dropOffset is the margin and stackOffset the cell gap', async () => {
    const holder = createHolder({ id: 'h', layout: 'grid', gridColumns: 2, dropOffsetX: 10, dropOffsetY: 20, stackOffsetX: 10, stackOffsetY: 10, width: 500, height: 500 });
    for(let i=0; i<2; ++i)
      createCard(`c${i}`, { parent: 'h', z: i+1 });
    await holder.updateAfterShuffle();
    expect(positionsByZ(holder)).toEqual([ [ 10, 20 ], [ 120, 20 ] ]);
  });

  test('a deal to one seat leaves the other lanes on their first cell', async () => {
    const holder = createHolder({ id: 'h', layout: 'grid', gridColumns: 5, childrenPerOwner: true, width: 560, height: 320 });
    // deal the way MOVE to a seat does: per card targetPlayer + parent +
    // bringToFront, one batch pass over the receiving lane at the end
    const deal = async (player, ids) => {
      for(const id of ids) {
        const c = createCard(id, { z: 1 });
        c.movedByButton = true;
        c.targetPlayer = player;
        await c.set('parent', 'h');
        await c.bringToFront();
        delete c.targetPlayer;
        delete c.movedByButton;
      }
      await holder.updateAfterShuffle(new Set([ player ]));
    };
    await deal('P1', [ 'a0', 'a1', 'a2' ]);
    await deal('P2', [ 'b0', 'b1', 'b2' ]);
    const lane = player=>holder.children().filter(c=>c.get('owner') == player)
      .sort((a, b)=>a.get('z') - b.get('z')).map(c=>[ c.get('x'), c.get('y') ]);
    // the second deal's cards have no owner while they arrive - P1's lane must
    // not count them and shift off its first cell
    expect(lane('P1')).toEqual([ [ 4, 4 ], [ 112, 4 ], [ 220, 4 ] ]);
    expect(lane('P2')).toEqual([ [ 4, 4 ], [ 112, 4 ], [ 220, 4 ] ]);
  });

  test('a fractional gridColumns below one still means a single column', async () => {
    const holder = createHolder({ id: 'h', layout: 'grid', gridColumns: 0.5, width: 320, height: 320 });
    for(let i=0; i<2; ++i)
      createCard(`c${i}`, { parent: 'h', z: i+1 });
    await holder.updateAfterShuffle();
    expect(positionsByZ(holder)).toEqual([ [ 4, 4 ], [ 4, 112 ] ]);
  });

  test('and a fractional gridRows below one a single row', async () => {
    const holder = createHolder({ id: 'h', layout: 'grid', gridRows: 0.5, width: 320, height: 320 });
    for(let i=0; i<2; ++i)
      createCard(`c${i}`, { parent: 'h', z: i+1 });
    await holder.updateAfterShuffle();
    expect(positionsByZ(holder)).toEqual([ [ 4, 4 ], [ 112, 4 ] ]);
  });
});

describe('the random layout', () => {
  // the axis-aligned box a piece covers with its tilt, the same measure the
  // layout places - the assertions below check these boxes against the
  // holder's room and against each other
  function coveredBox(c) {
    const radians = (c.get('rotation') || 0) * Math.PI / 180;
    const cos = Math.abs(Math.cos(radians));
    const sin = Math.abs(Math.sin(radians));
    const w = c.get('width') * cos + c.get('height') * sin;
    const h = c.get('height') * cos + c.get('width') * sin;
    return { x: c.get('x') - (w - c.get('width')) / 2, y: c.get('y') - (h - c.get('height')) / 2, w, h };
  }

  function expectInsideHolder(holder, margin = 4) {
    for(const c of holder.arrangedChildren()) {
      const box = coveredBox(c);
      expect(box.x).toBeGreaterThanOrEqual(margin - 1e-9);
      expect(box.y).toBeGreaterThanOrEqual(margin - 1e-9);
      expect(box.x + box.w).toBeLessThanOrEqual(holder.get('width') - margin + 1e-9);
      expect(box.y + box.h).toBeLessThanOrEqual(holder.get('height') - margin + 1e-9);
    }
  }

  function expectNoOverlap(holder) {
    const boxes = holder.arrangedChildren().map(coveredBox);
    for(let i = 0; i < boxes.length; ++i)
      for(let j = i + 1; j < boxes.length; ++j) {
        const a = boxes[i], b = boxes[j];
        const area = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
                   * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
        expect(area).toBeLessThanOrEqual(1e-9);
      }
  }

  test('random prevents piles and counts as a spreading arrangement', () => {
    const holder = createHolder({ id: 'h', layout: 'random' });
    expect(holder.get('preventPiles')).toBe(true);
    expect(holder.get('allowPiles')).toBe(false);
    expect(holder.get('alignChildren')).toBe(true);
    expect(holder.spreadsChildren()).toBe(true);
    expect(holder.supportsPiles()).toBe(false);
    expect(holder.arrangesPiles()).toBe(false);
  });

  test('a piece keeps the free spot it was dropped on and settles with a small tilt', async () => {
    const holder = createHolder({ id: 'h', layout: 'random', width: 400, height: 400 });
    const dropped = createCard('dropped', { parent: 'h', z: 1 });
    await holder.receiveCard(dropped, [ 150, 150 ]);
    expect(dropped.get('x')).toBe(150);
    expect(dropped.get('y')).toBe(150);
    expect(Math.abs(dropped.get('rotation'))).toBeLessThanOrEqual(15);
    expectInsideHolder(holder);
  });

  test('a piece aimed past the border is nudged back inside the margin', async () => {
    const holder = createHolder({ id: 'h', layout: 'random', width: 400, height: 400 });
    const dropped = createCard('dropped', { parent: 'h', z: 1 });
    await holder.receiveCard(dropped, [ 390, -50 ]);
    expectInsideHolder(holder);
  });

  test('a piece dropped onto an occupied spot lands on a free one instead', async () => {
    const holder = createHolder({ id: 'h', layout: 'random', width: 500, height: 500 });
    const first = createCard('first', { parent: 'h', z: 1 });
    await holder.receiveCard(first, [ 200, 200 ]);
    const second = createCard('second', { parent: 'h', z: 2 });
    await holder.receiveCard(second, [ 210, 190 ]);
    expectInsideHolder(holder);
    expectNoOverlap(holder);
  });

  test('the pieces already lying in the holder stay where they are when another lands', async () => {
    const holder = createHolder({ id: 'h', layout: 'random', width: 500, height: 500 });
    const first = createCard('first', { parent: 'h', z: 1 });
    await holder.receiveCard(first, [ 200, 200 ]);
    const before = [ first.get('x'), first.get('y'), first.get('rotation') ];
    const second = createCard('second', { parent: 'h', z: 2 });
    await holder.receiveCard(second, [ 210, 190 ]);
    expect([ first.get('x'), first.get('y'), first.get('rotation') ]).toEqual(before);
    // the piece that just landed lies on top
    expect(second.get('z')).toBeGreaterThan(first.get('z'));
  });

  test('a MOVE in ignores the sentinel drop spot and lands on a random one', async () => {
    const holder = createHolder({ id: 'h', layout: 'random', width: 400, height: 400 });
    const moved = createCard('moved', { parent: 'h', z: 1 });
    moved.movedByButton = true;
    randCalls = 0;
    await holder.receiveCard(moved, [ 999999, 0 ]);
    delete moved.movedByButton;
    // a fresh tilt plus a thrown spot - not the sentinel clamped to the border
    expect(randCalls).toBeGreaterThanOrEqual(3);
    expectInsideHolder(holder);
  });

  test('laying the holder out again moves nothing and consumes no randomness', async () => {
    const holder = createHolder({ id: 'h', layout: 'random', width: 500, height: 500 });
    for(let i = 0; i < 4; ++i)
      await holder.receiveCard(createCard(`c${i}`, { parent: 'h', z: i + 1 }), null);
    const before = positionsByZ(holder);
    randCalls = 0;
    await holder.updateAfterShuffle();
    expect(positionsByZ(holder)).toEqual(before);
    expect(randCalls).toBe(0);
  });

  test('the drop shadow is pinned under the pointer without consuming randomness', async () => {
    const holder = createHolder({ id: 'h', layout: 'random', width: 400, height: 400 });
    const shadow = createCard('shadow', { parent: 'h', z: 1, dropShadowOwner: 'someone' });
    randCalls = 0;
    await holder.receiveCard(shadow, [ 120, 130 ]);
    expect([ shadow.get('x'), shadow.get('y') ]).toEqual([ 120, 130 ]);
    await holder.receiveCard(shadow, [ 9999, 9999 ]);
    expect(shadow.get('x') + shadow.get('width')).toBeLessThanOrEqual(396);
    expect(randCalls).toBe(0);
  });

  test('a holder too full for free spots keeps everything inside instead of spilling out', async () => {
    const holder = createHolder({ id: 'h', layout: 'random', width: 230, height: 230 });
    for(let i = 0; i < 6; ++i)
      await holder.receiveCard(createCard(`c${i}`, { parent: 'h', z: i + 1 }), null);
    expectInsideHolder(holder);
  });

  test('a pile dropped in is emptied out and its cards scatter', async () => {
    const holder = createHolder({ id: 'h', layout: 'random', width: 500, height: 500 });
    const pile = await createPile('group', holder, 150, 150, 3);
    await holder.onChildAddAlign(pile, null);
    expect(widgetFilter(w => w.get('type') == 'pile').length).toBe(0);
    expect(holder.children().length).toBe(3);
    expectInsideHolder(holder);
    expectNoOverlap(holder);
  });

  test('a piece taken out of the holder straightens up again', async () => {
    const holder = createHolder({ id: 'h', layout: 'random', width: 400, height: 400 });
    const card = createCard('c', { parent: 'h', z: 1 });
    await holder.receiveCard(card, null);
    await holder.dispenseCard(card, true);
    expect(card.get('rotation')).toBe(0);
  });

  test('switching the layout away straightens every piece', async () => {
    const holder = createHolder({ id: 'h', layout: 'random', width: 500, height: 500 });
    for(let i = 0; i < 3; ++i)
      await holder.receiveCard(createCard(`c${i}`, { parent: 'h', z: i + 1 }), null);
    await holder.set('layout', 'grid');
    for(const c of holder.arrangedChildren())
      expect(c.get('rotation')).toBe(0);
  });

  test('switching to random scatters what the old layout had stacked', async () => {
    const holder = createHolder({ id: 'h', layout: 'pile', width: 500, height: 500 });
    for(let i = 0; i < 3; ++i)
      createCard(`c${i}`, { parent: 'h', x: 4, y: 4, z: i + 1 });
    await holder.set('layout', 'random');
    expectInsideHolder(holder);
    expectNoOverlap(holder);
  });

  test('shrinking the holder pulls the pieces that no longer fit back inside', async () => {
    const holder = createHolder({ id: 'h', layout: 'random', width: 600, height: 600 });
    for(let i = 0; i < 3; ++i)
      await holder.receiveCard(createCard(`c${i}`, { parent: 'h', z: i + 1 }), null);
    await holder.set('width', 300);
    await holder.set('height', 300);
    expectInsideHolder(holder);
  });
});

describe('MOVE with a position parameter', () => {
  test('pileBottom on a plain spread holder renumbers the batch below everything in one pass', async () => {
    const holder = createHolder({ id: 'h', layout: 'singleSpread', width: 600 });
    for(let i=0; i<3; ++i)
      createCard(`c${i}`, { parent: 'h', z: i+1 });
    const moved = [ createCard('m1', { parent: 'h', z: 10 }), createCard('m2', { parent: 'h', z: 11 }) ];
    await holder.applyMovePosition(moved, 'pileBottom');
    const order = holder.children().sort((a, b)=>a.get('z') - b.get('z')).map(c=>c.get('id'));
    expect(order).toEqual([ 'm1', 'm2', 'c0', 'c1', 'c2' ]);
    expect(holder.children().sort((a, b)=>a.get('z') - b.get('z')).map(c=>c.get('z'))).toEqual([ 1, 2, 3, 4, 5 ]);
  });

  test('pileTop and groupEnd on a plain holder leave the batch on top, where MOVE puts it anyway', async () => {
    const holder = createHolder({ id: 'h', layout: 'singleSpread', width: 600 });
    createCard('c0', { parent: 'h', z: 1 });
    const moved = [ createCard('m1', { parent: 'h', z: 10 }) ];
    await holder.applyMovePosition(moved, 'pileTop');
    expect(holder.children().sort((a, b)=>a.get('z') - b.get('z')).map(c=>c.get('id'))).toEqual([ 'c0', 'm1' ]);
  });

  test('pileBottom on a holder that arranges piles joins the first group at its bottom', async () => {
    const holder = createHolder({ id: 'h', layout: 'multipleSpread', width: 900, height: 300 });
    const first = await createPile('first', holder, 4, 4, 2);
    await createPile('second', holder, 300, 4, 2);
    await holder.updateAfterShuffle();
    const moved = [ createCard('m1', { parent: 'h', z: 50 }) ];
    await holder.applyMovePosition(moved, 'pileBottom');
    expect(moved[0].get('parent')).toBe('first');
    expect(first.children().sort((a, b)=>a.get('z') - b.get('z'))[0].get('id')).toBe('m1');
  });

  test('pileTop joins the last group on top', async () => {
    const holder = createHolder({ id: 'h', layout: 'multipleSpread', width: 900, height: 300 });
    await createPile('first', holder, 4, 4, 2);
    const second = await createPile('second', holder, 300, 4, 2);
    await holder.updateAfterShuffle();
    const moved = [ createCard('m1', { parent: 'h', z: 50 }) ];
    await holder.applyMovePosition(moved, 'pileTop');
    expect(moved[0].get('parent')).toBe('second');
    const byZ = second.children().sort((a, b)=>a.get('z') - b.get('z'));
    expect(byZ[byZ.length-1].get('id')).toBe('m1');
  });

  test('groupStart forms a new group before the others', async () => {
    const holder = createHolder({ id: 'h', layout: 'multipleSpread', width: 900, height: 300 });
    await createPile('existing', holder, 4, 4, 2);
    await holder.updateAfterShuffle();
    const moved = [ createCard('m1', { parent: 'h', z: 50 }), createCard('m2', { parent: 'h', z: 51 }) ];
    await holder.applyMovePosition(moved, 'groupStart');
    const groups = holder.arrangedChildren().sort((a, b)=>a.get('x') - b.get('x'));
    expect(groups.length).toBe(2);
    expect(groups[0].get('type')).toBe('pile');
    expect(groups[0].children().map(c=>c.get('id')).sort()).toEqual([ 'm1', 'm2' ]);
    expect(groups[0].get('id')).not.toBe('existing');
  });

  test('groupEnd forms a new group after the others, one moved card staying loose', async () => {
    const holder = createHolder({ id: 'h', layout: 'multipleSpread', width: 900, height: 300 });
    await createPile('existing', holder, 4, 4, 2);
    await holder.updateAfterShuffle();
    const moved = [ createCard('m1', { parent: 'h', z: 50 }) ];
    await holder.applyMovePosition(moved, 'groupEnd');
    const entries = holder.arrangedChildren().sort((a, b)=>a.get('x') - b.get('x'));
    expect(entries.length).toBe(2);
    expect(entries[1].get('id')).toBe('m1');
  });

  test('pileTop takes cards already inside a group over into the last one', async () => {
    const holder = createHolder({ id: 'h', layout: 'multipleSpread', width: 900, height: 300 });
    const first = await createPile('first', holder, 4, 4, 4);
    const second = await createPile('second', holder, 300, 4, 2);
    await holder.updateAfterShuffle();
    // the top two cards of the first group, still inside it - the way a MOVE
    // with from and to naming the same holder hands them over
    const moved = first.children().sort((a, b)=>b.get('z') - a.get('z')).slice(0, 2);
    await holder.applyMovePosition(moved, 'pileTop');
    expect(moved.map(c=>c.get('parent'))).toEqual([ 'second', 'second' ]);
    expect(first.children().length).toBe(2);
    const byZ = second.children().sort((a, b)=>a.get('z') - b.get('z'));
    expect(byZ.length).toBe(4);
    expect(byZ.slice(2).map(c=>c.get('id')).sort()).toEqual(moved.map(c=>c.get('id')).sort());
  });

  test('groupEnd deals cards already inside a group out as the final group', async () => {
    const holder = createHolder({ id: 'h', layout: 'multipleSpread', width: 900, height: 300 });
    await createPile('first', holder, 4, 4, 2);
    await createPile('second', holder, 300, 4, 2);
    await holder.updateAfterShuffle();
    const moved = [ ...widgets.get('second').children() ];
    await holder.applyMovePosition(moved, 'groupEnd');
    // the group the whole batch came out of dissolved, the batch is a new
    // group after the others
    expect(widgets.has('second')).toBe(false);
    const entries = holder.arrangedChildren().sort((a, b)=>a.get('z') - b.get('z'));
    expect(entries.length).toBe(2);
    expect(entries[0].get('id')).toBe('first');
    expect(entries[1].get('type')).toBe('pile');
    expect(entries[1].children().map(c=>c.get('id')).sort()).toEqual(moved.map(c=>c.get('id')).sort());
  });

  test('groupStart pulls a card out of a group and renumbers it in front', async () => {
    const holder = createHolder({ id: 'h', layout: 'multipleSpread', width: 900, height: 300 });
    const first = await createPile('first', holder, 4, 4, 3);
    await holder.updateAfterShuffle();
    const moved = [ first.children().sort((a, b)=>b.get('z') - a.get('z'))[0] ];
    await holder.applyMovePosition(moved, 'groupStart');
    expect(moved[0].get('parent')).toBe('h');
    const entries = holder.arrangedChildren().sort((a, b)=>a.get('z') - b.get('z'));
    expect(entries.map(c=>c.get('id'))).toEqual([ moved[0].get('id'), 'first' ]);
    expect(first.children().length).toBe(2);
  });
});

describe('SORT with groupBy', () => {
  test('re-partitions an arranging holder into one group per distinct value', async () => {
    const holder = createHolder({ id: 'h', layout: 'multipleSpread', width: 900, height: 300 });
    const cards = [
      [ 'S', 3 ], [ 'H', 1 ], [ 'S', 1 ], [ 'H', 2 ], [ 'S', 2 ]
    ].map(([ suit, rank ], i)=>createCard(`card-${suit}${rank}`, { parent: 'h', z: i+1, suit, rank }));
    await holder.updateAfterShuffle();

    // sorted by rank the suits interleave - the groups still form per suit
    await holder.regroupBy('suit', 'rank', false, undefined, undefined);

    const piles = widgetFilter(w=>w.get('type') == 'pile');
    expect(piles.length).toBe(2);
    const bySuit = {};
    for(const pile of piles)
      bySuit[pile.children()[0].get('suit')] = pile.children().sort((a, b)=>a.get('z') - b.get('z')).map(c=>c.get('rank'));
    expect(bySuit.S).toEqual([ 1, 2, 3 ]);
    expect(bySuit.H).toEqual([ 1, 2 ]);
    expect(cards.every(c=>holder.children().includes(c))).toBe(true);
  });

  test('handed a subset it regroups only those cards and keeps the rest ahead', async () => {
    const holder = createHolder({ id: 'h', layout: 'multipleSpread', stackOffsetX: 40, width: 900, height: 120, childrenPerOwner: true });
    const mine = [
      [ 'S', 2 ], [ 'H', 1 ], [ 'S', 1 ], [ 'H', 2 ]
    ].map(([ suit, rank ], i)=>createCard(`m${suit}${rank}`, { parent: 'h', z: i+1, suit, rank, owner: 'jestPlayer' }));
    createCard('aS1', { parent: 'h', z: 5, suit: 'S', rank: 1, owner: 'alice' });
    createCard('aH1', { parent: 'h', z: 6, suit: 'H', rank: 1, owner: 'alice' });
    await holder.updateAfterShuffle();
    const alicePositions = [ 'aS1', 'aH1' ].map(id=>[ widgets.get(id).get('x'), widgets.get(id).get('z') ]);

    // what SORT with a collection does: only the SELECTed cards regroup
    await holder.regroupBy('suit', 'rank', false, undefined, undefined, mine);

    const piles = widgetFilter(w=>w.get('type') == 'pile');
    expect(piles.length).toBe(2);
    for(const pile of piles) {
      expect(pile.get('owner')).toBe('jestPlayer');
      expect(pile.children().sort((a, b)=>a.get('z') - b.get('z')).map(c=>c.get('rank'))).toEqual([ 1, 2 ]);
    }
    // alice's loose cards stayed out of it
    expect([ 'aS1', 'aH1' ].map(id=>[ widgets.get(id).get('x'), widgets.get(id).get('z') ])).toEqual(alicePositions);
    expect([ 'aS1', 'aH1' ].every(id=>widgets.get(id).get('parent') == 'h')).toBe(true);
  });

  test('a subset from inside a group is pulled out and the rest keeps its place', async () => {
    const holder = createHolder({ id: 'h', layout: 'multipleSpread', stackOffsetX: 40, width: 900, height: 120 });
    const fan = await createPile('fan', holder, 4, 4, 3);
    for(const [ i, suit ] of [ 'S', 'H', 'S' ].entries())
      await widgets.get(`fan-card-${i}`).set('suit', suit);
    await holder.updateAfterShuffle();

    const picked = [ widgets.get('fan-card-0'), widgets.get('fan-card-2') ];
    await holder.regroupBy('suit', 'suit', false, undefined, undefined, picked);

    // the two spades formed a new group after the one they left
    expect(widgets.get('fan-card-1').get('parent')).toBe('h');
    const newPile = widgets.get('fan-card-0').get('parent');
    expect(newPile).not.toBe('h');
    expect(widgets.get(newPile).children().length).toBe(2);
    expect(widgets.get('fan-card-1').get('z')).toBeLessThan(widgets.get(newPile).get('z'));
  });

  test('a value only one card has stays a loose card', async () => {
    const holder = createHolder({ id: 'h', layout: 'multipleSpread', width: 900, height: 300 });
    createCard('a1', { parent: 'h', z: 1, suit: 'S' });
    createCard('a2', { parent: 'h', z: 2, suit: 'S' });
    createCard('b1', { parent: 'h', z: 3, suit: 'H' });
    await holder.regroupBy('suit', 'suit', false, undefined, undefined);
    expect(widgetFilter(w=>w.get('type') == 'pile').length).toBe(1);
    expect(widgets.get('b1').get('parent')).toBe('h');
  });
});

describe('a drop pointed into a fan', () => {
  test('names the slot of the fan it points at', async () => {
    const holder = createHolder({ id: 'h', layout: 'multipleSpread', stackOffsetY: 40, width: 300, height: 700 });
    const fan = await createPile('fan', holder, 4, 4, 4);
    await holder.updateAfterShuffle();
    const dropped = createCard('dropped');
    const x = fan.get('x');
    const y = fan.get('y');
    // aimed at the middle of the visible band of the second card (offsets 0/40/80/120)
    expect(holder.spreadFanIndexOf(fan, dropped, x, y + 60 - CARD_HEIGHT/2)).toBe(1);
    // aimed far past the end of the fan: on top
    expect(holder.spreadFanIndexOf(fan, dropped, x, y + 200 - CARD_HEIGHT/2)).toBe(4);
    // a compact pile has no fan to point into
    const stack = await createPile('stack', createHolder({ id: 'h2', layout: 'multipleSpread', width: 300, height: 700 }), 4, 4, 3);
    expect(createHolder({ id: 'h3', layout: 'multipleSpread' }).spreadFanIndexOf(stack, dropped, 4, 4)).toBe(null);
  });

  test('inserts the cards at that slot', async () => {
    const holder = createHolder({ id: 'h', layout: 'multipleSpread', stackOffsetY: 40, width: 300, height: 700 });
    const fan = await createPile('fan', holder, 4, 4, 3);
    const dropped = createCard('dropped', { parent: 'fan', z: 50 });
    await fan.insertChildrenAt([ dropped ], 1);
    const order = fan.children().sort((a, b)=>a.get('z') - b.get('z')).map(c=>c.get('id'));
    expect(order).toEqual([ 'fan-card-0', 'dropped', 'fan-card-1', 'fan-card-2' ]);
  });

  test('names the slot of a fan running in the negative direction', async () => {
    const holder = createHolder({ id: 'h', layout: 'multipleSpread', stackOffsetY: -40, width: 300, height: 700 });
    const fan = await createPile('fan', holder, 4, 4, 4);
    await holder.updateAfterShuffle();
    const dropped = createCard('dropped');
    const x = fan.get('x');
    const y = fan.get('y');
    // the offsets run 120/80/40/0 from the bottom card: the second card is covered
    // from the corner side, so its visible band runs from y 140 to 180 in the pile
    expect(holder.spreadFanIndexOf(fan, dropped, x, y + 160 - CARD_HEIGHT/2)).toBe(1);
    // aimed half a card past the end the fan grows towards: on top
    expect(holder.spreadFanIndexOf(fan, dropped, x, y + 10 - CARD_HEIGHT/2)).toBe(4);
  });
});

describe('a multipleSpread with more groups than fit', () => {
  // avail is the holder width minus the drop offset on both sides (default 4)
  test('shrinks the gaps between the groups first', async () => {
    // two fans of 3 at stack offset 40: bases 200, fans 160, one gap of 8 ->
    // full row 368; at width 370 (avail 362) only a 2px gap still fits
    const holder = createHolder({ id: 'h', layout: 'multipleSpread', stackOffsetX: 40, width: 370, height: 120 });
    await createPile('one', holder, 4, 4, 3);
    await createPile('two', holder, 300, 4, 3);
    await holder.updateAfterShuffle();
    expect(holder.fanSquish(null)).toEqual({ axis: 'X', gap: 2, fans: 1, groups: 1 });
    const xs = holder.arrangedChildren().sort((a, b)=>a.get('x') - b.get('x')).map(p=>p.get('x'));
    expect(xs).toEqual([ 4, 186 ]);
    // the fans themselves keep their full spread
    expect(widgets.get('one').spreadExtent('X')).toBe(180);
  });

  test('compresses the fans evenly once the gaps are gone', async () => {
    // bases 200, fans 160: at width 288 (avail 280) the fans keep half their spread
    const holder = createHolder({ id: 'h', layout: 'multipleSpread', stackOffsetX: 40, width: 288, height: 120 });
    await createPile('one', holder, 4, 4, 3);
    await createPile('two', holder, 300, 4, 3);
    await holder.updateAfterShuffle();
    expect(holder.fanSquish(null)).toEqual({ axis: 'X', gap: 0, fans: 0.5, groups: 1 });
    expect(widgets.get('one').spreadExtent('X')).toBe(140);
    const one = widgets.get('one');
    expect(one.children().sort((a, b)=>a.get('z') - b.get('z')).map(c=>c.get('x'))).toEqual([ 0, 20, 40 ]);
    const xs = holder.arrangedChildren().sort((a, b)=>a.get('x') - b.get('x')).map(p=>p.get('x'));
    // flush groups: the second starts where the squished first one ends
    expect(xs).toEqual([ 4, 144 ]);
  });

  test('overlaps the groups themselves when even the bare cards do not fit', async () => {
    const holder = createHolder({ id: 'h', layout: 'multipleSpread', stackOffsetX: 40, width: 180, height: 120 });
    await createPile('one', holder, 4, 4, 3);
    await createPile('two', holder, 300, 4, 3);
    await holder.updateAfterShuffle();
    const squish = holder.fanSquish(null);
    expect(squish.fans).toBe(0);
    const groups = holder.arrangedChildren().sort((a, b)=>a.get('x') - b.get('x'));
    // the last group ends at the far edge instead of running past it
    expect(groups[1].get('x') + groups[1].spreadExtent('X')).toBe(176);
  });

  test('a row spaced by pilesOffset is the game taking manual control, so it is honored', async () => {
    const holder = createHolder({ id: 'h', layout: 'multipleSpread', stackOffsetX: 40, pilesOffsetX: 60, width: 180, height: 120 });
    await createPile('one', holder, 4, 4, 3);
    await createPile('two', holder, 300, 4, 3);
    await holder.updateAfterShuffle();
    expect(holder.fanSquish(null).fans).toBe(1);
    const xs = holder.arrangedChildren().sort((a, b)=>a.get('x') - b.get('x')).map(p=>p.get('x'));
    expect(xs).toEqual([ 4, 64 ]);
    expect(widgets.get('one').spreadExtent('X')).toBe(180);
  });

  test('removing groups hands the room back', async () => {
    const holder = createHolder({ id: 'h', layout: 'multipleSpread', stackOffsetX: 40, width: 288, height: 120 });
    await createPile('one', holder, 4, 4, 3);
    const two = await createPile('two', holder, 300, 4, 3);
    await holder.updateAfterShuffle();
    expect(holder.fanSquish(null).fans).toBe(0.5);
    for(const c of [ ...two.children() ])
      await c.set('parent', null);
    await holder.updateAfterShuffle();
    expect(holder.fanSquish(null).fans).toBe(1);
    expect(widgets.get('one').spreadExtent('X')).toBe(180);
  });

  test('every group renders above the one before it, count handle included', async () => {
    // a pile renders at the highest z among its own and its cards' values, so
    // rows numbered with a plain z++ let two fans tie and stack in DOM order -
    // which hid their count handles behind a neighbor at random
    const holder = createHolder({ id: 'h', layout: 'multipleSpread', stackOffsetX: 40, width: 900, height: 120 });
    await createPile('one', holder, 4, 4, 3);
    await createPile('two', holder, 300, 4, 2);
    createCard('loose', { parent: 'h', x: 600, y: 4, z: 50 });
    await holder.updateAfterShuffle();
    const renderedZ = w=>Math.max(w.get('z'), ...(w.get('type') == 'pile' ? w.children().map(c=>c.get('z')) : []));
    const row = holder.arrangedChildren().sort((a, b)=>a.get('x') - b.get('x'));
    for(let i=1; i<row.length; ++i)
      expect(renderedZ(row[i])).toBeGreaterThan(renderedZ(row[i-1]));
  });
});

describe('the drop shadow previewing an insertion into a fan', () => {
  async function previewRoom() {
    const holder = createHolder({ id: 'h', layout: 'multipleSpread', stackOffsetX: 40, width: 600, height: 120 });
    await createPile('one', holder, 4, 4, 3);
    await createPile('two', holder, 300, 4, 2);
    await holder.updateAfterShuffle();
    const shadow = createCard('shadow', { parent: 'h', dropShadowOwner: 'jestPlayer', z: 40 });
    return { holder, shadow };
  }

  test('opens a gap at the slot the drop would insert at and sits in it', async () => {
    const { holder, shadow } = await previewRoom();
    const one = widgets.get('one');
    // aimed at slot 1 of the first fan: the point (x plus half a card) at 60
    await holder.previewShadowDrop(shadow, one, 60 - CARD_WIDTH/2 + one.get('x'), 4);
    expect(one.previewGap).toBe(1);
    expect(one.children().sort((a, b)=>a.get('z') - b.get('z')).map(c=>c.get('x'))).toEqual([ 0, 80, 120 ]);
    // the shadow joins the pile at the slot, covering the card below it and
    // covered by the cards above it the way the inserted card will
    expect(shadow.get('parent')).toBe('one');
    expect(shadow.get('x')).toBe(40);
    expect(shadow.get('z')).toBeGreaterThan(widgets.get('one-card-0').get('z'));
    expect(shadow.get('z')).toBeLessThan(widgets.get('one-card-1').get('z'));
    // the fan grew by the open slot and the next group moved along
    expect(one.spreadExtent('X')).toBe(220);
    const two = widgets.get('two');
    expect(two.get('x')).toBe(4 + 220 + 8);
  });

  test('a repeated preview of the same slot puts the shadow back into it', async () => {
    const { holder, shadow } = await previewRoom();
    const one = widgets.get('one');
    await holder.previewShadowDrop(shadow, one, 60 - CARD_WIDTH/2 + one.get('x'), 4);
    // the drag writes its global pointer coordinates into the shadow before
    // every preview - a pointer move within the same slot must not leave them
    await shadow.setPosition(325, 703, 0);
    await holder.previewShadowDrop(shadow, one, 60 - CARD_WIDTH/2 + one.get('x'), 4);
    expect(one.previewGap).toBe(1);
    expect(shadow.get('parent')).toBe('one');
    expect(shadow.get('x')).toBe(40);
    expect(shadow.get('y')).toBe(0);
    expect(shadow.get('z')).toBeGreaterThan(widgets.get('one-card-0').get('z'));
    expect(shadow.get('z')).toBeLessThan(widgets.get('one-card-1').get('z'));
  });

  test('pointing into the open gap keeps the same slot instead of flickering', async () => {
    const { holder, shadow } = await previewRoom();
    const one = widgets.get('one');
    await holder.previewShadowDrop(shadow, one, 60 - CARD_WIDTH/2 + one.get('x'), 4);
    // the gap slot sits at 40, its band reaches to the shifted card at 80
    expect(holder.spreadFanIndexOf(one, shadow, 60 - CARD_WIDTH/2 + one.get('x'), 4)).toBe(1);
    // the band of the card the gap pushed to 80 still means before that card
    expect(holder.spreadFanIndexOf(one, shadow, 100 - CARD_WIDTH/2 + one.get('x'), 4)).toBe(1);
    // one band further is between the former cards 1 and 2
    expect(holder.spreadFanIndexOf(one, shadow, 140 - CARD_WIDTH/2 + one.get('x'), 4)).toBe(2);
  });

  test('moving off the fan closes the gap and the shadow lines up as its own group again', async () => {
    const { holder, shadow } = await previewRoom();
    const one = widgets.get('one');
    await holder.previewShadowDrop(shadow, one, 60 - CARD_WIDTH/2 + one.get('x'), 4);
    await holder.previewShadowDrop(shadow, null, 500, 4);
    expect(one.previewGap).toBe(undefined);
    expect(shadow.fanPreviewPile).toBe(undefined);
    expect(shadow.get('parent')).toBe('h');
    expect(one.children().sort((a, b)=>a.get('z') - b.get('z')).map(c=>c.get('x'))).toEqual([ 0, 40, 80 ]);
    expect(one.spreadExtent('X')).toBe(180);
  });

  test('the drop right after lands in the previewed slot', async () => {
    const { holder, shadow } = await previewRoom();
    const one = widgets.get('one');
    const aimX = 60 - CARD_WIDTH/2 + one.get('x');
    await holder.previewShadowDrop(shadow, one, aimX, 4);
    // what hideShadowWidget does at the drop: close the gap, remove the shadow
    delete shadow.fanPreviewPile;
    delete one.previewGap;
    await one.arrangeChildren();
    removeWidget('shadow');
    // the real drop aims at the same point the preview did
    const dropped = createCard('dropped', { parent: 'h', z: 41 });
    const index = holder.spreadFanIndexOf(one, dropped, aimX, 4);
    expect(index).toBe(1);
    await dropped.set('parent', 'one');
    await one.insertChildrenAt([ dropped ], index);
    const order = one.children().sort((a, b)=>a.get('z') - b.get('z')).map(c=>c.get('id'));
    expect(order).toEqual([ 'one-card-0', 'dropped', 'one-card-1', 'one-card-2' ]);
  });

  test('the row is laid out as if the previewing shadow were not there', async () => {
    const { holder, shadow } = await previewRoom();
    const one = widgets.get('one');
    await holder.previewShadowDrop(shadow, one, 60 - CARD_WIDTH/2 + one.get('x'), 4);
    const shadowX = shadow.get('x');
    await holder.updateAfterShuffle();
    // the shadow kept its slot position instead of being arranged into the row
    expect(shadow.get('x')).toBe(shadowX);
  });

  test('disappears over a loose card the drop would pile up with, and comes back off it', async () => {
    const { holder, shadow } = await previewRoom();
    // a real card defaults onPileCreation to {}, and the join preview applies
    // the same checks a real drop does
    await shadow.set('onPileCreation', {});
    const loose = createCard('loose', { parent: 'h', x: 500, y: 4, z: 30, onPileCreation: {} });
    await holder.updateAfterShuffle();
    // row: one (fan of 3, 180 wide), two (fan of 2, 140 wide), loose - the
    // shadow previews as its own group between two and loose
    expect(loose.get('x')).toBe(340);
    await holder.previewShadowDrop(shadow, null, 335, 4);
    expect(shadow.get('display')).toBe(true);
    expect(loose.get('x')).toBe(448);
    // over the loose card there is no slot to preview - the drop would pile up
    // with it - so the shadow disappears and the row closes its gap
    await holder.previewShadowDrop(shadow, loose, 448, 4);
    expect(shadow.get('display')).toBe(false);
    expect(shadow.get('parent')).toBe('h');
    expect(loose.get('x')).toBe(340);
    // off the card it lines up as its own group again
    await holder.previewShadowDrop(shadow, null, 500, 4);
    expect(shadow.get('display')).toBe(true);
  });

  test('stays visible over a loose card the drop could not pile up with', async () => {
    const { holder, shadow } = await previewRoom();
    // a different onPileCreation means the real drop would refuse to join and
    // land as its own group instead - which is what the shadow keeps showing
    const loose = createCard('loose', { parent: 'h', x: 500, y: 4, z: 30, onPileCreation: { dropLimit: 5 } });
    await holder.updateAfterShuffle();
    await holder.previewShadowDrop(shadow, loose, loose.get('x'), 4);
    expect(shadow.get('display')).toBe(true);
  });
});

describe('a shared hand (childrenPerOwner) keeps its lanes', () => {
  // the local player is jestPlayer, so anything that wrongly hands cards to
  // "whoever clicked" shows up as an owner flipping to jestPlayer
  async function sharedHand() {
    const holder = createHolder({ id: 'h', layout: 'multipleSpread', stackOffsetX: 40, width: 900, height: 120, childrenPerOwner: true });
    await createPile('mine', holder, 4, 4, 2);
    await createPile('theirs', holder, 300, 4, 2);
    await widgets.get('mine').set('owner', 'jestPlayer');
    await widgets.get('theirs').set('owner', 'alice');
    return holder;
  }

  test('emptying the groups on a layout switch leaves every card in its lane', async () => {
    const holder = await sharedHand();
    await holder.set('layout', 'singleSpread');
    expect(widgetFilter(w=>w.get('type') == 'pile').length).toBe(0);
    expect(widgets.get('mine-card-0').get('owner')).toBe('jestPlayer');
    expect(widgets.get('theirs-card-0').get('owner')).toBe('alice');
    expect(widgets.get('theirs-card-1').get('owner')).toBe('alice');
  });

  test('SORT groupBy regroups every lane by itself and keeps the owners', async () => {
    const holder = await sharedHand();
    for(const [ id, suit ] of [ [ 'mine-card-0', 'S' ], [ 'mine-card-1', 'H' ], [ 'theirs-card-0', 'S' ], [ 'theirs-card-1', 'S' ] ])
      await widgets.get(id).set('suit', suit);
    await holder.regroupBy('suit', [ 'suit' ], false);
    // alice's spades stay alice's, and the loose cards of the jestPlayer lane
    // stay in the jestPlayer lane
    expect(widgets.get('mine-card-0').get('owner')).toBe('jestPlayer');
    expect(widgets.get('mine-card-1').get('owner')).toBe('jestPlayer');
    expect(widgets.get('theirs-card-0').get('owner')).toBe('alice');
    expect(widgets.get('theirs-card-1').get('owner')).toBe('alice');
    // no group mixes owners
    for(const pile of widgetFilter(w=>w.get('type') == 'pile'))
      expect(new Set(pile.children().map(c=>c.get('owner'))).size).toBe(1);
  });

  test('the last card promoted out of a dissolving group keeps its lane', async () => {
    await sharedHand();
    await widgets.get('theirs-card-1').set('parent', null);
    expect(widgets.get('theirs-card-0').get('parent')).toBe('h');
    expect(widgets.get('theirs-card-0').get('owner')).toBe('alice');
  });

  test('switching a shared pile layout to grid breaks every lane pile into cells of its lane', async () => {
    const holder = createHolder({ id: 'h', layout: 'pile', width: 900, height: 300, childrenPerOwner: true });
    await createPile('mine', holder, 4, 4, 3);
    await createPile('theirs', holder, 4, 4, 3);
    await widgets.get('mine').set('owner', 'jestPlayer');
    await widgets.get('theirs').set('owner', 'alice');
    await holder.set('layout', 'grid');
    expect(widgetFilter(w=>w.get('type') == 'pile').length).toBe(0);
    for(const [ prefix, owner ] of [ [ 'mine', 'jestPlayer' ], [ 'theirs', 'alice' ] ]) {
      const cards = [ 0, 1, 2 ].map(i=>widgets.get(`${prefix}-card-${i}`));
      expect(cards.every(c=>c.get('owner') == owner)).toBe(true);
      expect(new Set(cards.map(c=>`${c.get('x')}/${c.get('y')}`)).size).toBe(3);
    }
  });

  test('switching a shared hand to the pile layout leaves one pile per lane', async () => {
    const holder = await sharedHand();
    await createPile('mine2', holder, 500, 4, 2);
    await widgets.get('mine2').set('owner', 'jestPlayer');
    await holder.set('layout', 'pile');
    const piles = widgetFilter(w=>w.get('type') == 'pile');
    expect(piles.length).toBe(2);
    const byOwner = Object.fromEntries(piles.map(p=>[ p.get('owner'), p ]));
    expect(byOwner.jestPlayer.children().length).toBe(4);
    expect(byOwner.alice.children().length).toBe(2);
    expect(byOwner.jestPlayer.children().every(c=>c.get('owner') == 'jestPlayer')).toBe(true);
    expect(byOwner.alice.children().every(c=>c.get('owner') == 'alice')).toBe(true);
  });

  test('a card dropped onto a lone card of its lane piles up with it', async () => {
    const holder = createHolder({ id: 'h', layout: 'multipleSpread', stackOffsetX: 40, width: 900, height: 120, childrenPerOwner: true });
    createCard('lone', { parent: 'h', x: 4, y: 4, z: 1 });
    await widgets.get('lone').set('owner', 'jestPlayer');
    const dropped = createCard('dropped', { x: 10, y: 10, z: 5 });
    await dropped.moveToHolder(holder);
    const pile = widgets.get(dropped.get('parent'));
    expect(pile.get('type')).toBe('pile');
    expect(pile.get('owner')).toBe('jestPlayer');
    expect(pile.children().length).toBe(2);
    expect(widgets.get('lone').get('parent')).toBe(pile.get('id'));
  });

  test('a card dropped onto a spread group of its lane joins that group', async () => {
    const holder = await sharedHand();
    const dropped = createCard('dropped', { x: 20, y: 10, z: 9 });
    await dropped.moveToHolder(holder);
    expect(dropped.get('owner')).toBe('jestPlayer');
    expect(dropped.get('parent')).toBe('mine');
    expect(widgets.get('mine').children().length).toBe(3);
  });

  test('a SHIFT between the seats leaves every lane at the start of the hand', async () => {
    // handing a group to another seat of the same hand only changes its owner,
    // so the lane it leaves has to be laid out again as much as the one it
    // arrives in - otherwise the arriving group keeps the second-slot offset
    // it got while the leaving one was still in front of it
    globalThis.jeRoutineLogging = false;
    const holder = await sharedHand();
    await holder.updateAfterShuffle();
    createWidget({ id: 'seatA', type: 'seat', player: 'jestPlayer', hand: 'h', index: 1 });
    createWidget({ id: 'seatB', type: 'seat', player: 'alice', hand: 'h', index: 2 });
    const button = createWidget({ id: 'shiftButton', clickRoutine: [ { func: 'SHIFT', holders: [ 'seatA', 'seatB' ], widgets: 'all', interval: 1 } ] });
    await button.click();
    const mine = widgets.get('mine');
    const theirs = widgets.get('theirs');
    expect(mine.get('owner')).toBe('alice');
    expect(theirs.get('owner')).toBe('jestPlayer');
    expect(mine.children().every(c=>c.get('owner') == 'alice')).toBe(true);
    expect(theirs.children().every(c=>c.get('owner') == 'jestPlayer')).toBe(true);
    // each lane holds one group again, sitting at the first slot
    expect(mine.get('x')).toBe(4);
    expect(theirs.get('x')).toBe(4);
  });
});

describe('switching layouts with piles inside', () => {
  test('switching to the pile layout collects the spread-out cards into one pile', async () => {
    const holder = createHolder({ id: 'h', layout: 'singleSpread', stackOffsetX: 40, width: 900, height: 120 });
    for(let i=0; i<3; ++i)
      createCard(`c${i}`, { parent: 'h', x: 4 + i*40, y: 4, z: i+1 });
    await holder.set('layout', 'pile');
    const piles = widgetFilter(w=>w.get('type') == 'pile');
    expect(piles.length).toBe(1);
    expect(piles[0].get('x')).toBe(4);
    expect(piles[0].get('y')).toBe(4);
    expect(piles[0].children().length).toBe(3);
  });

  test('switching the pile layout to grid breaks its pile into cells', async () => {
    const holder = createHolder({ id: 'h', layout: 'pile', width: 900, height: 300 });
    await createPile('stack', holder, 4, 4, 3);
    await holder.set('layout', 'grid');
    expect(widgetFilter(w=>w.get('type') == 'pile').length).toBe(0);
    const cards = [ 'stack-card-0', 'stack-card-1', 'stack-card-2' ].map(id=>widgets.get(id));
    expect(cards.every(c=>c.get('parent') == 'h')).toBe(true);
    expect(new Set(cards.map(c=>`${c.get('x')}/${c.get('y')}`)).size).toBe(3);
  });

  test('switching the pile layout to a spread empties its pile onto the row', async () => {
    const holder = createHolder({ id: 'h', layout: 'pile', width: 900, height: 120 });
    await createPile('stack', holder, 4, 4, 3);
    await holder.set('layout', 'singleSpread');
    expect(widgetFilter(w=>w.get('type') == 'pile').length).toBe(0);
    expect(holder.children().length).toBe(3);
  });

  test('leaving multipleSpread for a spreading layout empties the groups onto the row', async () => {
    const holder = createHolder({ id: 'h', layout: 'multipleSpread', width: 900, height: 300 });
    await createPile('group', holder, 4, 4, 3);
    await holder.set('layout', 'singleSpread');
    expect(widgetFilter(w=>w.get('type') == 'pile').length).toBe(0);
    expect(holder.children().length).toBe(3);
  });

  test('leaving multipleSpread for auto empties them too, since a spreading auto layout allows no piles', async () => {
    const holder = createHolder({ id: 'h', layout: 'multipleSpread', width: 900, height: 300 });
    await createPile('group', holder, 4, 4, 3);
    await holder.set('layout', 'auto');
    expect(widgetFilter(w=>w.get('type') == 'pile').length).toBe(0);
    expect(holder.children().length).toBe(3);
    expect(holder.children().every(c=>c.get('parent') == 'h')).toBe(true);
  });

  test('leaving multipleSpread for auto keeps a group where the holder only fits one card', async () => {
    const holder = createHolder({ id: 'h', layout: 'multipleSpread', width: 120, height: 120 });
    await createPile('group', holder, 4, 4, 3);
    await holder.set('layout', 'auto');
    expect(widgetFilter(w=>w.get('type') == 'pile').length).toBe(1);
    expect(holder.children().length).toBe(3);
  });
});
