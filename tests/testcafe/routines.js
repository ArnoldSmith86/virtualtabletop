import { ClientFunction, Selector } from 'testcafe';

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

async function widgetProperty(id, property) {
  const widget = JSON.parse(await getState())[id];
  return widget && widget[property] !== undefined ? widget[property] : null;
}

// a button that marks itself, so that a test can tell whether the client still reacts
const markSelf = { id: 'go', type: 'button', text: 'go', x: 800, y: 50, clickRoutine: [
  { func: 'SELECT', property: 'id', value: 'go' },
  { func: 'SET', property: 'marked', value: true }
] };

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

// A widget that ends up as its own ancestor or that inherits in a circle used to take the whole
// client down (#1414, #684, #833), as did a routine calling itself (#1405, #1455) or building a
// value that contains itself (#1415). All of those have to end up as a reported problem instead.

test('SET parent refuses to put a widget inside itself', async t => {
  await setRoomState({
    outer: { id: 'outer', type: 'holder', x: 50, y: 50, width: 400, height: 400 },
    inner: { id: 'inner', type: 'holder', parent: 'outer', width: 200, height: 200 },
    swap: { id: 'swap', type: 'button', text: 'swap', x: 800, y: 400, clickRoutine: [
      { func: 'SELECT', property: 'id', value: 'outer' },
      { func: 'SET', property: 'parent', value: 'inner' }, // into its own child
      { func: 'SELECT', property: 'id', value: 'inner' },
      { func: 'SET', property: 'parent', value: 'inner' }, // into itself
      { func: 'SELECT', property: 'id', value: 'go' },
      { func: 'SET', property: 'marked', value: true }
    ] },
    go: markSelf
  });
  await ClientFunction(prepareClient)();
  await setName(t);
  await t.click('#w_swap');

  // the routine goes on after the refused write and the widget tree is unchanged
  await expectEventually(t, markedWidgets, [ 'go' ]);
  await expectEventually(t, ()=>widgetProperty('outer', 'parent'), null);
  await expectEventually(t, ()=>widgetProperty('inner', 'parent'), 'outer');
});

test('a routine calling itself is aborted instead of freezing the client', async t => {
  await setRoomState({
    loop: { id: 'loop', type: 'button', text: 'loop', x: 800, y: 400, clickRoutine: [ { func: 'CALL' } ] },
    go: markSelf
  });
  await ClientFunction(prepareClient)();
  await setName(t);
  await t.click('#w_loop');

  // the client is still there and reacts to the next click
  await t.click('#w_go');
  await expectEventually(t, markedWidgets, [ 'go' ]);
});

test('widgets inheriting from each other do not lock up the client', async t => {
  await setRoomState({
    left: { id: 'left', type: 'basic', x: 50, inheritFrom: { right: [ 'y' ] } },
    right: { id: 'right', type: 'basic', x: 300, inheritFrom: { left: [ 'y' ] } },
    go: markSelf
  });
  await ClientFunction(prepareClient)();
  await setName(t);
  await t.expect(Selector('#w_left').exists).ok();
  await t.expect(Selector('#w_right').exists).ok();

  await t.click('#w_go');
  await expectEventually(t, markedWidgets, [ 'go' ]);
});

test('a widget can still inherit the same widget through two different chains', async t => {
  await setRoomState({
    shared: { id: 'shared', type: 'basic', x: 600, y: 50, width: 111, height: 222 },
    viaWidth: { id: 'viaWidth', type: 'basic', inheritFrom: { shared: [ 'width' ] } },
    viaHeight: { id: 'viaHeight', type: 'basic', inheritFrom: { shared: [ 'height' ] } },
    both: { id: 'both', type: 'basic', x: 50, y: 50, inheritFrom: { viaWidth: [ 'width' ], viaHeight: [ 'height' ] } }
  });
  await ClientFunction(prepareClient)();
  await setName(t);

  // 'shared' is reached through two branches and has to be used by both of them
  await t.expect(Selector('#w_both').getStyleProperty('width')).eql('111px');
  await t.expect(Selector('#w_both').getStyleProperty('height')).eql('222px');
});

test('a value that contains itself is not written instead of crashing the client', async t => {
  await setRoomState({
    build: { id: 'build', type: 'button', text: 'build', x: 800, y: 400, clickRoutine: [
      'var list = []',
      'var list = ${list} push ${list}',
      { func: 'SELECT', property: 'id', value: 'build' },
      { func: 'SET', property: 'result', value: '${list}' },
      { func: 'CALL', widget: 'go', routine: 'clickRoutine' } // the value must not break passing variables on
    ] },
    go: markSelf
  });
  await ClientFunction(prepareClient)();
  await setName(t);
  await t.click('#w_build');

  await expectEventually(t, markedWidgets, [ 'go' ]);
  await expectEventually(t, ()=>widgetProperty('build', 'result'), null);
});
