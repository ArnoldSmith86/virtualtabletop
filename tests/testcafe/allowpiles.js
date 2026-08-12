import { Selector } from 'testcafe';
import { getStateObject, setupTestEnvironment } from './test-util.js';
import { dragPath, openRoom, stateWhen, surfaceGeometry } from './interaction-util.js';

setupTestEnvironment();

// A holder with allowPiles arranges piles instead of dissolving them, and the piles it arranges
// spread their cards the way it says. What that comes to is asserted through the pointer here:
// where a widget is when it is dropped, what a pile does on its way out of the holder and what
// a routine hands the holder are the parts of it a unit test cannot reach - the arithmetic
// itself is in tests/client/holder-piles.test.js.
//
// The states below are what the engine itself lays out (a card is 103 x 160, the holder places
// its first child at its drop offset of 4): nothing re-arranges a holder when a room is loaded,
// so a fixture that disagreed with the engine would move on the first interaction and make the
// assertions about something else.

const CARD_WIDTH = 103;
const CARD_HEIGHT = 160;
const STACK_OFFSET = 40;

function card(id, definition) {
  return Object.assign({ id, type: 'card', deck: 'deck', cardType: 'plain' }, definition);
}

// A pile of `count` cards spread downwards by the tableau's stack offset.
function column(id, x, count, properties) {
  const state = {
    [id]: Object.assign({ id, type: 'pile', parent: 'tableau', x, y: 4, width: CARD_WIDTH, height: CARD_HEIGHT + (count-1)*STACK_OFFSET }, properties)
  };
  for(let i=0; i<count; ++i)
    state[`${id}c${i}`] = card(`${id}c${i}`, { parent: id, x: 0, y: i*STACK_OFFSET, z: i+1 });
  return state;
}

// A tableau of columns: the piles are spaced out along X, their cards run down Y.
function tableau(extra) {
  return Object.assign({
    deck: { id: 'deck', type: 'deck', cardTypes: { plain: {} }, x: 1450, y: 20 },
    tableau: {
      id: 'tableau', type: 'holder', x: 100, y: 100, width: 900, height: 700,
      dropTarget: { type: 'card' }, allowPiles: true, stackOffsetY: STACK_OFFSET, pilesGapX: 20
    }
  }, extra);
}

const pileCount = state=>Object.values(state).filter(widget=>widget.type == 'pile').length;
const childrenOf = (state, id)=>Object.values(state).filter(widget=>widget.parent == id);

test('A card dropped onto the middle of a fanned pile joins that pile', async t => {
  await openRoom(t, 'modern', tableau(Object.assign(column('col1', 4, 3), {
    loose: card('loose', { x: 1100, y: 200, z: 9 })
  })));

  // the middle of the fan, far away from the corner of the pile - all a pile outside a holder
  // takes, and much too small a target where the holder decides how the piles are placed
  await dragPath(t, 'loose', [ { onto: 'col1' } ]);

  const state = await stateWhen(s=>s.loose.parent == 'col1');
  await t.expect(state.loose.parent).eql('col1', 'the card joined the pile it was dropped on');
  await t.expect(pileCount(state)).eql(1, 'and no second pile was made for it');
  await t.expect(state.col1.height).eql(CARD_HEIGHT + 3*STACK_OFFSET, 'the pile grew with its spread');
});

test('A card dropped next to the piles becomes a column of its own', async t => {
  await openRoom(t, 'modern', tableau(Object.assign(column('col1', 4, 3), {
    loose: card('loose', { x: 1100, y: 200, z: 9 })
  })));

  await dragPath(t, 'loose', [ { dx: -500, dy: -50 } ]);

  const state = await stateWhen(s=>s.loose.parent == 'tableau');
  await t.expect(state.loose.parent).eql('tableau');
  await t.expect(pileCount(state)).eql(1, 'the pile it was dropped beside is untouched');
});

test('A column dropped onto another column merges into it', async t => {
  await openRoom(t, 'modern', tableau(Object.assign(column('col1', 4, 3), column('col2', 127, 2))));

  // a pile is dragged by its handle: moving the second column left by exactly its slot puts
  // its cards onto the first column
  await dragPath(t, 'col2 .handle', [ { dx: -123, dy: 40 } ]);

  const state = await stateWhen(s=>pileCount(s) == 1);
  await t.expect(pileCount(state)).eql(1, 'the two columns became one');
  await t.expect(childrenOf(state, 'col1').length).eql(5);
  await t.expect(state.col1.height).eql(CARD_HEIGHT + 4*STACK_OFFSET);
});

