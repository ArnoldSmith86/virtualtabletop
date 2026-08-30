import fs from 'fs';
import path from 'path';

import { ClientFunction, Selector } from 'testcafe';
import { diff } from 'json-diff';

import { libraryVariants, readVariant } from '../server/corpus.js';
import { applyLegacy, getMeta, getStateObject, prepareClient, setRoomState, setupTestEnvironment } from './test-util.js';

setupTestEnvironment();

// Layer D: replay the public library.
//
// What this is: a broad, cheap crash finder over real content, at the legacy modes the file
// updater actually assigns - which is not what the files say, because every library file is
// pre-updater. What it is not: a proof of safety. Most games are not in the public library, so
// it is a biased sample, and clicking every button is a thin probe of any real game - it cannot
// drag, type or draw (that is what tests/testcafe/interactions.js is for). A clean run is a
// floor, not a certificate, which is why this is not wired into the per-PR checks.
//
// Environment:
//   CORPUS_SHARD=<n>/<total>  replay only one slice, for a sharded nightly job
//   CORPUS_LIMIT=<n>          replay at most n variants (default: all in the shard)
//   CORPUS_GAMES=<a,b>        replay only these games, by directory name
//   CORPUS_FLAGS_OFF=1        replay each game a second time with every mode off and report
//                             which games the flags are load-bearing for
//
// The per-game report lands in save/corpus-replay/, which is not checked in: the interesting
// output is the difference between two runs, not the absolute state.

const reportDirectory = path.resolve() + '/save/corpus-replay';
fs.mkdirSync(reportDirectory, { recursive: true });

function selectedVariants() {
  let variants = [ ...libraryVariants('games'), ...libraryVariants('tutorials') ];
  // `npm run testcafe-headless-all` picks up every file in this directory, and replaying 570
  // variants is a nightly job, not something a contributor should trip over - so without an
  // explicit selection this samples the library rather than replaying it
  if(!process.env.CORPUS_GAMES && !process.env.CORPUS_SHARD && !process.env.CORPUS_LIMIT)
    return variants.filter((variant, index)=>index % 32 == 0);
  if(process.env.CORPUS_GAMES) {
    const wanted = process.env.CORPUS_GAMES.split(',').map(name=>name.trim());
    variants = variants.filter(variant=>wanted.indexOf(variant.game) != -1);
  }
  if(process.env.CORPUS_SHARD) {
    const [ shard, total ] = process.env.CORPUS_SHARD.split('/').map(Number);
    variants = variants.filter((variant, index)=>index % total == shard-1);
  }
  if(process.env.CORPUS_LIMIT)
    variants = variants.slice(0, +process.env.CORPUS_LIMIT);
  return variants;
}

const engineException = message => /Cannot read|is not a function|is not defined|undefined is not|TypeError|ReferenceError/.test(message);

// Every button a player could press, in a fixed order so two runs are comparable.
const buttonIDsWithRoutine = state => Object.values(state)
  .filter(widget=>widget && widget.clickRoutine && widget.type != 'card')
  .map(widget=>widget.id)
  .sort();

// overrideFlags replaces the modes the room derived, or null to replay the game as loaded.
// errorsBefore is how many console errors the page had already produced: TestCafe accumulates
// them for the lifetime of the page and this never navigates, so a second replay in the same
// test would otherwise inherit the first one's errors.
async function replay(t, state, overrideFlags, errorsBefore = 0) {
  await ClientFunction(prepareClient)();
  await t.click('#activeGameButton');
  await setRoomState({});
  await setRoomState(JSON.parse(JSON.stringify(state)));
  // The modes the room just derived, asked of the room rather than of the file updater: that
  // updater is an ES module and a TestCafe test file is compiled to CommonJS, which cannot
  // import one.
  const legacyModes = ((await getMeta()).gameSettings || {}).legacyModes || {};
  // The room derives the modes from the file itself - Room.setState() runs FileUpdater for any
  // state carrying _meta, which every library file does - so the asserted replay needs no call
  // here, and a call *before* the load would be discarded by exactly that. Overriding them is
  // therefore a step after the load; switching a mode re-broadcasts the state, so the widgets
  // are rebuilt with the override in place, which is the path the Game Settings panel takes.
  if(overrideFlags)
    await applyLegacy(overrideFlags);
  await t.wait(1000);

  const buttons = buttonIDsWithRoutine(state);
  const clicked = [];
  for(const id of buttons) {
    const selector = Selector(`#w_${id.replace(/[^A-Za-z0-9_-]/g, match=>`\\${match}`)}`);
    if(!await selector.exists)
      continue;
    try {
      await t.click(selector, { speed: 1 });
      clicked.push(id);
      await t.wait(120);
    } catch(e) {
      // a button that cannot be clicked (covered, invisible, removed by an earlier routine) is
      // not a finding - a crash is
      continue;
    }
  }

  const messages = (await t.getBrowserConsoleMessages()).error || [];
  return { clicked, legacyModes, errors: messages.slice(errorsBefore), errorsSeen: messages.length, state: await getStateObject() };
}

for(const variant of selectedVariants()) {
  test(`Corpus: ${variant.library}/${variant.game} (variant ${variant.variant})`, async t => {
    const state = readVariant(variant);

    const withFlags = await replay(t, state, null);
    const flags = withFlags.legacyModes;
    const report = {
      game: `${variant.library}/${variant.game}`,
      variant: variant.variant,
      // the flags the updater assigns at load are part of the golden output: a PR that changes
      // which games get which mode is a finding in its own right, usually a bigger one than a
      // state difference
      legacyModes: flags,
      buttonsClicked: withFlags.clicked.length,
      errors: withFlags.errors
    };

    if(process.env.CORPUS_FLAGS_OFF && Object.keys(flags).length) {
      const withoutFlags = await replay(t, state, {}, withFlags.errorsSeen);
      report.flagsOffErrors = withoutFlags.errors;
      // a diagnostic, never a pass criterion: it says where a flag is load-bearing for a probe
      // that only clicks buttons, and says nothing about dragging, typing, drawing or timing
      report.flagsOffDifference = diff(withFlags.state, withoutFlags.state) !== undefined;
    }

    fs.writeFileSync(`${reportDirectory}/${variant.library}-${variant.game.replace(/[^A-Za-z0-9]/g, '_')}-${variant.variant}.json`, JSON.stringify(report, null, 2));

    // An uncaught exception already fails the test - TestCafe does that on its own. What is
    // asserted here is the subset of console errors that reads like the engine tripping over
    // itself; the rest (a game referring to a deck it does not ship, say) is a content problem
    // that would make this job permanently red for reasons no engine change can fix, so it is
    // recorded in the report and diffed between runs instead.
    await t.expect(withFlags.errors.filter(engineException)).eql([], `${variant.game} replayed without an engine exception`);
  });
}
