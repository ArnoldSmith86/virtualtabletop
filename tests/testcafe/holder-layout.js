import { Selector } from 'testcafe';
import { setupTestEnvironment } from './test-util.js';
import { dragPath, openRoom, stateWhen } from './interaction-util.js';

setupTestEnvironment();

// The layout property, driven through the pointer and through routines: where a drop lands in
// an auto holder and what the classicHolderLayout legacy mode keeps it doing, how a multiple
// spread takes a drop pointed into a fan, what MOVE's position parameter and SORT's groupBy
// leave behind. The arithmetic itself is covered in tests/client/holder-layout.test.js - this
// is about the parts only a real drag or a real routine reaches.
//
// The states below are what the engine itself lays out (a card is 103 x 160): nothing
// re-arranges a holder when a room is loaded, so a fixture that disagreed with the engine
// would move on the first interaction and make the assertions about something else.

const CARD_WIDTH = 103;
const CARD_HEIGHT = 160;

function card(id, definition) {
  return Object.assign({ id, type: 'card', deck: 'deck', cardType: 'plain' }, definition);
}

function baseState(extra) {
  return Object.assign({
    deck: { id: 'deck', type: 'deck', cardTypes: { plain: {} }, x: 1450, y: 20 }
  }, extra);
}

// An auto holder with room on both axes and a loose card outside of it.
function autoRoom() {
  return baseState({
    holder: { id: 'holder', type: 'holder', x: 100, y: 100, width: 600, height: 300, dropTarget: { type: 'card' } },
    loose: card('loose', { x: 1200, y: 700, z: 9 })
  });
}

// A multi-group hand; entries laid out the way the engine leaves them (drop offset 4/4,
// a group is spaced its X extent plus the default gap of 8 from the previous one).
function multiSpreadHand(extra, properties) {
  return baseState(Object.assign({
    hand: Object.assign({
      id: 'hand', type: 'holder', x: 100, y: 100, width: 900, height: 300,
      dropTarget: { type: 'card' }, layout: 'multiSpread', stackOffsetX: 40
    }, properties)
  }, extra));
}

// A fanned group of `count` cards inside the hand, spread right by the hand's stack offset.
function fan(id, x, count, cardProperties) {
  const state = {
    [id]: { id, type: 'pile', parent: 'hand', x, y: 4, width: CARD_WIDTH + (count-1)*40, height: CARD_HEIGHT }
  };
  for(let i=0; i<count; ++i)
    state[`${id}c${i}`] = card(`${id}c${i}`, Object.assign({ parent: id, x: i*40, y: 0, z: i+1 }, cardProperties));
  return state;
}

const pileCount = state=>Object.values(state).filter(widget=>widget.type == 'pile').length;
const byZ = (state, parent)=>Object.values(state).filter(widget=>widget.parent == parent).sort((a, b)=>a.z - b.z);

test('An auto holder centers a dropped card', async t => {
  await openRoom(t, 'modern', autoRoom());

  await dragPath(t, 'loose', [ { onto: 'holder' } ]);

  const state = await stateWhen(s=>s.loose.parent == 'holder');
  await t.expect(state.loose.parent).eql('holder');
  await t.expect(state.loose.x).eql(248.5, 'centered horizontally');
  await t.expect(state.loose.y).eql(70, 'centered vertically');
});

test('The classicHolderLayout legacy mode keeps drops at the drop offset', async t => {
  await openRoom(t, 'only-classicHolderLayout', autoRoom());

  await dragPath(t, 'loose', [ { onto: 'holder' } ]);

  const state = await stateWhen(s=>s.loose.parent == 'holder');
  await t.expect(state.loose.parent).eql('holder');
  await t.expect(state.loose.x).eql(4, 'the classic drop offset, not the center');
  await t.expect(state.loose.y).eql(4);
});

