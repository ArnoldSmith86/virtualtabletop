import fs from 'fs';

import FileUpdater, { VERSION } from '../../server/fileupdater.mjs';

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

// The version the importer check migrates from. Every migration newer than it has been
// confirmed to leave the importers' output alone, so it stays put when VERSION moves: the
// migrations a bump adds then run over what the importers write and have to be no-ops there
// too. Raising it takes a deliberate look at the migration it skips - the older ones are not
// idempotent on their own output (v20 appends white-space: pre-wrap a second time), which is
// why replaying all of them is not the invariant.
export const IMPORT_MIGRATION_BASE = 21;

// The importers write the current file version, so nothing they produce may be rewritten on
// load: a migration that would still have changed it never runs again. FileUpdater hands a
// state that already is at VERSION straight back, so the check migrates a copy stamped at
// IMPORT_MIGRATION_BASE instead and fails as soon as a migration is added whose result the
// importer does not produce by itself.
export function expectNoLegacyModes(state) {
  expect(state._meta.version).toBe(VERSION);
  expect(state._meta.gameSettings).toBeUndefined();
  // NaN and undefined do not survive the save file, so compare what is actually stored
  const stored = JSON.parse(JSON.stringify(state));
  const olderVersion = JSON.parse(JSON.stringify(stored));
  olderVersion._meta.version = IMPORT_MIGRATION_BASE;
  expect(FileUpdater(olderVersion)).toEqual(stored);
}
