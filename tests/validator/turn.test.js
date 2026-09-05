import { validateGameFile } from '../../validator/validate_gamefile.js';

// TURN reads 'turn' in two completely different ways: with turnCycle 'seat' it is the id
// of the seat that gets the turn, everywhere else it counts seats. Naming a seat where a
// number is expected - or a number/'first'/'last' where a seat id is expected - is not a
// value the engine works with: seat mode looks the id up among the seats and falls back to
// the first one after reporting a problem (see TURN in client/js/widgets/widget.js).
function turnProblems(operation, extraWidgets = {}) {
  const game = Object.assign({
    button1: { id: 'button1', type: 'button', clickRoutine: [ operation ] },
    seat1: { id: 'seat1', type: 'seat', index: 1 },
    seat2: { id: 'seat2', type: 'seat', index: 2 }
  }, extraWidgets);
  return validateGameFile(game, false).filter(p=>p.property.join('.') == 'clickRoutine.0.turn').map(p=>p.message);
}

describe("TURN's turn value", () => {
  test('takes a whole number, first or last while counting seats', () => {
    for(const turnCycle of [ undefined, 'forward', 'backward', 'position', 'random' ])
      for(const turn of [ 1, 3, -1, 'first', 'last' ])
        expect(turnProblems({ func: 'TURN', turnCycle, turn })).toEqual([]);
  });

  test('rejects a seat id where seats are counted', () => {
    expect(turnProblems({ func: 'TURN', turnCycle: 'position', turn: 'seat2' })).toEqual([
      "'seat2' is neither a whole number, 'first' nor 'last' - turn names a seat by its id only with turnCycle 'seat'"
    ]);
  });

  test('takes the id of a seat with turnCycle seat', () => {
    expect(turnProblems({ func: 'TURN', turnCycle: 'seat', turn: 'seat2' })).toEqual([]);
  });

  test('rejects a widget that is not a seat with turnCycle seat', () => {
    expect(turnProblems({ func: 'TURN', turnCycle: 'seat', turn: 'button1' })).toEqual([
      "'button1' is not a valid widget type (found button - valid types: seat) - with turnCycle 'seat', turn gives the turn to the seat with that id"
    ]);
    expect(turnProblems({ func: 'TURN', turnCycle: 'seat', turn: 'seat3' })).toEqual([
      "'seat3' is not a widget - with turnCycle 'seat', turn gives the turn to the seat with that id"
    ]);
  });

  test('rejects first, last and a number with turnCycle seat', () => {
    for(const turn of [ 'first', 'last', 2 ])
      expect(turnProblems({ func: 'TURN', turnCycle: 'seat', turn })).toEqual([
        `'${turn}' is not a widget - with turnCycle 'seat', turn gives the turn to the seat with that id`
      ]);
  });

  test('is left alone when the turn cycle is only known at runtime', () => {
    expect(turnProblems({ func: 'TURN', turnCycle: '${PROPERTY cycle}', turn: 'seat2' })).toEqual([]);
    expect(turnProblems({ func: 'TURN', turnCycle: '${PROPERTY cycle}', turn: 3 })).toEqual([]);
  });
});
