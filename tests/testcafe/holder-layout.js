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

// Rearranging cards inside a multipleSpread holder must not run its onLeave: the
// drag takes the card out of its group before it is dropped, and a hand that
// flips cards face up on entry would hand it back face down. A card that really
// is dragged off the holder still gets onLeave.
test('rearranging within a multipleSpread holder does not apply onLeave', async t => {
  const state = {
    deck1: deck,
    hand: { id: 'hand', type: 'holder', x: 500, y: 0, width: 600, height: 200,
      layout: 'multipleSpread', stackOffsetX: 25,
      onEnter: { activeFace: 1 }, onLeave: { activeFace: 0 } },
    group: { id: 'group', type: 'pile', parent: 'hand', x: 4, y: 4, width: 153, height: 160 },
    c1: { ...card('c1', 'group', 1), activeFace: 1 },
    c2: { ...card('c2', 'group', 2), x: 25, activeFace: 1 },
    c3: { ...card('c3', 'group', 3), x: 50, activeFace: 1 }
  };
  await setRoomState(state);
  await ClientFunction(prepareClient)();
  await setName(t);

  // out of the group, but dropped in an empty spot of the same holder
  await t.drag('#w_c3', 300, 0);
  let result = await waitForState(s=>s.c3.parent == 'hand');
  await t.expect(result.c3.activeFace).eql(1, 'a card regrouped inside the hand stays face up');

  // off the holder entirely - this one does leave
  await t.drag('#w_c3', 0, 400);
  result = await waitForState(s=>!s.c3.parent);
  await t.expect(result.c3.activeFace || 0).eql(0, 'a card dragged out of the hand is flipped by onLeave');
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
    c2: { ...card('c2', 'group', 2), y: 30 },
    c3: { ...card('c3', 'group', 3), y: 60 },
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

// SORT groupBy makes one spread group per distinct value even when the sort key
// interleaves those values: sorting by rank puts a heart between the two clubs,
// which must still come out as one heart group and one club group.
test('SORT groupBy makes one group per value, not one per run', async t => {
  const state = {
    deck1: deck,
    hand: { id: 'hand', type: 'holder', x: 500, y: 0, width: 600, height: 200,
      layout: 'multipleSpread', stackOffsetX: 25 },
    sorter: { id: 'sorter', type: 'button', x: 1200, y: 0, text: 'sort',
      clickRoutine: [ { func: 'SORT', holder: 'hand', key: 'rank', groupBy: 'suit' } ] }
  };
  const cards = [ [ 'hearts', 1 ], [ 'clubs', 1 ], [ 'hearts', 2 ], [ 'clubs', 2 ] ];
  cards.forEach(([ suit, rank ], i)=>{
    state[`c${i+1}`] = Object.assign(card(`c${i+1}`, 'hand', i+1), { suit, rank, x: i*140 });
  });
  await setRoomState(state);
  await ClientFunction(prepareClient)();
  await setName(t);
  await t.click('#w_sorter');

  const result = await waitForState(s=>Object.values(s).filter(w=>w.type == 'pile').length >= 2);
  const piles = Object.values(result).filter(w=>w.type == 'pile');
  await t.expect(piles.length).eql(2, 'one group per suit');
  const groups = piles.map(p=>Object.values(result).filter(w=>w.parent == p.id).sort((a, b)=>a.z - b.z));
  const asText = groups.map(g=>g.map(c=>`${c.suit}${c.rank}`).join(',')).sort();
  await t.expect(asText).eql([ 'clubs1,clubs2', 'hearts1,hearts2' ]);
});

// A game may still write the legacy alignChildren property while it runs, and
// the file updater replaced an authored alignChildren:false with
// layout:'freeform'. Setting alignChildren must hand the decision back to that
// property instead of leaving the holder stuck with the migrated layout.
test('a routine can switch alignChildren back on after the layout migration', async t => {
  const state = {
    deck1: deck,
    src: { id: 'src', type: 'holder', x: 0, y: 0, alignChildren: false },
    target: { id: 'target', type: 'holder', x: 500, y: 0, layout: 'freeform' },
    dropper: { id: 'dropper', type: 'button', x: 1000, y: 0, text: 'drop',
      clickRoutine: [ { func: 'MOVE', from: 'src', to: 'target', count: 1 } ] },
    aligner: { id: 'aligner', type: 'button', x: 1000, y: 100, text: 'align',
      clickRoutine: [
        { func: 'SELECT', property: 'id', value: 'target' },
        { func: 'SET', property: 'alignChildren', value: true }
      ] },
    c1: Object.assign(card('c1', 'src', 1), { x: 37, y: 53 }),
    c2: Object.assign(card('c2', 'src', 2), { x: 37, y: 53 })
  };
  await setRoomState(state);
  await ClientFunction(prepareClient)();
  await setName(t);

  // as saved, the migrated holder still leaves the card where it came from: the
  // card stays at x 37 of the room, which is 463 to the left of the holder
  await t.click('#w_dropper');
  let result = await waitForState(s=>s.c2.parent == 'target');
  await t.expect(result.c2.x).eql(-463, 'the migrated freeform holder does not align');

  await t.click('#w_aligner');
  await t.click('#w_dropper');
  result = await waitForState(s=>s.c1.parent == 'target');
  await t.expect(result.c1.x).eql(4, 'alignChildren:true aligns the holder again');
  await t.expect(result.c1.y).eql(4);
});
