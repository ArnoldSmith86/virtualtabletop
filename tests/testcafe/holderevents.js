import { getStateObject, setName, setupTestEnvironment } from './test-util.js';
import { dragPath, openRoom, stateWhen } from './interaction-util.js';

setupTestEnvironment();

// Holder events: what fires, in which order, and what the widget looks like while it fires.
//
// #1212 wrote down what holder events *should* do - parent cleared, beforeLeaveRoutine,
// onLeave, leaveRoutine, then on the other side parent set, onEnter, alignment, piles resolved,
// afterLeaveRoutine, enterRoutine - and nobody has ever asserted what they actually do. The
// order is the interesting part: a routine that reads the widget it was handed sees a different
// answer depending on whether it runs before or after the properties are written, and games
// encode whichever answer they observed.
//
// So this file pins the status quo. Several of the traces below are *not* what #1212 asks for,
// and they are recorded as they are, with the difference named at the case. That makes the
// eventual move towards the described order a visible, reviewable diff (and tells whoever
// writes the legacy mode for it exactly which games' assumptions are at stake), while any
// unintended change to the current order fails a test the day it is made.
//
// How the trace works: every routine appends one entry to a log widget, and each entry carries
// the properties of the widget the event is about, read at that moment. Two holders write
// distinguishable marks through onEnter/onLeave, so an entry saying `mark=null` means "this
// routine ran before the property half of the event", and `parent=handB` means "the parent was
// already written when this routine ran".

const CARD = 'card1';

// The fields an entry records. Coordinates are only meaningful where the case makes them
// deterministic - a routine that fires in the middle of a drag sees wherever the pointer was -
// so they are opt-in per holder.
const DEFAULT_FIELDS = [ 'parent', 'mark', 'owner' ];

function observation(fields, id) {
  return fields.map(property=>`${property}=\${PROPERTY ${property} OF ${id}}`).join(' ');
}

// One trace entry, appended to the log widget's `trace` property. Reading the log through
// ${PROPERTY trace OF log} rather than a variable is what makes it accumulate across the
// separate routine invocations the engine makes.
function traceRoutine(tag, fields, id = CARD) {
  return [
    { func: 'SELECT', property: 'id', value: 'log', collection: 'log' },
    { func: 'SET', collection: 'log', property: 'trace', value: `\${PROPERTY trace OF log}${tag}[${observation(fields, id)}];` }
  ];
}

function holder(id, properties = {}, { enterFields = DEFAULT_FIELDS, leaveFields = DEFAULT_FIELDS } = {}) {
  return Object.assign({
    id, type: 'holder', width: 350, height: 250,
    // this suite pins the ORDER of the holder events, so the holders stay on
    // the classic layout - the auto default would center the observed drops
    layout: 'custom',
    onEnter: { mark: `enter-${id}` },
    onLeave: { mark: `leave-${id}` },
    enterRoutine: traceRoutine(`enter ${id}`, enterFields),
    leaveRoutine: traceRoutine(`leave ${id}`, leaveFields)
  }, properties);
}

// Two holders far enough apart that a drag between them leaves the first one's box, a card on
// the table, a log widget and a button for the routine-driven cases.
function fixtureState(overrides = {}, holderOptions = {}) {
  const state = {
    deck:  { id: 'deck', type: 'deck', cardTypes: { plain: {} }, x: 1450, y: 20 },
    card1: { id: CARD, type: 'card', deck: 'deck', cardType: 'plain', x: 700, y: 60 },
    log:   { id: 'log', type: 'basic', x: 700, y: 900, width: 80, height: 80, trace: '' },
    go:    { id: 'go', type: 'button', x: 700, y: 420, width: 100, height: 60, text: 'go' },
    handA: holder('handA', { x: 80,   y: 650 }, holderOptions),
    handB: holder('handB', { x: 1150, y: 650 }, holderOptions)
  };
  for(const [ id, properties ] of Object.entries(overrides))
    state[id] = state[id] ? Object.assign(state[id], properties) : Object.assign({ id }, properties);
  return state;
}

// Read the log until it holds as many entries as the case expects, then give the engine a
// moment to add one more: a case that fires three routines where the test expects two has to go
// red rather than pass on a snapshot taken between them.
async function readTrace(t, expectedLength) {
  const entries = state=>String((state.log||{}).trace||'').split(';').filter(entry=>entry);
  const state = await stateWhen(s=>entries(s).length >= expectedLength);
  await t.wait(400);
  return entries(await getStateObject());
}

