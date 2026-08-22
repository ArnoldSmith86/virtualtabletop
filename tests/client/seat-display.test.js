import { widgets, addWidget, batchStart, batchEnd, widgetFilter, flushDelta } from '../../client/js/serverstate.js';
import { setText } from '../../client/js/domhelpers.js';
import { Widget } from '../../client/js/widgets/widget.js';

import { removeWidget } from './client-util.js';

// seat.js relies on the concatenated global scope of the shipped bundle rather than
// on imports, so expose the identifiers it references before importing it.
let Seat;
beforeAll(async () => {
  globalThis.Widget = Widget;
  globalThis.widgets = widgets;
  globalThis.widgetFilter = widgetFilter;
  globalThis.batchStart = batchStart;
  globalThis.batchEnd = batchEnd;
  globalThis.flushDelta = flushDelta;
  globalThis.setDeltaCause = () => {};
  globalThis.getMaxZ = () => 0;
  globalThis.updateMaxZ = () => {};
  globalThis.mapAssetURLs = url => url;
  globalThis.setText = setText;
  globalThis.playerName = 'jestPlayer';
  ({ Seat } = await import('../../client/js/widgets/seat.js'));
});

function seatText(def) {
  const seat = new Seat(def.id);
  addWidget({ ...def, type: 'seat' }, seat);
  const text = seat.domElement.textContent;
  removeWidget(def.id);
  return text;
}

// The substitution is a literal one in both directions: the placeholders are plain words
// rather than a syntax, and what they are replaced with is shown exactly as it is - a
// player free to pick their own name must not be able to write replace() patterns.
describe('Scenarios: A seat shows who is sitting on it', () => {
  test('replaces playerName and seatIndex in the seated text', () => {
    expect(seatText({ id: 'seat-seated', index: 3, player: 'Alice', display: 'playerName seatIndex' })).toBe('Alice 3');
  });

  test('replaces seatIndex in the empty text and leaves playerName to the seated one', () => {
    expect(seatText({ id: 'seat-empty', index: 2, display: 'playerName', displayEmpty: 'seat seatIndex is free' })).toBe('seat 2 is free');
  });

  test('replaces every occurrence of a placeholder', () => {
    expect(seatText({ id: 'seat-repeat', index: 7, player: 'Bo', display: 'playerName vs playerName (seatIndex)' })).toBe('Bo vs Bo (7)');
  });

  test('shows a player name containing $ patterns exactly as typed', () => {
    expect(seatText({ id: 'seat-dollar', index: 3, player: 'A$&B$$C', display: 'playerName seatIndex' })).toBe('A$&B$$C 3');
    expect(seatText({ id: 'seat-dollar-quote', index: 1, player: "A$`B$'C", display: 'playerName' })).toBe("A$`B$'C");
  });

  test('shows $ patterns in the text around the placeholders exactly as typed', () => {
    expect(seatText({ id: 'seat-dollar-text', index: 5, player: 'Cy', display: '$& playerName $$ seatIndex' })).toBe('$& Cy $$ 5');
  });
});
