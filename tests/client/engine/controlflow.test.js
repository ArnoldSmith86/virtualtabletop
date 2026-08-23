import { runRoutine, runRoutineCapturingVariables, routineState } from './harness.js';
import { forEachLegacy } from './matrix.js';

const state = () => routineState({
  h1: { type: 'widget' },
  c1: { type: 'widget', parent: 'h1' },
  c2: { type: 'widget', parent: 'h1' },
  c3: { type: 'widget', parent: 'h1' },
  helper: { type: 'widget', addTenRoutine: [ 'var result = + ${x} 10' ] }
});

const selectChildren = { func: 'SELECT', type: 'widget', property: 'parent', value: 'h1' };

async function captured(routine, names, legacy) {
  return (await runRoutineCapturingVariables(state(), routine, names, { legacy })).captured;
}

const branchOn = condition => [
  'var branch = -1',
  Object.assign({ func: 'IF', thenRoutine: [ 'var branch = 1' ], elseRoutine: [ 'var branch = 0' ] }, condition)
];

forEachLegacy(({ name, legacy }) => {
  describe(`IF [${name}]`, () => {
    test('a truthy condition takes thenRoutine, a falsy one elseRoutine', async () => {
      expect((await captured(branchOn({ condition: 'x' }), [ 'branch' ], legacy)).branch).toBe(1);
      expect((await captured(branchOn({ condition: 0 }), [ 'branch' ], legacy)).branch).toBe(0);
      expect((await captured(branchOn({ condition: '' }), [ 'branch' ], legacy)).branch).toBe(0);
      expect((await captured(branchOn({ condition: false }), [ 'branch' ], legacy)).branch).toBe(0);
      expect((await captured(branchOn({ condition: null }), [ 'branch' ], legacy)).branch).toBe(0);
    });

    test('no condition and no operand1 runs neither branch', async () => {
      expect((await captured(branchOn({}), [ 'branch' ], legacy)).branch).toBe(-1);
    });

    test('operand1/operand2 are compared with relation', async () => {
      expect((await captured(branchOn({ operand1: 2, operand2: 1, relation: '>' }), [ 'branch' ], legacy)).branch).toBe(1);
      expect((await captured(branchOn({ operand1: 1, operand2: 1, relation: '!=' }), [ 'branch' ], legacy)).branch).toBe(0);
    });

    test('an unsupported relation falls back to ==', async () => {
      expect((await captured(branchOn({ operand1: 1, operand2: 1, relation: '~=' }), [ 'branch' ], legacy)).branch).toBe(1);
    });

    test('operand1:0 is compared, not read as missing', async () => {
      expect((await captured(branchOn({ operand1: 0, operand2: 0 }), [ 'branch' ], legacy)).branch).toBe(1);
      expect((await captured(branchOn({ operand1: 0, operand2: 1 }), [ 'branch' ], legacy)).branch).toBe(0);
    });
  });

  describe(`FOREACH [${name}]`, () => {
    test('iterates over the collection', async () => {
      expect((await captured([
        'var iterations = 0',
        selectChildren,
        { func: 'FOREACH', loopRoutine: [ 'var iterations = + ${iterations} 1' ] }
      ], [ 'iterations' ], legacy)).iterations).toBe(3);
    });

    test('iterates over an array, falsy entries included', async () => {
      expect((await captured([
        'var seen = []',
        { func: 'FOREACH', in: [ 0, '', false, null ], loopRoutine: [ 'var seen = push ${value}' ] }
      ], [ 'seen' ], legacy)).seen).toEqual([ 0, '', false, null ]);
    });

    test('an empty array runs the loop zero times', async () => {
      expect((await captured([
        'var iterations = 0',
        selectChildren,
        { func: 'FOREACH', in: [], loopRoutine: [ 'var iterations = + ${iterations} 1' ] }
      ], [ 'iterations' ], legacy)).iterations).toBe(0);
    });

    // https://github.com/ArnoldSmith86/virtualtabletop/issues/3059 (6): `if(a.in)` cannot tell
    // "iterate over nothing" from "no in given", so a falsy in silently iterates the collection
    // instead. An empty array is the only falsy-ish value that behaves.
    test('a falsy in falls back to the collection (issue #3059.6)', async () => {
      expect((await captured([
        'var iterations = 0',
        selectChildren,
        { func: 'FOREACH', in: 0, loopRoutine: [ 'var iterations = + ${iterations} 1' ] }
      ], [ 'iterations' ], legacy)).iterations).toBe(3);
      expect((await captured([
        'var iterations = 0',
        selectChildren,
        { func: 'FOREACH', in: '', loopRoutine: [ 'var iterations = + ${iterations} 1' ] }
      ], [ 'iterations' ], legacy)).iterations).toBe(3);
    });

    test('key and value are restored after the loop', async () => {
      const result = await captured([
        "var value = 'before'",
        { func: 'FOREACH', in: [ 'a' ], loopRoutine: [] }
      ], [ 'value' ], legacy);
      expect(result.value).toBe('before');
    });
  });

  describe(`CALL [${name}]`, () => {
    test('runs another widget\'s routine and returns its result variable', async () => {
      expect((await captured([
        { func: 'CALL', widget: 'helper', routine: 'addTenRoutine', arguments: { x: 5 } },
        'var out = ${result}'
      ], [ 'out' ], legacy)).out).toBe(15);
    });

    test('arguments do not leak back into the caller', async () => {
      expect((await captured([
        'var x = 1',
        { func: 'CALL', widget: 'helper', routine: 'addTenRoutine', arguments: { x: 5 } },
        'var out = ${x}'
      ], [ 'out' ], legacy)).out).toBe(1);
    });

    test('a routine that does not exist yields a null result', async () => {
      expect((await captured([
        { func: 'CALL', widget: 'helper', routine: 'missingRoutine' },
        'var out = ${result}'
      ], [ 'out' ], legacy)).out).toBe(null);
    });

    test('return:false aborts the rest of the calling routine', async () => {
      // the abort stops the appended capture operation too, so the marker never lands
      const result = await runRoutine(state(), [
        { func: 'SET', collection: 'thisButton', property: 'marker', value: 'before' },
        { func: 'CALL', widget: 'helper', routine: 'addTenRoutine', arguments: { x: 5 }, 'return': false },
        { func: 'SET', collection: 'thisButton', property: 'marker', value: 'after' }
      ], { legacy });
      expect(result.state.trigger.marker).toBe('before');
    });

    test('a routine name that does not end in Routine is refused', async () => {
      expect((await captured([
        { func: 'CALL', widget: 'helper', routine: 'addTen' },
        'var out = ${result}'
      ], [ 'out' ], legacy)).out).toBe(null);
    });
  });
});

// A game file can put anything into a property a routine is read from. Reading a string as a
// routine has always run to the end of it rather than taking the client down with it, and neither
// case may throw: an exception escapes before the delta batch the routine opened is closed again,
// after which the client stops sending its state at all.
describe('a routine property that holds no routine', () => {
  test('a string runs to its end instead of throwing', async () => {
    const result = await runRoutine(routineState({
      trigger: { type: 'button', clickRoutine: 'var broken = 1' }
    }), 'clickRoutine');
    expect(result.variable).toBe(null);
  });

  test('an object runs no operation instead of throwing', async () => {
    const result = await runRoutine(routineState({
      trigger: { type: 'button', clickRoutine: { func: 'SET', property: 'broken', value: 1 } }
    }), 'clickRoutine');
    expect(result.state.trigger.broken).toBe(undefined);
  });
});
