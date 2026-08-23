/**
 * @jest-environment jsdom
 */
import { loadLogging, source, stripOf } from './logging-harness.js';

// What the Debug module's log and the results on the routine editor's cards are collected by: the
// jeLogging calls of evaluateRoutine, which come in matched pairs around a frame. The cases here
// are about the lifecycle itself rather than about the markup - what happens when a routine dies
// half way and the ends never come, what a routine that starts another one does to it, and what
// starts one interaction apart from the last.

// the widget hotkeys, which run their routines straight from the key event rather than through the
// mouse handling every other interaction goes through
function loadKeyHandler(logging, widgets) {
  const code = source('client/js/mousehandling.js').match(/^async function keyHandler[\s\S]*?^}/m)[0];
  return new Function('deps', `
    const { $, widgetFilter, batchStart, batchEnd, jeRoutineNewInteraction } = deps;
    const isLoading = false, overlayActive = false, jeRoutineLogging = false, jeRoutineDebug = true;
    ${code}
    return keyHandler;
  `)({
    $: selector => document.querySelector(selector),
    widgetFilter: filter => widgets.filter(filter),
    batchStart: () => {},
    batchEnd: () => {},
    jeRoutineNewInteraction: logging.jeRoutineNewInteraction
  });
}

const widgetNamed = id => ({ get: _=>id });

// one routine of one operation, the calls in the order evaluateRoutine makes them
function runRoutine(logging, path, definition) {
  logging.jeLoggingRoutineStart(widgetNamed('button1'), 'clickRoutine', {}, {}, false, path);
  logging.jeLoggingRoutineOperationStart('SHUFFLE', { func: 'SHUFFLE' }, 0);
  logging.jeLoggingRoutineOperationSummary(definition, '');
  logging.jeLoggingRoutineOperationEnd([], {}, {}, false);
  logging.jeLoggingRoutineEnd({}, {});
}

describe('a routine that dies half way', () => {
  test('the next routine is logged and rendered again rather than counted into the dead one', () => {
    const logging = loadLogging();
    logging.setLogging(true);

    const frame = logging.jeLoggingRoutineStart(widgetNamed('button1'), 'clickRoutine', {}, {}, false, 'button1/clickRoutine');
    logging.jeLoggingRoutineOperationStart('MOVE', { func: 'MOVE' }, 0);
    logging.jeLoggingRoutineAbort(frame, 'from is not a widget'); // the operation threw: no ends arrive

    expect(document.querySelector('#jeLog').innerHTML).toContain('from is not a widget');

    runRoutine(logging, 'button1/clickRoutine', 'the deck');
    expect(document.querySelector('#jeLog').innerHTML).toContain('the deck');
  });

  test('the operation it died in says what went wrong on its card', () => {
    const logging = loadLogging();

    const frame = logging.jeLoggingRoutineStart(widgetNamed('button1'), 'clickRoutine', {}, {}, false, 'button1/clickRoutine');
    logging.jeLoggingRoutineOperationStart('MOVE', { func: 'MOVE' }, 0);
    logging.jeLoggingRoutineAbort(frame, 'from is not a widget');

    expect(stripOf(logging, 'button1/clickRoutine/0')).toBe('from is not a widget');
  });

  test('only the block that died is unwound, not the routine that called it', () => {
    const logging = loadLogging();

    logging.jeLoggingRoutineStart(widgetNamed('button1'), 'clickRoutine', {}, {}, false, 'button1/clickRoutine');
    logging.jeLoggingRoutineOperationStart('IF', { func: 'IF' }, 0);
    const frame = logging.jeLoggingRoutineStart(widgetNamed('button1'), [], {}, {}, true, 'button1/clickRoutine/0/thenRoutine');
    logging.jeLoggingRoutineOperationStart('MOVE', { func: 'MOVE' }, 0);
    logging.jeLoggingRoutineAbort(frame, 'from is not a widget');
    // the caller is still running and reports its own end as usual
    logging.jeLoggingRoutineOperationEnd([], {}, {}, false);
    logging.jeLoggingRoutineEnd({}, {});

    expect(stripOf(logging, 'button1/clickRoutine/0/thenRoutine/0')).toBe('from is not a widget');
    expect(stripOf(logging, 'button1/clickRoutine/0')).toBe('ran');
  });

  // The frame a routine reports as dead is the one it was handed when it started, never the depth
  // evaluateRoutine counts: a routine the engine starts as a side effect of an operation begins at
  // depth 0 while the routine that set it off is still running, so unwinding to depth 0 would end
  // the routine the player clicked while it is still going.
  test('a routine that dies while another one is running leaves the one that set it off standing', () => {
    const logging = loadLogging();

    logging.jeLoggingRoutineStart(widgetNamed('button1'), 'clickRoutine', {}, {}, false, 'button1/clickRoutine');
    logging.jeLoggingRoutineOperationStart('MOVE', { func: 'MOVE' }, 0);
    const frame = logging.jeLoggingRoutineStart(widgetNamed('holder1'), 'enterRoutine', {}, {}, false, 'holder1/enterRoutine');
    logging.jeLoggingRoutineOperationStart('FLIP', { func: 'FLIP' }, 0);
    logging.jeLoggingRoutineAbort(frame, 'card is not a widget');
    // the MOVE swallowed nothing, so the routine that triggered the enterRoutine reports its ends
    logging.jeLoggingRoutineOperationEnd([], {}, {}, false);
    logging.jeLoggingRoutineOperationStart('SHUFFLE', { func: 'SHUFFLE' }, 1);
    logging.jeLoggingRoutineOperationSummary('the deck', '');
    logging.jeLoggingRoutineOperationEnd([], {}, {}, false);
    logging.jeLoggingRoutineEnd({}, {});

    expect(stripOf(logging, 'holder1/enterRoutine/0')).toBe('card is not a widget');
    expect(stripOf(logging, 'button1/clickRoutine/0')).toBe('ran');
    expect(stripOf(logging, 'button1/clickRoutine/1')).toBe('the deck');
  });

  test('switching the results off afterwards is read by the routine that runs next', () => {
    const logging = loadLogging();

    const frame = logging.jeLoggingRoutineStart(widgetNamed('button1'), 'clickRoutine', {}, {}, false, 'button1/clickRoutine');
    logging.jeLoggingRoutineOperationStart('MOVE', { func: 'MOVE' }, 0);
    logging.jeLoggingRoutineAbort(frame, 'from is not a widget');

    logging.deps.cardsEnabled = false;
    logging.routineDebugSetEnabled(false);
    runRoutine(logging, 'button1/clickRoutine', 'the deck');
    expect(stripOf(logging, 'button1/clickRoutine/0')).toBe('');
  });
});

