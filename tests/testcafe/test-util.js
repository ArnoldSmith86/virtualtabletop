import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

import { diffString, diff } from 'json-diff';

const referenceDir = path.resolve() + '/save/testcafe-references';
fs.mkdirSync(referenceDir, { recursive: true });
let server = null;

// hashes that changed because of Chrome updates that altered how some edge-case values get stringified -
// can hopefully be removed if Chrome changes this back. Keyed by the actual hash, valued by the expected hash.
const knownHashDrifts = {
  'aa8d738dfc1eb7886540315e78e42aae': '1a6e301d6510998fa27abeb75bcf0371', // https://github.com/ArnoldSmith86/virtualtabletop/pull/2668
  '7dbb198bba63663b41191432d8648492': 'bc511e7edd7e40b433f5620534775646'  // Chrome 150
};

export function setupTestEnvironment() {
  server = process.env.REFERENCE ? `https://test.virtualtabletop.io/PR-${process.env.REFERENCE}` : 'http://localhost:8272';
  fixture('virtualtabletop.io').page(`${server}/testcafe-testing`).beforeEach(_=>setRoomState()).after(_=>setRoomState());
}

export function prepareClient() {
  // non random random
  window.customRandomSeed = 1;

  // remove base element because it causes popups on form submit
  document.querySelector('base').parentNode.removeChild(document.querySelector('base'));
}

export async function setName(t, name, color) {
  await t
    .click('#playersButton')
    .click('.myPlayerEntry input[type=color]')
    .typeText('.myPlayerEntry input[type=color]', color || '#7F007F', { replace: true })
    .typeText('.myPlayerEntry > .playerName', name || 'TestCafe', { replace: true })
    .click('#activeGameButton');
}

export async function setRoomState(state) {
  await fetch(`${server}/state/testcafe-testing`, {
    method: 'PUT',
    headers: {
      'Content-Type':'application/json'
    },
    body: JSON.stringify(state || {})
  });
}

export async function setLegacyMode(name, value) {
  await fetch(`${server}/setLegacyMode/testcafe-testing/${name}/${value === true ? 'true' : 'false'}`, {
    method: 'PUT'
  });
}

export async function getState() {
  const response = await fetch(`${server}/state/testcafe-testing/false`);
  return await response.text();
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