// The box a tilted piece of a random holder covers - what the layout keeps
// inside the margins and clear of the other pieces.
function coveredBox(widget) {
  const width = widget.width ?? CARD_WIDTH;
  const height = widget.height ?? CARD_HEIGHT;
  const radians = (widget.rotation || 0) * Math.PI / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  const w = width * cos + height * sin;
  const h = height * cos + width * sin;
  return { x: (widget.x ?? 4) - (w - width) / 2, y: (widget.y ?? 4) - (h - height) / 2, w, h };
}

test('A random holder keeps a drop on its aimed free spot and relocates a covered one', async t => {
  await openRoom(t, 'modern', baseState({
    holder: { id: 'holder', type: 'holder', x: 100, y: 100, width: 600, height: 400, dropTarget: { type: 'card' }, layout: 'random' },
    loose: card('loose', { x: 1200, y: 700, z: 9 }),
    loose2: card('loose2', { x: 1200, y: 500, z: 10 })
  }));

  // dropped onto the middle of the empty holder, the card keeps that spot -
  // up to the drag's own client-pixel rounding - and settles with a small tilt
  await dragPath(t, 'loose', [ { onto: 'holder' } ]);
  let state = await stateWhen(s=>s.loose.parent == 'holder');
  await t.expect(Math.abs(state.loose.x - 248.5) <= 3).ok('kept the aimed spot');
  await t.expect(Math.abs(state.loose.y - 120) <= 3).ok('kept the aimed spot vertically');
  await t.expect(Math.abs(state.loose.rotation || 0) <= 15).ok('tilted at most 15 degrees');
  const settled = { x: state.loose.x, y: state.loose.y };

  // a second card aimed at the same spot hops to a free one; the first stays
  // put and nothing pokes past the drop offset margin
  await dragPath(t, 'loose2', [ { onto: 'holder' } ]);
  state = await stateWhen(s=>s.loose2.parent == 'holder');
  await t.expect(state.loose.x).eql(settled.x, 'the first card stayed put');
  await t.expect(state.loose.y).eql(settled.y);
  const boxes = [ coveredBox(state.loose), coveredBox(state.loose2) ];
  for(const box of boxes) {
    await t.expect(box.x >= 4 && box.y >= 4).ok('inside the top left margin');
    await t.expect(box.x + box.w <= 596 && box.y + box.h <= 396).ok('inside the bottom right margin');
  }
  const overlap = Math.max(0, Math.min(boxes[0].x + boxes[0].w, boxes[1].x + boxes[1].w) - Math.max(boxes[0].x, boxes[1].x))
                * Math.max(0, Math.min(boxes[0].y + boxes[0].h, boxes[1].y + boxes[1].h) - Math.max(boxes[0].y, boxes[1].y));
  await t.expect(overlap).eql(0, 'the two cards do not overlap');
});

test('A pile dropped into an auto holder with room to spread is emptied into the row', async t => {
  await openRoom(t, 'modern', baseState({
    holder: { id: 'holder', type: 'holder', x: 100, y: 100, width: 600, height: 300, dropTarget: { type: 'card' } },
    pile: { id: 'pile', type: 'pile', x: 1100, y: 500, width: CARD_WIDTH, height: CARD_HEIGHT },
    p0: card('p0', { parent: 'pile', x: 0, y: 0, z: 1 }),
    p1: card('p1', { parent: 'pile', x: 0, y: 0, z: 2 }),
    p2: card('p2', { parent: 'pile', x: 0, y: 0, z: 3 })
  }));

  await dragPath(t, 'pile .handle', [ { onto: 'holder' } ]);

  // a spreading auto layout allows no piles, so the drop empties it out, one
  // card per slot of the centered row
  const state = await stateWhen(s=>pileCount(s) == 0 && s.p0.parent == 'holder');
  await t.expect(pileCount(state)).eql(0, 'the pile was emptied out');
  const row = byZ(state, 'holder');
  await t.expect(row.length).eql(3, 'all three cards are in the holder');
  await t.expect(row.map(c=>c.x).sort((a, b)=>a - b)).eql([ 141.5, 248.5, 355.5 ], 'one card per slot of the centered row');
  await t.expect(row.map(c=>c.y)).eql([ 70, 70, 70 ]);
});

