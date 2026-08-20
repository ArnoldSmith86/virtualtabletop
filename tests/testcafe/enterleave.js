import { setName, setupTestEnvironment } from './test-util.js';
import { dragPath, openRoom, stateWhen } from './interaction-util.js';
import { CARD, card, clickGo, expectTrace, fixtureState, holder, readTrace } from './holderevent-util.js';

setupTestEnvironment();

// The legacyHolderEnterLeaveEvents half of the holder-event story, plus the combinations that
// need more than two plain holders.
//
// Two things are asserted here that holderevents.js cannot say on its own:
//
//   1. The legacy mode really does restore the old pipeline. Every trace in the first section is
//      the one this repository recorded before the pipeline was consolidated, so a game that was
//      built around leaveRoutine firing twice keeps working by switching the mode on.
//   2. The cases where the two pipelines disagree about *piles*. A pile is transparent for
//      enter and leave now - joining, leaving or dissolving one inside a holder is not a move
//      between containers - and every issue in that family (#480, #1094) shows up as a
//      difference between the two combinations below.
//
// tests/client/engine/enterleave.test.js covers the same ground far more cheaply for everything
// that does not need a real pointer; what is here needs the browser.

const MODERN = 'modern';
const LEGACY = 'only-legacyHolderEnterLeaveEvents';

// ---------------------------------------------------------------------------------------------
// The legacy mode restores the pipeline it replaced
// ---------------------------------------------------------------------------------------------

test('Legacy: dragging a card out of a holder fires leaveRoutine twice', async t => {
  await openRoom(t, LEGACY, fixtureState({ card1: { parent: 'handA', x: 4, y: 4 } }));
  await dragPath(t, CARD, [ { dx: 500, dy: -400 } ]);

  // Two code paths called the same routine for one drag: moveStart() detached the widget, which
  // called leaveRoutine before anything else about the departure had happened (mark=null), and
  // checkParent() later dispensed it, which applied onLeave and called leaveRoutine again.
  await expectTrace(t, [
    'leave handA[parent=null mark=null owner=null]',
    'leave handA[parent=null mark=leave-handA owner=null]'
  ]);
});

test('Legacy: dragging a card from one holder to another', async t => {
  await openRoom(t, LEGACY, fixtureState({ card1: { parent: 'handA', x: 4, y: 4 } }));
  await dragPath(t, CARD, [ { onto: 'handB' } ]);

  await expectTrace(t, [
    'leave handA[parent=null mark=null owner=null]',
    'leave handA[parent=null mark=leave-handA owner=null]',
    'enter handB[parent=handB mark=enter-handB owner=null]'
  ]);
});

test('Legacy: dragging a card within its holder runs enterRoutine without applying onEnter', async t => {
  await openRoom(t, LEGACY, fixtureState({ card1: { parent: 'handA', x: 4, y: 4 } }));
  await dragPath(t, CARD, [ { dx: 150, dy: 0 } ]);

  // onChildAdd() skipped onEnter when the widget landed back on the holder it was dragged off
  // (`this != child.currentParent`), so the properties and the routine disagreed about whether
  // an entry had happened - mark=null next to an `enter` entry is exactly that disagreement.
  await expectTrace(t, [
    'leave handA[parent=null mark=null owner=null]',
    'enter handA[parent=handA mark=null owner=null]'
  ]);
});

test('Legacy: dragging a card out of a holder and back before dropping it', async t => {
  await openRoom(t, LEGACY, fixtureState({ card1: { parent: 'handA', x: 4, y: 4 } }));
  await dragPath(t, CARD, [ { dx: 0, dy: -400 }, { onto: 'handA' } ]);

  await expectTrace(t, [
    'leave handA[parent=null mark=null owner=null]',
    'leave handA[parent=null mark=leave-handA owner=null]',
    'enter handA[parent=handA mark=enter-handA owner=null]'
  ]);
});

test('Legacy: MOVE from one holder to another leaves twice', async t => {
  await openRoom(t, LEGACY, fixtureState({
    card1: { parent: 'handA', x: 4, y: 4 },
    go: { clickRoutine: [ { func: 'MOVE', from: 'handA', to: 'handB', count: 1 } ] }
  }));
  await clickGo(t);

  // the second call ran after the card had already arrived in handB
  await expectTrace(t, [
    'leave handA[parent=null mark=null owner=null]',
    'leave handA[parent=null mark=leave-handA owner=null]',
    'enter handB[parent=handB mark=enter-handB owner=null]'
  ]);
});

