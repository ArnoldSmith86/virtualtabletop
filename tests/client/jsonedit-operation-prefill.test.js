import fs from 'fs';
import { validateRoutine } from '../../validator/validate_gamefile.js';

// The editor scripts share a scope in the browser. Keep the actual commands and
// context traversal, replacing only the DOM-based selection of inserted text.
const source = fs.readFileSync('client/js/jsonedit.js', 'utf8').replace(/^export /gm, '');

function editor(prefill = true) {
  return new Function('localStorage', `${source}
    jeSetAndSelect = value => {
      jeStateNow = JSON.parse(JSON.stringify(jeStateNow).replace('"###SELECT ME###"', JSON.stringify(value)));
    };
    for(const command of ['COUNT', 'IF', 'FLIP', 'SHIFT', 'TURN'])
      jeAddRoutineOperationCommands(command, {});
    return {
      state: () => jeStateNow,
      select(state, context) { jeStateNow = state; jeContext = context; },
      insert: command => jeCommands.find(c => c.id == 'operation_' + command).call(),
      canInsert: jeCanInsertOperation,
      anonymous: jeCommands.find(c => c.id == 'je_anonymousCollection')
    };
  `)({ getItem: () => prefill ? null : 'false' });
}

function validate(operation) {
  return validateRoutine([operation], {
    widgetId: 'button', widgets: { h1: { type: 'holder' }, h2: { type: 'holder' } },
    validCollections: { DEFAULT: 1, holders: 1 }, validVariables: {}, calledCustomRoutines: []
  });
}

test('prefilled insertion keeps existing operations and inserts immediately after the selected one', async () => {
  const e = editor();
  e.select({ clickRoutine: [{ func: 'DELETE' }, { func: 'SHUFFLE' }] }, ['button', 'clickRoutine', 0, '(DELETE)']);
  expect(e.canInsert()).toBe(true);
  await e.insert('COUNT');
  expect(e.state().clickRoutine).toEqual([
    { func: 'DELETE' }, { func: 'COUNT', collection: 'DEFAULT', variable: 'COUNT' }, { func: 'SHUFFLE' }
  ]);
});

test('the saved preference disables common properties', async () => {
  const e = editor(false);
  e.select({ clickRoutine: [] }, ['button', 'clickRoutine', null]);
  await e.insert('COUNT');
  expect(e.state().clickRoutine).toEqual([{ func: 'COUNT' }]);
});

test('nested routine arrays are independent across inserted operations', async () => {
  const e = editor();
  e.select({ clickRoutine: [] }, ['button', 'clickRoutine', null]);
  await e.insert('IF');
  e.state().clickRoutine[0].thenRoutine.push({ func: 'DELETE' });
  e.select(e.state(), ['button', 'clickRoutine', 0, '(IF)']);
  await e.insert('IF');
  expect(e.state().clickRoutine[1].thenRoutine).toEqual([]);
});

test.each(['FLIP', 'SHIFT', 'TURN'])('%s prefills match the current validator', async command => {
  const e = editor();
  e.select({ clickRoutine: [] }, ['button', 'clickRoutine', null]);
  await e.insert(command);
  expect(validate(e.state().clickRoutine[0])).toEqual([]);
});

test.each(['holders', 'widgets'])('SHIFT %s supports anonymous collections without converting array elements', async key => {
  const e = editor();
  e.select({ clickRoutine: [{ func: 'SHIFT', [key]: 'holders' }] }, ['button', 'clickRoutine', 0, '(SHIFT)', key]);
  expect(e.anonymous.context && new RegExp(e.anonymous.context).test(['button', 'clickRoutine', 0, '(SHIFT)', key].join(' ↦ '))).toBe(true);
  expect(e.anonymous.show()).toBe(true);
  await e.anonymous.call();
  expect(e.state().clickRoutine[0][key]).toEqual([]);
  e.state().clickRoutine[0][key] = ['h1', 'h2'];
  e.select(e.state(), ['button', 'clickRoutine', 0, '(SHIFT)', key, 0]);
  expect(e.anonymous.show()).toBe(false);
});

test('the validator keeps SHIFT and rejects the retired SWAPHANDS operation', () => {
  expect(validate({ func: 'SHIFT', holders: ['h1', 'h2'], widgets: 'all', direction: 'forward' })).toEqual([]);
  expect(validate({ func: 'SWAPHANDS' })[0].message).toMatch(/SWAPHANDS is not a valid function/);
});

test('the new permissive defaults still reject invalid faces and unknown collections', () => {
  expect(validate({ func: 'FLIP', face: 'wrong' })[0].message).toBe('number or null expected');
  expect(validate({ func: 'TURN', source: 'missing' })[0].message).toBe("Collection 'missing' is undefined.");
});