test('A pile dropped into a holder that only fits one card is kept', async t => {
  await openRoom(t, 'modern', baseState({
    holder: { id: 'holder', type: 'holder', x: 100, y: 100, dropTarget: { type: 'card' } },
    pile: { id: 'pile', type: 'pile', x: 1100, y: 500, width: CARD_WIDTH, height: CARD_HEIGHT },
    p0: card('p0', { parent: 'pile', x: 0, y: 0, z: 1 }),
    p1: card('p1', { parent: 'pile', x: 0, y: 0, z: 2 })
  }));

  await dragPath(t, 'pile .handle', [ { onto: 'holder' } ]);

  const state = await stateWhen(s=>s.pile && s.pile.parent == 'holder');
  await t.expect(pileCount(state)).eql(1, 'the pile survived');
  // 4/4 is a pile's default position, so the state leaves x and y out
  await t.expect(state.pile.x === undefined && state.pile.y === undefined).ok('centered at 4/4, the classic drop offset for a default-sized card');
});

// A small auto holder that keeps a pile; the cards sit at 0/0 inside it and the pile at its
// default 4/4, which is where the engine centers it in a default-sized holder.
function keptPileRoom(count, extra) {
  const state = baseState(Object.assign({
    holder: { id: 'holder', type: 'holder', x: 100, y: 100, dropTarget: { type: 'card' } },
    pile: { id: 'pile', type: 'pile', parent: 'holder', width: CARD_WIDTH, height: CARD_HEIGHT }
  }, extra));
  for(let i=0; i<count; ++i)
    state[`p${i}`] = card(`p${i}`, { parent: 'pile', x: 0, y: 0, z: i+1 });
  return state;
}

test('Resizing an auto holder empties the pile and gathers it back', async t => {
  await openRoom(t, 'modern', baseState({
    holder: { id: 'holder', type: 'holder', x: 100, y: 100, width: 600, height: 300, dropTarget: { type: 'card' } },
    c1: card('c1', { parent: 'holder', x: 141.5, y: 70, z: 1 }),
    c2: card('c2', { parent: 'holder', x: 248.5, y: 70, z: 2 }),
    c3: card('c3', { parent: 'holder', x: 355.5, y: 70, z: 3 }),
    shrink: { id: 'shrink', type: 'button', x: 1200, y: 400, text: 'shrink', clickRoutine: [
      { func: 'SELECT', property: 'id', value: 'holder' },
      { func: 'SET', property: 'width', value: 121 },
      { func: 'SET', property: 'height', value: 178 }
    ] },
    grow: { id: 'grow', type: 'button', x: 1200, y: 500, text: 'grow', clickRoutine: [
      { func: 'SELECT', property: 'id', value: 'holder' },
      { func: 'SET', property: 'width', value: 600 },
      { func: 'SET', property: 'height', value: 300 }
    ] }
  }));

  // without the room to line the cards up, the loose row gathers back into one pile
  await t.click('#w_shrink');
  let state = await stateWhen(s=>pileCount(s) == 1);
  const pile = Object.values(state).find(widget=>widget.type == 'pile');
  await t.expect(pile.parent).eql('holder');
  await t.expect(byZ(state, pile.id).map(c=>c.id)).eql([ 'c1', 'c2', 'c3' ], 'stacked in the order of the row');
  await t.expect(pile.x).eql(9, 'centered at the derived drop offset');
  await t.expect(pile.y).eql(9);

  // and the room coming back empties it onto the row again
  await t.click('#w_grow');
  state = await stateWhen(s=>pileCount(s) == 0 && s.c1 && s.c1.parent == 'holder');
  await t.expect(byZ(state, 'holder').map(c=>c.x)).eql([ 141.5, 248.5, 355.5 ], 'one card per slot of the centered row');
  await t.expect(byZ(state, 'holder').map(c=>c.id)).eql([ 'c1', 'c2', 'c3' ], 'in the order they were stacked');
});

