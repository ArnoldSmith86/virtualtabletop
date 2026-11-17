import { dropTargets, exceedsDropLimit } from '../../client/js/main.js';
import { widgets, addWidget, batchStart, batchEnd, widgetFilter, flushDelta, arrangementStateVersion } from '../../client/js/serverstate.js';
import { Widget } from '../../client/js/widgets/widget.js';

import { createWidget, removeWidget } from './client-util.js';

// A multiSpread holder arranges piles instead of dissolving them: it decides what a drop
// lands on and how much room each pile gets. holder.js relies on the concatenated global scope
// of the shipped bundle rather than on imports, so expose the identifiers it references before
// importing it.
let Holder, Pile;
beforeAll(async () => {
  globalThis.Widget = Widget;
  // the holder only reaches into ImageWidget for the image and icon it paints, neither of
  // which any of the arithmetic below touches
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
  globalThis.getMaxZ = () => 0;
  globalThis.updateMaxZ = () => {};
  globalThis.mapAssetURLs = url => url;
  globalThis.setTextAndAdjustFontSize = () => {};
  globalThis.playerName = 'jestPlayer';
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
});

const CARD_WIDTH = 100;
const CARD_HEIGHT = 100;

function createHolder(definition) {
  const holder = new Holder(definition.id);
  addWidget({ ...definition, type: 'holder' }, holder);
  return holder;
}

// A pile of `count` cards at x/y, spread downwards the way the holder says.
async function createColumn(id, holder, x, y, count) {
  const pile = new Pile(id);
  // no stackOffset of its own: the pile takes the one of the holder that arranges it
  addWidget({ id, type: 'pile', parent: holder.get('id'), x, y }, pile);
  for(let i=0; i<count; ++i)
    createWidget({ id: `${id}-card-${i}`, type: 'card', parent: id, z: i+1, width: CARD_WIDTH, height: CARD_HEIGHT });
  await pile.arrangeChildren(false);
  return pile;
}

function createCard(id, definition) {
  return createWidget({ id, type: 'card', width: CARD_WIDTH, height: CARD_HEIGHT, ...definition });
}

afterEach(() => {
  for(const id of [ ...widgets.keys() ])
    removeWidget(id);
});

