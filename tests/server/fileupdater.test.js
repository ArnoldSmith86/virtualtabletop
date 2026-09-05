import FileUpdater, { VERSION } from '../../server/fileupdater.mjs';
import { ALL_LEGACY_MODES, LEGACY_MODES } from '../../client/js/legacymoderegistry.js';
import { flagsForGame } from './fileupdater-util.js';

// Layer C: the file updater runs on every load, not once at import, so its heuristics are live
// code for every game that already exists. Tightening a detector does not just affect new
// imports - it changes what an already published game does the next time somebody opens it.
// These tests pin which games get which legacy mode.
//
// Never read legacyModes out of a game file: the checked-in JSON is pre-updater, so the flags
// in it are a lower bound on the flags the game actually runs with. flagsFor() is the only
// correct way to ask.

const flagsFor = flagsForGame;

const at = (version, widgets = {}) => Object.assign({ _meta: { version } }, widgets);

describe('legacy mode detection', () => {
  test('a v17 save with a var routine gets both var modes', () => {
    expect(flagsFor(at(17, { b: { id: 'b', type: 'button', clickRoutine: [ 'var a = 1' ] } }))).toEqual({
      convertNumericVarParametersToNumbers: true,
      useOneAsDefaultForVarParameters: true
    });
  });

  test('a v17 save with a COMPUTE operation gets both var modes', () => {
    expect(flagsFor(at(17, { b: { id: 'b', type: 'button', clickRoutine: [ { func: 'COMPUTE' } ] } }))).toEqual({
      convertNumericVarParametersToNumbers: true,
      useOneAsDefaultForVarParameters: true
    });
  });

  test('a v17 save without var or COMPUTE gets no modes at all', () => {
    expect(flagsFor(at(17, { l: { id: 'l', type: 'label', text: 'hello' } }))).toEqual({});
  });

  // The v18 detector is a regex over JSON.stringify(state), so any text that happens to contain
  // the characters `"var ` trips it. This is a known false positive and deliberately left alone
  // (a game that gets the modes it does not need still works); the test is here so that a PR
  // tightening the detector has to change it on purpose.
  test('label text containing \'"var \' is a known false positive', () => {
    expect(flagsFor(at(17, { l: { id: 'l', type: 'label', text: 'say "var " out loud' } }))).toEqual({
      convertNumericVarParametersToNumbers: true,
      useOneAsDefaultForVarParameters: true
    });
  });

  test('a deck with an html face object gets useIframeForHtmlCards', () => {
    const state = at(17, { d: { id: 'd', type: 'deck', faceTemplates: [ { objects: [ { type: 'html', value: '<b>x</b>' } ] } ] } });
    expect(flagsFor(state).useIframeForHtmlCards).toBe(true);
  });

  test('a deck with only image objects does not get useIframeForHtmlCards', () => {
    const state = at(17, { d: { id: 'd', type: 'deck', faceTemplates: [ { objects: [ { type: 'image', value: 'x.png' } ] } ] } });
    expect(flagsFor(state).useIframeForHtmlCards).toBe(undefined);
  });

  test('a holder with only a color gets disableHolderImageWidget', () => {
    expect(flagsFor(at(20, { h: { id: 'h', type: 'holder', color: 'red' } })).disableHolderImageWidget).toBe(true);
  });

  test('a plain holder does not get disableHolderImageWidget', () => {
    expect(flagsFor(at(20, { h: { id: 'h', type: 'holder' } })).disableHolderImageWidget).toBe(undefined);
  });

  test('a mode is not applied to a save that is already at or past its version', () => {
    // a v20 save predates v21, so the holder mode applies, but the var modes (v18) do not
    const state = at(20, {
      h: { id: 'h', type: 'holder', color: 'red' },
      b: { id: 'b', type: 'button', clickRoutine: [ 'var a = 1' ] }
    });
    expect(flagsFor(state)).toEqual({ disableHolderImageWidget: true });
  });

  test('a post-v18 save without gameSettings is classified instead of crashing', () => {
    // hand-written saves and importers can produce one; the detectors used to assume the v18
    // step had already created the object
    expect(flagsFor(at(19, { h: { id: 'h', type: 'holder', color: 'red' } }))).toEqual({ disableHolderImageWidget: true });
  });

  test('a current-version save is left exactly as it is', () => {
    const state = at(VERSION, { b: { id: 'b', type: 'button', clickRoutine: [ 'var a = 1' ] } });
    state._meta.gameSettings = { legacyModes: {} };
    expect(flagsFor(state)).toEqual({});
  });

  test('a current-version save without gameSettings has no modes', () => {
    // the updater returns it untouched, so there is nothing to read the modes out of
    expect(flagsFor(at(VERSION, { l: { id: 'l', type: 'label', text: 'hi' } }))).toEqual({});
  });

  test('detectors do not invent modes the registry does not declare', () => {
    const state = at(17, {
      b: { id: 'b', type: 'button', clickRoutine: [ 'var a = 1' ] },
      h: { id: 'h', type: 'holder', icon: 'star' },
      d: { id: 'd', type: 'deck', faceTemplates: [ { objects: [ { type: 'html', value: 'x' } ] } ] }
    });
    expect(Object.keys(flagsFor(state)).every(name => ALL_LEGACY_MODES.includes(name))).toBe(true);
  });

  test('every registered mode is reachable through the updater', () => {
    // a mode nothing can turn on would be dead weight in the sidebar and in the matrix
    const everything = at(1, {
      b: { id: 'b', type: 'button', clickRoutine: [ 'var a = 1' ] },
      h: { id: 'h', type: 'holder', color: 'red' },
      d: { id: 'd', type: 'deck', faceTemplates: [ { objects: [ { type: 'html', value: 'x' } ] } ] }
    });
    expect(Object.keys(flagsFor(everything)).sort()).toEqual([ ...ALL_LEGACY_MODES ].sort());
  });
});

