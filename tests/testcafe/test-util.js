import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import crypto from 'crypto';

import { diffString, diff } from 'json-diff';

const referenceDir = path.resolve() + '/save/testcafe-references';
let server;

export function setupTestEnvironment() {
  if (!server) {
    server = process.env.REFERENCE ? `http://212.47.248.129:${process.env.REFERENCE}` : 'http://localhost:8272';
    fs.mkdirSync(referenceDir, { recursive: true });
    fixture('virtualtabletop.io').page(`${server}/testcafe-testing`).beforeEach(_=>setRoomState()).after(_=>setRoomState());
  }
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
    .click('#playersButton');
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

    if(hash == md5) {
      if(!fs.existsSync(refFile))
        fs.writeFileSync(refFile, state);

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

