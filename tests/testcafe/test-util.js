import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

import { diffString, diff } from 'json-diff';

import { ALL_LEGACY_MODES, legacyModeCombinations } from '../../client/js/legacymoderegistry.js';

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

// The tiers from the legacy-mode registry: modern (all off), legacy-all (all on), one entry
// per mode alone and one per declared interaction. Linear in the number of modes.
export const LEGACY_COMBOS = legacyModeCombinations();

// setRoomState() keeps the room's gameSettings (see Room.setState), so a test that only ever
// switches modes on leaks them into every test that runs after it in the same room. Setting
// every mode explicitly - the false ones included - is what makes a combination reproducible.
export async function applyLegacy(combo) {
  const modes = typeof combo == 'string' ? LEGACY_COMBOS[combo] : combo;
  if(!modes)
    throw Error(`Unknown legacy mode combination '${combo}'.`);
  for(const name of ALL_LEGACY_MODES)
    await setLegacyMode(name, !!modes[name]);
}

export async function getState() {
  const response = await fetch(`${server}/state/testcafe-testing/false`);
  return await response.text();
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

