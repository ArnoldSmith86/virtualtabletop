import { Selector, ClientFunction } from 'testcafe';

import { compute_ops } from '../../client/js/compute.js';
import { escapeID } from '../../client/js/domhelpers.js';
import { compareState, prepareClient, setName, setRoomState, setupTestEnvironment } from './test-util.js';

setupTestEnvironment();

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
    await t.click(`#w_button${escapeID(op.name)}`);
    await compareState(t, op.hash);
  }
});

test('Dynamic expressions', async t => {
  await t.resizeWindow(1280, 800);
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
    ['var e = random', 'e', shouldBe(0.974268)],
    ['var f = randRange 100 200 5', 'f', shouldBe(120)],
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
    .click('#editButton')
    .click('#editorToolbar > div > [icon=add]')
    .click('#addBasicWidget')
    .click(Selector('button').withAttribute('icon', 'data_object'))
    .typeText('#jeText', button, { replace: true, paste: true })
    .rightClick('#w_jyo6')
    .click(Selector('button').withAttribute('icon', 'pest_control'))
  const log = await Selector('#jeLog').textContent
  for (let i=0; i<ops.length; i++) {
    const logContains = log.includes('"'+ops[i][1]+'": '+ops[i][2]);
    await t.expect(logContains)
           .ok('Test "' + ops[i] + '" failed.');
  };
  await t
    .pressKey('ctrl+j')
});
