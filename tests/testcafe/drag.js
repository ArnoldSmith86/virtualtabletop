import { ClientFunction } from 'testcafe';

import { getState, prepareClient, setName, setRoomState, setupTestEnvironment } from './test-util.js';

setupTestEnvironment();

// A hand that keeps a separate set of cards per player, with a second holder stacked on
// top of its right half. The card starts on the left, in the part of the hand that the
// other holder does not cover, so that it can be picked up at all. The hand marks the
// card when it leaves, once through onLeave and once through leaveRoutine, so that the
// tests can tell when the card left on top of what the other players see of it. With
// keepOwnerOnLeave the leaveRoutine also hands the card to the player who took it out,
// the way the hands in "4-Letter Words" and "CONTEST" do. spot is not a drop target, it
// just marks a free place on the table to drop a card onto.
function stackedHoldersRoom(keepOwnerOnLeave) {
  return {
    deck:  { id: 'deck', type: 'deck', cardTypes: { plain: {} }, x: 1200, y: 50 },
    hand:  { id: 'hand', type: 'holder', x: 100, y: 400, width: 600, height: 300, childrenPerOwner: true, alignChildren: false,
             onLeave: { classes: 'ran' },
             leaveRoutine: [ { func: 'SET', collection: 'child', property: 'text', value: 'ran' },
                             ...(keepOwnerOnLeave ? [ { func: 'SET', collection: 'child', property: 'owner', value: '${playerName}' } ] : []) ] },
    over:  { id: 'over', type: 'holder', x: 400, y: 350, width: 300, height: 400, z: 10 },
    table: { id: 'table', type: 'holder', x: 800, y: 100, width: 300, height: 250 },
    spot:  { id: 'spot', x: 850, y: 550, width: 200, height: 200, movable: false },
    card:  { id: 'card', type: 'card', deck: 'deck', cardType: 'plain', parent: 'hand', x: 30, y: 70, owner: 'TestCafe' }
  };
}

// The mouse events are dispatched one at a time so that the room state can be read while
// the drag is still going on - t.drag() would only leave the result of the drop behind.
const dragStart = ClientFunction(id => {
  const card = document.querySelector(`#w_${id}`).getBoundingClientRect();
  window.dragCoords = { x: card.left + card.width/2, y: card.top + card.height/2 };
  document.querySelector(`#w_${id}`).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: window.dragCoords.x, clientY: window.dragCoords.y }));
});

// Drags onto the center of the given widget in a few steps, like a real pointer would.
const dragOnto = ClientFunction(id => {
  const target = document.querySelector(`#w_${id}`).getBoundingClientRect();
  const from = window.dragCoords;
  const to = { x: target.left + target.width/2, y: target.top + target.height/2 };
  for(let step=1; step<=5; ++step)
    document.body.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, buttons: 1, clientX: from.x + (to.x-from.x)*step/5, clientY: from.y + (to.y-from.y)*step/5 }));
  window.dragCoords = to;
});

// Drags straight down until the dragged widget's center sits the given number of card
// heights below the bottom edge of the given widget - so 0.2 leaves the card overlapping
// that widget and 0.7 (more than half a card) puts it completely clear of it.
const dragBelow = ClientFunction((id, cardHeights) => {
  const bottom = document.querySelector(`#w_${id}`).getBoundingClientRect().bottom;
  const card = document.querySelector('#w_card').getBoundingClientRect();
  const from = window.dragCoords;
  const to = { x: from.x, y: bottom + card.height*cardHeights };
  for(let step=1; step<=5; ++step)
    document.body.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, buttons: 1, clientX: to.x, clientY: from.y + (to.y-from.y)*step/5 }));
  window.dragCoords = to;
});

const dragEnd = ClientFunction(() => {
  document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientX: window.dragCoords.x, clientY: window.dragCoords.y }));
});

// the state is read straight from the server so that this sees what the other players see.
// onLeave and leaveRoutine are the marks the hand leaves on the card on its way out - what
// they say about when the card leaves must not change.
async function cardState() {
  const { card } = JSON.parse(await getState());
  return {
    owner:        card.owner       || null,
    parent:       card.parent      || null,
    hoverParent:  card.hoverParent || null,
    hoverTarget:  card.hoverTarget || null,
    onLeave:      card.classes     || null,
    leaveRoutine: card.text        || null
  };
}

// the preview a dropShadow holder shows while a card is dragged over it, as the other
// players see it - it is a clone of the card and must not carry anything that would make
// it look like the hand the card is still hidden in
async function shadowState() {
  const shadow = Object.values(JSON.parse(await getState())).filter(w => w && w.dropShadowOwner)[0];
  return shadow ? { parent: shadow.parent || null, hoverParent: shadow.hoverParent || null } : null;
}

