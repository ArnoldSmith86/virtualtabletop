import { ClientFunction, Selector } from 'testcafe';

import { getMeta, getStateObject, prepareClient, setName, setRoomState, setupTestEnvironment, waitForStableState } from './test-util.js';

setupTestEnvironment();

// A board of two seats over two named rounds, so that every cell is in the
// table from the start and can be addressed by the seat and round it holds.
async function roomWithBoard(t, board={}, scores={ seat1: [ 12, 7 ], seat2: [ 9, 11 ] }) {
  const version = (await getMeta()).version;
  await setRoomState({
    _meta: { version },
    seat1: { id: 'seat1', type: 'seat', index: 1, player: 'Alice', score: scores.seat1 },
    seat2: { id: 'seat2', type: 'seat', index: 2, player: 'Bob', score: scores.seat2 },
    board: { id: 'board', type: 'scoreboard', x: 100, y: 100, width: 400, height: 300, clickable: true, rounds: [ 'R1', 'R2' ], showAllRounds: true, ...board }
  });
  await ClientFunction(prepareClient)();
  // the game list covers the room until a player has joined
  await setName(t);
  await waitForStableState();
}

function cell(seat, round) {
  return Selector(`#w_board td.scoreCell[data-seat="${seat}"][data-round="${round}"]`);
}

async function scores() {
  const state = await waitForStableState();
  const room = JSON.parse(state);
  return { seat1: room.seat1.score, seat2: room.seat2.score };
}

test('Clicking a cell types the score of that seat and round into it', async t => {
  await t.resizeWindow(1280, 800);
  await roomWithBoard(t);
  await t
    .click(cell('seat1', 2))
    .expect(Selector('#w_board input.scoreCellInput').exists).ok()
    .typeText('#w_board input.scoreCellInput', '10+15+8-5', { replace: true })
    .pressKey('enter');
  // the arithmetic the grid conditions and dragLimit speak is added up
  await t.expect((await scores()).seat1).eql([ 12, 28 ]);
  // Enter goes on to the same round of the next seat
  await t
    .expect(Selector('#w_board td.scoreCell[data-seat="seat2"][data-round="2"] input').exists).ok()
    .typeText('#w_board input.scoreCellInput', '5', { replace: true })
    .pressKey('enter');
  await t.expect((await scores()).seat2).eql([ 9, 5 ]);
});

test('An entry left empty erases the score again', async t => {
  await t.resizeWindow(1280, 800);
  await roomWithBoard(t);
  // the score a cell already holds is selected when the entry opens, so one
  // Delete is all it takes to empty it
  await t
    .click(cell('seat1', 1))
    .pressKey('delete')
    .expect(Selector('#w_board input.scoreCellInput').value).eql('')
    .pressKey('enter');
  await t.expect((await scores()).seat1).eql([ '', 7 ]);
});

test('Escape leaves the score the cell had', async t => {
  await t.resizeWindow(1280, 800);
  await roomWithBoard(t);
  await t
    .click(cell('seat1', 1))
    .typeText('#w_board input.scoreCellInput', '99', { replace: true })
    .pressKey('esc')
    .expect(Selector('#w_board input.scoreCellInput').exists).notOk();
  await t.expect((await scores()).seat1).eql([ 12, 7 ]);
});

test('A click that is not on a cell opens the edit pane, even after one that was', async t => {
  await t.resizeWindow(1280, 800);
  await roomWithBoard(t, { hotkey: 's' });
  const pane = Selector('#buttonInputOverlay');
  // a cancelled entry must not leave the cell behind for the next click to find
  await t
    .click(cell('seat1', 1))
    .pressKey('esc')
    .pressKey('s')
    .expect(pane.visible).ok()
    .expect(Selector('#w_board input.scoreCellInput').exists).notOk()
    .click('#buttonInputCancel')
    .expect(pane.visible).notOk();
  // a header holds no score of anyone, so it is not a cell either
  await t
    .click(Selector('#w_board td').nth(0))
    .expect(pane.visible).ok();
});

test('The keypad writes and erases the score of the cell it opened on', async t => {
  await t.resizeWindow(1280, 800);
  await roomWithBoard(t, { scoreEntry: 'keypad' });
  const keypad = Selector('.scoreboardKeypad');
  const key = text => keypad.find('button').withExactText(text);
  await t
    .click(cell('seat2', 1))
    .expect(keypad.visible).ok()
    .click(key('C'))
    .click(key('4'))
    .click(key('2'))
    .click(keypad.find('button.enter'))
    .expect(keypad.exists).notOk();
  await t.expect((await scores()).seat2).eql([ 42, 11 ]);
  await t
    .click(cell('seat2', 1))
    .click(key('C'))
    .click(keypad.find('button.enter'));
  await t.expect((await scores()).seat2).eql([ '', 11 ]);
  // a device that has a keyboard as well types straight into the pad, which
  // adds up what it is given
  await t
    .click(cell('seat1', 2))
    .pressKey('1 0')
    .click(key('+'))
    .pressKey('5')
    .expect(keypad.find('.scoreboardKeypadValue').innerText).eql('10+5')
    .pressKey('enter');
  await t.expect((await scores()).seat1).eql([ 12, 15 ]);
});

// The sandbox browser draws overlay scrollbars, which take no room in the layout
// and swallow the press themselves, so the gesture is dispatched at the place a
// classic scrollbar sits: past the client box of the scrolling element.
const pressScrollbar = ClientFunction(() => {
  const scroller = document.querySelector('#w_board .scoreboardIntermediate');
  const box = scroller.getBoundingClientRect();
  const fire = type => scroller.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: box.right-1, clientY: box.top + box.height/2, buttons: 1 }));
  fire('mousedown');
  fire('mousemove');
  fire('mouseup');
});

const wheelOver = ClientFunction(selector => {
  const element = document.querySelector(selector);
  const box = element.getBoundingClientRect();
  const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 100, clientX: box.left + box.width/2, clientY: box.top + box.height/2 });
  element.dispatchEvent(event);
  return event.defaultPrevented;
});

test('Dragging the scrollbar of a scoreboard scrolls it and nothing else', async t => {
  await t.resizeWindow(1280, 800);
  // more rounds than the board is tall, so the table scrolls
  await roomWithBoard(t, { height: 120, rounds: [ 'R1', 'R2' ], showAllRounds: true }, { seat1: [ 12, 7, 4, 8, 3, 9 ], seat2: [ 9, 11, 5, 2, 6, 1 ] });
  await pressScrollbar();
  await t
    .expect(Selector('#buttonInputOverlay').visible).notOk()
    .expect(Selector('#w_board input.scoreCellInput').exists).notOk()
    .expect(Selector('.scoreboardKeypad').exists).notOk();
});

test('The wheel scrolls a scoreboard that has a scrollbar instead of zooming the room', async t => {
  await t.resizeWindow(1280, 800);
  await roomWithBoard(t, { height: 120, rounds: [ 'R1', 'R2' ], showAllRounds: true }, { seat1: [ 12, 7, 4, 8, 3, 9 ], seat2: [ 9, 11, 5, 2, 6, 1 ] });
  // the room zoom takes the wheel everywhere else, which is what preventing the
  // default says - over the scrolling table it leaves it to the browser
  await t.expect(await wheelOver('#w_board .scoreboardIntermediate')).notOk();
  await t.expect(await wheelOver('#roomArea')).ok();
});
