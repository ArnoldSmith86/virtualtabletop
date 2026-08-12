import { dropTargets } from '../../client/js/main.js';
import { widgets, addWidget, batchStart, batchEnd, widgetFilter, flushDelta } from '../../client/js/serverstate.js';
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
beforeAll(async () => {
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
  globalThis.legacyMode = () => false;
  globalThis.compareDropTarget = w => w.get('type') == 'card' || w.get('type') == 'pile';
  globalThis.asArray = v => Array.isArray(v) ? v : [ v ];
  globalThis.tracingEnabled = false;
  globalThis.sendTraceEvent = () => {};
  globalThis.setDeltaCause = () => {};
  globalThis.rescaleDragAnchor = () => {};
  globalThis.removeWidgetLocal = id => removeWidget(id);
  globalThis.getMaxZ = () => 0;
  globalThis.updateMaxZ = () => {};
  globalThis.mapAssetURLs = url => url;
  globalThis.setTextAndAdjustFontSize = () => {};
  globalThis.playerName = 'jestPlayer';
  globalThis.sortWidgets = sortWidgets;
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
});

describe('when the auto layout applies', () => {
  test('it steps aside while any classic arrangement property is written', () => {
    for(const deferring of [ { stackOffsetX: 40 }, { dropOffsetY: 10 }, { alignChildren: false }, { preventPiles: true }, { allowPiles: true }, { pilesGapX: 20 }, { spreadMin: 3 } ]) {
      const holder = createHolder({ id: 'h', ...deferring });
      expect(holder.get('layout')).toBe('auto');
      expect(holder.effectiveLayout()).toBe('custom');
      expect(holder.usesAutoLayout()).toBe(false);
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

  test('a pile dropped in survives as a group and gets the room of one entry', async () => {
    const holder = createHolder({ id: 'h', width: 600, height: 120 });
    await createPile('group', holder, 4, 4, 3);
    createCard('loose', { parent: 'h', z: 10 });
    await holder.updateAfterShuffle();
    expect(widgetFilter(w=>w.get('type') == 'pile').length).toBe(1);
    // two entries, both in the row - and children() still counts the cards
    expect(holder.arrangedChildren().length).toBe(2);
    expect(holder.children().length).toBe(4);
  });

  test('shrinking the holder gathers everything in the middle without forming a pile', async () => {
    const holder = createHolder({ id: 'h', width: 600, height: 120 });
    for(let i=0; i<3; ++i)
      createCard(`c${i}`, { parent: 'h', z: i+1 });
    await holder.updateAfterShuffle();
    await holder.set('width', 120);
    expect(holder.autoSpreads()).toBe(false);
    expect(positionsByZ(holder)).toEqual([ [ 10, 10 ], [ 10, 10 ], [ 10, 10 ] ]);
    expect(widgetFilter(w=>w.get('type') == 'pile').length).toBe(0);
    // and growing it again spreads them back out
    await holder.set('width', 600);
    expect(positionsByZ(holder)).toEqual([ [ 146, 10 ], [ 250, 10 ], [ 354, 10 ] ]);
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
});

describe('the grid layout', () => {
  test('derives the columns with the least overlap and fills row by row', async () => {
    const holder = createHolder({ id: 'h', layout: 'grid', width: 320, height: 320 });
    for(let i=0; i<4; ++i)
      createCard(`c${i}`, { parent: 'h', z: i+1 });
    await holder.updateAfterShuffle();
    expect(positionsByZ(holder)).toEqual([ [ 4, 4 ], [ 108, 4 ], [ 4, 108 ], [ 108, 108 ] ]);
  });

  test('gridColumns pins the column count', async () => {
    const holder = createHolder({ id: 'h', layout: 'grid', gridColumns: 4, width: 440, height: 320 });
    for(let i=0; i<4; ++i)
      createCard(`c${i}`, { parent: 'h', z: i+1 });
    await holder.updateAfterShuffle();
    expect(positionsByZ(holder)).toEqual([ [ 4, 4 ], [ 108, 4 ], [ 212, 4 ], [ 316, 4 ] ]);
  });

  test('gridRows pins the row count instead', async () => {
    const holder = createHolder({ id: 'h', layout: 'grid', gridRows: 1, width: 440, height: 320 });
    for(let i=0; i<4; ++i)
      createCard(`c${i}`, { parent: 'h', z: i+1 });
    await holder.updateAfterShuffle();
    expect(positionsByZ(holder)).toEqual([ [ 4, 4 ], [ 108, 4 ], [ 212, 4 ], [ 316, 4 ] ]);
  });

  test('dropOffset is the margin and stackOffset the cell gap', async () => {
    const holder = createHolder({ id: 'h', layout: 'grid', gridColumns: 2, dropOffsetX: 10, dropOffsetY: 20, stackOffsetX: 10, stackOffsetY: 10, width: 500, height: 500 });
    for(let i=0; i<2; ++i)
      createCard(`c${i}`, { parent: 'h', z: i+1 });
    await holder.updateAfterShuffle();
    expect(positionsByZ(holder)).toEqual([ [ 10, 20 ], [ 120, 20 ] ]);
  });

  test('a fractional gridColumns below one still means a single column', async () => {
    const holder = createHolder({ id: 'h', layout: 'grid', gridColumns: 0.5, width: 320, height: 320 });
    for(let i=0; i<2; ++i)
      createCard(`c${i}`, { parent: 'h', z: i+1 });
    await holder.updateAfterShuffle();
    expect(positionsByZ(holder)).toEqual([ [ 4, 4 ], [ 4, 108 ] ]);
  });

  test('and a fractional gridRows below one a single row', async () => {
    const holder = createHolder({ id: 'h', layout: 'grid', gridRows: 0.5, width: 320, height: 320 });
    for(let i=0; i<2; ++i)
      createCard(`c${i}`, { parent: 'h', z: i+1 });
    await holder.updateAfterShuffle();
    expect(positionsByZ(holder)).toEqual([ [ 4, 4 ], [ 108, 4 ] ]);
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

describe('switching layouts with piles inside', () => {
  test('leaving multipleSpread for a spreading layout empties the groups onto the row', async () => {
    const holder = createHolder({ id: 'h', layout: 'multipleSpread', width: 900, height: 300 });
    await createPile('group', holder, 4, 4, 3);
    await holder.set('layout', 'singleSpread');
    expect(widgetFilter(w=>w.get('type') == 'pile').length).toBe(0);
    expect(holder.children().length).toBe(3);
  });

  test('leaving multipleSpread for auto keeps them, auto arranges piles too', async () => {
    const holder = createHolder({ id: 'h', layout: 'multipleSpread', width: 900, height: 300 });
    await createPile('group', holder, 4, 4, 3);
    await holder.set('layout', 'auto');
    expect(widgetFilter(w=>w.get('type') == 'pile').length).toBe(1);
    expect(holder.children().length).toBe(3);
  });
});
