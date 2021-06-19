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

async function removeGame(t, index) {
  await t
    .pressKey('esc')
    .click('#statesButton')
    .hover(`.roomState:nth-of-type(${index || 1})`)
    .click(`.roomState:nth-of-type(${index || 1}) .edit`)
    .click('p > .remove');
}

async function setName(t, name) {
  await t
    .click('#playersButton')
    .typeText('.myPlayerEntry > .playerName', name || 'TestCafe', { replace: true })
    .click('#playersButton');
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
    await removeGame(t);
    await t.expect(Selector('#statesOverlay').visible).ok();
  })(`Public library: ${game} (variant ${variant})`, async t => {
    await ClientFunction(prepareClient)();
    await t
      .pressKey('esc')
      .click('#statesButton')
      .click(Selector('td.name').withExactText(game).prevSibling().child())
      .hover('.roomState')
      .click(Selector('button.play').nth(variant));
    await setName(t);
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

test('Create game using edit mode', async t => {
  await emptyRoomState();
  await ClientFunction(prepareClient)();
  await setName(t);
  await t
    .click('#addButton')
    .click('#add-spinner6')
    .click('#jyo6')
    .click('#addButton')
    .click('#add-holder')
    .click('#addButton')
    .click('#addHand')
    .drag('[id="7ayk"]', 100, 100) // this shouldn't change anything because it's not movable
    .click('#editButton')
    .click('[id="7ayk"]')
    .click('#transparentHolder')
    .click('#updateWidget')
    .click('#editButton')
    .click('#addButton')
    .click('#add-deck_K_S')
    .click('[id="9eevB"]')
    .click('[id="9eevP"] > .handle')
    .click('#pileOverlay > button:nth-of-type(3)')
    .click('[id="5iou"] > .handle')
    .click('#pileOverlay > button:nth-of-type(1)')
    .click('[id="5iou"] > .handle')
    .click('#pileOverlay > button:nth-of-type(3)')
    .click('#oklz > .handle')
    .click('#pileOverlay > button:nth-of-type(2)')
    .dragToElement('#oklz > .handle', '[id="3nse"]')
    .click('#editButton')
    .click('#jyo6')
    .click('#editJSONoverlay > #duplicateWidget')
    .click('#jyo7')
    .typeText('#editWidgetJSON', '{"type":"spinner","options":[1,2],"angle": 5,"id": "jyo7"}', { replace: true })
    .click('#editJSONoverlay > #updateWidget')
    .click('#jyo6')
    .setNativeDialogHandler(() => true)
    .click('#editJSONoverlay > #removeWidget');

  await compareState(t, '5dd658f1e79ef3013d29a8c2f5fe839d');
});

test('Dynamic expressions', async t => {
  let button = `{
    "type": "button",
    "text": "DEAL",
    "clickRoutine": [`;
  const ops = [
    ['var int = 1 // integer', 'int', '1'],
    ['var float = 1.05 // number', 'float', '1.05'],
    ['var nothing = null // null value', 'nothing', 'null'],
    ['var text = \'abcd\' // string', 'text', '\"abcd\"'],
    ['var bool = true // boolean', 'bool', true],
    ['var list = [] // empty array', 'list', '[]'],
    ['var obj = {} // object', 'obj', '{}'],
    ['var a = \'foo\'', 'a', '\"foo\"'],
    ['var b = ${a}', 'b', '\"foo\"'],
    ['var c = ${a.1}', 'c', '\"o\"'],
    ['var prop_name = \'x\'', 'prop_name', '\"x\"'],
    ['var prop_widget = \'jyo6\'', 'prop_widget', '\"jyo6\"'],
    ['var a = ${PROPERTY x}', 'a', '810'],
    ['var b = ${PROPERTY x OF jyo6}', 'b', '810'],
    ['var c = ${PROPERTY $prop_name OF $prop_widget}', 'c', '810'],
    ['var a = ${text} == \'abcd\'', 'a', 'true'],
    ['var b = ${int} < ${float}', 'b', 'true'],
    ['var a = 1 + 2', 'a', '3'],
    ['var b = \'read\' + \'me\'', 'b', '\"readme\"'],
    ['var c = 100 / 2', 'c', '50'],
    ['var d = ${int} * ${float}', 'd', '1.05'],
    ['var a = \'split.me.up\' split \'.\'', 'a', '[\n    \"split\",\n    \"me\",\n    \"up\"\n  ]'],
    ['var b = ${a.0} concat \'me\'', 'b', '\"splitme\"'],
    ['var c = \'hello world\' substr 0 5', 'c', '\"hello\"'],
    ['var d = max 7 2', 'd', '7'],
    ['var e = random', 'e', '0.9742682568175951'],
    ['var f = randRange 100 200 5', 'f', '120'],
    ['var g = PI', 'g', '3.141592653589793'],
    ['var a.$int = 2', 'a', '[\n    \"split\",\n    2,\n    \"up\"\n  ]'],
    ['var $text = 2', 'abcd', '2'],
    ['var a = nonexistant', 'a', 'null'],
    ['var b = ${nonexistant_variable_name}', 'b', 'null'],
    ['var c = ${PROPERTY nonexistant_property_name}', 'c', 'null'],
    ['var d = ${PROPERTY x OF nonexistant_widget_id}', 'd', 'null'],
    ['var e = ${list.999999}', 'e', 'null'],
    ['var f = ${foo.bar}', 'f', 'null']
  ];

  ops.forEach((o)=>{
    button += '\n"' + o[0] + '",'
  });
  button = button.substring(0, button.length - 1);
  button += `
      ],
  "x": 810,
  "y": 300,
  "z": 127,
  "id": "jyo6",
  "debug": true
}`;
  await emptyRoomState();
  await ClientFunction(prepareClient)();
  await setName(t);
  await t
    .click('#addButton')
    .click('#add-button')
    .click('#editButton')
    .click('[id="jyo6"]')
    .typeText('#editWidgetJSON', button, { replace: true, paste: true })
    .click('#editJSONoverlay > #updateWidget')
    .click('#editButton')
    .click('[id="jyo6"]')
  const { log } = await t.getBrowserConsoleMessages();
  for (let i=1; i<=ops.length; i++) {
    await t.expect(log[i*2]).contains('"'+ops[i-1][1]+'": '+ops[i-1][2])
  };
});

publicLibraryButtons('Blue',               0, '90dbbde475e09bd500851c5648aa35f1', [
  'fcc3fa2c-c091-41bc-8737-54d8b9d3a929', 'd3ab9f5f-daa4-4d81-8004-50a9c90af88e_incrementButton',
  'd3ab9f5f-daa4-4d81-8004-50a9c90af88e_incrementButton', 'd3ab9f5f-daa4-4d81-8004-50a9c90af88e_decrementButton',
  'fdc25f83-ed33-4845-a97c-ff35fa8a094f_shuffleButton', 'buttonInputGo', 'fcc3fa2c-c091-41bc-8737-54d8b9d3a929', '9n2q'
]);
publicLibraryButtons('FreeCell',           0, 'b3339b3c5d42f47f4def7a164be69823', [ 'reset', 'jemz', 'reset' ]);
publicLibraryButtons('Reward',             0, '9fdd5258e7e556ba75806d28c1f316fd', [
  'gmex', 'kprc', 'oksq', 'j1wz', 'vfhn', '0i6i', 'Orange Recall', 'buttonInputGo', 'b09z'
]);
publicLibraryButtons('Rummy Tiles',        0, 'c593e557612c383acaa757b4124a4d36', [ 'startMix', 'draw14' ]);
publicLibraryButtons('Undercover',         1, '3e9afb911afbcffd5447ac27f8d0b10f', [ 'Reset', 'Spy Master Button' ]);
publicLibraryButtons('Dice',               0, 'd8b6edd6f7a25767781af4294ecda8fc', [ 'k18u', 'hy65', 'gghr', 'dsfa', 'f34a', 'fusq' ]);
publicLibraryButtons('Functions - CALL',   0, '6aa1a9737ee2a27092f0c41ad1b14614', [
  'n4cw_8_C', '5a52', '5a52', '66kr', 'qeg1', 'n4cwB', '8r6p', 'qeg1', 'qeg1', 'n5eu'
]);
publicLibraryButtons('Functions - CLICK',  0, 'b2430bd4589116a05df1fcedb55337c4', [ '7u2q' ]);
publicLibraryButtons('Functions - ROTATE', 0, '747586b12401e43382a7db2b2505f25e', [ 'c44c', '9kdj', 'w53c', 'w53c' ]);
publicLibraryButtons('Functions - SELECT', 0, '4db86f0a95509b1c4fe5ebd6a1f822a9', [ 'oeh9', '9fhb', 'njkk', 'ffwl', 'bomo' ]);
publicLibraryButtons('Functions - SORT',   1, '387ed0489dd09143fe7fd118f84234fd', [
  'ingw', 'k131', 'cnfu', 'i6yz', 'z394', '0v3h', '1h8o', 'v5ra', 'ingw-copy001', 'k131-copy001', 'cnfu-copy001',
  'i6yz-copy001', 'z394-copy001', '0v3h-copy001'
]);
publicLibraryButtons('Master Button',      0, 'eb19dffdb38641d5556e5fdb2c47c62b', [
  'masterbutton', 'redbutton', 'orangebutton', 'yellowbutton', 'greenbutton', 'bluebutton', 'indigobutton',
  'violetbutton', 'fae4', 'vbx5'
]);
