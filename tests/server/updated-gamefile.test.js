import fs from 'fs';
import os from 'os';

import { VERSION } from '../../server/fileupdater.mjs';
import { readUpdatedGameFile } from '../../validator/updated_gamefile.js';

// The validator judges what a game does, and what it does is what the file updater
// produces: a save on disk still says what it said when it was written, while the room
// it is loaded into - and the edit mode these checks are shown in - only ever sees the
// migrated version. Without this, every operation a migration renamed reads as an error
// in a file that works perfectly.
let directory = null;

function file(state) {
  const filename = `${directory}/game.json`;
  fs.writeFileSync(filename, JSON.stringify(state));
  return filename;
}

beforeEach(function() {
  directory = fs.mkdtempSync(os.tmpdir() + '/vtt-updated-gamefile-');
});

afterEach(function() {
  fs.rmSync(directory, { recursive: true, force: true });
});

describe('validator/updated_gamefile.js', function() {
  test('reads an old save as the migration leaves it', function() {
    const state = readUpdatedGameFile(file({
      _meta: { version: 22 },
      b: { id: 'b', type: 'button', clickRoutine: [ { func: 'SWAPHANDS' } ] }
    }));
    expect(state.b.clickRoutine).toEqual([ { func: 'SHIFT', keepOrder: false } ]);
    expect(state._meta.version).toBe(VERSION);
  });

  test('leaves a save at the current version untouched', function() {
    const routine = [ { func: 'SHIFT', holders: [ 'seat1', 'seat2' ] } ];
    expect(readUpdatedGameFile(file({
      _meta: { version: VERSION },
      b: { id: 'b', type: 'button', clickRoutine: routine }
    })).b.clickRoutine).toEqual(routine);
  });

  test('reads a file the updater refuses the way it was written', function() {
    const state = readUpdatedGameFile(file({
      _meta: { version: VERSION + 1 },
      b: { id: 'b', type: 'button', clickRoutine: [ { func: 'SWAPHANDS' } ] }
    }));
    expect(state.b.clickRoutine).toEqual([ { func: 'SWAPHANDS' } ]);
  });

  test('reads a file without _meta the way it was written', function() {
    expect(readUpdatedGameFile(file({ b: { id: 'b', type: 'button' } }))).toEqual({ b: { id: 'b', type: 'button' } });
  });
});