test('A card dropped onto the pile a small auto holder keeps joins it', async t => {
  await openRoom(t, 'modern', keptPileRoom(2, {
    loose: card('loose', { x: 1200, y: 700, z: 9 })
  }));

  await dragPath(t, 'loose', [ { onto: 'holder' } ]);

  const state = await stateWhen(s=>s.loose.parent == 'pile');
  await t.expect(byZ(state, 'pile').map(c=>c.id)).eql([ 'p0', 'p1', 'loose' ], 'on top of the pile');
  await t.expect(pileCount(state)).eql(1, 'no second pile');
});

test('Dragging the top card off a kept pile takes only that card', async t => {
  await openRoom(t, 'modern', keptPileRoom(3));

  await dragPath(t, 'p2', [ { dx: 500, dy: 300 } ]);

  const state = await stateWhen(s=>s.p2 && !s.p2.parent);
  await t.expect(state.p2.parent).eql(undefined, 'the card left alone');
  await t.expect(pileCount(state)).eql(1, 'the pile stayed behind');
  await t.expect(byZ(state, 'pile').map(c=>c.id)).eql([ 'p0', 'p1' ]);
});

test('Dragging a kept pile out of the holder keeps it together', async t => {
  await openRoom(t, 'modern', keptPileRoom(3));

  await dragPath(t, 'pile .handle', [ { dx: 500, dy: 300 } ]);

  const state = await stateWhen(s=>s.pile && !s.pile.parent);
  await t.expect(state.pile.parent).eql(undefined, 'the pile left the holder');
  await t.expect(byZ(state, 'pile').map(c=>c.id)).eql([ 'p0', 'p1', 'p2' ], 'with all its cards');
});

test('A holder inheriting classic arrangement properties follows them like their template', async t => {
  await openRoom(t, 'modern', baseState({
    template: { id: 'template', type: 'holder', x: 100, y: 500, width: 600, height: 300, dropTarget: { type: 'card' }, stackOffsetX: 40 },
    holder: { id: 'holder', type: 'holder', x: 100, y: 100, width: 600, height: 300, dropTarget: { type: 'card' }, inheritFrom: 'template' },
    loose: card('loose', { x: 1200, y: 700, z: 9 })
  }));

  await dragPath(t, 'loose', [ { onto: 'holder' } ]);

  const state = await stateWhen(s=>s.loose.parent == 'holder');
  await t.expect(state.loose.x).eql(4, 'the classic drop offset the inherited property implies, not the center');
  await t.expect(state.loose.y).eql(4);
});

test('MOVE into an auto holder spreads the cards into a centered row', async t => {
  await openRoom(t, 'modern', baseState({
    holder: { id: 'holder', type: 'holder', x: 100, y: 100, width: 600, height: 300, dropTarget: { type: 'card' } },
    source: { id: 'source', type: 'holder', layout: 'pile', x: 1200, y: 100, dropTarget: { type: 'card' } },
    c1: card('c1', { parent: 'source', x: 4, y: 4, z: 1 }),
    c2: card('c2', { parent: 'source', x: 4, y: 4, z: 2 }),
    c3: card('c3', { parent: 'source', x: 4, y: 4, z: 3 }),
    deal: { id: 'deal', type: 'button', x: 1200, y: 400, clickRoutine: [ { func: 'MOVE', from: 'source', to: 'holder', count: 3 } ] }
  }));

  await t.click('#w_deal');

  const state = await stateWhen(s=>s.c3.parent == 'holder' && s.c3.x == 355.5);
  const row = byZ(state, 'holder');
  await t.expect(row.map(c=>c.id)).eql([ 'c1', 'c2', 'c3' ], 'in the order they were moved');
  await t.expect(row.map(c=>c.x)).eql([ 141.5, 248.5, 355.5 ], 'a centered row');
  await t.expect(row.map(c=>c.y)).eql([ 70, 70, 70 ]);
  await t.expect(pileCount(state)).eql(0, 'spread out, not grouped');
});

