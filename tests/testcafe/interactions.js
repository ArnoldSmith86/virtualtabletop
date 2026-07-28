import { ClientFunction, Selector } from 'testcafe';

import { applyLegacy, getStateObject, prepareClient, setRoomState, setupTestEnvironment } from './test-util.js';

setupTestEnvironment();

// Layer E: the player interactions that are not a click routine.
//
// Every other test in this repository reaches the engine through one door - a button with a
// clickRoutine - because a click routine is a declarative object a test can invoke. Dragging,
// dropping into and out of a holder and typing into a label go through pointer geometry, DOM
// events and timing instead, and that is where a legacy mode could change an answer without
// anything noticing. It is also the only route to the entire risk surface of
// disableHolderImageWidget: a holder's prototype swap is invisible to a routine.
//
// Assertions are per property, and the whole file runs at both ends of the flag matrix, so a
// difference between the two is a finding rather than a hash mismatch.
const TIERS = [ 'modern', 'legacy-all' ];

// The board is a fixed 1600x1000 space that the client scales to the window, so a drag in board
// units has to be converted to the screen pixels TestCafe moves the pointer by.
const boardScale = ClientFunction(_=>+getComputedStyle(document.documentElement).getPropertyValue('--scale'));

async function openRoom(t, combo, state) {
  await ClientFunction(prepareClient)();
  // closing the states overlay is what makes the surface accept pointer events at all
  await t.click('#activeGameButton');
  // before setRoomState: a widget reads its legacy modes in the constructor
  await applyLegacy(combo);
  await setRoomState(state);
  // a cold room takes a while to render on a loaded machine, and every assertion below is
  // about what a pointer does to a widget that is already on screen
  await t.expect(Selector(`#w_${Object.keys(state)[0]}`).exists).ok('the room renders its widgets', { timeout: 30000 });
}

// A drag has to move more than 10 board units and take longer than 250ms, or mousehandling.js
// counts it as a click as well - which would flip the card the test just dragged.
async function dragBy(t, id, dx, dy) {
  const scale = await boardScale();
  await t.drag(`#w_${id}`, Math.round(dx*scale), Math.round(dy*scale), { speed: 0.4 });
}

async function dragOnto(t, id, targetID) {
  await t.dragToElement(`#w_${id}`, `#w_${targetID}`, { speed: 0.4 });
}

// Poll the room state until it looks like the drag arrived, then hand it to the assertions.
// Returning the last state seen (rather than asserting inside the loop) keeps the failure
// message about the property the test cares about.
async function stateWhen(predicate) {
  let state = null;
  for(let wait=50; wait<4000; wait*=2) {
    state = await getStateObject();
    if(predicate(state))
      break;
    await new Promise(resolve=>setTimeout(resolve, wait));
  }
  return state;
}

const select = id => ({ func: 'SELECT', property: 'id', value: id });

function tableState(probe = {}) {
  return {
    probe:  Object.assign({ id: 'probe',  type: 'basic', x: 200,  y: 200, width: 100, height: 100 }, probe),
    anchor: {              id: 'anchor', type: 'basic', x: 1200, y: 700, width: 100, height: 100 }
  };
}

// A holder that records every arrival and departure on a witness widget, so the test can tell a
// property that the drop wrote from a routine that the drop triggered.
function holderState(holderProperties = {}) {
  return {
    deck:    { id: 'deck', type: 'deck', cardTypes: { plain: {} }, x: 1400, y: 50 },
    card1:   { id: 'card1', type: 'card', deck: 'deck', cardType: 'plain', x: 200, y: 100 },
    witness: { id: 'witness', type: 'basic', x: 1200, y: 100, width: 100, height: 100 },
    hand: Object.assign({
      id: 'hand', type: 'holder', x: 100, y: 600, width: 700, height: 180,
      dropOffsetX: 4, dropOffsetY: 4,
      onEnter: { entered: true },
      onLeave: { left: true },
      enterRoutine: [ select('witness'), { func: 'SET', property: 'arrived', value: true } ],
      leaveRoutine: [ select('witness'), { func: 'SET', property: 'departed', value: true } ]
    }, holderProperties)
  };
}

