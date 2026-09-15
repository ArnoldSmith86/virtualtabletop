import { runRoutine, routineState } from './harness.js';
import { forEachLegacy } from './matrix.js';

// A cross-feature fixture rather than a per-operation one. inheritFrom is the second largest
// cluster in the open issue list (#2854 removal does not update, #2731 classes, #2390 not
// always updating, #2958 CLONE recursive ignores it) and every one of those is about a chain
// being mutated somewhere other than where it is read - which a single-level happy-path test
// cannot see. So: three levels, mutated at each, read at the bottom.
//
// An inherited value is not in the widget's own state, so the probe copies it there with
// ${PROPERTY ... OF ...}, which is what a game would use to read it too.
//
// Limited to the `inheritFrom: '<id>'` form. The object form with a property list resolves
// through applyInheritedValuesToDOM, i.e. through the rendering path, which is not what a
// jsdom widget graph reproduces faithfully - that half belongs in a browser fixture.

const chain = extra => routineState(Object.assign({
  base:   { type: 'basic', text: 'from base', color: 'red' },
  middle: { type: 'basic', inheritFrom: 'base' },
  leaf:   { type: 'basic', inheritFrom: 'middle' }
}, extra || {}));

// wrapped in an object so that an inherited value of null is distinguishable from "SET wrote
// nothing": setting a property to null removes it, setting it to { value: null } does not
const observe = (id, property) => ({
  func: 'SET', collection: 'thisButton', property: 'observed', value: { value: `\${PROPERTY ${property} OF ${id}}` }
});

async function observed(state, id, property, legacy, before = []) {
  const result = await runRoutine(state, [ ...before, observe(id, property) ], { legacy });
  return result.state.trigger.observed.value;
}

forEachLegacy(({ name, legacy }) => {
  describe(`inheritFrom chain [${name}]`, () => {
    test('a value reaches the bottom of a three level chain', async () => {
      expect(await observed(chain(), 'leaf', 'text', legacy)).toBe('from base');
    });

    test('a level in the middle shadows the one above it', async () => {
      const before = [
        { func: 'SELECT', property: 'id', value: 'middle' },
        { func: 'SET', property: 'text', value: 'from middle' }
      ];
      expect(await observed(chain(), 'leaf', 'text', legacy, before)).toBe('from middle');
    });

    test('a change at the top is seen at the bottom', async () => {
      const before = [
        { func: 'SELECT', property: 'id', value: 'base' },
        { func: 'SET', property: 'text', value: 'changed' }
      ];
      expect(await observed(chain(), 'leaf', 'text', legacy, before)).toBe('changed');
    });

    test('a widget in the middle keeps inheriting what it does not override', async () => {
      const before = [
        { func: 'SELECT', property: 'id', value: 'middle' },
        { func: 'SET', property: 'color', value: 'blue' }
      ];
      expect(await observed(chain(), 'leaf', 'color', legacy, before)).toBe('blue');
      expect(await observed(chain(), 'leaf', 'text', legacy, before)).toBe('from base');
    });

    // id and type are never inherited (statemanaged.js:89), which is what keeps a chain from
    // turning every widget into a copy of its ancestor
    test('id and type are never inherited', async () => {
      expect(await observed(chain(), 'leaf', 'type', legacy)).toBe('basic');
      expect(await observed(chain(), 'leaf', 'id', legacy)).toBe('leaf');
    });
  });
});