test('Legacy: MOVEXY out of a holder does not apply onLeave', async t => {
  await openRoom(t, LEGACY, fixtureState({
    card1: { parent: 'handA', x: 4, y: 4 },
    go: { clickRoutine: [ { func: 'MOVEXY', from: 'handA', x: 600, y: 300 } ] }
  }));
  await clickGo(t);

  // issue #1371: the operation never reached dispenseCard(), so the card came out of the holder
  // without the properties the holder applies to everything that leaves it
  await expectTrace(t, [
    'leave handA[parent=null mark=null owner=null]'
  ]);
});

test('Legacy: SET parent does not apply onLeave', async t => {
  await openRoom(t, LEGACY, fixtureState({
    card1: { parent: 'handA', x: 4, y: 4 },
    go: { clickRoutine: [ { func: 'SELECT', property: 'id', value: CARD }, { func: 'SET', property: 'parent', value: 'handB' } ] }
  }));
  await clickGo(t);

  // issue #1836: a game that moved cards with SET saw a different event sequence than one that
  // used MOVE, and the difference was invisible until a card came out of a holder the wrong way
  await expectTrace(t, [
    'leave handA[parent=handB mark=null owner=null]',
    'enter handB[parent=handB mark=enter-handB owner=null]'
  ]);
});

test('Legacy: ignoreOnLeave still leaves twice', async t => {
  await openRoom(t, LEGACY, fixtureState({ card1: { parent: 'handA', x: 4, y: 4, ignoreOnLeave: true } }));
  await dragPath(t, CARD, [ { dx: 500, dy: -400 } ]);

  await expectTrace(t, [
    'leave handA[parent=null mark=null owner=null]',
    'leave handA[parent=null mark=null owner=null]'
  ]);
});

test('Legacy: a dropShadow holder runs a doubled leave for the shadow widget too', async t => {
  await openRoom(t, LEGACY, fixtureState({ handB: { dropShadow: true } }, { enterFields: [ 'parent' ], leaveFields: [ 'parent' ] }));
  await dragPath(t, CARD, [ { onto: 'handB' } ]);

  await expectTrace(t, [
    'enter handB[parent=null]',
    'leave handB[parent=null]',
    'leave handB[parent=null]',
    'enter handB[parent=handB]'
  ]);
});

test('Legacy: the holder image mode does not change the event order', async t => {
  await openRoom(t, 'pair-disableHolderImageWidget+legacyHolderEnterLeaveEvents', fixtureState({ card1: { parent: 'handA', x: 4, y: 4 } }));
  await dragPath(t, CARD, [ { onto: 'handB' } ]);

  // the two modes are declared as interacting because both live on the holder - this is the
  // assertion behind that declaration
  await expectTrace(t, [
    'leave handA[parent=null mark=null owner=null]',
    'leave handA[parent=null mark=leave-handA owner=null]',
    'enter handB[parent=handB mark=enter-handB owner=null]'
  ]);
});

// ---------------------------------------------------------------------------------------------
// Piles
// ---------------------------------------------------------------------------------------------

// The holders in this section name the widget each event was about, because a pile turns one
// drop into several parent changes and "which widget" is the whole question.
const pileHolders = { watchChild: true };

test('Dropping a card onto a card inside a holder is one arrival', async t => {
  const state = fixtureState({}, pileHolders);
  state.card2 = card('card2', { parent: 'handB' });
  await openRoom(t, MODERN, state);
  await dragPath(t, CARD, [ { onto: 'card2' } ]);

  const after = await stateWhen(s=>Object.values(s).some(w=>w.type == 'pile'));
  await t.expect(Object.values(after).find(w=>w.type == 'pile').parent).eql('handB', 'the pile is in the holder');
  await expectTrace(t, [ 'enter handB card1[parent=handB mark=enter-handB owner=null]' ]);
});