test('A column picked up by a handle at the far end of its fan stays under the pointer', async t => {
  await openRoom(t, 'modern', tableau(column('col1', 4, 5, { handlePosition: 'bottom left' })));

  // the pile collects its cards on the way out of the holder, so the box the pointer took
  // hold of - 320 units of fan - is gone by the time it is carried anywhere
  const geometry = await surfaceGeometry();
  const handle = await Selector('#w_col1 .handle').boundingClientRect;
  const pointer = {
    x: (handle.left + handle.width /2 - geometry.left)/geometry.pixelsPerUnit + 1000,
    y: (handle.top  + handle.height/2 - geometry.top )/geometry.pixelsPerUnit + 100
  };
  await dragPath(t, 'col1 .handle', [ { dx: 1000, dy: 100 } ]);

  const state = await stateWhen(s=>s.col1.parent === undefined);
  await t.expect(state.col1.x).lte(pointer.x, 'the pile is not dropped right of the pointer');
  await t.expect(state.col1.x + CARD_WIDTH).gte(pointer.x, 'nor left of it');
  await t.expect(state.col1.y).lte(pointer.y, 'nor below it');
  await t.expect(state.col1.y + CARD_HEIGHT).gte(pointer.y, 'nor above it - it was carried by the pointer');
});

test('A fanned pile carried in joins what the pointer is over, not what its middle is over', async t => {
  await openRoom(t, 'modern', tableau(Object.assign(column('col1', 4, 1), {
    // a pile with a stack offset of its own keeps its fan wherever it is, so this one is 280
    // units of column while it is carried - its middle is 130 units away from the handle the
    // player is holding it by
    hand: {
      id: 'hand', type: 'pile', x: 1150, y: 300, width: CARD_WIDTH, height: CARD_HEIGHT + 3*STACK_OFFSET,
      stackOffsetY: STACK_OFFSET, handlePosition: 'bottom left'
    },
    handc0: card('handc0', { parent: 'hand', x: 0, y: 0, z: 1 }),
    handc1: card('handc1', { parent: 'hand', x: 0, y: STACK_OFFSET, z: 2 }),
    handc2: card('handc2', { parent: 'hand', x: 0, y: 2*STACK_OFFSET, z: 3 }),
    handc3: card('handc3', { parent: 'hand', x: 0, y: 3*STACK_OFFSET, z: 4 })
  })));

  // the handle is put down right on the card of the single-card column, while the middle of the
  // fan ends up above the holder entirely
  await dragPath(t, 'hand .handle', [ { onto: 'col1c0' } ]);

  const state = await stateWhen(s=>pileCount(s) == 1);
  await t.expect(pileCount(state)).eql(1, 'the fan joined the column the pointer was over');
  const pile = Object.values(state).find(widget=>widget.type == 'pile');
  await t.expect(pile.parent).eql('tableau');
  await t.expect(childrenOf(state, pile.id).length).eql(5);
});

test('A column dragged out of the holder collects its cards again', async t => {
  await openRoom(t, 'modern', tableau(column('col1', 4, 3)));

  // out of the holder entirely: it reaches from x 100 to x 1000
  await dragPath(t, 'col1 .handle', [ { dx: 1050, dy: 60 } ]);

  const state = await stateWhen(s=>s.col1.parent === undefined);
  await t.expect(state.col1.parent).eql(undefined, 'the pile is on the table');
  // the stack offset came from the holder, so out here there is none left to spread by
  for(const child of childrenOf(state, 'col1'))
    await t.expect([ child.x || 0, child.y || 0 ]).eql([ 0, 0 ], `${child.id} is back on the same spot`);
  await t.expect(state.col1.height).eql(CARD_HEIGHT, 'and the pile is card-sized again');
});

test('Turning allowPiles off empties the piles the holder was arranging', async t => {
  await openRoom(t, 'modern', tableau(Object.assign(column('col1', 4, 3), column('col2', 127, 2), {
    off: {
      id: 'off', type: 'button', x: 1100, y: 100, width: 120, height: 60, text: 'off',
      clickRoutine: [
        { func: 'SELECT', property: 'id', value: 'tableau' },
        { func: 'SET', property: 'allowPiles', value: false }
      ]
    }
  })));

  // a spreading holder holds no pile - one dropped into it is emptied out - so the piles it was
  // arranging are emptied out here as well, rather than being left for COUNT and dropLimit to
  // count instead of the cards
  await t.click('#w_off');

  const state = await stateWhen(s=>pileCount(s) == 0);
  await t.expect(pileCount(state)).eql(0, 'the columns became loose cards again');
  await t.expect(childrenOf(state, 'tableau').length).eql(5, 'all five of them are in the holder');
});

test('MOVE from a holder to itself leaves its cards as they are', async t => {
  await openRoom(t, 'modern', tableau({
    card1: card('card1', { parent: 'tableau', x: 4, y: 4, z: 1 }),
    card2: card('card2', { parent: 'tableau', x: 4, y: 44, z: 2 }),
    card3: card('card3', { parent: 'tableau', x: 4, y: 84, z: 3 }),
    go: {
      id: 'go', type: 'button', x: 1100, y: 100, width: 120, height: 60, text: 'go',
      clickRoutine: [ { func: 'MOVE', from: 'tableau', to: 'tableau', count: 3 } ]
    }
  }));

  // flipping or reordering a holder in place is a MOVE onto itself: nothing arrives, so nothing
  // is put down as a new pile either
  await t.click('#w_go');

  const state = await stateWhen(s=>s.card1.z != 1);
  await t.expect(pileCount(state)).eql(0, 'the cards stayed loose');
  await t.expect(childrenOf(state, 'tableau').length).eql(3);
});
