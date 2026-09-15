import { runRoutine, routineState } from './harness.js';
import { forEachLegacy } from './matrix.js';

// Behaviour changes that already shipped, found by replaying the Layer-A probe against dated
// revisions of the repo (2023q1 .. 2026q3). Each one changed what an existing game does, with
// no legacy mode and no file-updater migration guarding it. They are pinned here at the value
// main gives today, so the next change to any of them is a visible decision.

const state = () => routineState({
  h1: { type: 'widget' },
  h2: { type: 'widget' },
  c1: { type: 'widget', parent: 'h1' },
  c2: { type: 'widget', parent: 'h1' },
  c3: { type: 'widget', parent: 'h1' }
});

const selectChildren = { func: 'SELECT', type: 'widget', property: 'parent', value: 'h1' };
const parentsAfter = async (routine, legacy) => {
  const result = await runRoutine(state(), routine, { legacy });
  return [ 'c1', 'c2', 'c3' ].map(id => result.state[id].parent).join(',');
};
const rotationsAfter = async (routine, legacy) => {
  const result = await runRoutine(state(), routine, { legacy });
  return [ 'c1', 'c2', 'c3' ].map(id => result.state[id].rotation === undefined ? '-' : result.state[id].rotation).join(',');
};

forEachLegacy(({ name, legacy }) => {
  // Before https://github.com/ArnoldSmith86/virtualtabletop/pull/1466 (2024-09-13) every count
  // was read as `a.count || 999999`, so an explicit count:0 meant "all" - and it was the only
  // spelling for "all", because 0 was also the default. That PR gave 'all' its own spelling and
  // made 0 mean zero. A published game written before it that says count:0 stopped doing
  // anything, silently: no legacy mode, no migration.
  describe(`count:0 means none, not all (PR #1466) [${name}]`, () => {
    test('MOVE count:0 moves nothing', async () => {
      expect(await parentsAfter([ { func: 'MOVE', from: 'h1', to: 'h2', count: 0 } ], legacy)).toBe('h1,h1,h1');
    });

    test('MOVE count:"all" moves everything', async () => {
      expect(await parentsAfter([ { func: 'MOVE', from: 'h1', to: 'h2', count: 'all' } ], legacy)).toBe('h2,h2,h2');
    });

    test('ROTATE count:0 rotates nothing', async () => {
      expect(await rotationsAfter([ selectChildren, { func: 'ROTATE', angle: 90, count: 0 } ], legacy)).toBe('-,-,-');
    });

    test('ROTATE count:"all" rotates everything', async () => {
      expect(await rotationsAfter([ selectChildren, { func: 'ROTATE', angle: 90, count: 'all' } ], legacy)).toBe('90,90,90');
    });

    test('ROTATE holder:… count:0 rotates nothing', async () => {
      expect(await rotationsAfter([ { func: 'ROTATE', holder: 'h1', angle: 90, count: 0 } ], legacy)).toBe('-,-,-');
    });

    test('ROTATE with no count still rotates exactly one widget', async () => {
      expect(await rotationsAfter([ selectChildren, { func: 'ROTATE', angle: 90 } ], legacy)).toBe('90,-,-');
    });
  });

  // https://github.com/ArnoldSmith86/virtualtabletop/pull/1888 (2023-11-01) added the collection
  // branch to MOVE and ended it with an unconditional `await target.updateAfterShuffle()`, which
  // only holders have. Moving a collection onto anything else threw and aborted the rest of the
  // routine for the next 19 months, until #2496 (2025-05-29) added the holder check - as a side
  // effect of an unrelated fix, with nothing asserting either the break or the repair.
  describe(`MOVE onto a target that is not a holder [${name}]`, () => {
    test('completes and moves the collection', async () => {
      expect(await parentsAfter([ selectChildren, { func: 'MOVE', to: 'h2' } ], legacy)).toBe('h2,h2,h2');
    });

    test('does not abort the rest of the routine', async () => {
      const result = await runRoutine(state(), [
        selectChildren,
        { func: 'MOVE', to: 'h2' },
        { func: 'SET', collection: 'thisButton', property: 'reached', value: true }
      ], { legacy });
      expect(result.state.trigger.reached).toBe(true);
    });
  });
});