test('A drop pointed into a fan is inserted at that spot of the fan', async t => {
  await openRoom(t, 'modern', multiSpreadHand(Object.assign(fan('fan', 4, 3), {
    loose: card('loose', { x: 1200, y: 700, z: 9 })
  })));

  // the visible band of the second card of the fan runs from x 40 to 80 inside the pile, so
  // its center sits at holder 100 + pile 4 + 60 (and anywhere along the fan's height)
  await dragPath(t, 'loose', [ { dx: (100 + 4 + 60) - (1200 + CARD_WIDTH/2), dy: (100 + 4 + 80) - (700 + CARD_HEIGHT/2) } ]);

  const state = await stateWhen(s=>s.loose.parent == 'fan');
  await t.expect(state.loose.parent).eql('fan');
  await t.expect(byZ(state, 'fan').map(c=>c.id)).eql([ 'fanc0', 'loose', 'fanc1', 'fanc2' ], 'inserted below the card whose band it pointed at');
  await t.expect(byZ(state, 'fan').map(c=>c.x)).eql([ 0, 40, 80, 120 ], 'the fan re-spread around it');
  await t.expect(state.fan.width).eql(CARD_WIDTH + 3*40, 'and grew by one slot');
});

test('A card dropped beyond the groups becomes an entry of its own at that end', async t => {
  await openRoom(t, 'modern', multiSpreadHand({
    a: card('a', { parent: 'hand', x: 4, y: 4, z: 1 }),
    b: card('b', { parent: 'hand', x: 115, y: 4, z: 2 }),
    loose: card('loose', { x: 1200, y: 700, z: 9 })
  }));

  await dragPath(t, 'loose', [ { dx: (100 + 400) - (1200 + CARD_WIDTH/2), dy: (100 + 84) - (700 + CARD_HEIGHT/2) } ]);

  const state = await stateWhen(s=>s.loose.parent == 'hand' && s.loose.x == 226);
  await t.expect(state.loose.x).eql(226, 'the third slot of the row');
  await t.expect(pileCount(state)).eql(0, 'without joining either card');
});

test('A drop released where the open slot pushed a card to forms the new group the shadow showed', async t => {
  await openRoom(t, 'modern', multiSpreadHand(Object.assign(fan('one', 4, 3), {
    inhand: card('inhand', { parent: 'hand', x: 195, y: 4, z: 8 }),
    loose: card('loose', { x: 1200, y: 700, z: 9 })
  })));

  // three stops: into the gap before the in-hand card (the shadow's slot opens there and
  // pushes the card a slot to the right), across the open slot, and onto the spot the card
  // was pushed to. Joining there would let the card snap back out from under the pointer,
  // so the preview keeps the shadow as its own group - and the drop delivers exactly that
  // instead of joining a card the pointer is no longer over.
  const startX = 1200 + CARD_WIDTH/2;
  const startY = 700 + CARD_HEIGHT/2;
  await dragPath(t, 'loose', [
    { dx: (100 + 191) - startX, dy: (100 + 84) - startY },
    { dx: (100 + 250) - startX, dy: (100 + 84) - startY },
    { dx: (100 + 310) - startX, dy: (100 + 84) - startY }
  ]);

  const state = await stateWhen(s=>s.loose.parent == 'hand' && s.loose.x == 306);
  await t.expect(state.loose.x).eql(306, 'the slot the shadow showed past the in-hand card');
  await t.expect(state.inhand.x).eql(195, 'which kept its own slot');
  await t.expect(pileCount(state)).eql(1, 'and no pile formed with it');
});

