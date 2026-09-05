import { ClientFunction, Selector } from 'testcafe';

import { expectEventually, getState, prepareClient, setName, setRoomState, setupTestEnvironment } from './test-util.js';

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

// the seats are created in an order that does not match their index property, so a
// SHIFT handing hand1 on to hand3 shows that the seats follow the seat index
function outOfOrderSeatsRoom(clickRoutine = [ { func: 'SHIFT' } ]) {
  const state = {
    deck: { id: 'deck', type: 'deck', cardTypes: { plain: {} }, x: 50, y: 400 },
    shift: { id: 'shift', type: 'button', text: 'shift', x: 800, y: 400, clickRoutine },
    card1: { id: 'card1', type: 'card', deck: 'deck', cardType: 'plain', parent: 'hand1' }
  };
  for(const [ position, index ] of [ [ 1, 1 ], [ 2, 3 ], [ 3, 2 ] ]) {
    state[`hand${position}`] = { id: `hand${position}`, type: 'holder', x: 50, y: 200*position, width: 700, height: 180 };
    state[`seat${position}`] = { id: `seat${position}`, type: 'seat', index, player: `Player ${position}`, hand: `hand${position}`, x: 800, y: 200*position };
  }
  return state;
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

async function widgetPosition(id) {
  const widget = JSON.parse(await getState())[id];
  return [ widget.x, widget.y ];
}

async function widgetDragState(id) {
  const widget = JSON.parse(await getState())[id];
  return [ widget.parent || null, widget.dragging || null ];
}

// the click routine keeps running after the mouse button was released, so mouse
// movements arriving while it waits must not be treated as a drag of the button.
// the delay has to outlast the hover that follows the click, even on slow CI
const delayDuration = 3000;

function delayRoom() {
  return {
    delay: { id: 'delay', type: 'button', text: 'delay', x: 100, y: 100, width: 200, height: 100, movable: true, clickRoutine: [
      { func: 'DELAY', milliseconds: delayDuration },
      { func: 'SET', collection: 'thisButton', property: 'marked', value: true }
    ] },
    far: { id: 'far', type: 'basic', x: 1200, y: 700, width: 200, height: 200 }
  };
}

// a routine can open an overlay while a widget is being dragged - the mouseup
// that follows never reaches the drag handling, so ending the drag has to happen
// before the checks that swallow it
function overlayRoom() {
  return {
    holder: { id: 'holder', type: 'holder', x: 600, y: 100, width: 300, height: 300, dropTarget: {} },
    card: { id: 'card', type: 'basic', x: 100, y: 100, width: 200, height: 200, movable: true },
    ask: { id: 'ask', type: 'button', text: 'ask', x: 100, y: 700, hotkey: 'o', clickRoutine: [
      { func: 'INPUT', header: 'ask', fields: [ { type: 'string', variable: 'answer' } ] }
    ] }
  };
}

// taking a widget out of a holder runs that holder's leaveRoutine, so the drag
// step that the first mouse movement starts can still be running when the button
// is released - the release has to wait for it instead of racing it. this is
// what a player does when they flick a card out of a holder into another one
const leaveDuration = 2000;

function leaveRoutineRoom() {
  return {
    source: { id: 'source', type: 'holder', x: 100, y: 100, width: 300, height: 300, leaveRoutine: [
      { func: 'DELAY', milliseconds: leaveDuration }
    ] },
    holder: { id: 'holder', type: 'holder', x: 600, y: 100, width: 300, height: 300, dropTarget: {} },
    card: { id: 'card', type: 'basic', width: 200, height: 200, movable: true, parent: 'source' }
  };
}

// drag the card onto the holder without releasing the mouse button - the second
// move is what a real drag delivers too, and only it sees the widget at its new
// position and picks up the holder below it. steps adds the positions in between
// that a real drag delivers as well - they are outdated as soon as the next one
// arrives, so the widget must not walk through them one by one
const startDrag = ClientFunction(steps => {
  const card = document.querySelector('#w_card').getBoundingClientRect();
  const holder = document.querySelector('#w_holder').getBoundingClientRect();
  const from = { x: card.x + card.width/2, y: card.y + card.height/2 };
  const to = { x: holder.x + holder.width/2, y: holder.y + holder.height/2 };
  const move = (x, y)=>document.body.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, buttons: 1, clientX: x, clientY: y }));
  document.querySelector('#w_card').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, buttons: 1, clientX: from.x, clientY: from.y }));
  move(to.x, to.y);
  return new Promise(resolve=>setTimeout(()=>{
    for(let step=1; step<=(steps||0); step++)
      move(from.x + (to.x - from.x)*step/(steps+1), from.y + (to.y - from.y)*step/(steps+1));
    move(to.x, to.y);
    resolve();
  }, 100));
});

