import { ClientFunction, Selector } from 'testcafe';

import { getState, prepareClient, setName, setRoomState, setupTestEnvironment } from './test-util.js';

setupTestEnvironment();

const player = 'TestCafe';

function selectRoom(multiSelectMax) {
  const state = {
    deck: { id: 'deck', type: 'deck', cardTypes: { plain: {} }, x: 50, y: 100 },
    hand: { id: 'hand', type: 'holder', multiSelectMax, stackOffsetX: 120, x: 50, y: 600, width: 700, height: 180 },
    table: { id: 'table', type: 'holder', stackOffsetX: 120, x: 50, y: 300, width: 700, height: 180 }
  };
  for(const [ index, card ] of [ 'card1', 'card2', 'card3' ].entries())
    state[card] = { id: card, type: 'card', deck: 'deck', cardType: 'plain', parent: 'hand', x: 4+index*120, y: 4, z: index+1 };
  return state;
}

async function expectEventually(t, get, expected) {
  let actual = null;
  for(let wait=50; wait<1000; wait*=2) {
    actual = await get();
    if(JSON.stringify(actual) == JSON.stringify(expected))
      break;
    await new Promise(resolve=>setTimeout(resolve, wait));
  }
  await t.expect(actual).eql(expected);
}

async function selectedCards() {
  return Object.values(JSON.parse(await getState())).filter(w=>(w.selectedBy || []).indexOf(player) != -1).map(w=>w.id).sort();
}

async function cardsIn(holder) {
  return Object.values(JSON.parse(await getState())).filter(w=>w.type == 'card' && w.parent == holder).map(w=>w.id).sort();
}

async function openRoom(t, multiSelectMax) {
  await setRoomState(selectRoom(multiSelectMax));
  await ClientFunction(prepareClient)();
  await setName(t, player);
  await expectEventually(t, ()=>cardsIn('hand'), [ 'card1', 'card2', 'card3' ]);
}

test('Clicking cards in a holder with multiSelectMax selects them', async t => {
  await openRoom(t, 2);

  await t.click('#w_card1');
  await expectEventually(t, selectedCards, [ 'card1' ]);
  await t.expect(Selector('#w_card1').hasClass('multiSelected')).ok();

  await t.click('#w_card2');
  await expectEventually(t, selectedCards, [ 'card1', 'card2' ]);

  // the limit is reached, so the third card is not added to the selection
  await t.click('#w_card3');
  await expectEventually(t, selectedCards, [ 'card1', 'card2' ]);

  // clicking a selected card again deselects it
  await t.click('#w_card1');
  await expectEventually(t, selectedCards, [ 'card2' ]);
});

test('multiSelectMax 1 replaces the previous selection', async t => {
  await openRoom(t, 1);

  await t.click('#w_card1');
  await expectEventually(t, selectedCards, [ 'card1' ]);
  await t.click('#w_card2');
  await expectEventually(t, selectedCards, [ 'card2' ]);
});

test('Dragging one selected card takes the rest of the selection along', async t => {
  await openRoom(t, 'all');

  await t.click('#w_card1');
  await t.click('#w_card3');
  await expectEventually(t, selectedCards, [ 'card1', 'card3' ]);

  await t.dragToElement('#w_card1', '#w_table');
  await expectEventually(t, ()=>cardsIn('table'), [ 'card1', 'card3' ]);
  await expectEventually(t, ()=>cardsIn('hand'), [ 'card2' ]);
  // leaving the holder that offers the selection ends it
  await expectEventually(t, selectedCards, []);
});
