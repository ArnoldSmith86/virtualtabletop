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

// three seats, and the middle hand removes the only card of the last hand as soon as
// it receives one - so the last hand would pass on a card that no longer exists.
// the witness is marked by the first hand's enterRoutine, so it stays unmarked as
// long as nothing arrives there
function removeOnEnterRoom(operation) {
  const state = {
    deck: { id: 'deck', type: 'deck', cardTypes: { plain: {} }, x: 50, y: 400 },
    witness: { id: 'witness', type: 'basic', x: 1000, y: 400 },
    swap: { id: 'swap', type: 'button', text: 'swap', x: 800, y: 400, clickRoutine: [
      operation,
      { func: 'SELECT', property: 'id', value: 'card1' },
      { func: 'SET', property: 'marked', value: true }
    ] },
    card1: { id: 'card1', type: 'card', deck: 'deck', cardType: 'plain', parent: 'hand1' },
    doomed: { id: 'doomed', type: 'card', deck: 'deck', cardType: 'plain', parent: 'hand3' }
  };
  for(const index of [ 1, 2, 3 ]) {
    state[`hand${index}`] = { id: `hand${index}`, type: 'holder', x: 50, y: 200*index, width: 700, height: 180 };
    state[`seat${index}`] = { id: `seat${index}`, type: 'seat', index, player: `Player ${index}`, hand: `hand${index}`, x: 800, y: 200*index };
  }
  state.hand1.enterRoutine = [ { func: 'SELECT', property: 'id', value: 'witness' }, { func: 'SET', property: 'marked', value: true } ];
  state.hand2.enterRoutine = [ { func: 'SELECT', property: 'id', value: 'doomed' }, { func: 'DELETE' } ];
  return state;
}

// a PCIO import gives every seat the same hand and tells the cards apart by their
// owner, so passing a hand on there only changes owners and no card changes parent
function sharedHandRoom() {
  const state = {
    deck: { id: 'deck', type: 'deck', cardTypes: { plain: {} }, x: 50, y: 400 },
    hand: { id: 'hand', type: 'holder', childrenPerOwner: true, x: 50, y: 600, width: 700, height: 180 },
    shift: { id: 'shift', type: 'button', text: 'shift', x: 800, y: 400, clickRoutine: [
      { func: 'SHIFT', holders: [ 'seat1', 'seat2', 'seat3' ] }
    ] }
  };
  for(const index of [ 1, 2, 3 ]) {
    state[`seat${index}`] = { id: `seat${index}`, type: 'seat', index, player: `Player ${index}`, hand: 'hand', x: 800, y: 200*index };
    state[`card${index}`] = { id: `card${index}`, type: 'card', deck: 'deck', cardType: 'plain', parent: 'hand', owner: `Player ${index}`, z: index };
  }
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
  return Object.values(JSON.parse(await getState())).filter(w=>w.marked).map(w=>w.id).sort();
}

async function cardOwners() {
  const state = JSON.parse(await getState());
  return [ 'card1', 'card2', 'card3' ].map(id=>state[id].owner);
}

async function widgetExists(id) {
  return Object.keys(JSON.parse(await getState())).indexOf(id) != -1;
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

test('SWAPHANDS does not pass on a card that a routine of an earlier move removed', async t => {
  await setRoomState(removeOnEnterRoom({ func: 'SWAPHANDS' }));
  await ClientFunction(prepareClient)();
  await setName(t);
  await expectEventually(t, ()=>cardsInHand('hand3'), [ 'doomed' ]);
  await t.click('#w_swap');
  await expectEventually(t, ()=>cardsInHand('hand2'), [ 'card1' ]);
  await expectEventually(t, ()=>widgetExists('doomed'), false);
  await expectEventually(t, ()=>cardsInHand('hand1'), []);
  await expectEventually(t, markedWidgets, [ 'card1' ]);
});

test('SHIFT passes the cards on in the order of the hand', async t => {
  await clickSwap(t, [ { func: 'SHIFT', holders: [ 'seat1', 'seat2' ] } ]);
  await expectEventually(t, ()=>cardsInHand('hand2'), handOrder);
});

test('SHIFT defaults to shifting the hands of the active seats', async t => {
  await clickSwap(t, [ { func: 'SHIFT' } ]);
  await expectEventually(t, ()=>cardsInHand('hand2'), handOrder);
});

// SHIFT names its temporary collections after the entries they come from, so a
// collection of the surrounding routine using such a name has to survive the operation
test('SHIFT leaves a collection of the surrounding routine intact', async t => {
  await clickSwap(t, [
    { func: 'SELECT', property: 'id', value: 'card1', collection: 'hand of seat1' },
    { func: 'SHIFT', holders: [ 'seat1', 'seat2' ] },
    { func: 'SET', collection: 'hand of seat1', property: 'marked', value: true }
  ]);
  await expectEventually(t, ()=>cardsInHand('hand2'), handOrder);
  await expectEventually(t, markedWidgets, [ 'card1' ]);
});

test('SHIFT does not pass on a card that a routine of an earlier move removed', async t => {
  await setRoomState(removeOnEnterRoom({ func: 'SHIFT', holders: [ 'seat1', 'seat2', 'seat3' ] }));
  await ClientFunction(prepareClient)();
  await setName(t);
  await expectEventually(t, ()=>cardsInHand('hand3'), [ 'doomed' ]);
  await t.click('#w_swap');
  await expectEventually(t, ()=>cardsInHand('hand2'), [ 'card1' ]);
  await expectEventually(t, ()=>widgetExists('doomed'), false);
  await expectEventually(t, ()=>cardsInHand('hand1'), []);
  await expectEventually(t, markedWidgets, [ 'card1' ]);
});

test('SHIFT passes on a hand that all seats share by changing the owner', async t => {
  await setRoomState(sharedHandRoom());
  await ClientFunction(prepareClient)();
  await setName(t);
  await expectEventually(t, cardOwners, [ 'Player 1', 'Player 2', 'Player 3' ]);
  await t.click('#w_shift');
  await expectEventually(t, cardOwners, [ 'Player 2', 'Player 3', 'Player 1' ]);
  await expectEventually(t, async ()=>(await cardsInHand('hand')).sort(), [ 'card1', 'card2', 'card3' ]);
});