describe('a holder deciding what a drop lands on', () => {
  let holder;
  beforeEach(() => {
    holder = createHolder({ id: 'tableau', x: 0, y: 0, width: 900, height: 700, layout: 'multiSpread', stackOffsetY: 40, pilesGapX: 20 });
  });

  test('takes a card dropped anywhere along a fanned pile into that pile', async () => {
    const column = await createColumn('col1', holder, 4, 4, 3);
    // the middle of the fan, far away from the corner of the pile
    expect(holder.arrangedChildAt(createCard('loose'), 10, 100)).toBe(column);
  });

  test('starts a new pile for a card dropped beside them', async () => {
    await createColumn('col1', holder, 4, 4, 3);
    expect(holder.arrangedChildAt(createCard('loose'), 400, 100)).toBe(null);
  });

  test('slots the preview shadow into the fan like the card it previews', async () => {
    const column = await createColumn('col1', holder, 4, 4, 3);
    const shadow = createCard('shadow', { parent: 'tableau', dropShadowOwner: 'someone' });
    // aimed between the second and the third card of the fan
    await holder.previewShadowDrop(shadow, column, 10, 40);
    // as a sibling of the pile the shadow could only cover the whole fan or
    // hide behind it, so it joins the pile: above the cards below its slot,
    // below the cards above it
    expect(shadow.get('parent')).toBe('col1');
    expect(shadow.get('z')).toBeGreaterThan(widgets.get('col1-card-1').get('z'));
    expect(shadow.get('z')).toBeLessThan(widgets.get('col1-card-2').get('z'));
    // without counting as one of the cards
    expect(column.children().length).toBe(3);
  });

  test('takes a long pile carried onto a short one into that pile', async () => {
    const short = await createColumn('short', holder, 4, 4, 1);
    const long = await createColumn('long', holder, 124, 4, 5);
    // a pile that is being carried has collected its cards, so what aims it is the middle of
    // the one card it is drawn as, wherever along its fan it was picked up
    await long.set('parent', null);
    expect(holder.arrangedChildAt(long, 4, 40)).toBe(short);
  });

  test('picks the pile in front where two of them overlap', async () => {
    const overlapping = createHolder({ id: 'row', x: 0, y: 0, layout: 'multiSpread', stackOffsetY: 40, pilesOffsetX: 60 });
    const behind = await createColumn('behind', overlapping, 4, 4, 1);
    const inFront = await createColumn('inFront', overlapping, 64, 4, 1);
    await behind.set('z', 1);
    await inFront.set('z', 100);
    const dropped = createCard('loose');
    // the boxes of the two piles overlap between x 64 and x 104, so a drop there lands on both
    expect(overlapping.arrangedChildAt(dropped, 20, 4)).toBe(inFront);
    expect(overlapping.arrangedChildAt(dropped, 10, 4)).toBe(behind);
  });

  test('aims a pile that keeps its fan while it is carried by the card the pointer holds', async () => {
    const short = await createColumn('short', holder, 4, 4, 1);
    // a pile that spreads its own cards goes on doing so while it is being dragged, so its box
    // is the whole fan - five cards deep here, 260 units of it
    const carried = new Pile('carried');
    addWidget({ id: 'carried', type: 'pile', x: 400, y: 400, stackOffsetY: 40 }, carried);
    for(let i=0; i<5; ++i)
      createWidget({ id: `carried-card-${i}`, type: 'card', parent: 'carried', z: i+1, width: CARD_WIDTH, height: CARD_HEIGHT });
    await carried.arrangeChildren(false);
    expect(carried.get('height')).toBe(CARD_HEIGHT + 4*40);

    // held by its bottom card and dropped so that this card lands on the single-card pile
    carried.dropAnchor = { x: CARD_WIDTH/2, y: 4*40 + CARD_HEIGHT/2 };
    expect(holder.arrangedChildAt(carried, 4, 4 - 4*40)).toBe(short);
    // the middle of the fan alone points 130 units above the pointer and would have missed it
    delete carried.dropAnchor;
    expect(holder.arrangedChildAt(carried, 4, 4 - 4*40)).toBe(null);
  });

  test('leaves a pile out of its own hit test', async () => {
    const column = await createColumn('col1', holder, 4, 4, 3);
    expect(holder.arrangedChildAt(column, 4, 4)).toBe(null);
  });
});

describe('a holder spacing out the piles it arranges', () => {
  const spacing = async (properties, count) => {
    // roomy enough that the overflow squish stays out of these measurements
    const holder = createHolder({ id: 'tableau', x: 0, y: 0, width: 900, height: 700, layout: 'multiSpread', ...properties });
    const column = await createColumn('col1', holder, 4, 4, count);
    return [ holder.childSpacing(column, 'X'), holder.childSpacing(column, 'Y') ];
  };

  test('starts the next pile behind the cards of this one plus the gap', async () => {
    expect(await spacing({ stackOffsetY: 40, pilesGapX: 20 }, 3)).toEqual([ CARD_WIDTH + 20, 0 ]);
  });

  test('places them at a fixed offset regardless of what they hold', async () => {
    expect(await spacing({ stackOffsetY: 40, pilesOffsetX: 60 }, 3)).toEqual([ 60, 0 ]);
    expect(await spacing({ stackOffsetY: 40, pilesOffsetX: 60 }, 5)).toEqual([ 60, 0 ]);
  });

  test('prefers a gap over an offset on the same axis', async () => {
    expect(await spacing({ stackOffsetY: 40, pilesGapX: 20, pilesOffsetX: 60 }, 3)).toEqual([ CARD_WIDTH + 20, 0 ]);
  });

  test('leaves the small default gap between them until the game spaces them itself', async () => {
    expect(await spacing({ stackOffsetY: 40 }, 3)).toEqual([ CARD_WIDTH + 8, 0 ]);
  });

  test('packs them flush along the row when the gap is written as zero', async () => {
    expect(await spacing({ stackOffsetX: 40, pilesGapX: 0 }, 3)).toEqual([ CARD_WIDTH + 2*40, 0 ]);
  });

  test('gives a card of its own the same slot as a pile, since it is one pile deep', async () => {
    const holder = createHolder({ id: 'tableau', x: 0, y: 0, layout: 'multiSpread', stackOffsetY: 40, pilesGapX: 20 });
    const card = createCard('loose', { parent: 'tableau' });
    expect([ holder.childSpacing(card, 'X'), holder.childSpacing(card, 'Y') ]).toEqual([ CARD_WIDTH + 20, 0 ]);
  });

  test('gives it the same flush slot as such a pile as well, so the row stays flush', async () => {
    const holder = createHolder({ id: 'tableau', x: 0, y: 0, layout: 'multiSpread', stackOffsetX: 40, pilesGapX: 0 });
    const column = await createColumn('col1', holder, 4, 4, 1);
    const card = createCard('loose', { parent: 'tableau' });
    expect(holder.childSpacing(card, 'X')).toBe(holder.childSpacing(column, 'X'));
    expect(holder.childSpacing(card, 'X')).toBe(CARD_WIDTH);
  });
});