for(const combo of TIERS) {
  test(`Drag on the table moves the widget and brings it to the front (${combo})`, async t => {
    await openRoom(t, combo, tableState());
    await dragBy(t, 'probe', 300, 150);

    const state = await stateWhen(s=>s.probe && s.probe.x != 200);
    // the pointer moves a whole number of screen pixels, so the board coordinate it lands on
    // can be half a unit off in either direction - the assertion is "it followed the pointer",
    // not "it landed on a specific pixel"
    await t.expect(state.probe.x).within(498, 502, `x in combination ${combo}`);
    await t.expect(state.probe.y).within(348, 352, `y in combination ${combo}`);
    await t.expect(state.probe.z).eql(1, `z in combination ${combo}`);
    await t.expect(state.probe.dragging).eql(undefined, `dragging is cleared in combination ${combo}`);
    await t.expect(state.probe.parent).eql(undefined, `parent stays empty in combination ${combo}`);
  });

  test(`A widget with movable false does not move (${combo})`, async t => {
    await openRoom(t, combo, tableState({ movable: false }));
    await dragBy(t, 'probe', 300, 150);

    const state = await stateWhen(_=>false);
    await t.expect(state.probe.x).eql(200, `x in combination ${combo}`);
    await t.expect(state.probe.y).eql(200, `y in combination ${combo}`);
  });

  test(`dragLimit clamps the drag (${combo})`, async t => {
    await openRoom(t, combo, tableState({ dragLimit: { maxX: 400, maxY: 300 } }));
    await dragBy(t, 'probe', 600, 400);

    const state = await stateWhen(s=>s.probe && s.probe.x != 200);
    await t.expect(state.probe.x).eql(400, `x in combination ${combo}`);
    await t.expect(state.probe.y).eql(300, `y in combination ${combo}`);
  });

  test(`Dragging into a holder aligns the card and runs enterRoutine (${combo})`, async t => {
    await openRoom(t, combo, holderState());
    await dragOnto(t, 'card1', 'hand');

    const state = await stateWhen(s=>s.card1 && s.card1.parent == 'hand');
    await t.expect(state.card1.parent).eql('hand', `parent in combination ${combo}`);
    await t.expect(state.card1.x).eql(4, `dropOffsetX applied in combination ${combo}`);
    await t.expect(state.card1.y).eql(4, `dropOffsetY applied in combination ${combo}`);
    await t.expect(state.card1.entered).eql(true, `onEnter applied in combination ${combo}`);
    await t.expect((state.witness || {}).arrived).eql(true, `enterRoutine ran in combination ${combo}`);
    await t.expect((state.witness || {}).departed).eql(undefined, `leaveRoutine did not run in combination ${combo}`);
  });

  test(`Dragging out of a holder runs leaveRoutine and detaches (${combo})`, async t => {
    const state = holderState();
    state.card1.parent = 'hand';
    await openRoom(t, combo, state);
    await t.expect(Selector('#w_card1').exists).ok();
    await dragBy(t, 'card1', 500, -400);

    const after = await stateWhen(s=>s.card1 && s.card1.parent === undefined);
    await t.expect(after.card1.parent).eql(undefined, `parent in combination ${combo}`);
    await t.expect(after.card1.left).eql(true, `onLeave applied in combination ${combo}`);
    await t.expect((after.witness || {}).departed).eql(true, `leaveRoutine ran in combination ${combo}`);
  });

  test(`Dropping into a stacked holder appends to the stack (${combo})`, async t => {
    const state = holderState({ stackOffsetX: 40 });
    for(const id of [ 'stacked1', 'stacked2' ])
      state[id] = { id, type: 'card', deck: 'deck', cardType: 'plain', parent: 'hand' };
    await openRoom(t, combo, state);
    await dragOnto(t, 'card1', 'hand');

    const after = await stateWhen(s=>s.card1 && s.card1.parent == 'hand');
    const inHand = Object.values(after).filter(w=>w.parent == 'hand').sort((a, b)=>a.z-b.z);
    await t.expect(inHand.map(w=>w.z)).eql([ 1, 2, 3 ], `stack z in combination ${combo}`);
    await t.expect(inHand.map(w=>w.x)).eql([ 4, 44, 84 ], `stackOffsetX in combination ${combo}`);
    await t.expect(inHand.map(w=>w.y === undefined ? 4 : w.y)).eql([ 4, 4, 4 ], `stack y in combination ${combo}`);
  });

  test(`Dropping a card onto a card forms a pile (${combo})`, async t => {
    const state = holderState();
    state.card2 = { id: 'card2', type: 'card', deck: 'deck', cardType: 'plain', x: 900, y: 300 };
    await openRoom(t, combo, state);
    await dragOnto(t, 'card1', 'card2');

    const after = await stateWhen(s=>Object.values(s).some(w=>w.type == 'pile'));
    const piles = Object.values(after).filter(w=>w.type == 'pile');
    await t.expect(piles.length).eql(1, `one pile in combination ${combo}`);
    await t.expect(after.card1.parent).eql(piles[0].id, `dropped card joined the pile in combination ${combo}`);
    await t.expect(after.card2.parent).eql(piles[0].id, `target card joined the pile in combination ${combo}`);
    // the pile takes the position of the card that was standing still
    await t.expect(piles[0].x).eql(900, `pile x in combination ${combo}`);
    await t.expect(piles[0].y).eql(300, `pile y in combination ${combo}`);
  });
}

