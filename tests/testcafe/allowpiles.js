import { getStateObject, setupTestEnvironment } from './test-util.js';
import { dragPath, openRoom, stateWhen } from './interaction-util.js';

setupTestEnvironment();

// A holder with allowPiles arranges piles instead of dissolving them, and the piles it arranges
// spread their cards the way it says. Everything interesting about that lives in holder.js,
// which jest cannot import - so what a drop lands on, what a pile does when it leaves the
// holder and what a routine hands the holder are asserted here, through the pointer.
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
function column(id, x, count, firstCard) {
  const state = {
    [id]: { id, type: 'pile', parent: 'tableau', x, y: 4, width: CARD_WIDTH, height: CARD_HEIGHT + (count-1)*STACK_OFFSET }
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

  // a pile is dragged by its handle, and what aims the drop is the card at its corner: moving
  // the second column left by exactly its slot puts that card on the first column
  await dragPath(t, 'col2 .handle', [ { dx: -123, dy: 40 } ]);

  const state = await stateWhen(s=>pileCount(s) == 1);
  await t.expect(pileCount(state)).eql(1, 'the two columns became one');
  await t.expect(childrenOf(state, 'col1').length).eql(5);
  await t.expect(state.col1.height).eql(CARD_HEIGHT + 4*STACK_OFFSET);
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