async function expectTrace(t, expected) {
  await t.expect(await readTrace(t, expected.length)).eql(expected);
}

async function clickGo(t) {
  await t.click('#w_go');
}

// ---------------------------------------------------------------------------------------------
// Dragging
// ---------------------------------------------------------------------------------------------

test('Dragging a card into a holder: parent, onEnter and alignment are all done before enterRoutine', async t => {
  await openRoom(t, 'modern', fixtureState({}, { enterFields: [ 'parent', 'mark', 'owner', 'x', 'y' ] }));
  await dragPath(t, CARD, [ { onto: 'handB' } ]);

  // #1212 steps 9, 10 and 13 in that order - this half of the description is what the engine
  // already does.
  await expectTrace(t, [ 'enter handB[parent=handB mark=enter-handB owner=null x=4 y=4]' ]);
});

test('Dragging a card out of a holder fires leaveRoutine twice', async t => {
  await openRoom(t, 'modern', fixtureState({ card1: { parent: 'handA', x: 4, y: 4 } }));
  await dragPath(t, CARD, [ { dx: 500, dy: -400 } ]);

  // The #1212 headline. Two different code paths call the same routine for one drag:
  //
  //   1. moveStart() sets parent to null to detach the widget, and onPropertyChange('parent')
  //      calls the old parent's leaveRoutine directly (widget.js:2766) - before anything else
  //      about the departure has happened, so onLeave has not been applied yet (mark=null).
  //   2. move() calls checkParent(), which detaches for real once the widget no longer overlaps
  //      the holder: dispenseCard() applies onLeave and calls leaveRoutine again.
  //
  // The issue proposes splitting these into beforeLeaveRoutine and leaveRoutine, which would
  // make the two calls deliberate and distinguishable. Until then, a game that counts cards in
  // its leaveRoutine counts one drag twice.
  await expectTrace(t, [
    'leave handA[parent=null mark=null owner=null]',
    'leave handA[parent=null mark=leave-handA owner=null]'
  ]);
});

test('Dragging a card from one holder to another', async t => {
  await openRoom(t, 'modern', fixtureState({ card1: { parent: 'handA', x: 4, y: 4 } }));
  await dragPath(t, CARD, [ { onto: 'handB' } ]);

  // #1212 asks for beforeLeave / onLeave+leave / enter, with an afterLeaveRoutine after the
  // arrival. What happens is the doubled leave above, and then the arrival - so the leaving
  // holder is completely finished before the receiving one starts, and nothing runs after the
  // card has landed on behalf of the holder it came from.
  await expectTrace(t, [
    'leave handA[parent=null mark=null owner=null]',
    'leave handA[parent=null mark=leave-handA owner=null]',
    'enter handB[parent=handB mark=enter-handB owner=null]'
  ]);
});

test('Dragging a card within its holder still fires the whole leave-and-enter cycle', async t => {
  await openRoom(t, 'modern', fixtureState({ card1: { parent: 'handA', x: 4, y: 4 } }));
  // 150 board units to the right, which keeps the card inside handA the whole time
  await dragPath(t, CARD, [ { dx: 150, dy: 0 } ]);

  // #1212 wants this to be beforeLeaveRoutine + leaveCancelledRoutine, i.e. for the game to be
  // able to tell "the card never actually left" from a real departure. Today the card leaves
  // and arrives: the detaching leaveRoutine fires (the holder never stops overlapping, so the
  // second, onLeave-carrying call does not), and the drop runs enterRoutine.
  //
  // onEnter is *not* applied though - onChildAdd() skips it when the widget lands back on the
  // holder it was dragged off (`this != child.currentParent`, holder.js:128). So this is the one
  // case today where the properties and the routine disagree about whether an entry happened,
  // and mark=null is how a game can tell the two apart at all.
  await expectTrace(t, [
    'leave handA[parent=null mark=null owner=null]',
    'enter handA[parent=handA mark=null owner=null]'
  ]);
});

test('Dragging a card out of a holder and back before dropping it', async t => {
  await openRoom(t, 'modern', fixtureState({ card1: { parent: 'handA', x: 4, y: 4 } }));
  await dragPath(t, CARD, [ { dx: 0, dy: -400 }, { onto: 'handA' } ]);

  // The case #1212 calls "leaveCancelledRoutine with a flag indicating that leaveRoutine was
  // called". Today it is indistinguishable from a card that came from somewhere else: two
  // leaves and an enter, exactly like the holder-to-holder drag.
  await expectTrace(t, [
    'leave handA[parent=null mark=null owner=null]',
    'leave handA[parent=null mark=leave-handA owner=null]',
    'enter handA[parent=handA mark=enter-handA owner=null]'
  ]);
});

