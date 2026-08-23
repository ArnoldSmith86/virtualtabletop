// The Debug module's log and the results the routine editor shows on its cards, wired to each
// other the way the editor bundle wires them, so a test can drive the real recorder instead of a
// model of it - a model of a stack cannot fail the way the stack does.
//
// jsonedit.js and routinedebug.js are plain scripts that the server concatenates into its bundles,
// so evaluate just the parts under test out of their files and hand them the handful of names the
// bundle would give them.
import fs from 'fs';

export const source = file => fs.readFileSync(file, 'utf8');

export function sectionOf(file, marker) {
  const text = source(file);
  return text.slice(text.indexOf(`// START ${marker}`), text.indexOf(`// END ${marker}`)).replace(/^export /gm, '');
}

export function loadLogging() {
  // the panel the log is written into, emptied rather than the whole body: a test that runs a real
  // routine has its widgets in the same document
  let log = document.getElementById('jeLog');
  if(!log) {
    log = document.createElement('div');
    log.id = 'jeLog';
    document.body.appendChild(log);
  }
  log.innerHTML = '';
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
      runs: routineDebugRuns, routineRuns: routineDebugRoutineRuns,
      jeLoggingRoutineStart, jeLoggingRoutineEnd, jeLoggingRoutineAbort,
      jeLoggingRoutineOperationStart, jeLoggingRoutineOperationEnd, jeLoggingRoutineOperationSummary,
      jeRoutineNewInteraction, routineDebugRender, routineDebugSetEnabled
    };
  `)(deps);
}

// What the card of one operation reads, rendered by the recorder itself.
export function stripOf(logging, key) {
  const dom = document.createElement('div');
  dom.dataset.debugKey = key;
  logging.routineDebugRender(dom);
  return dom.textContent;
}