const releaseDrag = ClientFunction(() => {
  const holder = document.querySelector('#w_holder').getBoundingClientRect();
  document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientX: holder.x + holder.width/2, clientY: holder.y + holder.height/2 }));
});

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

test('SHIFT passes the cards on in the order of the hand', async t => {
  await clickSwap(t, [ { func: 'SHIFT', holders: [ 'seat1', 'seat2' ] } ]);
  await expectEventually(t, ()=>cardsInHand('hand2'), handOrder);
});

test('SHIFT defaults to shifting the hands of the active seats', async t => {
  await clickSwap(t, [ { func: 'SHIFT' } ]);
  await expectEventually(t, ()=>cardsInHand('hand2'), handOrder);
});

test('SHIFT without keepOrder passes the cards on in widget creation order', async t => {
  await clickSwap(t, [ { func: 'SHIFT', keepOrder: false } ]);
  await expectEventually(t, ()=>cardsInHand('hand2'), creationOrder);
});

// a collection has the widgets in the order they were created, which is not the order
// the seats sit around the table - so its seats take part in seat index order
test('SHIFT takes the holders from a collection and orders its seats by index', async t => {
  await setRoomState(outOfOrderSeatsRoom([
    { func: 'SELECT', type: 'seat', collection: 'seats' },
    { func: 'SHIFT', holders: 'seats' }
  ]));
  await ClientFunction(prepareClient)();
  await setName(t);
  await expectEventually(t, ()=>cardsInHand('hand1'), [ 'card1' ]);
  await t.click('#w_shift');
  await expectEventually(t, ()=>cardsInHand('hand3'), [ 'card1' ]);
  await expectEventually(t, ()=>cardsInHand('hand1'), []);
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

test('SHIFT without holders follows the seat index rather than the widget order', async t => {
  await setRoomState(outOfOrderSeatsRoom());
  await ClientFunction(prepareClient)();
  await setName(t);
  await expectEventually(t, ()=>cardsInHand('hand1'), [ 'card1' ]);
  await t.click('#w_shift');
  await expectEventually(t, ()=>cardsInHand('hand3'), [ 'card1' ]);
  await expectEventually(t, ()=>cardsInHand('hand1'), []);
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

test('moving the mouse while a DELAY is running does not drag the clicked widget', async t => {
  await setRoomState(delayRoom());
  await ClientFunction(prepareClient)();
  await setName(t);
  await t.click('#w_delay');
  await t.hover('#w_far');
  // without this the test would pass without ever testing anything if the hover
  // took longer than the DELAY, because the routine would already be over
  await t.expect(await markedWidgets()).eql([]);
  await expectEventually(t, markedWidgets, [ 'delay' ], 'the click routine never finished', 4*delayDuration);
  await expectEventually(t, ()=>widgetPosition('delay'), [ 100, 100 ]);
});

test('releasing the button while a leaveRoutine is running still drops the widget', async t => {
  await setRoomState(leaveRoutineRoom());
  await ClientFunction(prepareClient)();
  await setName(t);
  await expectEventually(t, ()=>widgetDragState('card'), [ 'source', null ]);
  // the burst is what a real drag delivers while the routine is running: those
  // positions are all outdated once it returns, and the widget has to end up
  // where the button came up instead of walking through them
  await startDrag(200);
  await releaseDrag();
  await expectEventually(t, ()=>widgetDragState('card'), [ 'holder', null ], 'the card was not dropped into the holder', 4*leaveDuration);
});

test('releasing a dragged widget while an overlay is open still ends the drag', async t => {
  await setRoomState(overlayRoom());
  await ClientFunction(prepareClient)();
  await setName(t);
  await startDrag();
  await expectEventually(t, ()=>widgetDragState('card'), [ null, 'TestCafe' ]);
  await t.pressKey('o');
  await t.expect(Selector('#buttonInputOverlay').visible).ok();
  await releaseDrag();
  await t.click('#buttonInputGo');
  await expectEventually(t, ()=>widgetDragState('card'), [ 'holder', null ]);
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

// returning pieces to their starting holder is what resetProperties is for, so a parent in there
// pointing at a descendant is not exotic - it used to overflow the stack the same way SET did
test('RESET refuses to put a widget inside itself', async t => {
  await setRoomState({
    outer: { id: 'outer', type: 'holder', x: 50, y: 50, width: 400, height: 400, resetProperties: { parent: 'inner' } },
    inner: { id: 'inner', type: 'holder', parent: 'outer', width: 200, height: 200, resetProperties: { parent: 'inner' } },
    reset: { id: 'reset', type: 'button', text: 'reset', x: 800, y: 400, clickRoutine: [
      { func: 'RESET' },
      { func: 'SELECT', property: 'id', value: 'go' },
      { func: 'SET', property: 'marked', value: true }
    ] },
    go: markSelf
  });
  await ClientFunction(prepareClient)();
  await setName(t);
  await t.click('#w_reset');

  // the routine goes on after the refused writes and the widget tree is unchanged
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

// The routine log formats every value it shows, so the Debug module used to be the one place where
// a value that contains itself still took the client down. (#1415)
test('the routine log shows a value that contains itself instead of crashing', async t => {
  await setRoomState({
    build: { id: 'build', type: 'button', text: 'build', x: 800, y: 400, clickRoutine: [
      'var list = []',
      'var list = ${list} push ${list}',
      { func: 'SELECT', property: 'id', value: 'build' },
      { func: 'SET', property: 'result', value: '${list}' }
    ] }
  });
  await ClientFunction(prepareClient)();
  await setName(t);
  await t
    .click('#editButton')
    .click('#editorSidebar [icon=pest_control]')
    .expect(Selector('#jeLog').exists).ok();

  await ClientFunction(() => widgets.get('build').evaluateRoutine('clickRoutine', {}, {}).then(_=>true))();

  await t.expect(Selector('#clientErrorOverlay').visible).notOk();
  await t.expect(Selector('#jeLog').innerText).contains('<contains itself>');
  await t.expect(Selector('#jeLog .jeLogProblems').innerText).contains('the value contains itself and can not be stored');
});

// how many routines may be running inside each other before the client refuses the next one
const maxNesting = 250;

// A button that counts one up in its own 'n' and then calls itself again until it has run `limit`
// times, at which point it writes how far it got into its text. The CALL sits inside two IF
// branches, which is what recursion as a loop looks like: one IF for the base case, and whatever
// else the author wrapped around it.
function recursiveCounterRoom(limit) {
  return {
    counter: { id: 'counter', type: 'button', text: 'counter', x: 800, y: 400, n: 0, clickRoutine: [
      { func: 'SELECT', property: 'id', value: 'counter' },
      { func: 'GET', variable: 'n', property: 'n' },
      'var n = ${n} + 1',
      { func: 'SET', property: 'n', value: '${n}' },
      { func: 'IF', operand1: '${n}', relation: '<', operand2: limit, thenRoutine: [
        { func: 'IF', operand1: 1, relation: '==', operand2: 1, thenRoutine: [ { func: 'CALL' } ] }
      ], elseRoutine: [
        { func: 'SET', property: 'text', value: '${n}' }
      ] }
    ] },
    reset: { id: 'reset', type: 'button', text: 'reset', x: 800, y: 600, clickRoutine: [
      { func: 'SELECT', property: 'id', value: 'counter' },
      { func: 'SET', property: 'n', value: 0 },
      { func: 'SET', property: 'text', value: 'counter' }
    ] }
  };
}

const runCounter = ClientFunction(() => widgets.get('counter').evaluateRoutine('clickRoutine', {}, {}).then(_=>true));

// The limit is there to catch a routine that triggers itself, so it counts the routines that were
// entered by name. Recursion is how the routine language writes a while loop - the public library
// uses it in dozens of games - and its CALL almost always sits inside the IF that checks the base
// case, so counting inline branches as well would cut such a loop off at half the number the
// message names. (#1405)
test('a routine calling itself from inside IF branches gets the whole nesting limit', async t => {
  await setRoomState(recursiveCounterRoom(maxNesting));
  await ClientFunction(prepareClient)();
  await setName(t);
  await t.click('#editButton');

  await runCounter();
  await expectEventually(t, ()=>widgetProperty('counter', 'text'), maxNesting);
});

// Whatever the CALL is nested in, it is the CALL that re-entered the routine - so that is what the
// message has to name, together with the routine it belongs to. (#1405)
test('a routine calling itself once too often is refused and named', async t => {
  await setRoomState(recursiveCounterRoom(maxNesting + 1));
  await ClientFunction(prepareClient)();
  await setName(t);
  await t
    .click('#editButton')
    .click('#editorSidebar [icon=pest_control]')
    .expect(Selector('#jeLog').exists).ok();

  await runCounter();

  const outermostProblem = Selector('#jeLog > .jeLog > .jeLogNested > .jeLogOperation > .jeLogNested > .jeLogDetails > .jeLogNested > .jeLogProblems');
  await t.expect(outermostProblem.innerText).contains(`Not running clickRoutine of counter more than ${maxNesting} times.`);
  await t.expect(outermostProblem.innerText).contains('recursive routine calling itself');
  // the routine never got to its last step
  await t.expect(await widgetProperty('counter', 'text')).eql('counter');
});

// The routine that hits the limit is hundreds of collapsed levels deep in the log, so the problem
// is reported in the outermost routine as well. (#1405, #1455)
test('the recursion limit is reported in the routine that was clicked', async t => {
  await setRoomState({
    loop: { id: 'loop', type: 'button', text: 'loop', x: 800, y: 400, clickRoutine: [ { func: 'CALL' } ] }
  });
  await ClientFunction(prepareClient)();
  await setName(t);
  await t
    .click('#editButton')
    .click('#editorSidebar [icon=pest_control]')
    .expect(Selector('#jeLog').exists).ok();

  await ClientFunction(() => widgets.get('loop').evaluateRoutine('clickRoutine', {}, {}).then(_=>true))();

  // the problem has to be on the operation of the outermost routine, not only hundreds of levels
  // down in the one that hit the limit
  const outermostProblem = Selector('#jeLog > .jeLog > .jeLogNested > .jeLogOperation > .jeLogNested > .jeLogDetails > .jeLogNested > .jeLogProblems');
  await t.expect(outermostProblem.innerText).contains('Not running clickRoutine of loop more than 250 times.');
  // the message names what re-entered the routine, so the operation to go and look at is in it
  await t.expect(outermostProblem.innerText).contains('recursive routine calling itself');
});

// A clickRoutine that CLICKs its own widget nests the same way a routine calling itself does, and
// the message says so rather than pointing at CALL. (#1405)
test('a routine clicking its own widget is reported as a recursive click', async t => {
  await setRoomState({
    loop: { id: 'loop', type: 'button', text: 'loop', x: 800, y: 400, clickRoutine: [ { func: 'CLICK', collection: 'thisButton' } ] }
  });
  await ClientFunction(prepareClient)();
  await setName(t);
  await t
    .click('#editButton')
    .click('#editorSidebar [icon=pest_control]')
    .expect(Selector('#jeLog').exists).ok();

  await ClientFunction(() => widgets.get('loop').evaluateRoutine('clickRoutine', {}, {}).then(_=>true))();

  const outermostProblem = Selector('#jeLog > .jeLog > .jeLogNested > .jeLogOperation > .jeLogNested > .jeLogDetails > .jeLogNested > .jeLogProblems');
  await t.expect(outermostProblem.innerText).contains('Not running clickRoutine of loop more than 250 times.');
  await t.expect(outermostProblem.innerText).contains('recursive click on itself');
});

// A routine waiting in DELAY has nothing running inside it, so it must not use up the nesting
// budget - a game that keeps a few timer driven routines in flight would otherwise be refused an
// ordinary click. (#1405)
test('routines that are waiting do not use up the nesting limit', async t => {
  await setRoomState({
    park: { id: 'park', type: 'button', text: 'park', x: 800, y: 200, clickRoutine: [ { func: 'DELAY', milliseconds: 3000 } ] },
    go: markSelf
  });
  await ClientFunction(prepareClient)();
  await setName(t);
  await t.click('#editButton');

  // more waiting routines than the nesting limit allows, none of them nested inside another
  await ClientFunction(() => {
    for(let i=0; i<300; i++)
      widgets.get('park').evaluateRoutine('clickRoutine', {}, {});
    return true;
  })();
  await t.wait(300); // long enough for all of them to have reached their DELAY

  // the routines that are waiting hold the client's batch open, so the write stays local for now
  await ClientFunction(() => widgets.get('go').evaluateRoutine('clickRoutine', {}, {}).then(_=>true))();
  await t.expect(await ClientFunction(() => widgets.get('go').get('marked'))()).eql(true);
});

// A routine waiting for INPUT is suspended just like one waiting in DELAY, and the player it is
// waiting for can take minutes. Cancelling the overlay unwinds it through a rejected promise, which
// has to give the level back exactly once - a leak there would shrink the budget with every
// cancelled input. (#1405)
test('routines that are waiting for input do not use up the nesting limit', async t => {
  await setRoomState({
    ask: { id: 'ask', type: 'button', text: 'ask', x: 800, y: 200, clickRoutine: [
      { func: 'INPUT', header: 'ask', fields: [ { type: 'string', variable: 'answer' } ] }
    ] },
    ...recursiveCounterRoom(maxNesting)
  });
  await ClientFunction(prepareClient)();
  await setName(t);
  await t.click('#editButton');

  await ClientFunction(() => {
    widgets.get('ask').evaluateRoutine('clickRoutine', {}, {}); // waits in its INPUT until cancelled
    return true;
  })();
  await t.wait(300); // long enough for it to have reached its INPUT

  // the counter needs every level of the limit, so it only gets all the way through while the
  // routine waiting for the input is not holding on to its own. that routine holds the client's
  // batch open as well, so the count stays local for now
  await runCounter();
  await t.expect(await ClientFunction(() => widgets.get('counter').get('text'))()).eql(maxNesting);

  // cancelling the input unwinds the waiting routine, which has to give its level back once - the
  // editor keeps the overlay itself hidden, so its button is pressed rather than clicked
  await ClientFunction(() => {
    $('#buttonInputCancel').click();
    return true;
  })();
  await ClientFunction(() => widgets.get('reset').evaluateRoutine('clickRoutine', {}, {}).then(_=>true))();
  await runCounter();
  await expectEventually(t, ()=>widgetProperty('counter', 'text'), maxNesting);
});

// Routines that overlap - one starts while another one is waiting in DELAY or INPUT - share the
// client's batch counter, so every routine has to close exactly the batch it opened. Closing
// everything down to the depth it saw when it started would close the batch of the routine that
// began in between, leaving the counter negative and the client unable to send anything at all.
test('a routine finishing while another one is waiting keeps the client sending', async t => {
  function delayThenMark(id, milliseconds) {
    return { id, type: 'button', text: id, x: 800, y: 200, clickRoutine: [
      { func: 'DELAY', milliseconds },
      { func: 'SELECT', property: 'id', value: id },
      { func: 'SET', property: 'marked', value: true }
    ] };
  }
  await setRoomState({
    first: delayThenMark('first', 200),
    second: delayThenMark('second', 600),
    go: { id: 'go', type: 'basic', x: 800, y: 50 }
  });
  await ClientFunction(prepareClient)();
  await setName(t);
  await t.click('#editButton');

  // 'second' starts while 'first' is waiting and is still waiting when 'first' is done
  await ClientFunction(() => {
    widgets.get('first').evaluateRoutine('clickRoutine', {}, {});
    setTimeout(_=>widgets.get('second').evaluateRoutine('clickRoutine', {}, {}), 100);
    return true;
  })();
  await t.wait(1000);

  // a write outside of any routine still has to reach the server
  await ClientFunction(() => widgets.get('go').set('marked', true).then(_=>true))();
  await expectEventually(t, markedWidgets, [ 'first', 'go', 'second' ]);
});
