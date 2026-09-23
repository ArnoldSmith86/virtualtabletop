// The public library as a corpus. Enumerating it is the same walk the server's library scanner
// does (Room.getPublicLibraryGames): every numbered .json file in a game directory is one
// variant of that game.
//
// A game's legacy modes are not in its file. The checked-in JSON is pre-updater - the updater
// runs at every load, which is what lets a fix to its heuristics reach games that already
// exist - so ask flagsForGameFile() (tests/server/fileupdater-util.js) instead of reading
// _meta.gameSettings out of the file.

import fs from 'fs';
import path from 'path';

export const libraryDirectory = path.resolve('library');

// [ { library, game, variant, path } ] for every variant of every game in the given library
// directory ('games' or 'tutorials'), sorted so a report reads the same on every machine.
export function libraryVariants(library = 'games') {
  const root = `${libraryDirectory}/${library}`;
  if(!fs.existsSync(root))
    return [];

  const variants = [];
  for(const game of fs.readdirSync(root).sort()) {
    const directory = `${root}/${game}`;
    if(!fs.statSync(directory).isDirectory())
      continue;
    for(const file of fs.readdirSync(directory).sort())
      if(/\.json$/.test(file))
        variants.push({ library, game, variant: file.replace(/\.json$/, ''), path: `${directory}/${file}` });
  }
  return variants;
}

export function readVariant(variant) {
  return JSON.parse(fs.readFileSync(variant.path, 'utf8'));
}

// What the file says about itself, before the updater sees it. Only useful in contrast with
// what the updater assigns - see corpus-census.js.
export function flagsOnDisk(state) {
  return ((state._meta || {}).gameSettings || {}).legacyModes || {};
}

export function fileVersion(state) {
  return (state._meta || {}).version;
}