test('Legacy: dropping a card onto a card inside a holder leaves the holder twice over', async t => {
  const state = fixtureState({}, pileHolders);
  state.card2 = card('card2', { parent: 'handB' });
  await openRoom(t, LEGACY, state);
  await dragPath(t, CARD, [ { onto: 'card2' } ]);

  // issue #1094: the pile the drop forms is a new parent for both cards, and every one of those
  // parent changes was a departure from the holder - with no matching arrival
  const trace = await readTrace(t, 3);
  await t.expect(trace[0]).eql('enter handB card1[parent=handB mark=enter-handB owner=null]');
  await t.expect(trace.length).eql(3, `two leaves follow the arrival: ${JSON.stringify(trace)}`);
  await t.expect(trace.slice(1).every(entry=>entry.startsWith('leave handB'))).ok(JSON.stringify(trace));
});

test('Dragging a card out of a pile inside a holder leaves the holder once', async t => {
  const state = fixtureState({}, pileHolders);
  state.pile1 = { id: 'pile1', type: 'pile', parent: 'handB', x: 4, y: 4 };
  Object.assign(state.card1, { parent: 'pile1', x: 0, y: 0 });
  state.card2 = card('card2', { parent: 'pile1', x: 0, y: 0 });
  state.card3 = card('card3', { parent: 'pile1', x: 0, y: 0 });
  await openRoom(t, MODERN, state);
  // the cards sit on top of each other, so the pointer takes whichever one is on top - the
  // assertion is about how many events one card leaving raises, not about which card it was
  await dragPath(t, CARD, [ { dx: 0, dy: -400 } ]);

  const trace = await readTrace(t, 1);
  await t.expect(trace.length).eql(1, JSON.stringify(trace));
  await t.expect(trace[0]).match(/^leave handB card\d\[parent=null mark=leave-handB owner=null\]$/, trace[0]);
});

test('The last card of a pile in a holder stays without entering or leaving', async t => {
  const state = fixtureState({}, pileHolders);
  state.pile1 = { id: 'pile1', type: 'pile', parent: 'handB', x: 4, y: 4 };
  Object.assign(state.card1, { parent: 'pile1', x: 0, y: 0 });
  state.card2 = card('card2', { parent: 'pile1', x: 0, y: 0 });
  await openRoom(t, MODERN, state);
  await dragPath(t, CARD, [ { dx: 0, dy: -400 } ]);

  // taking the second-to-last card out dissolves the pile, which hands the remaining card back
  // to the holder it is already in - not a departure, and not an arrival
  const after = await stateWhen(s=>!s.pile1);
  const parents = [ after.card1.parent, after.card2.parent ].sort();
  await t.expect(parents).eql([ 'handB', undefined ], 'one card left, the other is in the holder');
  const trace = await readTrace(t, 1);
  await t.expect(trace.length).eql(1, JSON.stringify(trace));
  await t.expect(trace[0]).match(/^leave handB card\d\[parent=null mark=leave-handB owner=null\]$/, trace[0]);
});

test('Dragging a pile out of a holder leaves once and applies onLeave to every card', async t => {
  const state = fixtureState({}, pileHolders);
  state.pile1 = { id: 'pile1', type: 'pile', parent: 'handB', x: 4, y: 4 };
  Object.assign(state.card1, { parent: 'pile1', x: 0, y: 0 });
  state.card2 = card('card2', { parent: 'pile1', x: 0, y: 0 });
  await openRoom(t, MODERN, state);
  await dragPath(t, 'pile1', [ { dx: 0, dy: -400 } ]);

  const after = await stateWhen(s=>(s.card1||{}).mark);
  await t.expect(after.card1.mark).eql('leave-handB', 'onLeave reached the first card');
  await t.expect(after.card2.mark).eql('leave-handB', 'onLeave reached the second card');
  await expectTrace(t, [ 'leave handB pile1[parent=null mark=null owner=null]' ]);
});

