import fs from 'fs';

import FileUpdater from '../server/fileupdater.mjs';

// A save is migrated every time it is loaded, so what the validator has to judge is
// the state the file updater produces and not the JSON on disk: a game written years
// ago still says what it said then, and edit mode - where these checks are shown -
// only ever sees the migrated version. A file the updater refuses (one written by a
// newer version) is validated the way it was written.
export function readUpdatedGameFile(path) {
  const state = JSON.parse(fs.readFileSync(path, 'utf8'));
  if(!state || typeof state._meta != 'object' || state._meta === null)
    return state;
  try {
    return FileUpdater(state);
  } catch(e) {
    return state;
  }
}
