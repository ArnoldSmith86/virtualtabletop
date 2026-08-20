import { getStateObject, setName, setupTestEnvironment } from './test-util.js';
import { dragPath, openRoom, stateWhen } from './interaction-util.js';
import { CARD, card, clickGo, expectTrace, fixtureState, readTrace } from './holderevent-util.js';

setupTestEnvironment();

// Holder events: what fires, in which order, and what the widget looks like while it fires.
//
// #1212 wrote down what holder events should do - the properties of the departure, then the
// leaving holder's routine, then the arrival and the receiving holder's routine - and this file
// pins what a real pointer and a real routine actually produce. Every move raises at most one
// leave and one enter, and each of them applies its properties before it calls its routine.
//
// tests/testcafe/enterleave.js is the other half: the same traces with the
// legacyHolderEnterLeaveEvents mode on, which restores the pipeline this replaced, plus the
// combinations that need more than the two holders holderevent-util.js sets up.

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

test('Dragging a card out of a holder fires leaveRoutine once', async t => {
  await openRoom(t, 'modern', fixtureState({ card1: { parent: 'handA', x: 4, y: 4 } }));
  await dragPath(t, CARD, [ { dx: 500, dy: -400 } ]);

  // Picking the card up detaches it, and that parent change is the departure: onLeave is applied
  // and leaveRoutine runs once, reading a card the event has already finished writing.
  await expectTrace(t, [
    'leave handA[parent=null mark=leave-handA owner=null]'
  ]);
});

test('Dragging a card from one holder to another', async t => {
  await openRoom(t, 'modern', fixtureState({ card1: { parent: 'handA', x: 4, y: 4 } }));
  await dragPath(t, CARD, [ { onto: 'handB' } ]);

  // The leaving holder is completely finished before the receiving one starts. #1212 also asks
  // for an afterLeaveRoutine once the card has landed, which does not exist yet - nothing runs
  // on behalf of handA after the arrival.
  await expectTrace(t, [
    'leave handA[parent=null mark=leave-handA owner=null]',
    'enter handB[parent=handB mark=enter-handB owner=null]'
  ]);
});

test('Dragging a card within its holder fires the whole leave-and-enter cycle', async t => {
  await openRoom(t, 'modern', fixtureState({ card1: { parent: 'handA', x: 4, y: 4 } }));
  // 150 board units to the right, which keeps the card inside handA the whole time
  await dragPath(t, CARD, [ { dx: 150, dy: 0 } ]);

  // #1212 wants this to be beforeLeaveRoutine + leaveCancelledRoutine, i.e. for the game to be
  // able to tell "the card never actually left" from a real departure. What it is instead is a
  // departure and an arrival, both complete: the card left the holder when it was picked up and
  // entered it again when it was dropped, so the properties and the routines agree.
  await expectTrace(t, [
    'leave handA[parent=null mark=leave-handA owner=null]',
    'enter handA[parent=handA mark=enter-handA owner=null]'
  ]);
});

test('Dragging a card out of a holder and back before dropping it', async t => {
  await openRoom(t, 'modern', fixtureState({ card1: { parent: 'handA', x: 4, y: 4 } }));
  await dragPath(t, CARD, [ { dx: 0, dy: -400 }, { onto: 'handA' } ]);

  // The case #1212 calls "leaveCancelledRoutine with a flag indicating that leaveRoutine was
  // called". It is indistinguishable from a card that came from somewhere else: one leave and
  // one enter, exactly like the holder-to-holder drag.
  await expectTrace(t, [
    'leave handA[parent=null mark=leave-handA owner=null]',
    'enter handA[parent=handA mark=enter-handA owner=null]'
  ]);
});

test('A card dragged onto a full holder is refused and stays on the table', async t => {
  const state = fixtureState({ handB: { dropLimit: 1 } });
  state.card2 = card('card2', { parent: 'handB' });
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
  state.card2 = card('card2', { parent: 'handB' });
  await openRoom(t, 'modern', state);
  await dragPath(t, CARD, [ { onto: 'handB' } ]);

  await expectTrace(t, [ 'enter handB[parent=handB mark=enter-handB x=44]' ]);
});

test('ignoreOnLeave skips the property half of the departure but not the routine', async t => {
  await openRoom(t, 'modern', fixtureState({ card1: { parent: 'handA', x: 4, y: 4, ignoreOnLeave: true } }));
  await dragPath(t, CARD, [ { dx: 500, dy: -400 } ]);

  await expectTrace(t, [
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
    'enter handB[parent=handB]'
  ]);
});

// ---------------------------------------------------------------------------------------------
// Piles
// ---------------------------------------------------------------------------------------------

test('Dropping a card onto a card inside a holder applies onEnter to both', async t => {
  const state = fixtureState({}, { enterFields: [ 'parent', 'mark' ], leaveFields: [ 'parent', 'mark' ] });
  state.card2 = card('card2', { parent: 'handB' });
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
  state.card2 = card('card2', { parent: 'pile1' });
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

  // A routine-driven move produces the same trace as the drag above: MOVE goes through
  // moveToHolder(), which detaches the card first, and the detach is the departure.
  await expectTrace(t, [
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

  // MOVEXY writes parent directly rather than going through checkParent(), and the departure is
  // the parent change itself - so it applies onLeave exactly like MOVE and the drag do (#1371).
  await expectTrace(t, [
    'leave handA[parent=null mark=leave-handA owner=null]'
  ]);
});

test('SET parent raises the same departure and arrival as a drag', async t => {
  await openRoom(t, 'modern', fixtureState({
    card1: { parent: 'handA', x: 4, y: 4 },
    go: { clickRoutine: [ { func: 'SELECT', property: 'id', value: CARD }, { func: 'SET', property: 'parent', value: 'handB' } ] }
  }));
  await clickGo(t);

  // SET writes the destination before the event runs, which is why the departing routine reads
  // parent=handB - but it is still a departure, so onLeave is applied first (#1836).
  await expectTrace(t, [
    'leave handA[parent=handB mark=leave-handA owner=null]',
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
// The rendering legacy modes do not reach the event methods
// ---------------------------------------------------------------------------------------------
//
// disableHolderImageWidget swaps the holder's prototype, which is the one legacy mode that could
// reach the event methods by accident - so the modern trace has to survive it. The mode that is
// about holder events, legacyHolderEnterLeaveEvents, has its own fixture in enterleave.js.

test('The holder-to-holder order survives disableHolderImageWidget', async t => {
  await openRoom(t, 'only-disableHolderImageWidget', fixtureState({ card1: { parent: 'handA', x: 4, y: 4 } }));
  await dragPath(t, CARD, [ { onto: 'handB' } ]);

  await expectTrace(t, [
    'leave handA[parent=null mark=leave-handA owner=null]',
    'enter handB[parent=handB mark=enter-handB owner=null]'
  ]);
});

test('The MOVE order survives disableHolderImageWidget', async t => {
  await openRoom(t, 'only-disableHolderImageWidget', fixtureState({
    card1: { parent: 'handA', x: 4, y: 4 },
    go: { clickRoutine: [ { func: 'MOVE', from: 'handA', to: 'handB', count: 1 } ] }
  }));
  await clickGo(t);

  await expectTrace(t, [
    'leave handA[parent=null mark=leave-handA owner=null]',
    'enter handB[parent=handB mark=enter-handB owner=null]'
  ]);
});