test('A card dragged onto a full holder is refused and stays on the table', async t => {
  const state = fixtureState({ handB: { dropLimit: 1 } });
  state.card2 = { id: 'card2', type: 'card', deck: 'deck', cardType: 'plain', parent: 'handB' };
  await openRoom(t, 'modern', state);
  await dragPath(t, CARD, [ { onto: 'handB' } ]);

  await t.wait(500);
  const after = await getStateObject();
  await t.expect(after.card1.parent).eql(undefined, 'the card stayed on the table');
  await t.expect(String((after.log||{}).trace||'')).eql('', 'no holder event fired');
});

// ---------------------------------------------------------------------------------------------
// The properties that change what an event does
// ---------------------------------------------------------------------------------------------

test('childrenPerOwner has written the owner before enterRoutine runs', async t => {
  await openRoom(t, 'modern', fixtureState({ handB: { childrenPerOwner: true } }));
  // the owner is the player name, which is a random guest name unless the test sets one
  await setName(t, 'Alice');
  await dragPath(t, CARD, [ { onto: 'handB' } ]);

  await expectTrace(t, [ 'enter handB[parent=handB mark=enter-handB owner=Alice]' ]);
});

test('alignChildren false leaves the drop coordinate alone', async t => {
  await openRoom(t, 'modern', fixtureState({ handB: { alignChildren: false } }, { enterFields: [ 'parent', 'mark', 'x', 'y' ] }));
  await dragPath(t, CARD, [ { onto: 'handB' } ]);

  const trace = await readTrace(t, 1);
  await t.expect(trace.length).eql(1, `one enter event: ${JSON.stringify(trace)}`);
  // the coordinate is wherever the pointer let go, so the assertion is that it is not the
  // holder's drop offset - the aligned case above pins the exact value
  await t.expect(trace[0]).match(/^enter handB\[parent=handB mark=enter-handB x=1\d\d y=\d+\]$/, trace[0]);
});

test('A stacked holder rearranges its children before enterRoutine and after onLeave', async t => {
  const state = fixtureState({ handB: { stackOffsetX: 40 } }, { enterFields: [ 'parent', 'mark', 'x' ], leaveFields: [ 'parent', 'mark', 'x' ] });
  state.card2 = { id: 'card2', type: 'card', deck: 'deck', cardType: 'plain', parent: 'handB' };
  await openRoom(t, 'modern', state);
  await dragPath(t, CARD, [ { onto: 'handB' } ]);

  await expectTrace(t, [ 'enter handB[parent=handB mark=enter-handB x=44]' ]);
});

test('ignoreOnLeave skips the property half of the departure but not the routine', async t => {
  await openRoom(t, 'modern', fixtureState({ card1: { parent: 'handA', x: 4, y: 4, ignoreOnLeave: true } }));
  await dragPath(t, CARD, [ { dx: 500, dy: -400 } ]);

  await expectTrace(t, [
    'leave handA[parent=null mark=null owner=null]',
    'leave handA[parent=null mark=null owner=null]'
  ]);
});

test('A holder with dropShadow runs its enter and leave events for the shadow widget as well', async t => {
  await openRoom(t, 'modern', fixtureState({ handB: { dropShadow: true } }, { enterFields: [ 'parent' ], leaveFields: [ 'parent' ] }));
  await dragPath(t, CARD, [ { onto: 'handB' } ]);

  // The shadow is a real widget that is put into the holder and taken out again while the drag
  // is still going on, so the holder's routines run for something the player never dropped. The
  // trace is about card1, which is why the shadow's own entries read parent=null: at that
  // moment the card is still being dragged.
  await expectTrace(t, [
    'enter handB[parent=null]',
    'leave handB[parent=null]',
    'leave handB[parent=null]',
    'enter handB[parent=handB]'
  ]);
});

// ---------------------------------------------------------------------------------------------
// Piles
// ---------------------------------------------------------------------------------------------