// An operation can set another routine off - a MOVE that lands in a holder with an enterRoutine, a
// property change with a changeRoutine, a CLICK. That routine is nested in the one that is running,
// however the engine counts its depth, and taking the frames of the outer one off the stack for it
// would make every operation after the trigger read "not run" under a header that says "ran".
describe('an operation that sets another routine off', () => {
  test('leaves the cards of the routine it runs in where they are', () => {
    const logging = loadLogging();

    logging.jeLoggingRoutineStart(widgetNamed('button1'), 'clickRoutine', {}, {}, false, 'button1/clickRoutine');
    logging.jeLoggingRoutineOperationStart('MOVE', { func: 'MOVE' }, 0);
    logging.jeLoggingRoutineStart(widgetNamed('holder1'), 'enterRoutine', {}, {}, false, 'holder1/enterRoutine');
    logging.jeLoggingRoutineOperationStart('FLIP', { func: 'FLIP' }, 0);
    logging.jeLoggingRoutineOperationSummary('the card', 'flipped');
    logging.jeLoggingRoutineOperationEnd([], {}, {}, false);
    logging.jeLoggingRoutineEnd({}, {});
    logging.jeLoggingRoutineOperationSummary('the card into the holder', '');
    logging.jeLoggingRoutineOperationEnd([], {}, {}, false);
    logging.jeLoggingRoutineOperationStart('SHUFFLE', { func: 'SHUFFLE' }, 1);
    logging.jeLoggingRoutineOperationSummary('the deck', '');
    logging.jeLoggingRoutineOperationEnd([], {}, {}, false);
    logging.jeLoggingRoutineEnd({}, {});

    expect(stripOf(logging, 'button1/clickRoutine/0')).toBe('the card into the holder');
    expect(stripOf(logging, 'button1/clickRoutine/1')).toBe('the deck');
    expect(stripOf(logging, 'holder1/enterRoutine/0')).toBe('the card → flipped');
  });
});

describe('what one interaction is', () => {
  const widget = (id, hotkey, onClick) => ({
    get: property => property == 'hotkey' ? hotkey : id,
    isVisible: _=>true,
    click: async _=>onClick(id)
  });

  test('every widget that shares a hotkey belongs to the same interaction', async () => {
    const logging = loadLogging();
    const clicked = [];
    const keyHandler = loadKeyHandler(logging, [
      widget('button1', 'x', id=>runRoutine(logging, `${id}/clickRoutine`, `${id} ran`) || clicked.push(id)),
      widget('button2', 'x', id=>runRoutine(logging, `${id}/clickRoutine`, `${id} ran`) || clicked.push(id))
    ]);

    await keyHandler({ key: 'x', target: { tagName: 'DIV' } });
    expect(clicked).toEqual([ 'button1', 'button2' ]);
    expect(stripOf(logging, 'button1/clickRoutine/0')).toBe('button1 ran');
    expect(stripOf(logging, 'button2/clickRoutine/0')).toBe('button2 ran');
  });

  test('the next hotkey starts from nothing rather than adding to the one before', async () => {
    const logging = loadLogging();
    const keyHandler = loadKeyHandler(logging, [
      widget('button1', 'x', id=>runRoutine(logging, `${id}/clickRoutine`, 'first')),
      widget('button2', 'y', id=>runRoutine(logging, `${id}/clickRoutine`, 'second'))
    ]);

    await keyHandler({ key: 'x', target: { tagName: 'DIV' } });
    await keyHandler({ key: 'y', target: { tagName: 'DIV' } });

    expect(stripOf(logging, 'button1/clickRoutine/0')).toBe('');
    expect(stripOf(logging, 'button2/clickRoutine/0')).toBe('second');
  });
});
