import { runRoutineCapturingVariables, routineState } from './harness.js';
import { forEachLegacy } from './matrix.js';

const state = () => routineState({
  h1: { type: 'widget' },
  h2: { type: 'widget' },
  c1: { type: 'widget', parent: 'h1', owner: 'alice' },
  c2: { type: 'widget', parent: 'h1', owner: 'bob' },
  c3: { type: 'widget', parent: 'h2', owner: 'alice' }
});

async function counted(routine, legacy) {
  const result = await runRoutineCapturingVariables(state(), routine, [ 'n' ], { legacy });
  return result.captured.n;
}

forEachLegacy(({ name, legacy }) => {
  describe(`COUNT [${name}]`, () => {
    test('counts the widgets in the collection', async () => {
      expect(await counted([
        { func: 'SELECT', type: 'widget', property: 'parent', value: 'h1' },
        { func: 'COUNT', variable: 'n' }
      ], legacy)).toBe(2);
    });

    test('counts the children of a holder', async () => {
      expect(await counted([ { func: 'COUNT', variable: 'n', holder: 'h1' } ], legacy)).toBe(2);
    });

    test('counts the children of several holders', async () => {
      expect(await counted([ { func: 'COUNT', variable: 'n', holder: [ 'h1', 'h2' ] } ], legacy)).toBe(3);
    });

    test('holder wins over collection when both are given', async () => {
      expect(await counted([
        { func: 'SELECT', type: 'widget' },
        { func: 'COUNT', variable: 'n', holder: 'h2' }
      ], legacy)).toBe(1);
    });

    test('owner filters the count, and null is not the same as omitted', async () => {
      const select = { func: 'SELECT', type: 'widget', property: 'parent', value: 'h1' };
      expect(await counted([ select, { func: 'COUNT', variable: 'n', owner: 'alice' } ], legacy)).toBe(1);
      // owner defaults to null, which means "do not filter" rather than "owner is null"
      expect(await counted([ select, { func: 'COUNT', variable: 'n', owner: null } ], legacy)).toBe(2);
      expect(await counted([ select, { func: 'COUNT', variable: 'n' } ], legacy)).toBe(2);
      // ... but a falsy owner that is not null does filter
      expect(await counted([ select, { func: 'COUNT', variable: 'n', owner: '' } ], legacy)).toBe(0);
    });

    test('a holder id that does not exist counts nothing rather than throwing', async () => {
      expect(await counted([ { func: 'COUNT', variable: 'n', holder: 'nowhere' } ], legacy)).toBe(0);
    });

    test('a collection that does not exist leaves the variable untouched', async () => {
      expect(await counted([
        'var n = -1',
        { func: 'COUNT', variable: 'n', collection: 'nope' }
      ], legacy)).toBe(-1);
    });
  });
});
