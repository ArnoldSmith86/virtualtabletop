import { runRoutineCapturingVariables, routineState } from './harness.js';
import { forEachLegacy } from './matrix.js';

// The var expression is the one place where a legacy mode changes the answer rather than just
// the rendering, so these expectations are functions of the combination. Both halves are
// written down: a mode that quietly stopped doing anything would pass a one-sided test.
const state = () => routineState({ 4711: { type: 'label', text: 'numeric id' } });

async function captured(routine, names, legacy) {
  return (await runRoutineCapturingVariables(state(), routine, names, { legacy })).captured;
}

forEachLegacy(({ name, legacy }) => {
  describe(`VAR [${name}]`, () => {
    test('assigns every variable, falsy values included', async () => {
      expect(await captured([
        { func: 'VAR', variables: { a: 0, b: '', c: false, d: null, e: [], f: {} } }
      ], [ 'a', 'b', 'c', 'd', 'e', 'f' ], legacy)).toEqual({ a: 0, b: '', c: false, d: null, e: [], f: {} });
    });

    test('an omitted variables object is a no-op', async () => {
      expect((await captured([ 'var a = 1', { func: 'VAR' }, 'var out = ${a}' ], [ 'out' ], legacy)).out).toBe(1);
    });
  });

  describe(`var expression [${name}]`, () => {
    test('a digits-only string keeps its type unless the legacy mode converts it', async () => {
      const result = await captured([ 'var a = []', "var a = push '1'" ], [ 'a' ], legacy);
      expect(result.a).toEqual(legacy.convertNumericVarParametersToNumbers ? [ 1 ] : [ '1' ]);
    });

    test("'+' converts digits-only strings in both states", async () => {
      expect((await captured([ "var a = + '1' '2'" ], [ 'a' ], legacy)).a).toBe(3);
    });

    test('a stored numeric widget id stays selectable unless it was converted', async () => {
      const result = await captured([
        'var ids = []',
        "var ids = push '4711'",
        { func: 'SELECT', property: 'id', value: '${ids.0}' },
        { func: 'COUNT', variable: 'found' }
      ], [ 'found' ], legacy);
      expect(result.found).toBe(legacy.convertNumericVarParametersToNumbers ? 0 : 1);
    });

    test('omitted compute parameters default to 1 only under the legacy mode', async () => {
      const result = await captured([ 'var sum = +', 'var product = *' ], [ 'sum', 'product' ], legacy);
      expect(result.sum).toBe(legacy.useOneAsDefaultForVarParameters ? 2 : 0);
      expect(result.product).toBe(legacy.useOneAsDefaultForVarParameters ? 1 : 0);
    });

    test('an explicit 0 parameter is used rather than replaced by the default', async () => {
      expect((await captured([ 'var a = + 0 0' ], [ 'a' ], legacy)).a).toBe(0);
      expect((await captured([ 'var a = * 0 5' ], [ 'a' ], legacy)).a).toBe(0);
    });

    test('indexing an array works with both string and numeric indices', async () => {
      const result = await captured([
        "var a = []",
        "var a = push 'x'",
        "var i = 0",
        "var out = ${a.$i}"
      ], [ 'out' ], legacy);
      expect(result.out).toBe('x');
    });

    test('a property reference reads the widget property', async () => {
      expect((await captured([ 'var out = ${PROPERTY text OF 4711}' ], [ 'out' ], legacy)).out).toBe('numeric id');
    });
  });
});
