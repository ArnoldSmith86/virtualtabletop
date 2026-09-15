import { runRoutine, routineState } from './harness.js';
import { forEachLegacy } from './matrix.js';

const state = () => routineState({
  h1: { type: 'widget' },
  c1: { type: 'widget', parent: 'h1' },
  c2: { type: 'widget', parent: 'h1' },
  c3: { type: 'widget', parent: 'h1' }
});

const selectChildren = { func: 'SELECT', type: 'widget', property: 'parent', value: 'h1' };

async function children(routine, legacy, property) {
  const result = await runRoutine(state(), routine, { legacy });
  return [ 'c1', 'c2', 'c3' ].map(id => result.state[id][property]);
}

forEachLegacy(({ name, legacy }) => {
  describe(`SET [${name}]`, () => {
    test('writes the value to every widget in the collection', async () => {
      expect(await children([ selectChildren, { func: 'SET', property: 'p', value: 7 } ], legacy, 'p')).toEqual([ 7, 7, 7 ]);
    });

    test('a falsy value is written, an omitted one clears the property', async () => {
      expect(await children([ selectChildren, { func: 'SET', property: 'p', value: 0 } ], legacy, 'p')).toEqual([ 0, 0, 0 ]);
      expect(await children([ selectChildren, { func: 'SET', property: 'p', value: '' } ], legacy, 'p')).toEqual([ '', '', '' ]);
      expect(await children([ selectChildren, { func: 'SET', property: 'p', value: false } ], legacy, 'p')).toEqual([ false, false, false ]);
      // value defaults to null, and setting a property to null removes it from the state
      expect(await children([ selectChildren, { func: 'SET', property: 'p' } ], legacy, 'p')).toEqual([ undefined, undefined, undefined ]);
    });

    test("relation '+' appends to what is already there", async () => {
      expect(await children([
        selectChildren,
        { func: 'SET', property: 'p', value: 'a' },
        { func: 'SET', property: 'p', value: 'b', relation: '+' }
      ], legacy, 'p')).toEqual([ 'ab', 'ab', 'ab' ]);
    });

    test("relation '+' on an unset property assigns instead of appending", async () => {
      expect(await children([
        selectChildren,
        { func: 'SET', property: 'p', value: 'a', relation: '+' }
      ], legacy, 'p')).toEqual([ 'a', 'a', 'a' ]);
    });

    // https://github.com/ArnoldSmith86/virtualtabletop/issues/3059 (3): the '+' -> '=' fallback
    // is written back onto the operation object inside the per-widget loop, so the first widget
    // whose property is null converts every later widget from append to overwrite. c3 keeps its
    // 'x' in a correct implementation; it does not here, and it only misbehaves because c2 comes
    // before it - which is why this is asserted per widget and not as a total.
    test("relation '+' leaks the fallback to later widgets (issue #3059.3)", async () => {
      expect(await children([
        selectChildren,
        { func: 'SET', property: 'p', value: 'x' },
        { func: 'SELECT', type: 'widget', property: 'id', value: 'c2' },
        { func: 'SET', property: 'p', value: null },
        selectChildren,
        { func: 'SET', property: 'p', value: '!', relation: '+' }
      ], legacy, 'p')).toEqual([ 'x!', '!', '!' ]);
    });

    test('a read-only property is refused', async () => {
      const result = await runRoutine(state(), [ selectChildren, { func: 'SET', property: '_ancestor', value: 'nope' } ], { legacy });
      expect(result.state.c1._ancestor).toBe(undefined);
    });

    test('parent is only set to a widget that exists', async () => {
      const moved = await runRoutine(state(), [
        { func: 'SELECT', type: 'widget', property: 'id', value: 'c1' },
        { func: 'SET', property: 'parent', value: 'nowhere' }
      ], { legacy });
      expect(moved.state.c1.parent).toBe('h1');
    });
  });
});