test('A preventPiles holder unpacks a dropped pile without extra events', async t => {
  const state = fixtureState({ handB: { preventPiles: true } }, pileHolders);
  state.pile1 = { id: 'pile1', type: 'pile', x: 600, y: 250 };
  Object.assign(state.card1, { parent: 'pile1', x: 0, y: 0 });
  state.card2 = card('card2', { parent: 'pile1', x: 0, y: 0 });
  await openRoom(t, MODERN, state);
  await dragPath(t, 'pile1', [ { onto: 'handB' } ]);

  const after = await stateWhen(s=>(s.card1||{}).parent == 'handB');
  await t.expect(after.card2.parent).eql('handB', 'both cards ended up in the holder');
  await expectTrace(t, [ 'enter handB pile1[parent=handB mark=null owner=null]' ]);
});

// ---------------------------------------------------------------------------------------------
// Holders that are not plain top-left stackers
// ---------------------------------------------------------------------------------------------

test('A stacked holder closes the gap when a card is taken out', async t => {
  const state = fixtureState({ handB: { stackOffsetY: 40 } }, { enterFields: [ 'parent' ], leaveFields: [ 'parent' ] });
  Object.assign(state.card1, { parent: 'handB', x: 4, y: 4 });
  state.card2 = card('card2', { parent: 'handB', x: 4, y: 44 });
  state.card3 = card('card3', { parent: 'handB', x: 4, y: 84 });
  await openRoom(t, MODERN, state);
  await dragPath(t, CARD, [ { dx: 0, dy: -500 } ]);

  // the departure re-compacts the holder, so the two cards that stayed sit at the first two
  // stack positions rather than leaving a hole where the third one was
  const after = await stateWhen(s=>Object.values(s).filter(w=>w.parent == 'handB').length == 2);
  const remaining = Object.values(after).filter(w=>w.parent == 'handB').map(w=>w.y).sort((a, b)=>a-b);
  await t.expect(remaining).eql([ 4, 44 ], 'the two cards that stayed sit at the first two stack positions');
});

test('MOVEXY out of a stacked holder closes the gap as well', async t => {
  const state = fixtureState({
    handB: { stackOffsetY: 40 },
    go: { clickRoutine: [ { func: 'MOVEXY', from: 'handB', x: 700, y: 200 } ] }
  }, { enterFields: [ 'parent' ], leaveFields: [ 'parent' ] });
  Object.assign(state.card1, { parent: 'handB', x: 4, y: 4 });
  state.card2 = card('card2', { parent: 'handB', x: 4, y: 44 });
  state.card3 = card('card3', { parent: 'handB', x: 4, y: 84 });
  await openRoom(t, MODERN, state);
  await clickGo(t);

  const after = await stateWhen(s=>Object.values(s).filter(w=>w.parent == 'handB').length == 2);
  const remaining = Object.entries(after).filter(([ , w ])=>w.parent == 'handB').map(([ , w ])=>w.y);
  await t.expect(remaining.sort((a, b)=>a-b)).eql([ 4, 44 ]);
});

test('DELETE closes the gap in a stacked holder as well', async t => {
  const state = fixtureState({
    handB: { stackOffsetY: 40 },
    go: { clickRoutine: [ { func: 'SELECT', property: 'id', value: CARD }, { func: 'DELETE' } ] }
  }, { enterFields: [ 'parent' ], leaveFields: [ 'parent' ] });
  Object.assign(state.card1, { parent: 'handB', x: 4, y: 4 });
  state.card2 = card('card2', { parent: 'handB', x: 4, y: 44 });
  state.card3 = card('card3', { parent: 'handB', x: 4, y: 84 });
  await openRoom(t, MODERN, state);
  await clickGo(t);

  // a card removed from the room applies no onLeave - it is gone - but the holder it was taken
  // out of is still one card shorter and re-stacks what is left
  const after = await stateWhen(s=>!s[CARD]);
  const remaining = Object.values(after).filter(w=>w.parent == 'handB').map(w=>w.y).sort((a, b)=>a-b);
  await t.expect(remaining).eql([ 4, 44 ], 'the two cards that stayed sit at the first two stack positions');
});

test('An alignChildren:false holder keeps the drop coordinate and still enters', async t => {
  const state = fixtureState({ handB: { alignChildren: false } }, { enterFields: [ 'parent', 'mark' ], leaveFields: [ 'parent', 'mark' ] });
  state.card1.parent = 'handA';
  await openRoom(t, MODERN, state);
  await dragPath(t, CARD, [ { onto: 'handB' } ]);

  await expectTrace(t, [
    'leave handA[parent=null mark=leave-handA]',
    'enter handB[parent=handB mark=enter-handB]'
  ]);
});

