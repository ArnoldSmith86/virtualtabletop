/**
 * @jest-environment jsdom
 */
// Every operation tells the routine editor where it sits, so the editor can show on the card of an
// operation what that operation did (client/js/editor/controls/routinedebug.js). The cases here run
// a real routine into the real recorder - the one the browser uses, loaded out of its file by
// tests/client/logging-harness.js - and read the cards back, because a wrong address silently
// shows a run on the wrong card and a model of the recorder's stack cannot go wrong the way the
// stack does.
import { loadDeckWidgets, runRoutine, routineState } from './harness.js';
import { loadLogging, stripOf } from '../logging-harness.js';

// Outside the browser the jeLogging functions evaluateRoutine calls are globals of a bundle that is
// not there, so the test is the bundle.
let logging;

function installLogging() {
  logging = loadLogging();
  globalThis.jeRoutineDebug = true;
  globalThis.jeRoutineLogging = false;
  for(const name of [ 'jeLoggingRoutineStart', 'jeLoggingRoutineEnd', 'jeLoggingRoutineAbort',
                      'jeLoggingRoutineOperationStart', 'jeLoggingRoutineOperationEnd', 'jeLoggingRoutineOperationSummary' ])
    globalThis[name] = logging[name];
}

// which cards collected a run, and how many runs each of them holds - a loop that goes round three
// times files all three on the one card that stands for its operation
function recorded() {
  const cards = {};
  for(const [ key, runs ] of logging.runs)
    cards[key] = runs.reduce((count, run)=>count + run.count, 0);
  return cards;
}

const card = key => stripOf(logging, key);

beforeEach(installLogging);
afterEach(function() {
  globalThis.jeRoutineDebug = false;
});

describe('where a running operation says it sits', () => {
  test('a named routine is addressed by its widget and property', async () => {
    await runRoutine(routineState({
      trigger: { type: 'button', clickRoutine: [ 'var a = 1', 'var b = 2' ] }
    }), 'clickRoutine');
    expect(recorded()).toEqual({ 'trigger/clickRoutine/0': 1, 'trigger/clickRoutine/1': 1 });
  });

  test('the branch of an IF is a routine of its own, under the index of the IF', async () => {
    await runRoutine(routineState({
      trigger: { type: 'button', clickRoutine: [
        'var a = 1',
        { func: 'IF', operand1: 1, relation: '==', operand2: 1, thenRoutine: [ 'var taken = 1' ], elseRoutine: [ 'var missed = 1' ] }
      ] }
    }), 'clickRoutine');
    expect(recorded()).toEqual({
      'trigger/clickRoutine/0': 1,
      'trigger/clickRoutine/1': 1,
      'trigger/clickRoutine/1/thenRoutine/0': 1
    });
    // the branch that was not taken never started, so its card says the routine around it ran
    // without it rather than staying empty
    expect(card('trigger/clickRoutine/1/elseRoutine/0')).toBe('not run');
  });

  test('every round of a loop files its operations under the same card', async () => {
    await runRoutine(routineState({
      trigger: { type: 'button', clickRoutine: [
        { func: 'FOREACH', range: [ 1, 3 ], loopRoutine: [ 'var seen = ${value}' ] }
      ] }
    }), 'clickRoutine');
    expect(recorded()).toEqual({
      'trigger/clickRoutine/0': 1,
      'trigger/clickRoutine/0/loopRoutine/0': 3
    });
    expect(card('trigger/clickRoutine/0/loopRoutine/0')).toContain('seen = 3');
  });

  test('a called routine is addressed on the widget that owns it', async () => {
    await runRoutine(routineState({
      trigger: { type: 'button', clickRoutine: [ { func: 'CALL', widget: 'helper', routine: 'helperRoutine' } ] },
      helper: { type: 'button', helperRoutine: [ 'var called = 1' ] }
    }), 'clickRoutine');
    expect(recorded()).toEqual({ 'trigger/clickRoutine/0': 1, 'helper/helperRoutine/0': 1 });
  });

  test('a skipped operation is recorded as one that ran and did nothing', async () => {
    await runRoutine(routineState({
      trigger: { type: 'button', clickRoutine: [ { func: 'FLIP', skip: true } ] }
    }), 'clickRoutine');
    expect(card('trigger/clickRoutine/0')).toBe('skipped');
  });

  test('an IF says which values it compared, not which variables it read', async () => {
    await runRoutine(routineState({
      trigger: { type: 'button', clickRoutine: [ 'var wanted = 3', { func: 'IF', operand1: '${wanted}', relation: '<', operand2: 5 } ] }
    }), 'clickRoutine');
    expect(card('trigger/clickRoutine/1')).toBe('3 < 5 → true');
  });

  test('a var line is recorded with the values it read, not with the names it wrote', async () => {
    await runRoutine(routineState({
      trigger: { type: 'button', clickRoutine: [ 'var total = 4', 'var value = 3', 'var total = ${total} + ${value}' ] }
    }), 'clickRoutine');
    expect(card('trigger/clickRoutine/2')).toBe('total = 4 + 3 → 7');
  });

  test('nothing is recorded while neither the editor nor the Debug module is there', async () => {
    globalThis.jeRoutineDebug = false;
    await runRoutine(routineState({
      trigger: { type: 'button', clickRoutine: [ 'var a = 1' ] }
    }), 'clickRoutine');
    expect(recorded()).toEqual({});
  });
});

