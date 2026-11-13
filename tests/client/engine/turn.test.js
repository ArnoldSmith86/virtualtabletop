import { runRoutine, routineState } from './harness.js';
import { forEachLegacy } from './matrix.js';

// four seated players with the turn on the first seat. skipped names the seats that carry
// skipTurn - the current seat being one of them is what the offset in the operation is for
const state = (skipped = []) => routineState(Object.fromEntries([ 1, 2, 3, 4 ].map(index => [
  `seat${index}`,
  { type: 'seat', index, player: `Player ${index}`, turn: index == 1, skipTurn: skipped.indexOf(index) != -1 }
])));

// the seats that have the turn after the operation. A turn value that cannot be resolved used
// to leave the operation without a target and throw, so a rejected routine is a failure here
async function seatsWithTurn(turn, { skipped = [], legacy } = {}) {
  const result = await runRoutine(state(skipped), [ Object.assign({ func: 'TURN' }, turn) ], { legacy });
  return Object.values(result.state).filter(w => w.type == 'seat' && w.turn).map(w => w.id).sort();
}

forEachLegacy(({ name, legacy }) => {
  describe(`TURN [${name}]`, () => {
    test('a negative turn cycles the other way around the seats', async () => {
      expect(await seatsWithTurn({ turn: -1 }, { legacy })).toEqual([ 'seat4' ]);
    });

    test('a negative turn of more than one step wraps around the seats', async () => {
      expect(await seatsWithTurn({ turn: -2 }, { legacy })).toEqual([ 'seat3' ]);
    });

    // the seat that has the turn is not in the list a negative turn counts back over, so
    // counting it as a step - the way counting forward has to - would skip a seat
    test('a negative turn steps back one seat from a skipped current seat', async () => {
      expect(await seatsWithTurn({ turn: -1 }, { skipped: [ 1 ], legacy })).toEqual([ 'seat4' ]);
    });

    test('a negative turn matches turnCycle backward on a skipped current seat', async () => {
      expect(await seatsWithTurn({ turnCycle: 'backward', turn: 1 }, { skipped: [ 1 ], legacy })).toEqual([ 'seat4' ]);
    });

    test('a positive turn skips the current seat as before', async () => {
      expect(await seatsWithTurn({ turn: 1 }, { skipped: [ 1 ], legacy })).toEqual([ 'seat2' ]);
    });

    test('turnCycle position counts a negative turn from the last seat', async () => {
      expect(await seatsWithTurn({ turnCycle: 'position', turn: -1 }, { legacy })).toEqual([ 'seat4' ]);
    });

    test('turnCycle position and turn -2 select the seat before the last one', async () => {
      expect(await seatsWithTurn({ turnCycle: 'position', turn: -2 }, { legacy })).toEqual([ 'seat3' ]);
    });

    // positions are counted over the seats that are not skipped, so the last position is the
    // last seat without skipTurn - not the last seat of the collection
    test('turnCycle position counts a negative turn over the unskipped seats', async () => {
      expect(await seatsWithTurn({ turnCycle: 'position', turn: -1 }, { skipped: [ 4 ], legacy })).toEqual([ 'seat3' ]);
    });

    test('turnCycle position and turn 0 leave the turn on the first seat', async () => {
      expect(await seatsWithTurn({ turnCycle: 'position', turn: 0 }, { legacy })).toEqual([ 'seat1' ]);
    });

    test('a fractional turn cuts off the fraction', async () => {
      expect(await seatsWithTurn({ turn: -1.5 }, { legacy })).toEqual([ 'seat4' ]);
    });

    test('a numeric string turn steps as many seats as the number', async () => {
      expect(await seatsWithTurn({ turn: '2' }, { legacy })).toEqual([ 'seat3' ]);
    });
  });
});
