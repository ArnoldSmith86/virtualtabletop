import { widgets, widgetFilter, addWidget, batchStart, batchEnd } from '../../client/js/serverstate.js';
import { Widget } from '../../client/js/widgets/widget.js';

import { removeWidget } from './client-util.js';

// scoreboard.js reads the room and the delta helpers from the concatenated
// scope of the shipped bundle rather than from imports, so they are globals
// here - and the surfaces it opens are plain DOM in the room area.
let Scoreboard;
beforeAll(async () => {
  globalThis.widgets = widgets;
  globalThis.widgetFilter = widgetFilter;
  globalThis.playerName = 'jestPlayer';
  globalThis.batchStart = batchStart;
  globalThis.batchEnd = batchEnd;
  globalThis.setDeltaCause = () => {};
  globalThis.contrastAnyColor = () => '#000000';
  globalThis.mapAssetURLs = css => css;
  ({ Scoreboard } = await import('../../client/js/widgets/scoreboard.js'));
});

// A seat is only read for its player, its color and its score here, so a plain
// widget of type seat keeps Seat's own DOM out of the picture.
function seat(id, index, score) {
  const widget = new Widget(id);
  addWidget({ id, type: 'seat', index, player: `Player ${index}`, color: '#336699', ...(score === undefined ? {} : { score }) }, widget);
  return widget;
}

function scoreboard(properties = {}) {
  const widget = new Scoreboard('board');
  addWidget({ id: 'board', type: 'scoreboard', ...properties }, widget);
  return widget;
}

const cells = board => [ ...board.tableDOM.querySelectorAll('td') ];
const enterable = board => cells(board).filter(td=>td.classList.contains('scoreCell')).map(td=>`${td.dataset.seat}/${td.dataset.round || 'total'}`);

afterEach(() => {
  for(const id of [ ...widgets.keys() ])
    removeWidget(id);
  localStorage.removeItem('scoreEntry');
  document.body.classList.remove('overlayActive');
  delete globalThis.matchMedia;
});

describe('which surface a cell opens', () => {
  test('a board that names one gets it, whatever the device says', () => {
    globalThis.matchMedia = _=>({ matches: true });
    for(const mode of [ 'keypad', 'pane', 'type' ])
      expect(scoreboard({ scoreEntry: mode }).scoreEntryMode()).toBe(mode);
  });

  test('auto asks the device: a finger gets the keypad, a keyboard the cell', () => {
    const board = scoreboard();
    expect(board.get('scoreEntry')).toBe('auto');
    globalThis.matchMedia = query=>({ matches: query == '(pointer: coarse)' });
    expect(board.scoreEntryMode()).toBe('keypad');
    globalThis.matchMedia = _=>({ matches: false });
    expect(board.scoreEntryMode()).toBe('type');
  });

  test('the player overrules auto for this browser, but not a board that chose', () => {
    globalThis.matchMedia = _=>({ matches: true });
    const auto = scoreboard();
    auto.pinPlayerScoreEntry('type');
    expect(localStorage.getItem('scoreEntry')).toBe('type');
    expect(auto.scoreEntryMode()).toBe('type');
    removeWidget('board');
    expect(scoreboard({ scoreEntry: 'keypad' }).scoreEntryMode()).toBe('keypad');
  });
});

