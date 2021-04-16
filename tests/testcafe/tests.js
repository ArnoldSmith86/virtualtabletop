import { Selector, ClientFunction } from 'testcafe';
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import crypto from 'crypto';
import { diffString, diff } from 'json-diff';

const server = process.env.REFERENCE ? `http://212.47.248.129:${3000 + +process.env.REFERENCE}` : 'http://localhost:8272';
const referenceDir = path.resolve() + '/save/testcafe-references';

if(process.env.REFERENCE)
  fs.mkdirSync(referenceDir, { recursive: true });

getState();

async function emptyRoomState() {
  await fetch(`${server}/state/testcafe-testing`, {
    method: 'PUT',
    headers: {
      'Content-Type':'application/json'
    },
    body: '{}'
  });
}

function prepareClient() {
  // non random random
  let seed = 1;
  Math.random = function() {
    const x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
  };

  // remove base element because it causes popups on form submit
  document.querySelector('base').parentNode.removeChild(document.querySelector('base'));
}

function publicLibraryTest(game, variant, md5, tests) {
  test.after(async t => {
    await t
      .click('#statesButton')
      .hover('.roomState')
      .click('.edit')
      .click('p > .remove')
      .expect(Selector('#statesOverlay').visible).ok();
  })(`Public library: ${game} (variant ${variant})`, async t => {
    await ClientFunction(prepareClient)();
    await t
      .pressKey('esc')
      .click('#statesButton')
      .click(Selector('td.name').withExactText(game).prevSibling().child())
      .hover('.roomState')
      .click(Selector('button.play').nth(variant))
      .click('#playersButton')
      .typeText('.myPlayerEntry > .playerName', 'TestCafe', { replace: true })
      .click('#playersButton');
    await tests(t);
    await compareState(t, md5);
  });
}

function publicLibraryButtons(game, variant, md5, buttons) {
  publicLibraryTest(game, variant, md5, async t => {
    for(const b of buttons)
      await t.click(`[id="${b}"]`);
  });
}

async function compareState(t, md5) {
  const state = await getState();
  const hash = crypto.createHash('md5').update(state).digest('hex');
  const refFile = `${referenceDir}/${md5}.json`;

  if(process.env.REFERENCE && hash == md5)
    fs.writeFileSync(refFile, state);

  if(!process.env.REFERENCE && hash != md5 && fs.existsSync(refFile))
    console.log(diffString(JSON.parse(fs.readFileSync(refFile)), JSON.parse(state)));

  await t.expect(hash).eql(md5);
}

async function getState() {
  // wait for 500ms
  await new Promise(resolve => setTimeout(resolve, 500));

  const response = await fetch(`${server}/state/testcafe-testing`);
  return await response.text();
}

fixture('virtualtabletop.io').page(`${server}/testcafe-testing`).beforeEach(emptyRoomState).after(emptyRoomState);

publicLibraryButtons('Blue',               0, '8cf30e7dbcb33dc01fbbc0d7b5dac039', [
  'fcc3fa2c-c091-41bc-8737-54d8b9d3a929', 'd3ab9f5f-daa4-4d81-8004-50a9c90af88e_incrementButton',
  'd3ab9f5f-daa4-4d81-8004-50a9c90af88e_incrementButton', 'd3ab9f5f-daa4-4d81-8004-50a9c90af88e_decrementButton',
  'fdc25f83-ed33-4845-a97c-ff35fa8a094f_shuffleButton', 'buttonInputGo', 'fcc3fa2c-c091-41bc-8737-54d8b9d3a929', '9n2q'
]);
publicLibraryButtons('FreeCell',           0, '4b0aee9fd6706a08e35928e70601b27e', [ 'reset', 'jemz', 'reset' ]);
publicLibraryButtons('Reward',             0, 'cbf8598d244e1290efe98f0d7fb3ccc8', [
  'gmex', 'kprc', 'oksq', 'j1wz', 'vfhn', '0i6i', 'Orange Recall', 'buttonInputGo', 'b09z'
]);
publicLibraryButtons('Rummy Tiles',        0, '5d171ad18638d051bb79bafaad169583', [ 'startMix', 'draw14' ]);
publicLibraryButtons('Undercover',         1, 'd3ba0452c9f44e8963d49a484c78e66b', [ 'Reset', 'Spy Master Button' ]);
publicLibraryButtons('Dice',               0, '3cd34fc98732a94639d37e677c81b7f2', [ 'k18u', 'hy65', 'gghr', 'dsfa', 'f34a', 'fusq' ]);
publicLibraryButtons('Functions - CALL',   0, '176feb836057ecc4b5074df90ddc4e2f', [
  'n4cw_8_C', '5a52', '5a52', '66kr', 'qeg1', 'n4cwB', '8r6p', 'qeg1', 'qeg1', 'n5eu'
]);
publicLibraryButtons('Functions - CLICK',  0, '15b6f716708d97b769cdc930b1ae24ac', [ '7u2q' ]);
publicLibraryButtons('Functions - RANDOM', 0, 'bfd121b54d8ab0fced83cc0bcc09032d', [ '9fhb', 'yqji', 'oeh9' ]);
publicLibraryButtons('Functions - ROTATE', 0, 'cccdcdcd6bb944a8a3916349a4128290', [ 'c44c', '9kdj', 'w53c', 'w53c' ]);
publicLibraryButtons('Functions - SELECT', 0, 'f116837e48e596c78cb1cac780b21762', [ 'oeh9', '9fhb', 'njkk', 'ffwl', 'bomo' ]);
publicLibraryButtons('Functions - SORT',   1, 'dd047343b667795ad6d3f366aa2ae2fd', [
  'ingw', 'k131', 'cnfu', 'i6yz', 'z394', '0v3h', '1h8o', 'v5ra', 'ingw-copy001', 'k131-copy001', 'cnfu-copy001',
  'i6yz-copy001', 'z394-copy001', '0v3h-copy001'
]);
publicLibraryButtons('Master Button',      0, '8249f5f20ad44bc0ac468e4f0bbcacd5', [
  'masterbutton', 'redbutton', 'orangebutton', 'yellowbutton', 'greenbutton', 'bluebutton', 'indigobutton',
  'violetbutton', 'fae4', 'vbx5'
]);
