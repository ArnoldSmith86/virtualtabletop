import { ClientFunction } from 'testcafe';

import { compareState, prepareClient, setName, setRoomState, setupTestEnvironment } from './test-util.js';

setupTestEnvironment();

// A deck is required so the cards can be added (a card needs a cardType the deck
// defines); its exact faces don't matter for the resulting room-state hash. It
// lives on the surface (no parent) so it isn't a child of the source holder and
// therefore isn't itself moved.
const deck = { id: 'deck1', type: 'deck', x: 0, y: 700, cardTypes: { a: {} }, faceTemplates: [ {} ] };

function card(id, parent, z) {
  return { id, type: 'card', deck: 'deck1', cardType: 'a', parent, x: 0, y: 0, z };
}

function baseState(target, button) {
  const state = {
    deck1: deck,
    src: { id: 'src', type: 'holder', x: 0, y: 0 },
    target,
    mover: button
  };
  for(let i=1; i<=6; ++i)
    state[`c${i}`] = card(`c${i}`, 'src', i);
  return state;
}

// A `grid` holder auto-arranges the cards MOVEd into it, wrapping them into rows
// that stay inside the holder. This locks the wrap coordinates the arrangement
// code produces for six cards in a 400x400 grid holder.
test('layout grid wraps MOVEd cards into a grid', async t => {
  await setRoomState(baseState(
    { id: 'target', type: 'holder', x: 500, y: 0, width: 400, height: 400, layout: 'grid' },
    { id: 'mover', type: 'button', x: 1000, y: 0, text: 'move',
      clickRoutine: [ { func: 'MOVE', from: 'src', to: 'target', count: 'all' } ] }
  ));
  await ClientFunction(prepareClient)();
  await setName(t);
  await t.click('#w_mover');
  await compareState(t, '3ab0e89036a439659cd3e16ee4d57840');
});

// A MOVE batch (count > 1) into a `multipleSpread` holder must funnel every moved
// card into a single spread group; `position: pileTop` selects the end. This
// locks that batch-grouping behaviour and the resulting fan coordinates.
test('layout multipleSpread MOVE batch with position lands in one group', async t => {
  await setRoomState(baseState(
    { id: 'target', type: 'holder', x: 500, y: 0, width: 600, height: 200,
      layout: 'multipleSpread', stackOffsetX: 25 },
    { id: 'mover', type: 'button', x: 1200, y: 0, text: 'move',
      clickRoutine: [ { func: 'MOVE', from: 'src', to: 'target', count: 'all', position: 'pileTop' } ] }
  ));
  await ClientFunction(prepareClient)();
  await setName(t);
  await t.click('#w_mover');
  await compareState(t, '65000be865e6120cb3829e08741016a3');
});