describe('the cells of the table', () => {
  test('are addressed by seat and round, and only score cells can be entered', () => {
    seat('seat1', 1, [ 12, 7 ]);
    seat('seat2', 2, [ 9, 11 ]);
    const board = scoreboard({ rounds: [ 'R1', 'R2' ], showAllRounds: true });
    expect(enterable(board)).toEqual([ 'seat1/1', 'seat2/1', 'seat1/2', 'seat2/2' ]);
    // the totals are computed, so they are addressed but not enterable
    const total = cells(board).find(td=>td.dataset.seat == 'seat1' && td.dataset.total !== undefined);
    expect(total.classList.contains('scoreCell')).toBe(false);
  });

  test('are left inert on a printed table and on a board with a clickRoutine', async () => {
    seat('seat1', 1, [ 12 ]);
    const board = scoreboard({ rounds: [ 'R1' ], showAllRounds: true, clickable: false });
    expect(enterable(board)).toEqual([]);
    await board.set('clickable', true);
    expect(enterable(board)).toEqual([ 'seat1/1' ]);
    await board.set('clickRoutine', [ { func: 'LABEL', value: 1 } ]);
    expect(enterable(board)).toEqual([]);
  });

  test('are the rounds that have been scored, and no empty one on top of them', async () => {
    const seat1 = seat('seat1', 1, [ 12 ]);
    seat('seat2', 2, [ 9 ]);
    const board = scoreboard();
    expect(enterable(board)).toEqual([ 'seat1/1', 'seat2/1' ]);
    // the table grows with the seat that is furthest ahead, so a seat the others
    // are waiting for never keeps a scored round out of it
    await seat1.set('score', [ 12, 5 ]);
    board.updateTable();
    expect(enterable(board)).toEqual([ 'seat1/1', 'seat2/1', 'seat1/2', 'seat2/2' ]);
  });

  test('are a single score per seat on a board no round has been scored on', () => {
    seat('seat1', 1);
    const board = scoreboard();
    expect(enterable(board)).toEqual([ 'seat1/total' ]);
  });

  test('keep the table they have always had on a board that asks for the pane', () => {
    seat('seat1', 1, [ 12 ]);
    seat('seat2', 2, [ 9 ]);
    // the pane picks the round it writes itself, so no extra row is offered -
    // the cells are still addressed, so a click on one prefills the pane
    const board = scoreboard({ scoreEntry: 'pane' });
    expect(enterable(board)).toEqual([ 'seat1/1', 'seat2/1' ]);
  });
});

describe('the button that starts the next round', () => {
  const addRound = board => board.tableDOM.querySelector('button.addRound');

  test('adds a round nobody has scored, without writing to any seat', () => {
    const seat1 = seat('seat1', 1, [ 12 ]);
    seat('seat2', 2, [ 9 ]);
    const board = scoreboard();
    addRound(board).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(enterable(board)).toEqual([ 'seat1/1', 'seat2/1', 'seat1/2', 'seat2/2' ]);
    expect(seat1.get('score')).toEqual([ 12 ]);
    // and it is still there to start the round after that one
    addRound(board).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(enterable(board)).toContain('seat1/3');
  });

  test('is named with the label the round column carries', () => {
    seat('seat1', 1, [ 12 ]);
    const board = scoreboard({ roundLabel: 'Deal' });
    expect(addRound(board).textContent).toBe('Deal');
    expect(addRound(board).title).toBe('New Deal');
  });

  test('sits under the sheet, above the totals line', () => {
    seat('seat1', 1, [ 12 ]);
    const board = scoreboard();
    const rows = [ ...board.tableDOM.rows ];
    expect(rows[rows.length-1].cells[0].innerText).toBe('Totals');
    expect(rows[rows.length-2].querySelector('button.addRound')).not.toBe(null);
  });

  test('is not offered where a click does not enter a cell', async () => {
    seat('seat1', 1, [ 12 ]);
    // the pane offers the next round in its round list, so a board that asks
    // for it needs no button - nor does a printed table
    expect(addRound(scoreboard({ scoreEntry: 'pane' }))).toBe(null);
    removeWidget('board');
    expect(addRound(scoreboard({ clickable: false }))).toBe(null);
  });

  test('is not offered on a board that adds its seats up in teams', () => {
    seat('seat1', 1, [ 12 ]);
    seat('seat2', 2, [ 9 ]);
    // a team column is the sum of the seats in it, so there is no cell to enter
    // a round in and nothing for a new one to offer
    expect(addRound(scoreboard({ seats: { Reds: [ 'seat1' ], Blues: [ 'seat2' ] } }))).toBe(null);
  });

  test('is not offered on a board that has no rounds at all', () => {
    seat('seat1', 1);
    // a single score per seat is the shape that board was written in: the round
    // it would add is a different table, not the next line of this one
    expect(addRound(scoreboard())).toBe(null);
  });

  test('stops at the last round the game names', () => {
    seat('seat1', 1, [ 12 ]);
    const board = scoreboard({ rounds: [ 'R1', 'R2' ] });
    addRound(board).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(enterable(board)).toEqual([ 'seat1/1', 'seat1/2' ]);
    expect(addRound(board)).toBe(null);
    board.addRound(3);
    expect(enterable(board)).toEqual([ 'seat1/1', 'seat1/2' ]);
  });

  test('is not offered at all where the game names every round it shows', () => {
    seat('seat1', 1, [ 12 ]);
    expect(addRound(scoreboard({ rounds: [ 'R1', 'R2' ], showAllRounds: true }))).toBe(null);
  });
});

