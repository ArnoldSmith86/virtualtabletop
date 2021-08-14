import { Selector, ClientFunction } from 'testcafe';
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import crypto from 'crypto';
import { diffString, diff } from 'json-diff';

import { compute_ops } from '../../client/js/compute.js';

const server = process.env.REFERENCE ? `http://212.47.248.129:${3000 + +process.env.REFERENCE}` : 'http://localhost:8272';
const referenceDir = path.resolve() + '/save/testcafe-references';

fs.mkdirSync(referenceDir, { recursive: true });

async function setRoomState(state) {
  await fetch(`${server}/state/testcafe-testing`, {
    method: 'PUT',
    headers: {
      'Content-Type':'application/json'
    },
    body: JSON.stringify(state || {})
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
    return Math.round((x - Math.floor(x))*1000000)/1000000;
  };

  // remove base element because it causes popups on form submit
  document.querySelector('base').parentNode.removeChild(document.querySelector('base'));
}

function hiddenTest(game, variant, md5, tests) {
  const testUrl = `${server}/library/${game}.vtt#VTT`;
  test.after(async t => {
    await removeGame(t);
    await t.expect(Selector('#statesOverlay').visible).ok();
  })(`Public library: ${game} (variant ${variant})`, async t => {
    await ClientFunction(prepareClient)();
    await t
      .pressKey('esc')
      .click('#statesButton')
      .setNativeDialogHandler(() => testUrl, { dependencies: { testUrl }})
      .click('button.prettyButton.link:nth-child(2)')
      .pressKey('enter')
      .hover('.roomState')
      .click(Selector('button.play').nth(variant));
    await setName(t);
    await tests(t);
    await compareState(t, md5);
  });
}

function hiddenLibraryButtons(game, variant, md5, buttons) {
  hiddenTest(game, variant, md5, async t => {
    for(const b of buttons) {
      const clickSubmit = ClientFunction(() => {
    document.getElementById(`${b}`).click().wait(20000);
});
      await t
      await clickSubmit();
    }
  });
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

async function getState() {
  const response = await fetch(`${server}/state/testcafe-testing`);
  return await response.text();
}

fixture('virtualtabletop.io').page(`${server}/testcafe-testing`).beforeEach(_=>setRoomState()).after(_=>setRoomState());

test('Create game using edit mode', async t => {
  await setRoomState();
  await ClientFunction(prepareClient)();
  await setName(t);
  await t
    .click('#addButton')
    .click('#add-spinner6')
    .click('#jyo2')
    .click('#addButton')
    .click('#add-holder')
    .click('#addButton')
    .click('#addHand')
    .drag('[id="3nsj"]', 100, 100) // this shouldn't change anything because it's not movable
    .click('#editButton')
    .click('[id="3nsj"]')
    .click('#transparentHolder')
    .click('#updateWidget')
    .click('#editButton')
    .click('#addButton')
    .click('#add-deck_K_S')
    .click('[id="9ee9B"]')
    .click('[id="9ee9P"] > .handle')
    .click('#pileOverlay > button:nth-of-type(3)')
    .click('[id="5ip4"] > .handle')
    .click('#pileOverlay > button:nth-of-type(1)')
    .click('[id="5ip4"] > .handle')
    .click('#pileOverlay > button:nth-of-type(3)')
    .click('#oklb > .handle')
    .click('#pileOverlay > button:nth-of-type(2)')
    .dragToElement('#oklb > .handle', '[id="3nsj"]')
    .click('#editButton')
    .click('#jyo2')
    .click('#duplicateWidget')
    .click('#jyo3')
    .click('#manualEdit')
    .typeText('#editWidgetJSON', '{"type":"spinner","options":[1,2],"angle": 5,"id": "jyo3"}', { replace: true })
    .click('#editJSONoverlay #updateWidget')
    .click('#jyo2')
    .setNativeDialogHandler(() => true)
    .click('#removeWidget');

  await compareState(t, 'f6c89dac1d50d5d49f1dde03a478c425');
});

test('Compute', async t => {
  function opToString(op) {
    if(op === undefined)
      return '//';
    if(op && op[0] == '$')
      return op;
    return JSON.stringify(op).replace(/"/g, "'");
  }

  await ClientFunction(prepareClient)();
  await setName(t);

  for(const index in compute_ops) {
    const op = compute_ops[index];
    const operators = [ 0, 1, '${obj.12}', 0.1, '', '0', '${str}', true, '${obj.$str}', null, undefined, [], '${PROPERTY arr}', {}, '${PROPERTY obj}' ];
    const clickRoutine = [ "var str = 'as0d'", "var obj = ${PROPERTY obj}", 'var results = []' ];
    let i = 0;
    for(const op1 of operators) {
      for(const op2 of operators) {
        for(const op3 of operators) {
          clickRoutine.push(`var results.${i++} = ${op.name} ${opToString(op1)} ${opToString(op2)} ${opToString(op3)}`);
        }
      }
    }
    clickRoutine.push({
      func: 'SET',
      property: 'results',
      value: '${results}',
      collection: 'thisButton'
    });

    const state = {};
    state[`button${op.name}`] = {
      id: `button${op.name}`,
      type: 'button',
      obj: { '12': 2, 'as0d': false },
      arr: [ 'a', '1', 1, 'as0d', false, [], {} ],
      clickRoutine
    };
    await setRoomState(state);
    await t.click(`[id="button${op.name}"]`);
    await compareState(t, op.hash);
  }
});

test('Dynamic expressions', async t => {
  let button = `{
    "type": "button",
    "text": "DEAL",
    "clickRoutine": [`;
    function shouldBe(a) {
      switch((typeof a)) {
        case 'object':
          if (Array.isArray(a))
            return a.length > 0 ? '['.concat(a.map(e => typeof e === 'string' ? '\n    \u0022' + e + '\u0022' : '\n    ' + e).join()).concat('\n  ]') : '[]';
          else
            return '{}'; // TODO: non-empty object
        case 'string':
          return '\u0022' + a + '\u0022';
        case 'number':
          return +a;
        case 'boolean':
          return '' + a;
        default:
          return 'null';
      }
    }
  const ops = [
    ['var int = 1 // integer', 'int', shouldBe(1)],
    ['var float = 1.05 // number', 'float', shouldBe(1.05)],
    ['var nothing = null // null value', 'nothing', shouldBe()],
    ['var text = \'abcd\' // string', 'text', shouldBe('abcd')],
    ['var bool = true // boolean', 'bool', shouldBe(true)],
    ['var list = [] // empty array', 'list', shouldBe([])],
    ['var obj = {} // object', 'obj', shouldBe({})],
    ['var a = \'foo\'', 'a', shouldBe('foo')],
    ['var b = ${a}', 'b', shouldBe('foo')],
    ['var c = ${a.1}', 'c', shouldBe('o')],
    ['var prop_name = \'x\'', 'prop_name', shouldBe('x')],
    ['var prop_widget = \'jyo6\'', 'prop_widget', shouldBe('jyo6')],
    ['var a = ${PROPERTY x}', 'a', shouldBe(810)],
    ['var b = ${PROPERTY x OF jyo6}', 'b', shouldBe(810)],
    ['var c = ${PROPERTY $prop_name OF $prop_widget}', 'c', shouldBe(810)],
    ['var a = ${text} == \'abcd\'', 'a', shouldBe(true)],
    ['var b = ${int} < ${float}', 'b', shouldBe(true)],
    ['var a = 1 + 2', 'a', shouldBe(3)],
    ['var b = \'read\' + \'me\'', 'b', shouldBe('readme')],
    ['var c = 100 / 2', 'c', shouldBe(50)],
    ['var d = ${int} * ${float}', 'd', shouldBe(1.05)],
    ['var a = \'split.me.up\' split \'.\'', 'a', shouldBe(["split","me","up"])],
    ['var b = ${a.0} concat \'me\'', 'b', shouldBe('splitme')],
    ['var c = \'hello world\' substr 0 5', 'c', shouldBe('hello')],
    ['var d = max 7 2', 'd', shouldBe(7)],
    ['var e = random', 'e', shouldBe(0.709848)],
    ['var f = randRange 100 200 5', 'f', shouldBe(195)],
    ['var g = PI', 'g', shouldBe(3.141592653589793)],
    ['var a.$int = 2', 'a', shouldBe(["split",2,"up"])],
    ['var $text = 2', 'abcd', shouldBe(2)],
    ['var a = nonexistant', 'a', shouldBe()],
    ['var b = ${nonexistant_variable_name}', 'b', shouldBe()],
    ['var c = ${PROPERTY nonexistant_property_name}', 'c', shouldBe()],
    ['var d = ${PROPERTY x OF nonexistant_widget_id}', 'd', shouldBe()],
    ['var e = ${list.999999}', 'e', shouldBe()],
    ['var f = ${foo.bar}', 'f', shouldBe()],
    ['var a = []', 'a', shouldBe([])],
    ['var a = push 1', 'a', shouldBe([1])],
    ['var a = push 3', 'a', shouldBe([1,3])],
    ['var a = insert 2 1', 'a', shouldBe([1,2,3])],
    ['var test = 2 in ${a}', 'test', shouldBe(true)],
    ['var test = ${a} includes 2', 'test', shouldBe(true)],
    ['var a = remove 1 2', 'a', shouldBe([1])],
    ['var test = 2 in ${a}', 'test', shouldBe(false)],
    ['var test = ${a} includes 2', 'test', shouldBe(false)],
    ['var b = \'ac\'', 'b', shouldBe('ac')],
    ['var b = insert \'b\' 1', 'b', shouldBe('abc')],
    ['var test = \'b\' in ${b}', 'test', shouldBe(true)],
    ['var test = ${b} includes \'b\'', 'test', shouldBe(true)],
    ['var m = ${b} match \'a.c\'', 'm', shouldBe(['abc'])],
    ['var b = remove 1 2', 'b', shouldBe('a')],
    ['var test = \'b\' in ${b}', 'test', shouldBe(false)],
    ['var test = ${b} includes \'b\'', 'test', shouldBe(false)],
    ['var c = from ${b}', 'c', shouldBe(['a'])],
    ['var c = parseFloat \'0.3\'', 'c', shouldBe(0.3)]
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
  "id": "jyo6"
}`;
  await setRoomState();
  await ClientFunction(prepareClient)();
  await setName(t);
  await t
    .click('#addButton')
    .click('#addCustomWidgetOverlay')
    .typeText('#widgetText', button, { replace: true, paste: true })
    .click('#addWidget')
    .pressKey('ctrl+j')
    .click('[id="jyo6"]')
  const log = await Selector('#jeLog').textContent
  for (let i=0; i<ops.length; i++) {
    await t.expect(log).contains('"'+ops[i][1]+'": '+ops[i][2])
  };
  await t
    .pressKey('ctrl+j')
});

publicLibraryButtons('Blue',               0, '6681bcf652fe87f58945797e2f909036', [
  'fcc3fa2c-c091-41bc-8737-54d8b9d3a929', 'd3ab9f5f-daa4-4d81-8004-50a9c90af88e_incrementButton',
  'd3ab9f5f-daa4-4d81-8004-50a9c90af88e_incrementButton', 'd3ab9f5f-daa4-4d81-8004-50a9c90af88e_decrementButton',
  'reset_button', 'buttonInputGo', 'fcc3fa2c-c091-41bc-8737-54d8b9d3a929', '9n2q'
]);
publicLibraryButtons('FreeCell',           0, 'b3339b3c5d42f47f4def7a164be69823', [ 'reset', 'jemz', 'reset' ]);
publicLibraryButtons('Reward',             0, 'f46d98d8c5b9ec8930524a1173364e10', [
  'gmex', 'kprc', 'oksq', 'j1wz', 'vfhn', '0i6i', 'Orange Recall', 'buttonInputGo', 'b09z'
]);
publicLibraryButtons('Rummy Tiles',        0, '3e7716fb5b94c59969861a72fad9ce90', [ 'startMix', 'draw14' ]);
publicLibraryButtons('Undercover',         1, '2ae852ce49304b1074b483138026b1b0', [ 'Reset', 'Spy Master Button' ]);
publicLibraryButtons('Dice',               0, 'd8b6edd6f7a25767781af4294ecda8fc', [ 'k18u', 'hy65', 'gghr', 'dsfa', 'f34a', 'fusq' ]);
publicLibraryButtons('Functions - CALL',   0, 'def80a1f8ae3047bd435007cc7cd4aa3', [
  'n4cw_8_C', '5a52', '5a52', '66kr', 'qeg1', 'n4cwB', '8r6p', 'qeg1', 'qeg1', 'n5eu'
]);
publicLibraryButtons('Functions - CLICK',  0, 'd98299a0065b24a44b0d03a79900e0ef', [ '7u2q' ]);
publicLibraryButtons('Functions - ROTATE', 0, '747586b12401e43382a7db2b2505f25e', [ 'c44c', '9kdj', 'w53c', 'w53c' ]);
publicLibraryButtons('Functions - SELECT', 0, '4db86f0a95509b1c4fe5ebd6a1f822a9', [ 'oeh9', '9fhb', 'njkk', 'ffwl', 'bomo' ]);
publicLibraryButtons('Functions - SORT',   1, 'dd047343b667795ad6d3f366aa2ae2fd', [
  'ingw', 'k131', 'cnfu', 'i6yz', 'z394', '0v3h', '1h8o', 'v5ra', 'ingw-copy001', 'k131-copy001', 'cnfu-copy001',
  'i6yz-copy001', 'z394-copy001', '0v3h-copy001'
]);
publicLibraryButtons('Master Button',      0, 'eb19dffdb38641d5556e5fdb2c47c62b', [
  'masterbutton', 'redbutton', 'orangebutton', 'yellowbutton', 'greenbutton', 'bluebutton', 'indigobutton',
  'violetbutton', 'fae4', 'vbx5'
]);

hiddenLibraryButtons('Test_Room',      0, 'd4bdcaad84bd09fb792fc4a6990bc0d5', [
  'clickThis'
]);
