/**
 * @jest-environment jsdom
 */
// Every operation tells the routine editor where it sits, so the editor can show on the card of an
// operation what that operation did (client/js/editor/controls/routinedebug.js). What is recorded
// is the log the Debug module already collects - these cases pin down the addresses that go with
// it, because a wrong one silently shows a run on the wrong card.
import { runRoutine, routineState } from './harness.js';

// the calls evaluateRoutine makes into the editor bundle, in the order it makes them. Outside the
// browser those functions are globals of the bundle that is not there, so the test is the bundle.
let calls = [];

function installLoggingStubs() {
  calls = [];
  globalThis.jeRoutineDebug = true;
  globalThis.jeLoggingRoutineStart = (widget, property, variables, collections, byReference, path)=>calls.push({ type: 'routine', path });
  globalThis.jeLoggingRoutineEnd = _=>calls.push({ type: 'routineEnd' });
  globalThis.jeLoggingRoutineOperationStart = (original, applied, index)=>calls.push({ type: 'operation', index });
  globalThis.jeLoggingRoutineOperationEnd = (problems, variables, collections, skipped)=>calls.push({ type: 'operationEnd', problems: [ ...problems ], skipped: Boolean(skipped) });
  globalThis.jeLoggingRoutineOperationSummary = (definition, result)=>calls.push({ type: 'summary', definition, result });
}

// what the routine editor would look up for each operation that ran: the path of the routine it
// is in plus its index, which is exactly how the cards are addressed
function operationKeys() {
  const paths = [];
  const keys = [];
  for(const call of calls) {
    if(call.type == 'routine')
      paths.unshift(call.path);
    else if(call.type == 'routineEnd')
      paths.shift();
    else if(call.type == 'operation' && paths[0] && typeof call.index == 'number')
      keys.push(`${paths[0]}/${call.index}`);
  }
  return keys;
}

beforeEach(installLoggingStubs);
afterEach(function() {
  globalThis.jeRoutineDebug = false;
});

describe('where a running operation says it sits', () => {
  test('a named routine is addressed by its widget and property', async () => {
    await runRoutine(routineState({
      trigger: { type: 'button', clickRoutine: [ 'var a = 1', 'var b = 2' ] }
    }), 'clickRoutine');
    expect(operationKeys()).toEqual([ 'trigger/clickRoutine/0', 'trigger/clickRoutine/1' ]);
  });

  test('the branch of an IF is a routine of its own, under the index of the IF', async () => {
    await runRoutine(routineState({
      trigger: { type: 'button', clickRoutine: [
        'var a = 1',
        { func: 'IF', operand1: 1, relation: '==', operand2: 1, thenRoutine: [ 'var taken = 1' ], elseRoutine: [ 'var missed = 1' ] }
      ] }
    }), 'clickRoutine');
    expect(operationKeys()).toEqual([
      'trigger/clickRoutine/0',
      'trigger/clickRoutine/1',
      'trigger/clickRoutine/1/thenRoutine/0'
    ]);
  });

  test('every round of a loop files its operations under the same card', async () => {
    await runRoutine(routineState({
      trigger: { type: 'button', clickRoutine: [
        { func: 'FOREACH', range: [ 1, 3 ], loopRoutine: [ 'var seen = ${value}' ] }
      ] }
    }), 'clickRoutine');
    expect(operationKeys()).toEqual([
      'trigger/clickRoutine/0',
      'trigger/clickRoutine/0/loopRoutine/0',
      'trigger/clickRoutine/0/loopRoutine/0',
      'trigger/clickRoutine/0/loopRoutine/0'
    ]);
  });

  test('a called routine is addressed on the widget that owns it', async () => {
    await runRoutine(routineState({
      trigger: { type: 'button', clickRoutine: [ { func: 'CALL', widget: 'helper', routine: 'helperRoutine' } ] },
      helper: { type: 'button', helperRoutine: [ 'var called = 1' ] }
    }), 'clickRoutine');
    expect(operationKeys()).toEqual([ 'trigger/clickRoutine/0', 'helper/helperRoutine/0' ]);
  });

  test('a skipped operation is recorded as one that ran and did nothing', async () => {
    await runRoutine(routineState({
      trigger: { type: 'button', clickRoutine: [ { func: 'FLIP', skip: true } ] }
    }), 'clickRoutine');
    expect(calls.filter(c=>c.type == 'operationEnd')).toEqual([ { type: 'operationEnd', problems: [], skipped: true } ]);
  });

  test('an IF says which values it compared, not which variables it read', async () => {
    await runRoutine(routineState({
      trigger: { type: 'button', clickRoutine: [ 'var wanted = 3', { func: 'IF', operand1: '${wanted}', relation: '<', operand2: 5 } ] }
    }), 'clickRoutine');
    expect(calls).toContainEqual({ type: 'summary', definition: '3 < 5', result: 'true' });
  });

  test('nothing is recorded while neither the editor nor the Debug module is there', async () => {
    globalThis.jeRoutineDebug = false;
    await runRoutine(routineState({
      trigger: { type: 'button', clickRoutine: [ 'var a = 1' ] }
    }), 'clickRoutine');
    expect(calls).toEqual([]);
  });
});
