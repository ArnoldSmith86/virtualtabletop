import { ALL_LEGACY_MODES, LEGACY_MODES } from '../../client/js/legacymoderegistry.js';
import { flagsForGame } from './fileupdater-util.js';
import { fileVersion, flagsOnDisk, libraryVariants, readVariant } from './corpus.js';

// Layer C over the real corpus. tests/server/fileupdater.test.js pins the updater against
// hand-written states; this runs it over every variant of every game in the public library,
// which is the closest thing available to the population it actually acts on - the updater runs
// at every load, so its heuristics are live code for games that have been played for years.
//
// The assertions are deliberately invariants rather than counts. The library changes in almost
// every release, so pinning "275 variants get the var modes" would fail on a game submission
// that has nothing to do with the updater. What must not change is that the updater terminates,
// is deterministic, is idempotent, never invents a mode the registry does not know, and never
// adds a mode to a game that was saved after that mode's behaviour change.
//
// Run `npm run corpus-census` for the numbers themselves.

const variants = [ ...libraryVariants('games'), ...libraryVariants('tutorials') ];

// One pass over the library, because reading and updating 500+ files is the expensive part.
const results = [];
beforeAll(() => {
  for(const variant of variants) {
    const name = `${variant.library}/${variant.game}/${variant.variant}`;
    let state = null;
    try {
      state = readVariant(variant);
    } catch(e) {
      results.push({ name, error: `unreadable: ${e.message}` });
      continue;
    }

    try {
      const version = fileVersion(state);
      const onDisk = flagsOnDisk(state);
      const assigned = flagsForGame(state);
      // the updated state is what the room keeps and hands to the next load, so a second pass
      // over the result has to be a no-op
      const reUpdated = flagsForGame(Object.assign(JSON.parse(JSON.stringify(state)), {
        _meta: Object.assign({}, state._meta, { version: 21, gameSettings: { legacyModes: assigned } })
      }));
      results.push({
        name, version, onDisk, assigned,
        again: flagsForGame(state),
        reUpdated,
        added: Object.keys(assigned).filter(mode=>assigned[mode] && !onDisk[mode])
      });
    } catch(e) {
      results.push({ name, error: `the updater threw: ${e.message}` });
    }
  }
});

const failuresOf = predicate => results.filter(predicate).map(result=>result.name);

describe('the public library as a corpus', () => {
  test('there is a corpus to test', () => {
    expect(variants.length).toBeGreaterThan(100);
  });

  test('every variant parses and the updater accepts it', () => {
    expect(results.filter(result=>result.error).map(result=>`${result.name}: ${result.error}`)).toEqual([]);
  });

  test('the assigned modes are deterministic', () => {
    expect(failuresOf(result=>!result.error && JSON.stringify(result.assigned) !== JSON.stringify(result.again))).toEqual([]);
  });

  test('updating an already updated state changes nothing', () => {
    expect(failuresOf(result=>!result.error && JSON.stringify(result.assigned) !== JSON.stringify(result.reUpdated))).toEqual([]);
  });

  test('no game is given a mode the registry does not declare', () => {
    const unknown = new Set();
    for(const result of results)
      for(const mode of Object.keys(result.assigned || {}))
        if(ALL_LEGACY_MODES.indexOf(mode) == -1)
          unknown.add(mode);
    expect([ ...unknown ]).toEqual([]);
  });

  // A mode exists to preserve the behaviour a game was authored against, so the updater must
  // never add one to a game saved at or after the version that changed the behaviour - that
  // game was written for the new behaviour. A mode already written in the file is a different
  // matter and stays untouched, which is why this looks at what the updater added.
  test('the updater adds no mode to a game newer than that mode', () => {
    const failures = [];
    for(const result of results)
      for(const mode of result.added || [])
        if(result.version >= LEGACY_MODES[mode].since)
          failures.push(`${result.name} (v${result.version}) got ${mode} (since v${LEGACY_MODES[mode].since})`);
    expect(failures).toEqual([]);
  });
});
