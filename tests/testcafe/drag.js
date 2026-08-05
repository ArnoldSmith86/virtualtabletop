import { ClientFunction } from 'testcafe';

import { getState, prepareClient, setName, setRoomState, setupTestEnvironment } from './test-util.js';

setupTestEnvironment();

// A hand that keeps a separate set of cards per player, with a second holder stacked on
// top of its right half. The card starts on the left, in the part of the hand that the
// other holder does not cover, so that it can be picked up at all.
function stackedHoldersRoom() {
  return {
    deck:  { id: 'deck', type: 'deck', cardTypes: { plain: {} }, x: 1200, y: 50 },
    hand:  { id: 'hand', type: 'holder', x: 100, y: 400, width: 600, height: 300, childrenPerOwner: true, alignChildren: false },
    over:  { id: 'over', type: 'holder', x: 400, y: 350, width: 300, height: 400, z: 10 },
    table: { id: 'table', type: 'holder', x: 800, y: 100, width: 300, height: 250 },
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

const dragEnd = ClientFunction(() => {
  document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientX: window.dragCoords.x, clientY: window.dragCoords.y }));
});

// the state is read straight from the server so that this sees what the other players see
async function cardState() {
  const { card } = JSON.parse(await getState());
  return { owner: card.owner || null, parent: card.parent || null, hoverTarget: card.hoverTarget || null };
}

// the mouse events above return before the drag they trigger has reached the server, so
// give the state a moment to arrive there instead of waiting a fixed amount of time
async function expectCardState(t, expected) {
  let actual = null;
  for(let wait=50; wait<2000; wait*=2) {
    actual = await cardState();
    if(JSON.stringify(actual) == JSON.stringify(expected))
      break;
    await new Promise(resolve => setTimeout(resolve, wait));
  }
  await t.expect(actual).eql(expected);
}

test('A card is not revealed while it is dragged over a holder stacked on top of its hand', async t => {
  await setRoomState(stackedHoldersRoom());
  await ClientFunction(prepareClient)();
  await setName(t);

  await dragStart('card');
  await dragOnto('over');

  // the card is still completely inside the hand, so it still belongs to its owner and
  // the other players do not get to see it - even though the holder on top of the hand
  // is what a drop would go to now
  await expectCardState(t, { owner: 'TestCafe', parent: null, hoverTarget: 'over' });

  await dragEnd();
  await expectCardState(t, { owner: null, parent: 'over', hoverTarget: null });
});

test('A card is revealed as soon as it is dragged out of its hand', async t => {
  await setRoomState(stackedHoldersRoom());
  await ClientFunction(prepareClient)();
  await setName(t);

  await dragStart('card');
  await dragOnto('table');

  await expectCardState(t, { owner: null, parent: null, hoverTarget: 'table' });

  await dragEnd();
  await expectCardState(t, { owner: null, parent: 'table', hoverTarget: null });
});
