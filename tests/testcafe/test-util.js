import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

import { Selector } from 'testcafe';

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