// ---------------------------------------------------------------------------------------------
// Seats and per-owner hands
// ---------------------------------------------------------------------------------------------

test('Dragging a card out of a per-owner hand releases it once it is out of the box', async t => {
  await openRoom(t, MODERN, fixtureState({ handA: { childrenPerOwner: true }, card1: { parent: 'handA', x: 4, y: 4, owner: 'Alice' } }));
  await setName(t, 'Alice');
  await dragPath(t, CARD, [ { dx: 500, dy: -400 } ]);

  // the hand still holds the card while the drag is over it, so leaveRoutine reads the owner it
  // had; the release follows a moment later, when the card is really outside
  await expectTrace(t, [ 'leave handA[parent=null mark=leave-handA owner=Alice]' ]);
  // an owner back at its default is not serialized at all, so the state simply stops naming one
  const after = await stateWhen(s=>!s[CARD].owner);
  await t.expect(after[CARD].owner).notOk('the card on the table belongs to nobody');
});

test('Rearranging a card inside a per-owner hand never takes its owner away', async t => {
  await openRoom(t, MODERN, fixtureState({ handA: { childrenPerOwner: true }, card1: { parent: 'handA', x: 4, y: 4, owner: 'Alice' } }));
  await setName(t, 'Alice');
  await dragPath(t, CARD, [ { dx: 150, dy: 0 } ]);

  // A card without an owner is one every other player can see. The drag detaches it at the
  // pickup, so both halves of this rearrange have to find it still owned - otherwise the other
  // players watch Alice sort her hand.
  await expectTrace(t, [
    'leave handA[parent=null mark=leave-handA owner=Alice]',
    'enter handA[parent=handA mark=enter-handA owner=Alice]'
  ]);
  const after = await stateWhen(s=>s[CARD].parent == 'handA');
  await t.expect(after[CARD].owner).eql('Alice', 'the card is still in Alice\'s hand');
});

test('Legacy: the per-owner hand released the card between its two leave calls', async t => {
  await openRoom(t, LEGACY, fixtureState({ handA: { childrenPerOwner: true }, card1: { parent: 'handA', x: 4, y: 4, owner: 'Alice' } }));
  await setName(t, 'Alice');
  await dragPath(t, CARD, [ { dx: 500, dy: -400 } ]);

  await expectTrace(t, [
    'leave handA[parent=null mark=null owner=Alice]',
    'leave handA[parent=null mark=leave-handA owner=null]'
  ]);
});

test('MOVE to a seat runs the hand\'s enterRoutine with the owner already set', async t => {
  const state = fixtureState({
    handB: { childrenPerOwner: true },
    card1: { parent: 'handA', x: 4, y: 4 },
    go: { clickRoutine: [ { func: 'SELECT', property: 'id', value: CARD }, { func: 'MOVE', to: 'seat1' } ] }
  });
  state.seat1 = { id: 'seat1', type: 'seat', hand: 'handB', x: 1150, y: 500, index: 1 };
  await openRoom(t, MODERN, state);
  await setName(t, 'Alice');
  // MOVE to a seat needs somebody sitting on it, or it has no hand to move the card into
  await t.click('#w_seat1');
  await clickGo(t);

  await expectTrace(t, [
    'leave handA[parent=null mark=leave-handA owner=null]',
    'enter handB[parent=handB mark=enter-handB owner=Alice]'
  ]);
});

// ---------------------------------------------------------------------------------------------
// A holder inside a holder
// ---------------------------------------------------------------------------------------------

test('A card dropped into a holder that sits in another holder enters only the inner one', async t => {
  const state = fixtureState({ handB: { alignChildren: false } });
  state.inner = holder('inner', { parent: 'handB', x: 20, y: 20, width: 200, height: 150 });
  state.card1.parent = 'handA';
  await openRoom(t, MODERN, state);
  await dragPath(t, CARD, [ { onto: 'inner' } ]);

  await expectTrace(t, [
    'leave handA[parent=null mark=leave-handA owner=null]',
    'enter inner[parent=inner mark=enter-inner owner=null]'
  ]);
});
