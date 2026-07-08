import { ClientFunction } from 'testcafe';

import { escapeID } from '../../client/js/domhelpers.js';
import { compareState, prepareClient, setName, setRoomState, setLegacyMode } from './test-util.js';

function opToString(op) {
  if(op === undefined)
    return '//';
  if(op && op[0] == '$')
    return op;
  return JSON.stringify(op).replace(/"/g, "'");
}

export function computeTest(ops, label) {
  test(`Compute (${label})`, async t => {
    await ClientFunction(prepareClient)();
    await setName(t);
    await setLegacyMode('convertNumericVarParametersToNumbers', true);
    await setLegacyMode('useOneAsDefaultForVarParameters', true);

    for(const op of ops) {
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
}