// the mouse events above return before the drag they trigger has reached the server, so
// give the state a moment to arrive there instead of waiting a fixed amount of time
async function expectState(t, readState, expected) {
  let actual = await readState();
  for(let wait=50; wait<2000 && JSON.stringify(actual) != JSON.stringify(expected); wait*=2) {
    await new Promise(resolve => setTimeout(resolve, wait));
    actual = await readState();
  }
  await t.expect(actual).eql(expected);
}

async function expectCardState(t, expected) {
  await expectState(t, cardState, expected);
}

test('A card is not revealed while it is dragged over a holder stacked on top of its hand', async t => {
  await setRoomState(stackedHoldersRoom());
  await ClientFunction(prepareClient)();
  await setName(t);

  await dragStart('card');
  await dragOnto('over');

  // the holder on top of the hand is what a drop would go to now, so the card leaves the
  // hand right here and gets both of its marks - but it is still completely inside the
  // hand, so it keeps belonging to its owner and the other players do not get to see it
  await expectCardState(t, { owner: 'TestCafe', parent: null, hoverParent: 'hand', hoverTarget: 'over', onLeave: 'ran', leaveRoutine: 'ran' });

  await dragEnd();
  await expectCardState(t, { owner: null, parent: 'over', hoverParent: null, hoverTarget: null, onLeave: 'ran', leaveRoutine: 'ran' });
});

test('A card is revealed as soon as it is dragged out of its hand', async t => {
  await setRoomState(stackedHoldersRoom());
  await ClientFunction(prepareClient)();
  await setName(t);

  await dragStart('card');
  await dragOnto('table');

  await expectCardState(t, { owner: null, parent: null, hoverParent: null, hoverTarget: 'table', onLeave: 'ran', leaveRoutine: 'ran' });

  await dragEnd();
  await expectCardState(t, { owner: null, parent: 'table', hoverParent: null, hoverTarget: null, onLeave: 'ran', leaveRoutine: 'ran' });
});

test('A card half out of its hand and over no other holder still belongs to its owner', async t => {
  await setRoomState(stackedHoldersRoom());
  await ClientFunction(prepareClient)();
  await setName(t);

  await dragStart('card');

  // dragged straight down out of the hand, past its bottom edge but not clear of it: the
  // card has left the hand and is marked accordingly, but it still overlaps the hand it
  // came from, so it keeps its owner
  await dragBelow('hand', 0.2);
  await expectCardState(t, { owner: 'TestCafe', parent: null, hoverParent: 'hand', hoverTarget: null, onLeave: 'ran', leaveRoutine: 'ran' });

  // once it no longer touches the hand at all, everyone gets to see it
  await dragBelow('hand', 0.7);
  await expectCardState(t, { owner: null, parent: null, hoverParent: null, hoverTarget: null, onLeave: 'ran', leaveRoutine: 'ran' });

  await dragEnd();
  await expectCardState(t, { owner: null, parent: null, hoverParent: null, hoverTarget: null, onLeave: 'ran', leaveRoutine: 'ran' });
});

test('An owner assigned by a leaveRoutine survives the card leaving its hand', async t => {
  await setRoomState(stackedHoldersRoom(true));
  await ClientFunction(prepareClient)();
  await setName(t);

  await dragStart('card');

  // the card leaves the hand while it is still inside it, so the leaveRoutine hands it to
  // the player right here - and it is still hidden from the other players
  await dragOnto('over');
  await expectCardState(t, { owner: 'TestCafe', parent: null, hoverParent: 'hand', hoverTarget: 'over', onLeave: 'ran', leaveRoutine: 'ran' });

  // being outside the hand only takes back what leaving it did, so the owner the
  // leaveRoutine assigned stays - the card keeps belonging to the player who took it,
  // all the way to a drop on the table next to any holder
  await dragOnto('spot');
  await expectCardState(t, { owner: 'TestCafe', parent: null, hoverParent: null, hoverTarget: null, onLeave: 'ran', leaveRoutine: 'ran' });

  await dragEnd();
  await expectCardState(t, { owner: 'TestCafe', parent: null, hoverParent: null, hoverTarget: null, onLeave: 'ran', leaveRoutine: 'ran' });
});

test('The drop shadow of a holder stacked on a hand does not inherit that hand', async t => {
  const room = stackedHoldersRoom();
  room.over.dropShadow = true;
  await setRoomState(room);
  await ClientFunction(prepareClient)();
  await setName(t);

  await dragStart('card');
  await dragOnto('over');

  // the card is hidden in the hand it has not left yet, but the preview of where it would
  // land is in the holder on top and belongs to nothing else
  await expectCardState(t, { owner: 'TestCafe', parent: null, hoverParent: 'hand', hoverTarget: 'over', onLeave: 'ran', leaveRoutine: 'ran' });
  await expectState(t, shadowState, { parent: 'over', hoverParent: null });

  await dragEnd();
  await expectState(t, shadowState, null);
});