describe('the cell a press landed on', () => {
  function press(element) {
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  }

  test('is read once, so the click after it is the only one it answers', () => {
    seat('seat1', 1, [ 12 ]);
    const board = scoreboard();
    const cell = board.cellFor('seat1', 1);
    press(cell);
    expect(board.pressedCell()).toBe(cell);
    // a hotkey or a CLICK operation reaches click() without a press of ours
    expect(board.pressedCell()).toBe(null);
  });

  test('is forgotten by a press that missed the table', () => {
    seat('seat1', 1, [ 12 ]);
    const board = scoreboard();
    press(board.cellFor('seat1', 1));
    press(board.domElement);
    expect(board.pressedCell()).toBe(null);
  });

  // committing a cell that was typed into rebuilds the table, which happens
  // between the press and the click when the commit is a click on another cell
  test('survives the table being rebuilt under it', () => {
    seat('seat1', 1, [ 12 ]);
    seat('seat2', 2, []);
    const board = scoreboard();
    const cell = board.cellFor('seat2', 1);
    press(cell);
    board.updateTable();
    const found = board.pressedCell();
    expect(found).not.toBe(cell);
    expect(board.cellAddress(found)).toEqual({ seat: widgets.get('seat2'), round: 1 });
  });

  test('survives it for a computed total as well', () => {
    seat('seat1', 1, [ 12 ]);
    const board = scoreboard();
    press(cells(board).find(td=>td.dataset.seat == 'seat1' && td.dataset.total !== undefined));
    board.updateTable();
    const found = board.pressedCell();
    expect(found.dataset.seat).toBe('seat1');
    expect(found.dataset.total).toBe('');
  });

  test('is gone when the rebuilt table no longer has it', () => {
    seat('seat1', 1, [ 12 ]);
    seat('seat2', 2, [ 7 ]);
    const board = scoreboard();
    press(board.cellFor('seat2', 1));
    board.applyDelta({ seats: [ 'seat1' ] });
    expect(board.pressedCell()).toBe(null);
  });
});