test('A card regrouped within its holder does not run onLeave, one that leaves does', async t => {
  await openRoom(t, 'modern', multiSpreadHand(fan('fan', 4, 2, { activeFace: 1 }), {
    onEnter: { activeFace: 1 },
    onLeave: { activeFace: 0 }
  }));

  // out of the fan, but onto an empty part of the same hand
  await dragPath(t, 'fanc1', [ { dx: 400, dy: 0 } ]);

  let state = await stateWhen(s=>s.fanc1.parent == 'hand');
  await t.expect(state.fanc1.activeFace).eql(1, 'it only moved between groups, so it stays face up');

  // and off the hand entirely
  await dragPath(t, 'fanc1', [ { dx: 300, dy: 500 } ]);

  state = await stateWhen(s=>!s.fanc1.parent);
  await t.expect(state.fanc1.activeFace === 0 || state.fanc1.activeFace === undefined).ok('leaving the hand flipped it back');
});

test('MOVE with position pileBottom puts the batch at the start of a spread', async t => {
  await openRoom(t, 'modern', baseState({
    row: { id: 'row', type: 'holder', x: 100, y: 100, width: 600, height: 200, dropTarget: { type: 'card' }, layout: 'singleSpread', stackOffsetX: 40 },
    c0: card('c0', { parent: 'row', x: 4, y: 4, z: 1 }),
    c1: card('c1', { parent: 'row', x: 44, y: 4, z: 2 }),
    source: { id: 'source', type: 'holder', layout: 'pile', x: 1200, y: 100, dropTarget: { type: 'card' } },
    m1: card('m1', { parent: 'source', x: 4, y: 4, z: 1 }),
    move: { id: 'move', type: 'button', x: 1200, y: 400, clickRoutine: [ { func: 'MOVE', from: 'source', to: 'row', count: 1, position: 'pileBottom' } ] }
  }));

  await t.click('#w_move');

  const state = await stateWhen(s=>s.m1.parent == 'row' && s.m1.x == 4);
  await t.expect(byZ(state, 'row').map(c=>c.id)).eql([ 'm1', 'c0', 'c1' ], 'below everything that was there');
  await t.expect(byZ(state, 'row').map(c=>c.x)).eql([ 4, 44, 84 ], 'so it leads the spread');
});

test('MOVE with position groupEnd and pileTop work the groups of a multi spread', async t => {
  await openRoom(t, 'modern', multiSpreadHand(Object.assign(fan('fan', 4, 2), {
    source: { id: 'source', type: 'holder', layout: 'pile', x: 1200, y: 100, dropTarget: { type: 'card' } },
    m1: card('m1', { parent: 'source', x: 4, y: 4, z: 1 }),
    m2: card('m2', { parent: 'source', x: 4, y: 4, z: 2 }),
    m3: card('m3', { parent: 'source', x: 4, y: 4, z: 3 }),
    moveEnd: { id: 'moveEnd', type: 'button', x: 1200, y: 400, text: 'group',
      clickRoutine: [ { func: 'MOVE', from: 'source', to: 'hand', count: 2, position: 'groupEnd' } ] },
    moveTop: { id: 'moveTop', type: 'button', x: 1200, y: 500, text: 'top',
      clickRoutine: [ { func: 'MOVE', from: 'source', to: 'hand', count: 1, position: 'pileTop' } ] }
  })));

  // the top two cards of the source become a new group after the fan
  await t.click('#w_moveEnd');
  let state = await stateWhen(s=>s.m2.parent && s.m2.parent != 'source' && s.m3.parent == s.m2.parent);
  await t.expect(pileCount(state)).eql(2, 'a second group formed');
  const group = state.m2.parent;
  await t.expect(group).notEql('fan');
  await t.expect(state[group].x).eql(4 + (CARD_WIDTH + 40) + 8, 'after the fan');
  await t.expect(byZ(state, group).map(c=>c.id)).eql([ 'm2', 'm3' ], 'in the order they were moved');

  // and pileTop joins that last group on top of it
  await t.click('#w_moveTop');
  state = await stateWhen(s=>s.m1.parent == group);
  await t.expect(byZ(state, group).map(c=>c.id)).eql([ 'm2', 'm3', 'm1' ]);
  await t.expect(pileCount(state)).eql(2, 'no third group');
});

