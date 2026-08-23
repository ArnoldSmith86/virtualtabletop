import fs from 'fs';

import FileUpdater from '../../server/fileupdater.mjs';

// A game's legacy modes are whatever the file updater assigns when the game is loaded, not what
// is written in the file: the checked-in JSON of every library game is pre-updater, so reading
// legacyModes out of it reports a number that is always too low. Ask through here instead.
// A save that needs no legacy mode comes out of the updater without a gameSettings object, so
// answer with an empty set rather than throwing on it.
export function flagsForGame(state) {
  return (FileUpdater(JSON.parse(JSON.stringify(state)))._meta.gameSettings || {}).legacyModes || {};
}

export function flagsForGameFile(path) {
  return flagsForGame(JSON.parse(fs.readFileSync(path, 'utf8')));
}