describe('entering a score', () => {
  test('writes the round into the score property of the seat', async () => {
    const seat1 = seat('seat1', 1, [ 12, 7 ]);
    const board = scoreboard();
    await board.setCellScore({ seat: seat1, round: 2 }, 42);
    expect(seat1.get('score')).toEqual([ 12, 42 ]);
  });

  test('leaves no hole in a seat that has not scored the earlier rounds', async () => {
    seat('seat1', 1, [ 12, 7, 3 ]);
    const seat2 = seat('seat2', 2, []);
    const board = scoreboard();
    await board.setCellScore({ seat: seat2, round: 3 }, 5);
    expect(seat2.get('score')).toEqual([ '', '', 5 ]);
  });

  test('writes the single score of a board that has no rounds', async () => {
    const seat1 = seat('seat1', 1);
    const board = scoreboard();
    await board.setCellScore({ seat: seat1, round: 0 }, 40);
    expect(seat1.get('score')).toBe(40);
  });

  test('erases the round of a seat when the entry is left empty', async () => {
    const seat1 = seat('seat1', 1, [ 12, 7 ]);
    const board = scoreboard();
    await board.setCellScore({ seat: seat1, round: 2 }, board.parseScore(''));
    expect(seat1.get('score')).toEqual([ 12, '' ]);
  });

  test('reads what was typed as a number, including arithmetic', () => {
    const board = scoreboard();
    expect(board.parseScore('42')).toBe(42);
    expect(board.parseScore('-7.5')).toBe(-7.5);
    expect(board.parseScore('10+15+8-5')).toBe(28);
    // an empty entry erases the cell, text that is not a score writes nothing
    expect(board.parseScore('')).toBe('');
    expect(board.parseScore('  ')).toBe('');
    expect(board.parseScore('twelve')).toBe(null);
  });

  test('adds up what the keypad typed, without stacking operators', () => {
    const board = scoreboard();
    let text = '';
    for(const key of [ '1', '0', '+', '+', '5', '.', '.', '2', '-', '3' ])
      text = board.keypadText(text, key);
    expect(text).toBe('10+5.2-3');
    expect(board.parseScore(text)).toBe(12.2);
  });

  test('opens a keypad entry with a minus, which is a negative score, but not with a plus', () => {
    const board = scoreboard();
    expect(board.keypadText('', '-')).toBe('-');
    expect(board.keypadText('', '+')).toBe('');
    expect(board.parseScore(board.keypadText('-', '7'))).toBe(-7);
  });

  test('types into the open keypad from a physical keyboard', async () => {
    const seat1 = seat('seat1', 1, [ 12 ]);
    const board = scoreboard({ scoreEntry: 'keypad' });
    board.openEntrySurface('keypad', board.cellFor('seat1', 1));
    const press = key => document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    for(const key of [ '9', 'Backspace', '4', ',', '5', '+', '3' ])
      press(key);
    expect(document.querySelector('.scoreboardKeypadValue').textContent).toBe('4.5+3');
    press('Enter');
    await new Promise(resolve=>setTimeout(resolve, 0));
    expect(seat1.get('score')).toEqual([ 7.5 ]);
    expect(document.querySelector('.scoreboardKeypad')).toBe(null);
  });

  test('leaves a key the keypad has no use for to the room', () => {
    seat('seat1', 1, [ 12 ]);
    const board = scoreboard({ scoreEntry: 'keypad' });
    board.openEntrySurface('keypad', board.cellFor('seat1', 1));
    const reaches = key => {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      document.dispatchEvent(event);
      return !event.defaultPrevented;
    };
    // a hotkey of a widget in the room still works, a digit types into the pad
    expect(reaches('s')).toBe(true);
    expect(reaches('5')).toBe(false);
  });

  test('leaves the keyboard to an overlay opened on top of it', () => {
    seat('seat1', 1, [ 12 ]);
    const board = scoreboard({ scoreEntry: 'keypad' });
    board.openEntrySurface('keypad', board.cellFor('seat1', 1));
    // an overlay hides the pad and has fields of its own: the digits, the Enter
    // and the Escape it is typing belong to it
    document.body.classList.add('overlayActive');
    const event = new KeyboardEvent('keydown', { key: '7', bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(document.querySelector('.scoreboardKeypadValue').textContent).toBe('');
    // and so does a key aimed at a field, wherever that field is
    const field = document.body.appendChild(document.createElement('input'));
    document.body.classList.remove('overlayActive');
    field.dispatchEvent(new KeyboardEvent('keydown', { key: '7', bubbles: true, cancelable: true }));
    expect(document.querySelector('.scoreboardKeypadValue').textContent).toBe('');
    field.remove();
  });

  test('keeps an entry it cannot read as a score, instead of dropping it', async () => {
    const seat1 = seat('seat1', 1, [ 12 ]);
    const board = scoreboard({ scoreEntry: 'keypad' });
    board.openEntrySurface('keypad', board.cellFor('seat1', 1));
    for(const key of [ '4', '2', '+' ])
      await board.keypadPress(key);
    const display = document.querySelector('.scoreboardKeypadValue');
    await board.keypadPress('enter');
    // the entry is not finished, so nothing is written and the pad stays open
    // with what was typed on it, marked as the reason nothing happened
    expect(seat1.get('score')).toEqual([ 12 ]);
    expect(document.querySelector('.scoreboardKeypad')).not.toBe(null);
    expect(display.textContent).toBe('42+');
    expect(display.classList.contains('rejected')).toBe(true);
    await board.keypadPress('3');
    expect(display.classList.contains('rejected')).toBe(false);
    await board.keypadPress('enter');
    expect(seat1.get('score')).toEqual([ 45 ]);
  });

  test('names the value the cell holds now beside its entry, not inside it', () => {
    seat('seat1', 1, [ 12 ]);
    const board = scoreboard({ scoreEntry: 'keypad' });
    board.openEntrySurface('keypad', board.cellFor('seat1', 1));
    // pressing enter on an untouched pad erases the cell, so the entry has to
    // read as empty rather than as the value it is about to replace
    expect(document.querySelector('.scoreboardKeypadValue').textContent).toBe('');
    expect(document.querySelector('.scoreboardKeypadCurrent').textContent).toBe('was 12');
  });

  test('carries what has been entered so far to the other surface', () => {
    seat('seat1', 1, [ 12 ]);
    const board = scoreboard({ scoreEntry: 'auto' });
    const cell = board.cellFor('seat1', 1);
    board.openEntrySurface('type', cell, '10+5');
    const input = document.querySelector('input.scoreCellInput');
    input.value = '10+7';
    input.dispatchEvent(new Event('input'));
    document.querySelector('.scoreEntrySwitchBar button.scoreEntrySwitch').click();
    expect(document.querySelector('.scoreboardKeypadValue').textContent).toBe('10+7');
    document.querySelector('.scoreboardKeypadHeader button.scoreEntrySwitch').click();
    expect(document.querySelector('input.scoreCellInput').value).toBe('10+7');
  });

  test('keeps a typed entry that is not a score on the cell it was typed into', async () => {
    const seat1 = seat('seat1', 1, [ 12 ]);
    const board = scoreboard({ scoreEntry: 'type' });
    board.openEntrySurface('type', board.cellFor('seat1', 1));
    const input = document.querySelector('input.scoreCellInput');
    input.value = '5+';
    input.dispatchEvent(new Event('input'));
    await board.commitCellInput(board.entrySurface, 'nextSeat');
    expect(seat1.get('score')).toEqual([ 12 ]);
    expect(document.querySelector('input.scoreCellInput').value).toBe('5+');
    expect(input.classList.contains('rejected')).toBe(true);
    input.value = '5+3';
    input.dispatchEvent(new Event('input'));
    expect(input.classList.contains('rejected')).toBe(false);
    await board.commitCellInput(board.entrySurface, null);
    expect(seat1.get('score')).toEqual([ 8 ]);
  });

  test('puts the caret back where it was when the table is rebuilt under it', () => {
    seat('seat1', 1, [ 12 ]);
    seat('seat2', 2, [ 9 ]);
    const board = scoreboard({ scoreEntry: 'type' });
    board.openEntrySurface('type', board.cellFor('seat1', 1), '123');
    const input = document.querySelector('input.scoreCellInput');
    input.setSelectionRange(2, 2);
    // the score of another seat rebuilds the table while this one is being typed
    board.updateTable();
    const reopened = document.querySelector('input.scoreCellInput');
    expect(reopened.value).toBe('123');
    expect([ reopened.selectionStart, reopened.selectionEnd ]).toEqual([ 2, 2 ]);
  });

  test('takes its surface down with the board it belongs to', () => {
    seat('seat1', 1, [ 12 ]);
    const board = scoreboard();
    board.openEntrySurface('keypad', board.cellFor('seat1', 1));
    expect(document.querySelector('.scoreboardKeypad')).not.toBe(null);
    removeWidget('board');
    expect(document.querySelector('.scoreboardKeypad')).toBe(null);
  });
});
