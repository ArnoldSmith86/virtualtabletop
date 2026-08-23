/**
 * @jest-environment jsdom
 */
import fs from 'fs';

// What the Debug module's log and the results on the routine editor's cards are collected by: the
// jeLogging calls of evaluateRoutine, which come in matched pairs and count a depth. The cases
// here are about the lifecycle itself rather than about the markup - what happens when a routine
// dies half way and the ends never come, and what starts one interaction apart from the last.
//
// jsonedit.js, mousehandling.js and routinedebug.js are plain scripts that the server concatenates
// into its bundles, so evaluate just the parts under test out of their files and hand them the
// handful of names the bundle would give them.
const source = file => fs.readFileSync(file, 'utf8');

function sectionOf(file, marker) {
  const text = source(file);
  return text.slice(text.indexOf(`// START ${marker}`), text.indexOf(`// END ${marker}`)).replace(/^export /gm, '');
}

// the recorder and the logging that drives it, wired to each other the way the editor bundle does
function loadLogging() {
  document.body.innerHTML = '<div id="jeLog"></div>';
  const deps = {
    $: selector => document.querySelector(selector),
    $a: (selector, parent) => (parent || document).querySelectorAll(selector),
    $c: (selector, parent) => (parent || document).querySelector(selector),
    html: string => String(string).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    escapeHTML: string => String(string).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    focusable: () => {},
    getDelta: () => ({ s: {} }),
    cardsEnabled: true
  };
  return new Function('deps', `
    const { $, $a, $c, html, escapeHTML, focusable, getDelta } = deps;
    const getJEroutineDebug = _=>deps.cardsEnabled;
    let jeRoutineLogging = false;
    ${source('client/js/editor/controls/routinedebug.js')}
    ${sectionOf('client/js/jsonedit.js', 'routine logging')}
    return {
      deps,
      setLogging: value=>jeRoutineLogging = value,
      jeLoggingRoutineStart, jeLoggingRoutineEnd, jeLoggingRoutineAbort,
      jeLoggingRoutineOperationStart, jeLoggingRoutineOperationEnd, jeLoggingRoutineOperationSummary,
      jeRoutineNewInteraction, routineDebugRender, routineDebugSetEnabled
    };
  `)(deps);
}

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

// one routine of one operation, the calls in the order evaluateRoutine makes them
function runRoutine(logging, path, definition) {
  logging.jeLoggingRoutineStart({ get: _=>'button1' }, 'clickRoutine', {}, {}, false, path, 0);
  logging.jeLoggingRoutineOperationStart('SHUFFLE', { func: 'SHUFFLE' }, 0);
  logging.jeLoggingRoutineOperationSummary(definition, '');
  logging.jeLoggingRoutineOperationEnd([], {}, {}, false);
  logging.jeLoggingRoutineEnd({}, {});
}

function stripOf(logging, key) {
  const dom = document.createElement('div');
  dom.dataset.debugKey = key;
  logging.routineDebugRender(dom);
  return dom.textContent;
}

describe('a routine that dies half way', () => {
  test('the next routine is logged and rendered again rather than counted into the dead one', () => {
    const logging = loadLogging();
    logging.setLogging(true);

    logging.jeLoggingRoutineStart({ get: _=>'button1' }, 'clickRoutine', {}, {}, false, 'button1/clickRoutine', 0);
    logging.jeLoggingRoutineOperationStart('MOVE', { func: 'MOVE' }, 0);
    logging.jeLoggingRoutineAbort(0, 'from is not a widget'); // the operation threw: no ends arrive

    expect(document.querySelector('#jeLog').innerHTML).toContain('from is not a widget');

    runRoutine(logging, 'button1/clickRoutine', 'the deck');
    expect(document.querySelector('#jeLog').innerHTML).toContain('the deck');
  });

  test('the operation it died in says what went wrong on its card', () => {
    const logging = loadLogging();

    logging.jeLoggingRoutineStart({ get: _=>'button1' }, 'clickRoutine', {}, {}, false, 'button1/clickRoutine', 0);
    logging.jeLoggingRoutineOperationStart('MOVE', { func: 'MOVE' }, 0);
    logging.jeLoggingRoutineAbort(0, 'from is not a widget');

    expect(stripOf(logging, 'button1/clickRoutine/0')).toBe('from is not a widget');
  });

  test('only the block that died is unwound, not the routine that called it', () => {
    const logging = loadLogging();

    logging.jeLoggingRoutineStart({ get: _=>'button1' }, 'clickRoutine', {}, {}, false, 'button1/clickRoutine', 0);
    logging.jeLoggingRoutineOperationStart('IF', { func: 'IF' }, 0);
    logging.jeLoggingRoutineStart({ get: _=>'button1' }, [], {}, {}, true, 'button1/clickRoutine/0/thenRoutine', 1);
    logging.jeLoggingRoutineOperationStart('MOVE', { func: 'MOVE' }, 0);
    logging.jeLoggingRoutineAbort(1, 'from is not a widget');
    // the caller is still running and reports its own end as usual
    logging.jeLoggingRoutineOperationEnd([], {}, {}, false);
    logging.jeLoggingRoutineEnd({}, {});

    expect(stripOf(logging, 'button1/clickRoutine/0/thenRoutine/0')).toBe('from is not a widget');
    expect(stripOf(logging, 'button1/clickRoutine/0')).toBe('ran');
  });

  test('switching the results off afterwards is read by the routine that runs next', () => {
    const logging = loadLogging();

    logging.jeLoggingRoutineStart({ get: _=>'button1' }, 'clickRoutine', {}, {}, false, 'button1/clickRoutine', 0);
    logging.jeLoggingRoutineOperationStart('MOVE', { func: 'MOVE' }, 0);
    logging.jeLoggingRoutineAbort(0, 'from is not a widget');

    logging.deps.cardsEnabled = false;
    logging.routineDebugSetEnabled(false);
    runRoutine(logging, 'button1/clickRoutine', 'the deck');
    expect(stripOf(logging, 'button1/clickRoutine/0')).toBe('');
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
