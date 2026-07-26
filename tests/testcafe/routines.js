import { ClientFunction } from 'testcafe';

import { getState, prepareClient, setName, setRoomState, setupTestEnvironment } from './test-util.js';

setupTestEnvironment();

// the cards are created in an order that differs from the order they sit in the hand
const cardZ = { card1: 3, card2: 1, card3: 2 };
const creationOrder = [ 'card1', 'card2', 'card3' ];
const handOrder = [ 'card2', 'card3', 'card1' ];

function swapHandsRoom(clickRoutine) {
  const state = {
    deck: { id: 'deck', type: 'deck', cardTypes: { plain: {} }, x: 50, y: 400 },
    hand1: { id: 'hand1', type: 'holder', stackOffsetX: 40, x: 50, y: 600, width: 700, height: 180 },
    hand2: { id: 'hand2', type: 'holder', stackOffsetX: 40, x: 50, y: 800, width: 700, height: 180 },
    seat1: { id: 'seat1', type: 'seat', index: 1, player: 'Player 1', hand: 'hand1', x: 800, y: 600 },
    seat2: { id: 'seat2', type: 'seat', index: 2, player: 'Player 2', hand: 'hand2', x: 800, y: 800 },
    swap: { id: 'swap', type: 'button', text: 'swap', x: 800, y: 400, clickRoutine }
  };
  for(const [ card, z ] of Object.entries(cardZ))
    state[card] = { id: card, type: 'card', deck: 'deck', cardType: 'plain', parent: 'hand1', z };
  return state;
}

async function expectEventually(t, get, expected) {
  let actual = null;
  for(let wait=50; wait<1000; wait*=2) {
    actual = await get();
    if(JSON.stringify(actual) == JSON.stringify(expected))
      break;
    await new Promise(resolve=>setTimeout(resolve, wait));
  }
  await t.expect(actual).eql(expected);
}

// a hand is filled from the bottom up, so its order is the one of ascending z
async function cardsInHand(hand) {
  return Object.values(JSON.parse(await getState())).filter(w=>w.parent == hand).sort((a, b)=>a.z-b.z).map(w=>w.id);
}

async function markedWidgets() {
  return Object.values(JSON.parse(await getState())).filter(w=>w.marked).map(w=>w.id);
}

async function clickSwap(t, clickRoutine) {
  await setRoomState(swapHandsRoom(clickRoutine));
  await ClientFunction(prepareClient)();
  await setName(t);
  await expectEventually(t, ()=>cardsInHand('hand1'), handOrder);
  await t.click('#w_swap');
  await expectEventually(t, ()=>cardsInHand('hand1'), []);
}

test('SWAPHANDS passes the cards on in widget creation order', async t => {
  await clickSwap(t, [ { func: 'SWAPHANDS' } ]);
  await expectEventually(t, ()=>cardsInHand('hand2'), creationOrder);
});

test('SWAPHANDS with keepOrder passes the cards on in the order of the hand', async t => {
  await clickSwap(t, [ { func: 'SWAPHANDS', keepOrder: true } ]);
  await expectEventually(t, ()=>cardsInHand('hand2'), handOrder);
});

// SWAPHANDS names its temporary collections after the seats they come from, so a
// collection of the surrounding routine using such a name has to survive the operation
test('SWAPHANDS leaves a collection of the surrounding routine intact', async t => {
  await clickSwap(t, [
    { func: 'SELECT', property: 'id', value: 'card1', collection: 'hand of seat1' },
    { func: 'SWAPHANDS' },
    { func: 'SET', collection: 'hand of seat1', property: 'marked', value: true }
  ]);
  await expectEventually(t, ()=>cardsInHand('hand2'), creationOrder);
  await expectEventually(t, markedWidgets, [ 'card1' ]);
});
