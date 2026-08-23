// What every operation of a routine did the last time it ran, shown on the card of the operation
// itself: the values it worked with once the variables were filled in, what came out, and what
// went wrong. A routine is followed where it is written instead of in a log next to it.
//
// A run is filed under the place of the operation in the game, in the same terms the routine
// editor addresses its cards with - the widget, the property the routine is written in, and the
// path of block and index into the nested routines ("card1/clickRoutine/2/thenRoutine/0"). So an
// operation inside a loopRoutine collects every one of its runs on the one card that stands for
// it, however often the loop went round.
//
// Runs that read the same are counted instead of kept twice, so a loop that does the same thing a
// hundred times is one line saying so rather than a hundred. Everything is dropped when the next
// user interaction runs a routine, so what a card shows always belongs to one interaction - the
// same rule the Debug module's log follows, down to the "auto clear" setting that turns it off.

const ROUTINE_DEBUG_MAX_RUNS = 40;      // runs kept per operation; further ones are only counted
const ROUTINE_DEBUG_COLLAPSED_RUNS = 3; // runs a card shows until it is asked for all of them

const routineDebugRuns = new Map();        // operation key -> [ { text, definition, result, problems, skipped, count } ]
const routineDebugOmitted = new Map();     // operation key -> runs that no longer fit
const routineDebugRoutineRuns = new Map(); // routine path -> how often the routine itself ran
const routineDebugExpanded = new Set();    // operation keys that were asked to show every run

// The routines and operations currently running, outermost first. Both are kept in step by the
// logging calls of evaluateRoutine, which come in matched pairs - except when an operation throws,
// which reports the end of nothing at all. So a routine that starts drops the frames its own
// nesting depth says cannot be running any more, and a routine that ends drops the operations of
// its own that were left behind: a routine that dies half way cannot wedge the cards on stale
// results until the page is reloaded.
const routineDebugRoutineStack = [];    // { path, operationDepth }
const routineDebugOperationStack = [];

let routineDebugResetOnNextRun = true;
let routineDebugRefreshPending = false;

// A new user interaction starts with a clean slate, but only once it actually runs something:
// clicking around in the editor must not empty the cards of the routine that was just watched.
function routineDebugResetAfterInteraction() {
  routineDebugResetOnNextRun = true;
}

// Switching the results off takes what is on the cards with them: a strip left standing after the
// switch was flipped would read as what the routine that runs next did.
function routineDebugSetEnabled(enabled) {
  if(!enabled)
    routineDebugClear();
  routineDebugRefreshNow();
}

function routineDebugClear() {
  routineDebugRuns.clear();
  routineDebugOmitted.clear();
  routineDebugRoutineRuns.clear();
  routineDebugResetOnNextRun = false;
}

// depth is how many routines evaluateRoutine is already inside, so anything below that on the
// stacks belongs to a routine that never came back
function routineDebugRoutineStart(path, depth) {
  if(routineDebugRoutineStack.length > depth) {
    routineDebugOperationStack.length = routineDebugRoutineStack[depth].operationDepth;
    routineDebugRoutineStack.length = depth;
  }
  if(!routineDebugRoutineStack.length && routineDebugResetOnNextRun)
    routineDebugClear();
  routineDebugRoutineStack.push({ path: path || null, operationDepth: routineDebugOperationStack.length });
  if(path)
    routineDebugRoutineRuns.set(path, (routineDebugRoutineRuns.get(path) || 0) + 1);
}

function routineDebugRoutineEnd() {
  const routine = routineDebugRoutineStack.pop();
  if(!routine)
    return;
  routineDebugOperationStack.length = routine.operationDepth;
  if(!routineDebugRoutineStack.length)
    routineDebugRefresh();
}

// index is missing for the pseudo operations the log wraps a loop body in - those stand for no
// card, so they only keep the stack in step
function routineDebugOperationStart(index) {
  const routine = routineDebugRoutineStack[routineDebugRoutineStack.length-1];
  const path = routine && routine.path;
  routineDebugOperationStack.push(path && typeof index == 'number' ? { key: `${path}/${index}` } : null);
}

function routineDebugOperationSummary(definition, result) {
  const running = routineDebugOperationStack[routineDebugOperationStack.length-1];
  if(running) {
    running.definition = definition;
    running.result = result;
  }
}

function routineDebugOperationEnd(problems, skipped) {
  const running = routineDebugOperationStack.pop();
  if(!running)
    return;
  routineDebugAddRun(running.key, {
    definition: running.definition || '',
    result: running.result === undefined || running.result === null ? '' : String(running.result),
    problems: (problems || []).map(String),
    skipped: Boolean(skipped)
  });
}

// what makes two runs read the same, and with that what is counted rather than listed twice
function routineDebugRunText(run) {
  return [ run.skipped, run.definition, run.result, ...run.problems ].join('\u0000');
}

