import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

import { Selector } from 'testcafe';

import { diffString, diff } from 'json-diff';

import { fullLegacyCombination, legacyModeCombinations } from '../../client/js/legacymoderegistry.js';

const referenceDir = path.resolve() + '/save/testcafe-references';
fs.mkdirSync(referenceDir, { recursive: true });
let server = null;

// hashes that changed because of Chrome updates that altered how some edge-case values get stringified -
// can hopefully be removed if Chrome changes this back. Keyed by the actual hash, valued by the expected hash.
const knownHashDrifts = {
  'aa8d738dfc1eb7886540315e78e42aae': '1a6e301d6510998fa27abeb75bcf0371', // https://github.com/ArnoldSmith86/virtualtabletop/pull/2668
  '7dbb198bba63663b41191432d8648492': 'bc511e7edd7e40b433f5620534775646'  // Chrome 150
};

// Every fixture starts from an empty room in the modern combination. Widgets are not the only
// thing a test leaves behind: setRoomState() keeps the room's gameSettings (see Room.setState),
// so without the reset a test that switches a legacy mode on hands it to every test that runs
// after it - within the file and, because the whole suite shares one room, across files too.
export function setupTestEnvironment() {
  server = process.env.REFERENCE ? `https://test.virtualtabletop.io/PR-${process.env.REFERENCE}` : 'http://localhost:8272';
  fixture('virtualtabletop.io').page(`${server}/testcafe-testing`).beforeEach(resetRoom).after(resetRoom);
}

// Empty the room and clear its game settings in one request: setState() takes the gameSettings
// out of the _meta it is handed, so the room is back in the modern combination without a
// setLegacyMode round trip per mode. Those would be five state messages in a row before every
// single test - and a state message makes the client rebuild every widget it has.
export async function resetRoom() {
  await setRoomState({ _meta: { version: (await getMeta()).version, gameSettings: {} } });
}

// The page every fixture starts on. A second client in the same room is a second window on the
// same URL, which is what multiclient.js opens.
export function roomURL() {
  return `${server}/testcafe-testing`;
}

// The URL a public library game is shared under - 'game' for the Games library, 'tutorial' for
// the Tutorials one. The slug is derived from the game name the same way Room.getStateDetails()
// derives it when it matches a link back to a game, so digits and spaces both become separators.
export function publicGameURL(gameName, category='game') {
  const slug = gameName.replace(/[^A-Za-z]+/g, '-').toLowerCase().replace(/^-+/, '').replace(/-+$/, '');
  return `${server}/${category}/${slug}`;
}

export function prepareClient() {
  // non random random
  window.customRandomSeed = 1;

  // remove base element because it causes popups on form submit - a test that prepares the
  // same page twice (multiclient.js names its client before it opens the room) finds it gone
  const base = document.querySelector('base');
  if(base)
    base.parentNode.removeChild(base);
}

export async function setName(t, name, color) {
  // setRoomState() returns after the server accepts its REST request, before
  // the browser necessarily receives that state. The first received state
  // activates the Active Game tab, which closes any overlay opened just before
  // it - intermittently hiding this color input in CI. Wait for that initial
  // state transition before opening Players.
  const loadingIndicator = Selector('#loadingRoomIndicator');
  const playerOverlay = Selector('#playerOverlay');
  const playerColor = playerOverlay.find('.myPlayerEntry input[type=color]');
  await t
    .expect(loadingIndicator.exists).notOk()
    .click('#playersButton')
    .expect(playerOverlay.visible).ok()
    .click(playerColor)
    .typeText(playerColor, color || '#7F007F', { replace: true })
    .typeText('.myPlayerEntry .playerName', name || 'TestCafe', { replace: true })
    .click('#activeGameButton');
}

// Node reuses the connection to the server between requests, and one that the server has closed in
// the meantime makes the next fetch() reject with a network-level 'TypeError: fetch failed' before the
// request is ever sent. That is not a test failure - it just kills whichever test runs next, most
// often in the beforeEach hook - so a rejected request is retried with a short backoff. An HTTP error
// status is passed through untouched: that one is a real failure the tests have to see.
async function fetchWithRetry(url, options, attempts=3) {
  for(let attempt=1; ; attempt++) {
    try {
      return await fetch(url, options);
    } catch(e) {
      if(attempt == attempts)
        throw e;
      await new Promise(resolve => setTimeout(resolve, 100 * attempt));
    }
  }
}

