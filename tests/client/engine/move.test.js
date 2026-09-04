import { runRoutine, routineState } from './harness.js';
import { forEachLegacy } from './matrix.js';

// Only structural results are asserted here: jsdom has no layout, so the harness cannot say
// anything meaningful about coordinates (see harness.js).
const state = () => routineState({
  h1: { type: 'widget' },
  h2: { type: 'widget' },
  c1: { type: 'widget', parent: 'h1' },
  c2: { type: 'widget', parent: 'h1' },
  c3: { type: 'widget', parent: 'h1' }
});

const selectChildren = { func: 'SELECT', type: 'widget', property: 'parent', value: 'h1' };

async function parents(operation, legacy, prefix = [ selectChildren ]) {
  const result = await runRoutine(state(), [ ...prefix, operation ], { legacy });
  return [ 'c1', 'c2', 'c3' ].map(id => result.state[id].parent);
}

forEachLegacy(({ name, legacy }) => {
  describe(`MOVE [${name}]`, () => {
    test('moves the whole collection by default', async () => {
      expect(await parents({ func: 'MOVE', to: 'h2' }, legacy)).toEqual([ 'h2', 'h2', 'h2' ]);
    });

    test('count limits how many widgets move', async () => {
      expect(await parents({ func: 'MOVE', to: 'h2', count: 1 }, legacy)).toEqual([ 'h2', 'h1', 'h1' ]);
      expect(await parents({ func: 'MOVE', to: 'h2', count: 2 }, legacy)).toEqual([ 'h2', 'h2', 'h1' ]);
      expect(await parents({ func: 'MOVE', to: 'h2', count: '2' }, legacy)).toEqual([ 'h2', 'h2', 'h1' ]);
    });

    test('count:0 moves nothing - it is not read as "unset"', async () => {
      expect(await parents({ func: 'MOVE', to: 'h2', count: 0 }, legacy)).toEqual([ 'h1', 'h1', 'h1' ]);
    });

    test('fillTo stops once the target holds that many widgets', async () => {
      expect(await parents({ func: 'MOVE', to: 'h2', fillTo: 1 }, legacy)).toEqual([ 'h2', 'h1', 'h1' ]);
      expect(await parents({ func: 'MOVE', to: 'h2', fillTo: 2 }, legacy)).toEqual([ 'h2', 'h2', 'h1' ]);
    });

    // https://github.com/ArnoldSmith86/virtualtabletop/issues/2990: `a.fillTo || a.count` reads
    // fillTo:0 as "no fillTo given", so a move that should have been refused moves everything.
    // Same family as issue #3059.6 - see falsy-vs-omitted.test.js for the systematic version.
    test('fillTo:0 currently moves everything (issue #2990)', async () => {
      expect(await parents({ func: 'MOVE', to: 'h2', fillTo: 0 }, legacy)).toEqual([ 'h2', 'h2', 'h2' ]);
    });

    test('from moves one widget out of a holder by default', async () => {
      expect(await parents({ func: 'MOVE', from: 'h1', to: 'h2' }, legacy, [])).toEqual([ 'h2', 'h1', 'h1' ]);
    });

    test('from with count:"all" empties the holder', async () => {
      expect(await parents({ func: 'MOVE', from: 'h1', to: 'h2', count: 'all' }, legacy, [])).toEqual([ 'h2', 'h2', 'h2' ]);
    });

    test('a target that does not exist leaves everything alone', async () => {
      expect(await parents({ func: 'MOVE', to: 'nowhere' }, legacy)).toEqual([ 'h1', 'h1', 'h1' ]);
    });

    test('a widget is not moved into itself', async () => {
      const result = await runRoutine(state(), [
        { func: 'SELECT', type: 'widget', property: 'id', value: 'h1' },
        { func: 'MOVE', to: 'h1' }
      ], { legacy });
      expect(result.state.h1.parent).toBe(undefined);
    });
  });
});