// Typing is the third P0 interaction and the one the falsy-vs-empty bugs live in: a label
// stores what was typed through setText(), which converts a string of digits to a number. The
// stored type is what a later SELECT compares against, so it is asserted here as well as the
// value - and the changeRoutine has to see the same thing the property ends up holding.
const typedValues = [
  { typed: '7',     stored: 7,       type: 'number' },
  { typed: '007',   stored: 7,       type: 'number' },
  { typed: '0',     stored: 0,       type: 'number' },
  { typed: '-3.5',  stored: -3.5,    type: 'number' },
  { typed: '1e3',   stored: '1e3',   type: 'string' },
  { typed: 'a007',  stored: 'a007',  type: 'string' },
  { typed: 'héllo', stored: 'héllo', type: 'string' }
];

function labelState() {
  return {
    input: { id: 'input', type: 'label', x: 100, y: 100, width: 400, height: 40, editable: true, text: '', changeRoutine: [
      select('witness'),
      { func: 'SET', property: 'changed', value: '${property}' },
      { func: 'SET', property: 'seen', value: '${value}' }
    ] },
    // starts out set, so that the changeRoutine writing null over it is observable - writing
    // null over a property that does not exist yet is a no-op
    witness: { id: 'witness', type: 'basic', x: 1200, y: 100, width: 100, height: 100, seen: 'unset' }
  };
}

for(const combo of TIERS) {
  for(const { typed, stored, type } of typedValues) {
    test(`Typing "${typed}" into a label stores a ${type} (${combo})`, async t => {
      await openRoom(t, combo, labelState());
      await t.typeText('#w_input textarea', typed, { replace: true });

      const state = await stateWhen(s=>s.input && s.input.text === stored);
      await t.expect(state.input.text).eql(stored, `stored value in combination ${combo}`);
      await t.expect(typeof state.input.text).eql(type, `stored type in combination ${combo}`);
      // the changeRoutine has to be handed the value the property ends up holding, type included
      const seen = await stateWhen(s=>s.witness && s.witness.seen === stored);
      await t.expect(seen.witness.seen).eql(stored, `changeRoutine value in combination ${combo}`);
    });
  }

  // Emptying the field sets text to '', which is the default for a label - and a property that
  // equals its default is deleted from the state rather than stored (statemanaged.js:112). So a
  // routine reading the property afterwards gets undefined, not '', and the changeRoutine is
  // handed null rather than the value that was typed. Pinned because the falsy-vs-omitted
  // family of bugs is exactly about telling those apart.
  test(`Emptying a label removes the text property (${combo})`, async t => {
    const state = labelState();
    state.input.text = 'something';
    await openRoom(t, combo, state);
    await t.selectText('#w_input textarea').pressKey('delete');

    const after = await stateWhen(s=>s.input && s.input.text !== 'something');
    await t.expect(after.input.text).eql(undefined, `stored value in combination ${combo}`);
    await t.expect((after.witness || {}).changed).eql('text', `the changeRoutine ran in combination ${combo}`);
    // ... and was handed null, which SET turns into a removal of the target property
    await t.expect((after.witness || {}).seen).eql(undefined, `the changeRoutine value in combination ${combo}`);
  });

  // setText() converts a string of digits to a number, and the label writes the property back
  // into the textarea, so typing 007 leaves "7" in the field - the next keystroke continues
  // from there rather than from what the player typed.
  test(`A numeric entry is rewritten in the field while typing (${combo})`, async t => {
    await openRoom(t, combo, labelState());
    await t.typeText('#w_input textarea', '007a', { replace: true });

    const after = await stateWhen(s=>s.input && s.input.text === '7a');
    await t.expect(after.input.text).eql('7a', `stored value in combination ${combo}`);
  });
}
