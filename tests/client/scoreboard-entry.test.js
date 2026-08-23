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
  delete globalThis.matchMedia;
});

describe('which surface a cell opens', () => {
  test('a board that names one gets it, whatever the device says', () => {
    globalThis.matchMedia = _=>({ matches: true });
    for(const mode of [ 'cell', 'keypad', 'type' ])
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

  test('gain the next round as soon as every seat has scored the current one', async () => {
    const seat1 = seat('seat1', 1, [ 12 ]);
    seat('seat2', 2, [ 9 ]);
    const board = scoreboard();
    expect(enterable(board)).toEqual([ 'seat1/1', 'seat2/1', 'seat1/2', 'seat2/2' ]);
    await seat1.set('score', [ 12, 5 ]);
    board.updateTable();
    // seat2 is still on round 2, so no round 3 is offered yet
    expect(enterable(board)).toEqual([ 'seat1/1', 'seat2/1', 'seat1/2', 'seat2/2' ]);
  });

  test('are a single score per seat on a board no round has been scored on', () => {
    seat('seat1', 1);
    const board = scoreboard();
    expect(enterable(board)).toEqual([ 'seat1/total' ]);
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

  test('reads what was typed as a number, including arithmetic', () => {
    const board = scoreboard();
    expect(board.parseScore('42')).toBe(42);
    expect(board.parseScore('-7.5')).toBe(-7.5);
    expect(board.parseScore('10+15+8-5')).toBe(28);
    expect(board.parseScore('')).toBe(null);
    expect(board.parseScore('  ')).toBe(null);
    expect(board.parseScore('twelve')).toBe(null);
  });
});
