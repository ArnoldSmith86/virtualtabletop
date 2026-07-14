import { ClientFunction } from 'testcafe';

import { compareState, getState, prepareClient, setName, setRoomState, setupTestEnvironment } from './test-util.js';

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

async function waitForState(predicate) {
  let state;
  for(let wait=50; wait<1000; wait*=2) {
    state = JSON.parse(await getState());
    if(predicate(state))
      return state;
    await new Promise(resolve=>setTimeout(resolve, wait));
  }
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

// A MOVE within one holder must still honour position. c1 starts at the top but
// is the first child selected by MOVE, so pileBottom must send it below c2/c3
// rather than using the legacy same-holder bring-to-front behaviour.
test('MOVE position applies within the same holder', async t => {
  const state = baseState(
    { id: 'target', type: 'holder', x: 500, y: 0 },
    { id: 'mover', type: 'button', x: 1000, y: 0, text: 'move',
      clickRoutine: [ { func: 'MOVE', from: 'target', to: 'target', count: 1, position: 'pileBottom' } ] }
  );
  delete state.src;
  for(let i=1; i<=6; ++i) {
    state[`c${i}`].parent = 'target';
    state[`c${i}`].z = i == 1 ? 6 : i - 1;
  }
  await setRoomState(state);
  await ClientFunction(prepareClient)();
  await setName(t);
  await t.click('#w_mover');
  const result = await waitForState(s=>s.c1.z === 1);
  const order = Object.values(result).filter(w=>w.parent == 'target').sort((a, b)=>a.z - b.z).map(w=>w.id);
  await t.expect(order).eql([ 'c1', 'c2', 'c3', 'c4', 'c5', 'c6' ]);
});

// In a vertical multipleSpread fan, dropping over the second card inserts at
// that y-derived fan position. This also exercises the vertical shadow slot.
test('layout multipleSpread inserts within a vertical fan', async t => {
  const state = {
    deck1: deck,
    src: { id: 'src', type: 'holder', x: 0, y: 0 },
    target: { id: 'target', type: 'holder', x: 500, y: 0, width: 250, height: 400,
      layout: 'multipleSpread', stackOffsetX: 0, stackOffsetY: 30 },
    group: { id: 'group', type: 'pile', parent: 'target', x: 4, y: 4, width: 100, height: 210 },
    c1: card('c1', 'group', 1),
    c2: card('c2', 'group', 2),
    c3: card('c3', 'group', 3),
    incoming: card('incoming', 'src', 1)
  };
  await setRoomState(state);
  await ClientFunction(prepareClient)();
  await setName(t);
  await t.dragToElement('#w_incoming', '#w_c2');
  const result = await waitForState(s=>s.incoming.parent == 'group');
  const order = [ result.c1, result.c2, result.c3, result.incoming ].sort((a, b)=>a.z - b.z).map(w=>w.id);
  await t.expect(order).eql([ 'c1', 'incoming', 'c2', 'c3' ]);
});
