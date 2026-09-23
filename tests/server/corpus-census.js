// What the public library actually looks like after the file updater has run.
//
// Nobody currently knows: the checked-in JSON of every library game is pre-updater, and the
// updater runs at every load, so the legacyModes written in a file are a lower bound on what
// the game is played with. Counting the files answers the wrong question - this script answers
// the right one by running the updater over every variant and reporting what it assigns.
//
// Run it with `npm run corpus-census`. It reads files and prints; it changes nothing.

import { libraryVariants, readVariant, fileVersion, flagsOnDisk } from './corpus.js';
import { flagsForGame } from './fileupdater-util.js';
import { ALL_LEGACY_MODES } from '../../client/js/legacymoderegistry.js';

const libraries = process.argv.slice(2).length ? process.argv.slice(2) : [ 'games', 'tutorials' ];

for(const library of libraries) {
  const variants = libraryVariants(library);
  if(!variants.length) {
    console.log(`library/${library}: no files\n`);
    continue;
  }

  const onDisk = {};
  const afterUpdater = {};
  const versions = {};
  const games = new Set();
  const gamesWithAnyMode = new Set();
  const failures = [];
  for(const name of ALL_LEGACY_MODES)
    onDisk[name] = afterUpdater[name] = 0;

  for(const variant of variants) {
    games.add(variant.game);
    let state = null;
    try {
      state = readVariant(variant);
    } catch(e) {
      failures.push(`${variant.game}/${variant.variant}.json: unreadable (${e.message})`);
      continue;
    }

    const version = fileVersion(state);
    versions[version] = (versions[version] || 0) + 1;
    // truthy only, like the "at load" column below: the Game Settings panel writes an unticked
    // box as `false`, and counting that as "on disk" would read as the updater removing a mode
    for(const [ name, value ] of Object.entries(flagsOnDisk(state)))
      if(value)
        onDisk[name] = (onDisk[name] || 0) + 1;

    let assigned = null;
    try {
      assigned = flagsForGame(state);
    } catch(e) {
      failures.push(`${variant.game}/${variant.variant}.json: the updater threw (${e.message})`);
      continue;
    }
    for(const [ name, value ] of Object.entries(assigned))
      if(value) {
        afterUpdater[name] = (afterUpdater[name] || 0) + 1;
        gamesWithAnyMode.add(variant.game);
      }
  }

  console.log(`library/${library}: ${games.size} games, ${variants.length} variants`);
  console.log(`  file versions: ${Object.entries(versions).sort((a, b)=>a[0]-b[0]).map(([ v, c ])=>`v${v}: ${c}`).join(', ')}`);
  console.log(`  games with at least one legacy mode at load time: ${gamesWithAnyMode.size}`);
  console.log(`  ${'legacy mode'.padEnd(38)} ${'on disk'.padStart(8)} ${'at load'.padStart(8)}`);
  for(const name of ALL_LEGACY_MODES)
    console.log(`  ${name.padEnd(38)} ${String(onDisk[name] || 0).padStart(8)} ${String(afterUpdater[name] || 0).padStart(8)}`);
  for(const failure of failures)
    console.log(`  ! ${failure}`);

  // The v18 detector is a regex over the whole serialised state, so it fires on any string that
  // merely starts with "var " - the standing example of an over-broad heuristic. This measures
  // how much that actually costs on real content: variants it flags that contain no var
  // expression and no COMPUTE operation anywhere.
  const hasVarExpression = node => {
    if(typeof node == 'string')
      return /^var /.test(node);
    if(Array.isArray(node))
      return node.some(hasVarExpression);
    if(node && typeof node == 'object')
      return node.func == 'COMPUTE' || Object.values(node).some(hasVarExpression);
    return false;
  };
  let flagged = 0;
  let withoutVarExpression = 0;
  for(const variant of variants) {
    let state = null;
    try {
      state = readVariant(variant);
    } catch(e) {
      continue;
    }
    if(fileVersion(state) >= 18 || !flagsForGame(state).convertNumericVarParametersToNumbers)
      continue;
    ++flagged;
    if(!hasVarExpression(state))
      ++withoutVarExpression;
  }
  console.log(`  the v18 regex flags ${flagged} pre-v18 variants, ${withoutVarExpression} of which contain no var expression`);
  console.log('');
}
