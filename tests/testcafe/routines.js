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
function removeOnEnterRoom() {
  const state = {
    deck: { id: 'deck', type: 'deck', cardTypes: { plain: {} }, x: 50, y: 400 },
    witness: { id: 'witness', type: 'basic', x: 1000, y: 400 },
    swap: { id: 'swap', type: 'button', text: 'swap', x: 800, y: 400, clickRoutine: [
      { func: 'SWAPHANDS' },
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

// four seated players with the turn on the first seat, and one button per TURN
// variant to test. every button marks the witness after the TURN operation, so the
// witness also shows whether the routine survived the operation
const turnButtons = {
  forward:      { turn: 1 },
  back:         { turn: -1 },
  backTwo:      { turn: -2 },
  backward:     { turnCycle: 'backward', turn: 1 },
  backFraction: { turn: -1.5 },
  forwardString: { turn: '2' },
  positionLast: { turnCycle: 'position', turn: -1 },
  positionBeforeLast: { turnCycle: 'position', turn: -2 },
  positionZero: { turnCycle: 'position', turn: 0 }
};

function turnRoom(skipped) {
  const state = {
    witness: { id: 'witness', type: 'basic', x: 1000, y: 400 }
  };
  for(const index of [ 1, 2, 3, 4 ])
    state[`seat${index}`] = { id: `seat${index}`, type: 'seat', index, player: `Player ${index}`, turn: index == 1, skipTurn: skipped.indexOf(index) != -1, x: 800, y: 200*index };
  Object.entries(turnButtons).forEach(([ id, turn ], i)=>{
    state[id] = { id, type: 'button', text: id, x: 50 + 150*Math.floor(i/4), y: 200*(i%4), clickRoutine: [
      Object.assign({ func: 'TURN' }, turn),
      { func: 'SELECT', property: 'id', value: 'witness' },
      { func: 'SET', property: 'marked', value: true }
    ] };
  });
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

async function widgetExists(id) {
  return Object.keys(JSON.parse(await getState())).indexOf(id) != -1;
}

async function seatsWithTurn() {
  return Object.values(JSON.parse(await getState())).filter(w=>w.type == 'seat' && w.turn).map(w=>w.id).sort();
}

async function clickTurn(t, button, skipped=[]) {
  await setRoomState(turnRoom(skipped));
  await ClientFunction(prepareClient)();
  await setName(t);
  await expectEventually(t, seatsWithTurn, [ 'seat1' ]);
  await t.click(`#w_${button}`);
}

async function clickSwap(t, clickRoutine) {
  await setRoomState(swapHandsRoom(clickRoutine));
  await ClientFunction(prepareClient)();
  await setName(t);
  await expectEventually(t, ()=>cardsInHand('hand1'), handOrder);
  await t.click('#w_swap');
  await expectEventually(t, ()=>cardsInHand('hand1'), []);
}

test('TURN with a negative turn cycles the other way around the seats', async t => {
  await clickTurn(t, 'back');
  await expectEventually(t, seatsWithTurn, [ 'seat4' ]);
  await expectEventually(t, markedWidgets, [ 'witness' ]);
});

test('TURN with a negative turn of more than one step wraps around the seats', async t => {
  await clickTurn(t, 'backTwo');
  await expectEventually(t, seatsWithTurn, [ 'seat3' ]);
  await expectEventually(t, markedWidgets, [ 'witness' ]);
});

// the seat that has the turn is skipped itself, so it is missing from the list the
// target is picked from - the step in either direction still has to be a single one
test('TURN with a negative turn steps back one seat from a skipped current seat', async t => {
  await clickTurn(t, 'back', [ 1 ]);
  await expectEventually(t, seatsWithTurn, [ 'seat4' ]);
  await expectEventually(t, markedWidgets, [ 'witness' ]);
});

test('TURN with a negative turn matches turnCycle backward on a skipped current seat', async t => {
  await clickTurn(t, 'backward', [ 1 ]);
  await expectEventually(t, seatsWithTurn, [ 'seat4' ]);
  await expectEventually(t, markedWidgets, [ 'witness' ]);
});

test('TURN with a positive turn skips the current seat as before', async t => {
  await clickTurn(t, 'forward', [ 1 ]);
  await expectEventually(t, seatsWithTurn, [ 'seat2' ]);
  await expectEventually(t, markedWidgets, [ 'witness' ]);
});

test('TURN with turnCycle position counts a negative turn from the last seat', async t => {
  await clickTurn(t, 'positionLast');
  await expectEventually(t, seatsWithTurn, [ 'seat4' ]);
  await expectEventually(t, markedWidgets, [ 'witness' ]);
});

test('TURN with turnCycle position and turn -2 selects the seat before the last one', async t => {
  await clickTurn(t, 'positionBeforeLast');
  await expectEventually(t, seatsWithTurn, [ 'seat3' ]);
  await expectEventually(t, markedWidgets, [ 'witness' ]);
});

// positions are counted over the seats that are not skipped, so the last position is
// the last seat without skipTurn - not the last seat of the collection
test('TURN with turnCycle position counts a negative turn over the unskipped seats', async t => {
  await clickTurn(t, 'positionLast', [ 4 ]);
  await expectEventually(t, seatsWithTurn, [ 'seat3' ]);
  await expectEventually(t, markedWidgets, [ 'witness' ]);
});

// a turn value that cannot index the seat list must not abort the routine
test('TURN with turnCycle position and turn 0 leaves the turn on the first seat', async t => {
  await clickTurn(t, 'positionZero');
  await expectEventually(t, seatsWithTurn, [ 'seat1' ]);
  await expectEventually(t, markedWidgets, [ 'witness' ]);
});

test('TURN with a fractional turn cuts off the fraction', async t => {
  await clickTurn(t, 'backFraction');
  await expectEventually(t, seatsWithTurn, [ 'seat4' ]);
  await expectEventually(t, markedWidgets, [ 'witness' ]);
});

test('TURN with a numeric string turn steps as many seats as the number', async t => {
  await clickTurn(t, 'forwardString');
  await expectEventually(t, seatsWithTurn, [ 'seat3' ]);
  await expectEventually(t, markedWidgets, [ 'witness' ]);
});

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
  await setRoomState(removeOnEnterRoom());
  await ClientFunction(prepareClient)();
  await setName(t);
  await expectEventually(t, ()=>cardsInHand('hand3'), [ 'doomed' ]);
  await t.click('#w_swap');
  await expectEventually(t, ()=>cardsInHand('hand2'), [ 'card1' ]);
  await expectEventually(t, ()=>widgetExists('doomed'), false);
  await expectEventually(t, ()=>cardsInHand('hand1'), []);
  await expectEventually(t, markedWidgets, [ 'card1' ]);
});
