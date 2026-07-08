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

// operators whose results depend on window.customRandomSeed (a global counter incremented
// on every draw - see rand() in domhelpers.js). Splitting the Compute test across shards
// means each shard's operators no longer see the same cumulative draw count they would in
// a single unsharded run, so any randomness-consuming operator tested here must first
// "replay" (execute without asserting) every randomness-consuming operator that precedes it
// in the full compute_ops list to advance the counter to the same state.
const RANDOM_CONSUMING_OPS = [ 'random', 'shuffle', 'randInt', 'randRange', 'colorCreateHue' ];

async function runOperator(t, op) {
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
}

// Splits allOps into totalShards contiguous chunks and returns the chunk at shardIndex
// (0-based). Deriving the boundaries from allOps.length instead of hard-coding them means a
// newly added compute op is always picked up by some shard.
export function computeShard(allOps, shardIndex, totalShards) {
  const size = Math.ceil(allOps.length / totalShards);
  return allOps.slice(shardIndex * size, (shardIndex + 1) * size);
}

export function computeTest(allOps, ops, label) {
  test(`Compute (${label})`, async t => {
    await ClientFunction(prepareClient)();
    await setName(t);
    await setLegacyMode('convertNumericVarParametersToNumbers', true);
    await setLegacyMode('useOneAsDefaultForVarParameters', true);

    const precedingOps = allOps.slice(0, allOps.indexOf(ops[0]));
    for(const op of precedingOps)
      if(RANDOM_CONSUMING_OPS.includes(op.name))
        await runOperator(t, op);

    for(const op of ops) {
      await runOperator(t, op);
      await compareState(t, op.hash);
    }
  });
}