test('MOVE with from and to naming one holder repositions cards that already sit inside its groups', async t => {
  // two real fans; their z is what the engine assigns the entries of the row
  const state = Object.assign(fan('fan1', 4, 3), fan('fan2', 4 + (CARD_WIDTH + 2*40) + 8, 2));
  state.fan1.z = 1;
  state.fan2.z = 2;
  await openRoom(t, 'modern', multiSpreadHand(Object.assign(state, {
    moveStart: { id: 'moveStart', type: 'button', x: 1200, y: 400, text: 'start',
      clickRoutine: [ { func: 'MOVE', from: 'hand', to: 'hand', count: 2, position: 'groupStart' } ] },
    moveBottom: { id: 'moveBottom', type: 'button', x: 1200, y: 500, text: 'bottom',
      clickRoutine: [ { func: 'MOVE', from: 'hand', to: 'hand', count: 1, position: 'pileBottom' } ] }
  })));

  // the top two cards are the second fan: they become a new first group and the fan they
  // drained dissolves
  await t.click('#w_moveStart');
  let roomState = await stateWhen(s=>s.fan2c0.parent && s.fan2c0.parent != 'fan2' && s.fan2c0.parent == s.fan2c1.parent && s[s.fan2c0.parent] && s[s.fan2c0.parent].x == 4);
  const group = roomState.fan2c0.parent;
  await t.expect(roomState[group].type).eql('pile');
  await t.expect(roomState.fan2).eql(undefined, 'the drained fan is gone');
  await t.expect(pileCount(roomState)).eql(2);
  await t.expect(byZ(roomState, group).map(c=>c.id)).eql([ 'fan2c0', 'fan2c1' ]);
  await t.expect(roomState.fan1.x).eql(4 + (CARD_WIDTH + 40) + 8, 'the old fan moved behind it');

  // the top card of the remaining old fan joins that first group at its bottom
  await t.click('#w_moveBottom');
  roomState = await stateWhen(s=>s.fan1c2.parent == group);
  await t.expect(byZ(roomState, group).map(c=>c.id)).eql([ 'fan1c2', 'fan2c0', 'fan2c1' ]);
  await t.expect(byZ(roomState, 'fan1').map(c=>c.id)).eql([ 'fan1c0', 'fan1c1' ]);
  await t.expect(pileCount(roomState)).eql(2, 'no extra group formed');
});

test('SORT with groupBy builds one group per suit even when the sort interleaves them', async t => {
  await openRoom(t, 'modern', multiSpreadHand({
    s1: card('s1', { parent: 'hand', x: 4,   y: 4, z: 1, suit: 'S', rank: 2 }),
    h1: card('h1', { parent: 'hand', x: 115, y: 4, z: 2, suit: 'H', rank: 1 }),
    s2: card('s2', { parent: 'hand', x: 226, y: 4, z: 3, suit: 'S', rank: 1 }),
    h2: card('h2', { parent: 'hand', x: 337, y: 4, z: 4, suit: 'H', rank: 2 }),
    sort: { id: 'sort', type: 'button', x: 1200, y: 400,
      clickRoutine: [ { func: 'SORT', holder: 'hand', key: 'rank', groupBy: 'suit' } ] }
  }));

  await t.click('#w_sort');

  const state = await stateWhen(s=>pileCount(s) == 2);
  await t.expect(pileCount(state)).eql(2, 'one group per suit');
  for(const pile of Object.values(state).filter(widget=>widget.type == 'pile')) {
    const cards = byZ(state, pile.id);
    await t.expect(new Set(cards.map(c=>c.suit)).size).eql(1, 'every card of a group shares the suit');
    await t.expect(cards.map(c=>c.rank)).eql([ 1, 2 ], 'sorted by rank within the group');
  }
});