function routineDebugAddRun(key, run) {
  let runs = routineDebugRuns.get(key);
  if(!runs)
    routineDebugRuns.set(key, runs = []);
  run.text = routineDebugRunText(run);
  const previous = runs[runs.length-1];
  if(previous && previous.text === run.text) {
    ++previous.count;
    return;
  }
  if(runs.length >= ROUTINE_DEBUG_MAX_RUNS) {
    routineDebugOmitted.set(key, (routineDebugOmitted.get(key) || 0) + 1);
    return;
  }
  run.count = 1;
  runs.push(run);
}

// the routine an operation belongs to: its key without the index of the operation itself
function routineDebugRoutineOf(key) {
  return key.replace(/\/[^/]*$/, '');
}

// The results of one operation, as the markup of the strip below its sentence. Everything the
// cards show goes through here, so a card rendered now and a card updated after a routine ran
// look the same.
function routineDebugRunsHTML(key) {
  const runs = routineDebugRuns.get(key) || [];
  if(!runs.length) {
    // a routine that ran without reaching this operation says so - within a routine that did run,
    // the operations it stepped over are half of what there is to see
    return routineDebugRoutineRuns.get(routineDebugRoutineOf(key))
      ? '<span class="routine-editor-debug-idle">not run</span>'
      : '';
  }

  const expanded = routineDebugExpanded.has(key);
  const shown = expanded ? runs : runs.slice(0, ROUTINE_DEBUG_COLLAPSED_RUNS);
  const omitted = routineDebugOmitted.get(key) || 0;
  const hidden = runs.slice(shown.length).reduce((sum, run)=>sum + run.count, 0) + omitted;

  let html = shown.map(run=>routineDebugRunHTML(run)).join('');
  // a loop long enough to fill the card is cut off rather than kept in full, and says so instead
  // of letting the last line it shows read as the last round there was
  if(expanded && omitted)
    html += `<span class="routine-editor-debug-idle">${omitted} further ${omitted == 1 ? 'run' : 'runs'} were not kept</span>`;
  if(runs.length > ROUTINE_DEBUG_COLLAPSED_RUNS)
    html += `<span class="routine-editor-debug-more">${expanded ? 'show less' : `+ ${hidden} more ${hidden == 1 ? 'run' : 'runs'}`}</span>`;
  return html;
}

function routineDebugRunHTML(run) {
  const parts = [];
  if(run.count > 1)
    parts.push(`<span class="routine-editor-debug-count">${run.count}&times;</span>`);
  if(run.skipped)
    parts.push('<span class="routine-editor-debug-idle">skipped</span>');
  if(run.definition)
    parts.push(`<span class="routine-editor-debug-definition">${escapeHTML(run.definition)}</span>`);
  if(run.result !== '')
    parts.push('<span class="routine-editor-debug-arrow">&rarr;</span>', `<span class="routine-editor-debug-result">${escapeHTML(run.result)}</span>`);
  // an operation the engine has nothing to say about still says that it ran, because an empty
  // line would read as "not run"
  if(!run.skipped && !run.definition && run.result === '' && !run.problems.length)
    parts.push('<span class="routine-editor-debug-idle">ran</span>');
  const problems = run.problems.map(problem=>`<span class="routine-editor-debug-problem">${escapeHTML(problem)}</span>`).join('');
  return `<span class="routine-editor-debug-run">${parts.join(' ')}${problems}</span>`;
}

// The strip of one card, filled in place: rewriting the card itself whenever a routine ends would
// close the popup somebody is editing a parameter in.
function routineDebugRender(dom) {
  const key = dom.dataset.debugKey;
  dom.innerHTML = routineDebugRunsHTML(key);
  for(const toggle of $a('.routine-editor-debug-more', dom)) {
    focusable(toggle, _=>{
      if(routineDebugExpanded.has(key))
        routineDebugExpanded.delete(key);
      else
        routineDebugExpanded.add(key);
      routineDebugRender(dom);
    });
  }
}

// how often a whole routine ran, for the list of routines: which of them an interaction went
// through is worth seeing without opening every one of them
function routineDebugRenderRoutine(dom) {
  const runs = routineDebugRoutineRuns.get(dom.dataset.debugRoutine) || 0;
  dom.textContent = runs ? (runs > 1 ? `ran ${runs}×` : 'ran') : '';
  dom.title = runs ? `This routine ran ${runs} ${runs == 1 ? 'time' : 'times'} during the last interaction.` : '';
}

// Every strip on screen follows the routine that just ran. Deferred by a tick because one
// interaction can run dozens of routines (every property change runs the changeRoutines of the
// widget), and they all end up showing the same thing.
function routineDebugRefresh() {
  if(routineDebugRefreshPending)
    return;
  routineDebugRefreshPending = true;
  setTimeout(_=>{
    routineDebugRefreshPending = false;
    routineDebugRefreshNow();
  }, 0);
}

function routineDebugRefreshNow() {
  for(const dom of $a('.routine-editor-debug[data-debug-key]'))
    routineDebugRender(dom);
  for(const dom of $a('[data-debug-routine]'))
    routineDebugRenderRoutine(dom);
}