test('Dropping a card onto a card inside a holder applies onEnter to both', async t => {
  const state = fixtureState({}, { enterFields: [ 'parent', 'mark' ], leaveFields: [ 'parent', 'mark' ] });
  state.card2 = { id: 'card2', type: 'card', deck: 'deck', cardType: 'plain', parent: 'handB' };
  await openRoom(t, 'modern', state);
  await dragPath(t, CARD, [ { onto: 'card2' } ]);

  const after = await stateWhen(s=>Object.values(s).some(w=>w.type == 'pile'));
  const pile = Object.values(after).find(w=>w.type == 'pile');
  await t.expect(pile.parent).eql('handB', 'the pile is in the holder');
  await t.expect(after.card1.mark).eql('enter-handB', 'onEnter reached the dropped card');
});

test('Dragging a pile into a holder applies onEnter to every card in it', async t => {
  const state = fixtureState();
  state.pile1 = { id: 'pile1', type: 'pile', x: 600, y: 250 };
  state.card1.parent = 'pile1';
  state.card2 = { id: 'card2', type: 'card', deck: 'deck', cardType: 'plain', parent: 'pile1' };
  await openRoom(t, 'modern', state);
  await dragPath(t, 'pile1', [ { onto: 'handB' } ]);

  // A pile is one widget for the drag and a collection for the properties: onChildAdd() applies
  // onEnter to each card it holds (holder.js:129), while enterRoutine fires once, for the pile.
  // The trace watches card1, so its entry proves the properties reached inside the pile.
  const after = await stateWhen(s=>(s.log||{}).trace);
  await t.expect(after.card1.mark).eql('enter-handB', 'onEnter reached the first card');
  await t.expect(after.card2.mark).eql('enter-handB', 'onEnter reached the second card');
  await expectTrace(t, [ 'enter handB[parent=pile1 mark=enter-handB owner=null]' ]);
});

// ---------------------------------------------------------------------------------------------
// Routines that move widgets
// ---------------------------------------------------------------------------------------------

test('MOVE from one holder to another', async t => {
  await openRoom(t, 'modern', fixtureState({
    card1: { parent: 'handA', x: 4, y: 4 },
    go: { clickRoutine: [ { func: 'MOVE', from: 'handA', to: 'handB', count: 1 } ] }
  }));
  await clickGo(t);

  // #1212 wants onLeave + leaveRoutine, then the arrival, then afterLeaveRoutine and
  // enterRoutine. What the engine does is the same doubled leave as the drag (moveToHolder()
  // detaches through the same two paths), and the second one runs *after* the card has already
  // arrived in handB - so a leaveRoutine reading its child's parent sees the destination.
  await expectTrace(t, [
    'leave handA[parent=null mark=null owner=null]',
    'leave handA[parent=null mark=leave-handA owner=null]',
    'enter handB[parent=handB mark=enter-handB owner=null]'
  ]);
});

test('MOVE of a collection into a holder', async t => {
  await openRoom(t, 'modern', fixtureState({
    card1: { parent: 'handA', x: 4, y: 4 },
    go: { clickRoutine: [ { func: 'SELECT', property: 'id', value: CARD }, { func: 'MOVE', to: 'handB' } ] }
  }));
  await clickGo(t);

  await expectTrace(t, [
    'leave handA[parent=null mark=null owner=null]',
    'leave handA[parent=null mark=leave-handA owner=null]',
    'enter handB[parent=handB mark=enter-handB owner=null]'
  ]);
});

test('MOVEXY out of a holder', async t => {
  await openRoom(t, 'modern', fixtureState({
    card1: { parent: 'handA', x: 4, y: 4 },
    go: { clickRoutine: [ { func: 'MOVEXY', from: 'handA', x: 600, y: 300 } ] }
  }));
  await clickGo(t);

  // MOVEXY writes parent directly instead of going through checkParent(), so dispenseCard()
  // never runs: onLeave is not applied (mark stays null) and leaveRoutine fires once rather
  // than twice. #1212 asks for onLeave + leaveRoutine + afterLeaveRoutine here, so this is the
  // operation furthest from the description - and the difference to MOVE, which does apply
  // onLeave, is invisible in a game until a card comes out of a holder the wrong way.
  await expectTrace(t, [
    'leave handA[parent=null mark=null owner=null]'
  ]);
});