describe('a holder that stops arranging piles', () => {
  test('empties them out onto the row, so it goes on holding the cards it held', async () => {
    const holder = createHolder({ id: 'tableau', x: 0, y: 0, width: 900, height: 700, layout: 'multiSpread', stackOffsetY: 40, pilesGapX: 20 });
    await createColumn('col1', holder, 4, 4, 3);
    await createColumn('col2', holder, 124, 4, 2);
    expect(holder.children().length).toBe(5);

    await holder.set('layout', 'singleSpread');

    // a spreading holder can hold no pile - COUNT and dropLimit would count the piles instead
    // of the cards from here on
    expect(widgetFilter(w=>w.get('type') == 'pile').length).toBe(0);
    expect(holder.children().length).toBe(5);
    expect(holder.children().every(c=>c.get('parent') == 'tableau')).toBe(true);
  });

  test('keeps them where it does not spread its children out, as any holder may hold a pile', async () => {
    const holder = createHolder({ id: 'stack', x: 0, y: 0, layout: 'multiSpread', pilesOffsetX: 60 });
    const column = await createColumn('col1', holder, 4, 4, 3);
    await holder.set('layout', 'custom');
    expect(widgetFilter(w=>w.get('type') == 'pile').length).toBe(1);
    // it places its own cards no longer, so it collects them onto one spot
    expect(column.children().every(c=>c.get('x') == 0 && c.get('y') == 0)).toBe(true);
  });
});

describe('a pile authored with a single card', () => {
  // the engine dissolves a pile before it gets this small, but a hand-written game file
  // can start one off like this - taking the card must not leave an empty pile behind
  test('goes away when that card is taken out', async () => {
    const holder = createHolder({ id: 'tableau', x: 0, y: 0, width: 400, height: 300, layout: 'multiSpread', stackOffsetY: 40 });
    await createColumn('lonely', holder, 4, 4, 1);
    await widgets.get('lonely-card-0').set('parent', null);
    expect(widgets.has('lonely')).toBe(false);
  });
});

describe('the axis a holder lines its children up along', () => {
  const direction = properties => createHolder({ id: 'tableau', x: 0, y: 0, ...properties }).spreadDirection();

  test('is the one its stack offset names when it does not arrange piles', () => {
    expect(direction({ stackOffsetY: 40 })).toEqual([ 'Y', 1 ]);
    expect(direction({ stackOffsetX: -40 })).toEqual([ 'X', -1 ]);
  });

  test('is the one the piles are spaced out on where it arranges them', () => {
    expect(direction({ layout: 'multiSpread', stackOffsetY: 40, pilesGapX: 20 })).toEqual([ 'X', 1 ]);
    expect(direction({ layout: 'multiSpread', stackOffsetX: 40, pilesOffsetY: 60 })).toEqual([ 'Y', 1 ]);
    expect(direction({ layout: 'multiSpread', stackOffsetX: 40, pilesOffsetY: -60 })).toEqual([ 'Y', -1 ]);
  });
});