describe('registry consistency', () => {
  test('every mode declares the fields the sidebar, updater and matrix need', () => {
    for(const [ name, mode ] of Object.entries(LEGACY_MODES)) {
      expect(typeof mode.since).toBe('number');
      expect(mode.since).toBeLessThanOrEqual(VERSION);
      expect(typeof mode.pr).toBe('number');
      expect(Array.isArray(mode.interactsWith)).toBe(true);
      expect(typeof mode.detect).toBe('function');
      expect(typeof mode.label).toBe('string');
      expect(mode.description.length).toBeGreaterThan(0);
      expect(name).toMatch(/^[a-z][A-Za-z]+$/);
    }
  });

  test('interactsWith only names modes that exist and is symmetric', () => {
    for(const [ name, mode ] of Object.entries(LEGACY_MODES))
      for(const other of mode.interactsWith) {
        expect(LEGACY_MODES[other]).toBeDefined();
        expect(LEGACY_MODES[other].interactsWith).toContain(name);
      }
  });
});

// The point of these is not what the flags are but that they do not move. A PR that changes a
// detector shows up here as an explicit diff instead of as a silent reclassification of every
// game that shape describes.
const CLASSIFICATION_FIXTURES = {
  'v17 plain label game': [ at(17, { l: { id: 'l', type: 'label', text: 'hi' } }), [] ],
  'v17 game with a var routine': [ at(17, { b: { id: 'b', type: 'button', clickRoutine: [ 'var a = 1' ] } }), [ 'convertNumericVarParametersToNumbers', 'useOneAsDefaultForVarParameters' ] ],
  'v17 game with a COMPUTE routine': [ at(17, { b: { id: 'b', type: 'button', clickRoutine: [ { func: 'COMPUTE', property: 'x' } ] } }), [ 'convertNumericVarParametersToNumbers', 'useOneAsDefaultForVarParameters' ] ],
  'v17 game whose label mentions "var "': [ at(17, { l: { id: 'l', type: 'label', text: 'a "var " here' } }), [ 'convertNumericVarParametersToNumbers', 'useOneAsDefaultForVarParameters' ] ],
  'v17 deck with an html face': [ at(17, { d: { id: 'd', type: 'deck', faceTemplates: [ { objects: [ { type: 'html', value: 'x' } ] } ] } }), [ 'useIframeForHtmlCards' ] ],
  'v17 deck with an image face': [ at(17, { d: { id: 'd', type: 'deck', faceTemplates: [ { objects: [ { type: 'image', value: 'x.png' } ] } ] } }), [] ],
  'v18 game with a var routine': [ at(18, { b: { id: 'b', type: 'button', clickRoutine: [ 'var a = 1' ] } }), [] ],
  'v19 holder with an icon': [ at(19, { h: { id: 'h', type: 'holder', icon: 'star' } }), [ 'disableHolderImageWidget' ] ],
  'v19 holder with text': [ at(19, { h: { id: 'h', type: 'holder', text: 'draw' } }), [ 'disableHolderImageWidget' ] ],
  'v19 holder with nothing on it': [ at(19, { h: { id: 'h', type: 'holder' } }), [] ],
  'v20 holder with svgReplaces': [ at(20, { h: { id: 'h', type: 'holder', svgReplaces: { a: 'b' } } }), [ 'disableHolderImageWidget' ] ],
  'v20 game with a var routine and a bare holder': [ at(20, { b: { id: 'b', type: 'button', clickRoutine: [ 'var a = 1' ] }, h: { id: 'h', type: 'holder' } }), [] ]
};