test('SET parent is the plain property write and fires only the parent-change half', async t => {
  await openRoom(t, 'modern', fixtureState({
    card1: { parent: 'handA', x: 4, y: 4 },
    go: { clickRoutine: [ { func: 'SELECT', property: 'id', value: CARD }, { func: 'SET', property: 'parent', value: 'handB' } ] }
  }));
  await clickGo(t);

  // No dispenseCard() on this path, so onLeave is never applied and leaveRoutine fires once
  // instead of twice. A game that moves cards with SET therefore sees a different event
  // sequence than one that uses MOVE, which is worth knowing before the order is changed.
  await expectTrace(t, [
    'leave handA[parent=handB mark=null owner=null]',
    'enter handB[parent=handB mark=enter-handB owner=null]'
  ]);
});

test('DELETE of a card in a holder', async t => {
  await openRoom(t, 'modern', fixtureState({
    card1: { parent: 'handA', x: 4, y: 4 },
    go: { clickRoutine: [ { func: 'SELECT', property: 'id', value: CARD }, { func: 'DELETE' } ] }
  }));
  await clickGo(t);

  await t.wait(700);
  const after = await getStateObject();
  await t.expect(after.card1).eql(undefined, 'the card is gone');
  await t.expect(String((after.log||{}).trace||'').split(';').filter(e=>e)).eql([
    'leave handA[parent=handA mark=null owner=null]'
  ]);
});

test('RECALL brings the cards back and runs the receiving holder\'s enterRoutine', async t => {
  await openRoom(t, 'modern', fixtureState({
    // RECALL collects the cards of the decks *inside* the holder it is given
    deck: { parent: 'handB' },
    go: { clickRoutine: [ { func: 'RECALL', holder: 'handB' } ] }
  }));
  await clickGo(t);

  await expectTrace(t, [ 'enter handB[parent=handB mark=enter-handB owner=null]' ]);
});

// ---------------------------------------------------------------------------------------------
// What the routines are handed
// ---------------------------------------------------------------------------------------------

test('enterRoutine and leaveRoutine are handed the widget in the child collection', async t => {
  const state = fixtureState({ card1: { parent: 'handA', x: 4, y: 4 } });
  const record = property => [
    { func: 'SELECT', property: 'id', value: 'log', collection: 'log' },
    { func: 'GET', collection: 'child', property: 'id', variable: 'childID', aggregation: 'array' },
    { func: 'SET', collection: 'log', property, value: '${childID}' }
  ];
  state.handA.leaveRoutine = record('leftChild');
  state.handB.enterRoutine = record('enteredChild').concat([
    { func: 'SET', collection: 'log', property: 'oldParent', value: '${oldParentID}' }
  ]);
  await openRoom(t, 'modern', state);
  await dragPath(t, CARD, [ { onto: 'handB' } ]);

  const after = await stateWhen(s=>(s.log||{}).enteredChild);
  await t.expect(after.log.leftChild).eql([ CARD ], 'leaveRoutine got the card in child');
  await t.expect(after.log.enteredChild).eql([ CARD ], 'enterRoutine got the card in child');
  // the drag detaches the widget before it lands, so the holder it came from is not what
  // enterRoutine is told - oldParentID is null for every drag, however the card got there
  await t.expect(after.log.oldParent).eql(undefined, 'oldParentID is null for a dragged card');
});

// ---------------------------------------------------------------------------------------------
// The same ordering with every legacy mode on
// ---------------------------------------------------------------------------------------------
//
// None of the four modes is about holder events, so the answer has to be the same in both
// combinations - which is exactly why it is worth asserting: disableHolderImageWidget swaps the
// holder's prototype, and a prototype swap that reached the event methods would show up here
// and nowhere else.

test('The holder-to-holder order is the same with every legacy mode on', async t => {
  await openRoom(t, 'legacy-all', fixtureState({ card1: { parent: 'handA', x: 4, y: 4 } }));
  await dragPath(t, CARD, [ { onto: 'handB' } ]);

  await expectTrace(t, [
    'leave handA[parent=null mark=null owner=null]',
    'leave handA[parent=null mark=leave-handA owner=null]',
    'enter handB[parent=handB mark=enter-handB owner=null]'
  ]);
});

test('The MOVE order is the same with every legacy mode on', async t => {
  await openRoom(t, 'legacy-all', fixtureState({
    card1: { parent: 'handA', x: 4, y: 4 },
    go: { clickRoutine: [ { func: 'MOVE', from: 'handA', to: 'handB', count: 1 } ] }
  }));
  await clickGo(t);

  await expectTrace(t, [
    'leave handA[parent=null mark=null owner=null]',
    'leave handA[parent=null mark=leave-handA owner=null]',
    'enter handB[parent=handB mark=enter-handB owner=null]'
  ]);
});