// An operation can set a routine off that the engine starts from scratch - a MOVE that lands in a
// holder with an enterRoutine, a property change with a changeRoutine, a CLICK. Those start at
// depth 0 while the routine that triggered them is still running, so anything that reads that depth
// as "nothing else is running" throws away the cards of the routine the player actually clicked.
describe('a routine another routine sets off', () => {
  test('an enterRoutine is filed on the holder without emptying the routine that moved into it', async () => {
    await runRoutine(routineState({
      trigger: { type: 'button', clickRoutine: [ { func: 'MOVE', from: 'source', to: 'target' }, 'var afterwards = 1' ] },
      source: { type: 'widget' },
      target: { type: 'widget', enterRoutine: [ 'var entered = 1' ] },
      token: { type: 'widget', parent: 'source' }
    }), 'clickRoutine');
    expect(recorded()).toEqual({
      'trigger/clickRoutine/0': 1,
      'trigger/clickRoutine/1': 1,
      'target/enterRoutine/0': 1
    });
    expect(card('trigger/clickRoutine/1')).toBe('afterwards = 1 → 1');
  });

  test('a changeRoutine of a widget a SET wrote to is filed on that widget', async () => {
    await runRoutine(routineState({
      trigger: { type: 'button', clickRoutine: [
        { func: 'SELECT', type: 'all', property: 'id', value: 'watched' },
        { func: 'SET', property: 'value', value: 7 },
        'var afterwards = 1'
      ] },
      watched: { type: 'widget', changeRoutine: [ 'var changed = 1' ] }
    }), 'clickRoutine');
    expect(recorded()).toEqual({
      'trigger/clickRoutine/0': 1,
      'trigger/clickRoutine/1': 1,
      'trigger/clickRoutine/2': 1,
      'watched/changeRoutine/0': 1
    });
  });

  test('the clickRoutine a CLICK runs is filed on the widget it clicked', async () => {
    await runRoutine(routineState({
      trigger: { type: 'button', clickRoutine: [
        { func: 'SELECT', type: 'all', property: 'id', value: 'other' },
        { func: 'CLICK' },
        'var afterwards = 1'
      ] },
      other: { type: 'button', clickRoutine: [ 'var clicked = 1' ] }
    }), 'clickRoutine');
    expect(recorded()).toEqual({
      'trigger/clickRoutine/0': 1,
      'trigger/clickRoutine/1': 1,
      'trigger/clickRoutine/2': 1,
      'other/clickRoutine/0': 1
    });
    expect(card('trigger/clickRoutine/2')).toBe('afterwards = 1 → 1');
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
    expect(recorded()).toEqual({ 'deck1/cardDefaults.clickRoutine/0': 1 });
  });

  test('a block nested in such a routine is addressed there too', async () => {
    await runOnCard(deckState({ cardDefaults: { clickRoutine: [
      { func: 'FOREACH', range: [ 1, 2 ], loopRoutine: [ 'var seen = ${value}' ] }
    ] } }));
    expect(recorded()).toEqual({
      'deck1/cardDefaults.clickRoutine/0': 1,
      'deck1/cardDefaults.clickRoutine/0/loopRoutine/0': 2
    });
  });

  test('a routine the card has itself is addressed on the card', async () => {
    await runOnCard(deckState({ cardDefaults: { clickRoutine: [ 'var fromDeck = 1' ] } }, { clickRoutine: [ 'var own = 1' ] }));
    expect(recorded()).toEqual({ 'card1/clickRoutine/0': 1 });
  });

  // A card type and a face template are the two other places a deck can put a routine, and the
  // routine editor has no card for either of them - so there is nowhere to show what they did, and
  // nothing is filed rather than filing it under a routine that did not run.
  test('a routine of a card type is not addressed in the card defaults, nor anywhere else', async () => {
    await runOnCard(deckState({
      cardDefaults: { clickRoutine: [ 'var fromDeck = 1' ] },
      cardTypes: { a: { clickRoutine: [ 'var fromType = 1' ] } }
    }));
    expect(recorded()).toEqual({});
  });

  test('a routine of a face template is not addressed either', async () => {
    await runOnCard(deckState({
      faceTemplates: [ { properties: { clickRoutine: [ 'var fromFace = 1' ] } } ]
    }));
    expect(recorded()).toEqual({});
  });
});

// An operation that throws never reports its end, and neither does the routine it was in. What
// those calls would have taken off the log and the recorder is unwound in one go instead - without
// it the nesting they count stays standing, and with it the log is never rendered again.
describe('a routine that dies half way', () => {
  const dying = _=>runRoutine(routineState({
    trigger: { type: 'button', clickRoutine: { notARoutine: true } }
  }), 'clickRoutine');

  test('the routine that runs after it is recorded and rendered as usual', async () => {
    await expect(dying()).rejects.toThrow();
    await runRoutine(routineState({
      trigger: { type: 'button', clickRoutine: [ 'var afterwards = 1' ] }
    }), 'clickRoutine');
    expect(recorded()).toEqual({ 'trigger/clickRoutine/0': 1 });
  });

  test('a block that dies inside a running routine takes only itself off', async () => {
    await expect(runRoutine(routineState({
      trigger: { type: 'button', clickRoutine: [
        'var before = 1',
        { func: 'FOREACH', range: [ 1, 2 ], loopRoutine: { notARoutine: true } }
      ] }
    }), 'clickRoutine')).rejects.toThrow();
    // the operation the routine died in says what went wrong, on its own card
    expect(card('trigger/clickRoutine/0')).toBe('before = 1 → 1');
    expect(card('trigger/clickRoutine/1')).toContain('not iterable');
  });

  test('nothing is unwound while neither the editor nor the Debug module is there', async () => {
    globalThis.jeRoutineDebug = false;
    globalThis.jeLoggingRoutineAbort = _=>{ throw Error('the recorders are not there and were asked to unwind'); };
    await expect(dying()).rejects.toThrow(/iterable/);
  });
});