export async function setRoomState(state) {
  await fetchWithRetry(`${server}/state/testcafe-testing`, {
    method: 'PUT',
    headers: {
      'Content-Type':'application/json'
    },
    body: JSON.stringify(state || {})
  });
}

export async function setLegacyMode(name, value) {
  await fetchWithRetry(`${server}/setLegacyMode/testcafe-testing/${name}/${value === true ? 'true' : 'false'}`, {
    method: 'PUT'
  });
}

// The tiers from the legacy-mode registry: modern (all off), legacy-all (all on), one entry
// per mode alone and one per declared interaction. Linear in the number of modes.
export const LEGACY_COMBOS = legacyModeCombinations();

// setLegacyMode() only ever switches one mode, so a combination has to name the false modes as
// well - fullLegacyCombination() does that - or the room keeps whatever the last caller set.
export async function applyLegacy(combo) {
  const modes = typeof combo == 'string' ? LEGACY_COMBOS[combo] : combo;
  if(!modes)
    throw Error(`Unknown legacy mode combination '${combo}'.`);
  for(const [ name, value ] of Object.entries(fullLegacyCombination(modes)))
    await setLegacyMode(name, value);
}

export async function getState() {
  const response = await fetchWithRetry(`${server}/state/testcafe-testing/false`);
  return await response.text();
}

export async function getStateObject() {
  return JSON.parse(await getState());
}

// Everything a test does arrives at the server asynchronously, so an assertion has to give the
// delta time to show up. Polls until the value matches or the backoff runs out, then asserts
// once - so a passing test is fast and a failing one still prints the last value it saw.
// timeout raises the backoff limit for values that a routine only produces after a
// deliberate wait, like a DELAY.
export async function expectEventually(t, get, expected, message, timeout=1000) {
  let actual = await get();
  for(let wait=50; wait<timeout && JSON.stringify(actual) != JSON.stringify(expected); wait*=2) {
    await new Promise(resolve=>setTimeout(resolve, wait));
    actual = await get();
  }
  await t.expect(actual).eql(expected, message);
}

// getState leaves _meta out - this is the version and the game settings the room is on
export async function getMeta() {
  const response = await fetchWithRetry(`${server}/state/testcafe-testing`);
  return JSON.parse(await response.text())._meta;
}

// Wait until the room state stops changing, i.e. until every routine triggered by
// the last interaction has finished, and return that stable state. Without this, a
// test that performs multiple interactions in a row can start the next one while
// the game is still evaluating the previous one, which makes games that validate
// moves (like Reversi) reject it.
//
// Pass the state from before an interaction as `differentFrom` to also wait for it
// to arrive: otherwise "stable" can just mean "the interaction has not reached the
// server yet", which would make a negative assertion afterwards pass vacuously.
export async function waitForStableState({ differentFrom = null, timeout = 10000 } = {}) {
  const start = Date.now();
  let previous = null;
  let changed = differentFrom === null;

  while(Date.now() - start < timeout) {
    const state = await getState();
    if(!changed)
      changed = state !== differentFrom;
    else if(state === previous)
      return state;
    previous = state;
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // failing here points at the interaction that never settled instead of letting
  // the test run on and fail with an unrelated-looking state hash mismatch later
  throw new Error(changed ? `The room state was still changing after ${timeout}ms.`
                          : `The room state did not change at all within ${timeout}ms.`);
}

export async function compareState(t, md5) {
  const refFile = `${referenceDir}/${md5}.json`;
  let hash = null;
  let state = null;
  for(let wait=50; wait<1000; wait*=2) {
    state = await getState();
    hash = crypto.createHash('md5').update(state).digest('hex');

    if(hash == md5 || knownHashDrifts[hash] == md5) {
      if(!fs.existsSync(refFile))
        fs.writeFileSync(refFile, state);

      if(knownHashDrifts[hash] == md5)
        await t.expect(md5).eql(md5);
      else
        await t.expect(hash).eql(md5);
      return;
    }

    // wait for a bit and try again
    await new Promise(resolve => setTimeout(resolve, wait));
  }

  if(!process.env.REFERENCE && fs.existsSync(refFile))
    console.log(diffString(JSON.parse(fs.readFileSync(refFile)), JSON.parse(state)));

  await t.expect(hash).eql(md5);
}
