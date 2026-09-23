import { runRoutineCapturingVariables, routineState } from './harness.js';
import { forEachLegacy } from './matrix.js';

// Three children in h1 plus two containers, so a selection has something to be wrong about.
const state = () => routineState({
  h1: { type: 'widget' },
  h2: { type: 'widget' },
  c1: { type: 'widget', parent: 'h1', v: 1, falsy: 0 },
  c2: { type: 'widget', parent: 'h1', v: 2, falsy: '' },
  c3: { type: 'widget', parent: 'h1', v: 3, falsy: false }
});

async function count(routine, legacy) {
  const result = await runRoutineCapturingVariables(state(), [ ...routine, { func: 'COUNT', variable: 'n' } ], [ 'n' ], { legacy });
  return result.captured.n;
}

const inH1 = { func: 'SELECT', type: 'widget', property: 'parent', value: 'h1' };

forEachLegacy(({ name, legacy }) => {
  describe(`SELECT [${name}]`, () => {
    test('selects every widget matching the property', async () => {
      expect(await count([ inH1 ], legacy)).toBe(3);
    });

    test('max limits the selection', async () => {
      expect(await count([ Object.assign({}, inH1, { max: 2 }) ], legacy)).toBe(2);
    });

    test('max accepts a numeric string', async () => {
      expect(await count([ Object.assign({}, inH1, { max: '2' }) ], legacy)).toBe(2);
    });

    // https://github.com/ArnoldSmith86/virtualtabletop/issues/3059 (2): slice(0, 'all') is
    // slice(0, NaN), so max:'all' selects nothing while the wiki documents the opposite.
    // Pinned as-is - when the fix lands this expectation flips to 3 in every combination,
    // which is exactly the review signal the number is here to give.
    test('max:"all" currently selects nothing (issue #3059.2)', async () => {
      expect(await count([ Object.assign({}, inH1, { max: 'all' }) ], legacy)).toBe(0);
    });

    test('max:0 selects nothing', async () => {
      expect(await count([ Object.assign({}, inH1, { max: 0 }) ], legacy)).toBe(0);
    });

    test('a falsy property value is not the same as an omitted one', async () => {
      // omitted value means null, which no widget's falsy property holds
      expect(await count([ { func: 'SELECT', type: 'widget', property: 'falsy' } ], legacy)).toBe(2);
      expect(await count([ { func: 'SELECT', type: 'widget', property: 'falsy', value: 0 } ], legacy)).toBe(1);
      expect(await count([ { func: 'SELECT', type: 'widget', property: 'falsy', value: '' } ], legacy)).toBe(1);
      expect(await count([ { func: 'SELECT', type: 'widget', property: 'falsy', value: false } ], legacy)).toBe(1);
    });

    test('relations compare against the property', async () => {
      // restricted to the three children so widgets without a v are out of the picture
      const numbers = relation => [ Object.assign({}, inH1, { collection: 'children' }), { func: 'SELECT', type: 'widget', property: 'v', source: 'children', ...relation } ];
      expect(await count(numbers({ relation: '>', value: 1 }), legacy)).toBe(2);
      expect(await count(numbers({ relation: '>=', value: 1 }), legacy)).toBe(3);
      expect(await count(numbers({ relation: '<', value: 3 }), legacy)).toBe(2);
      expect(await count(numbers({ relation: 'in', value: [ 1, 3 ] }), legacy)).toBe(2);
    });

    test('an unsupported relation falls back to ==', async () => {
      expect(await count([ { func: 'SELECT', type: 'widget', property: 'v', relation: '~=', value: 1 } ], legacy)).toBe(1);
    });

    test('mode combines with the existing collection', async () => {
      const one = { func: 'SELECT', type: 'widget', property: 'id', value: 'c1' };
      expect(await count([ one, Object.assign({}, inH1, { mode: 'set' }) ], legacy)).toBe(3);
      expect(await count([ one, Object.assign({}, inH1, { mode: 'add' }) ], legacy)).toBe(3);
      expect(await count([ one, Object.assign({}, inH1, { mode: 'remove' }) ], legacy)).toBe(0);
      expect(await count([ one, Object.assign({}, inH1, { mode: 'intersect' }) ], legacy)).toBe(1);
      // an unknown mode warns and behaves like set
      expect(await count([ one, Object.assign({}, inH1, { mode: 'bogus' }) ], legacy)).toBe(3);
    });

    test('source restricts the candidates', async () => {
      expect(await count([
        { func: 'SELECT', type: 'widget', property: 'v', relation: '<', value: 3, collection: 'small' },
        { func: 'SELECT', type: 'widget', property: 'v', value: 1, source: 'small' }
      ], legacy)).toBe(1);
    });
  });
});
