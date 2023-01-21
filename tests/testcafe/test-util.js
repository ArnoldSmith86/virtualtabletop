import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import crypto from 'crypto';

import { diffString, diff } from 'json-diff';

const referenceDir = path.resolve() + '/save/testcafe-references';
fs.mkdirSync(referenceDir, { recursive: true });
let server = null;

export function setupTestEnvironment() {
  server = process.env.REFERENCE ? `http://212.47.248.129:${process.env.REFERENCE}` : 'http://localhost:8272';
  fixture('virtualtabletop.io').page(`${server}/testcafe-testing`).beforeEach(_=>setRoomState()).after(_=>setRoomState());
}

export function prepareClient() {
  // non random random
  let seed = 1;
  Math.random = function() {
    const x = Math.sin(seed++) * 10000;
    return Math.round((x - Math.floor(x))*1000000)/1000000;
  };

  // remove base element because it causes popups on form submit
  document.querySelector('base').parentNode.removeChild(document.querySelector('base'));
}

export async function setName(t, name, color) {
  await t
    .click('#playersButton')
    .click('.myPlayerEntry > input[type=color]')
    .typeText('.myPlayerEntry > input[type=color]', color || '#7F007F', { replace: true })
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

export async function getState() {
  const response = await fetch(`${server}/state/testcafe-testing`);
  return await response.text();
}

export async function compareState(t, md5) {
  const refFile = `${referenceDir}/${md5}.json`;
  let hash = null;
  let state = null;
  for(let wait=50; wait<1000; wait*=2) {
    state = await getState();
    hash = crypto.createHash('md5').update(state).digest('hex');

    // hardcoded hash difference because of https://github.com/ArnoldSmith86/virtualtabletop/issues/1553 - can hopefully be removed if Chrome changes this back
    if(hash == md5 || hash == 'a1c9e538ab6e1bf3296e4e90cffa0cfb' && md5 == '4403a094826913c3d883dedc619e4924') {
      if(!fs.existsSync(refFile))
        fs.writeFileSync(refFile, state);

      if(hash == 'a1c9e538ab6e1bf3296e4e90cffa0cfb' && md5 == '4403a094826913c3d883dedc619e4924')
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

