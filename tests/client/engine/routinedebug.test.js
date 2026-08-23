/**
 * @jest-environment jsdom
 */
// Every operation tells the routine editor where it sits, so the editor can show on the card of an
// operation what that operation did (client/js/editor/controls/routinedebug.js). What is recorded
// is the log the Debug module already collects - these cases pin down the addresses that go with
// it, because a wrong one silently shows a run on the wrong card.
import { loadDeckWidgets, runRoutine, routineState } from './harness.js';

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

  test('a var line is recorded with the values it read, not with the names it wrote', async () => {
    await runRoutine(routineState({
      trigger: { type: 'button', clickRoutine: [ 'var total = 4', 'var value = 3', 'var total = ${total} + ${value}' ] }
    }), 'clickRoutine');
    expect(calls).toContainEqual({ type: 'summary', definition: 'total = 4 + 3', result: '7' });
  });

  test('nothing is recorded while neither the editor nor the Debug module is there', async () => {
    globalThis.jeRoutineDebug = false;
    await runRoutine(routineState({
      trigger: { type: 'button', clickRoutine: [ 'var a = 1' ] }
    }), 'clickRoutine');
    expect(calls).toEqual([]);
  });
});

// A card mostly runs routines that are not written on the card: they belong to the deck, which
// hands them to every card it made. The editor shows them there, so that is where their runs have
// to be filed - the deck knows nothing about the card that ran them.
describe('a card runs a routine of its deck', () => {
  beforeAll(loadDeckWidgets);

  const deckState = (deck, card)=>routineState({
    deck1: Object.assign({ type: 'deck', cardTypes: { a: {} }, faceTemplates: [ { properties: {} } ] }, deck),
    card1: Object.assign({ type: 'card', deck: 'deck1', cardType: 'a' }, card)
  });
  const runOnCard = state=>runRoutine(state, 'clickRoutine', { trigger: 'card1' });

  test('a routine the deck defines for its cards is addressed in the card defaults of the deck', async () => {
    await runOnCard(deckState({ cardDefaults: { clickRoutine: [ 'var fromDeck = 1' ] } }));
    expect(operationKeys()).toEqual([ 'deck1/cardDefaults.clickRoutine/0' ]);
  });

  test('a block nested in such a routine is addressed there too', async () => {
    await runOnCard(deckState({ cardDefaults: { clickRoutine: [
      { func: 'FOREACH', range: [ 1, 2 ], loopRoutine: [ 'var seen = ${value}' ] }
    ] } }));
    expect(operationKeys()).toEqual([
      'deck1/cardDefaults.clickRoutine/0',
      'deck1/cardDefaults.clickRoutine/0/loopRoutine/0',
      'deck1/cardDefaults.clickRoutine/0/loopRoutine/0'
    ]);
  });

  test('a routine the card has itself is addressed on the card', async () => {
    await runOnCard(deckState({ cardDefaults: { clickRoutine: [ 'var fromDeck = 1' ] } }, { clickRoutine: [ 'var own = 1' ] }));
    expect(operationKeys()).toEqual([ 'card1/clickRoutine/0' ]);
  });

  // A card type and a face template are the two other places a deck can put a routine, and the
  // routine editor has no card for either of them - so there is nowhere to show what they did, and
  // nothing is filed rather than filing it under a routine that did not run.
  test('a routine of a card type is not addressed in the card defaults, nor anywhere else', async () => {
    await runOnCard(deckState({
      cardDefaults: { clickRoutine: [ 'var fromDeck = 1' ] },
      cardTypes: { a: { clickRoutine: [ 'var fromType = 1' ] } }
    }));
    expect(operationKeys()).toEqual([]);
  });

  test('a routine of a face template is not addressed either', async () => {
    await runOnCard(deckState({
      faceTemplates: [ { properties: { clickRoutine: [ 'var fromFace = 1' ] } } ]
    }));
    expect(operationKeys()).toEqual([]);
  });
});

// An operation that throws never reports its end, and neither does the routine it was in. What
// those calls would have taken off the log and the recorder is unwound in one go instead - without
// it the depth they count stays standing, and with it the log is never rendered again.
describe('a routine that dies half way', () => {
  test('says so once, with the depth it started at and what went wrong', async () => {
    const aborts = [];
    globalThis.jeLoggingRoutineAbort = (depth, problem)=>aborts.push({ depth, problem });
    globalThis.jeRoutineLogging = false;
    try {
      await expect(runRoutine(routineState({
        trigger: { type: 'button', clickRoutine: { notARoutine: true } }
      }), 'clickRoutine')).rejects.toThrow();
      expect(aborts).toEqual([ { depth: 0, problem: expect.any(String) } ]);
    } finally {
      delete globalThis.jeLoggingRoutineAbort;
    }
  });

  test('nothing is unwound while neither the editor nor the Debug module is there', async () => {
    const aborts = [];
    globalThis.jeLoggingRoutineAbort = (depth, problem)=>aborts.push({ depth, problem });
    globalThis.jeRoutineDebug = false;
    globalThis.jeRoutineLogging = false;
    try {
      await expect(runRoutine(routineState({
        trigger: { type: 'button', clickRoutine: { notARoutine: true } }
      }), 'clickRoutine')).rejects.toThrow();
      expect(aborts).toEqual([]);
    } finally {
      delete globalThis.jeLoggingRoutineAbort;
    }
  });
});