describe('classification stability', () => {
  for(const [ name, [ state, expected ] ] of Object.entries(CLASSIFICATION_FIXTURES)) {
    test(name, () => {
      expect(Object.keys(flagsFor(state)).sort()).toEqual([ ...expected ].sort());
    });
  }
});

// The updater must not change the shape of _meta beyond the modes it sets: everything that
// reads gameSettings treats a missing object and an empty one alike, but a save that gains keys
// it did not have is a diff in every state file the server rewrites.
describe('_meta shape', () => {
  test('a post-v18 save that needs no mode keeps its _meta as it was', () => {
    const updated = FileUpdater(at(19, { l: { id: 'l', type: 'label', text: 'hi' } }));
    expect(updated._meta).toEqual({ version: VERSION });
  });

  test('a pre-v18 save keeps sibling game settings', () => {
    const state = at(17, { l: { id: 'l', type: 'label', text: 'hi' } });
    state._meta.gameSettings = { globalCss: 'body { color: red }' };
    expect(FileUpdater(state)._meta.gameSettings).toEqual({ globalCss: 'body { color: red }', legacyModes: {} });
  });

  test('an existing legacyModes object is added to, not replaced', () => {
    const state = at(20, { h: { id: 'h', type: 'holder', color: 'red' } });
    state._meta.gameSettings = { legacyModes: { useIframeForHtmlCards: true } };
    expect(FileUpdater(state)._meta.gameSettings.legacyModes).toEqual({
      useIframeForHtmlCards: true,
      disableHolderImageWidget: true
    });
  });
});

describe('idempotence', () => {
  test('updating twice equals updating once', () => {
    for(const [ name, [ state ] ] of Object.entries(CLASSIFICATION_FIXTURES)) {
      const input = JSON.parse(JSON.stringify(state));
      const once = FileUpdater(JSON.parse(JSON.stringify(input)));
      const twice = FileUpdater(JSON.parse(JSON.stringify(once)));
      expect({ [name]: twice }).toEqual({ [name]: once });
    }
  });

  test('a save at the current version is returned unchanged', () => {
    const state = at(VERSION, { l: { id: 'l', type: 'label', text: 'hi' } });
    state._meta.gameSettings = { legacyModes: {} };
    expect(FileUpdater(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });

  test('a save from the future is refused', () => {
    expect(() => FileUpdater(at(VERSION + 1))).toThrow();
  });
});

// Every save carries the version it was written with and is migrated on load,
// so that a change to what a property means never changes what an existing game
// does. This covers the dragLimit sides, which used to be clamped with
// Math.max(null, x) - i.e. at 0 - where they are now read as "no limit".
function migrated(widget, version = 21) {
  const state = { _meta: { version }, w: Object.assign({ id: 'w', type: 'basic' }, widget) };
  return FileUpdater(state).w;
}

// The version a migration was written for, so that a later one added below does
// not silently stop these from running.
const beforeDragLimitSides = 21;
const beforeScoreboardEntry = 23;

describe('the dragLimit sides written as null', () => {
  const dragLimit = limit => migrated({ dragLimit: limit }, beforeDragLimitSides).dragLimit;

  test('become the 0 they always clamped to', () => {
    expect(dragLimit({ minX: null, maxY: 10 })).toEqual({ minX: 0, maxY: 10 });
    expect(dragLimit({ minX: null, maxX: null, minY: null, maxY: null }))
      .toEqual({ minX: 0, maxX: 0, minY: 0, maxY: 0 });
  });

  test('leave every other limit as it was written', () => {
    expect(dragLimit({ minX: 0, maxX: '${PROPERTY width OF board}', condition: 'y > x' }))
      .toEqual({ minX: 0, maxX: '${PROPERTY width OF board}', condition: 'y > x' });
    expect(dragLimit({})).toEqual({});
    expect(dragLimit('nonsense')).toBe('nonsense');
    expect(migrated({}, beforeDragLimitSides).dragLimit).toBe(undefined);
  });

  test('are left alone in a file that was written with the new meaning', () => {
    const state = { _meta: { version: VERSION }, w: { id: 'w', type: 'basic', dragLimit: { minX: null } } };
    expect(FileUpdater(state).w.dragLimit).toEqual({ minX: null });
  });
});

// SWAPHANDS was the special case of SHIFT that passes the hands of the seats around
// the table, so an existing game says it as the SHIFT it always was.
function migratedRoutine(routine, version = 22) {
  return migrated({ clickRoutine: routine }, version).clickRoutine;
}

describe('a SWAPHANDS operation', () => {
  test('becomes a SHIFT that arrives in the order the widgets were created', () => {
    expect(migratedRoutine([ { func: 'SWAPHANDS' } ])).toEqual([ { func: 'SHIFT', keepOrder: false } ]);
  });

  test('keeps the order of each hand where it asked for it', () => {
    expect(migratedRoutine([ { func: 'SWAPHANDS', keepOrder: true } ])).toEqual([ { func: 'SHIFT', keepOrder: true } ]);
  });

  test('leaves an order the routine works out to the routine', () => {
    expect(migratedRoutine([ { func: 'SWAPHANDS', keepOrder: '${PROPERTY keepOrder OF button}' } ]))
      .toEqual([ { func: 'SHIFT', keepOrder: '${PROPERTY keepOrder OF button}' } ]);
  });

  test('carries its interval and direction over unchanged', () => {
    expect(migratedRoutine([ { note: 'pass on', func: 'SWAPHANDS', interval: 2, direction: 'backward' } ]))
      .toEqual([ { note: 'pass on', func: 'SHIFT', interval: 2, direction: 'backward', keepOrder: false } ]);
  });

  test('drops a source of all, which is what SHIFT does without any holders', () => {
    expect(migratedRoutine([ { func: 'SWAPHANDS', source: 'all' } ])).toEqual([ { func: 'SHIFT', keepOrder: false } ]);
  });

  test('passes a named collection of seats on as the holders', () => {
    expect(migratedRoutine([ { func: 'SWAPHANDS', source: 'usedSeats' } ]))
      .toEqual([ { func: 'SHIFT', holders: 'usedSeats', keepOrder: false } ]);
  });

  // a written-out list was a collection to SWAPHANDS, so its seats took part in seat
  // index order rather than in the order they are written in
  test('turns a written-out list of seats into a collection of them', () => {
    expect(migratedRoutine([ { func: 'SWAPHANDS', source: [ 'seat3', 'seat1' ] } ])).toEqual([
      {
        note: 'This was added by the automatic file migration because SHIFT passes the widgets along a list of holders in the order it is written in.',
        func: 'SELECT',
        type: 'seat',
        property: 'id',
        relation: 'in',
        value: [ 'seat3', 'seat1' ],
        collection: 'internal_swapHandsMigration'
      },
      { func: 'SHIFT', holders: 'internal_swapHandsMigration', keepOrder: false }
    ]);
  });

  test('is migrated inside the routines of an IF and a FOREACH too', () => {
    expect(migratedRoutine([
      { func: 'IF', condition: true, thenRoutine: [ { func: 'SWAPHANDS' } ], elseRoutine: [ { func: 'FOREACH', loopRoutine: [ { func: 'SWAPHANDS' } ] } ] }
    ])).toEqual([
      { func: 'IF', condition: true, thenRoutine: [ { func: 'SHIFT', keepOrder: false } ], elseRoutine: [ { func: 'FOREACH', loopRoutine: [ { func: 'SHIFT', keepOrder: false } ] } ] }
    ]);
  });

  test('is left alone in a file that was written after SWAPHANDS was gone', () => {
    expect(migratedRoutine([ { func: 'SWAPHANDS' } ], VERSION)).toEqual([ { func: 'SWAPHANDS' } ]);
  });
});

// A scoreboard used to open the edit pane whatever cell was clicked and to show
// only the rounds that had been scored. scoreEntry 'pane' is that behaviour, so
// a board saved before the property existed is given it and a new board gets
// the 'auto' default instead.
describe('a scoreboard saved before scoreEntry existed', () => {
  const scoreboard = (widget, version = beforeScoreboardEntry) =>
    FileUpdater({ _meta: { version }, s: Object.assign({ id: 's', type: 'scoreboard' }, widget) }).s;

  test('asks for the edit pane', () => {
    expect(scoreboard({}).scoreEntry).toBe('pane');
    expect(scoreboard({ clickable: false }).scoreEntry).toBe('pane');
  });

  test('keeps a value it was written with', () => {
    expect(scoreboard({ scoreEntry: 'keypad' }).scoreEntry).toBe('keypad');
    expect(scoreboard({ scoreEntry: 'auto' }).scoreEntry).toBe('auto');
  });

  test('leaves every other widget type alone', () => {
    const state = { _meta: { version: beforeScoreboardEntry }, l: { id: 'l', type: 'label' } };
    expect(FileUpdater(state).l.scoreEntry).toBe(undefined);
  });

  test('is not touched in a file written with the property', () => {
    expect(scoreboard({}, VERSION).scoreEntry).toBe(undefined);
  });
});
