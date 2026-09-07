// Describe a routine in plain English and have it written for you.
//
// The button sits on every routine card of the Automations section, so the AI
// works on the routine you are already looking at rather than asking you to name
// a widget and a property first. It is offered a second time in words next to
// "add routine", for the author who has no routine yet - which is where not
// knowing what to write is a wall in the first place. What comes back is not shown as a preview to
// approve: it is written to the routine straight away, with the operations that
// changed highlighted, because reading a page of JSON in a popup is a worse way
// to judge a routine than looking at the routine itself. It goes through the
// same setRoutine() path the visual editor uses, so undo takes it back. The
// marks and the note above the routine survive every re-render in between and
// go away when the note is dismissed, not when the next edit lands.
//
// The slider says how much thought to buy for it: a two-operation button does
// not need the expensive model, and a whole game's setup does. The position is
// remembered.
//
// The room is sent along with the request, because a routine is about this room:
// which widgets exist, what they are called, what the game already does. Without
// it the answers are generic ones full of invented ids - which is what the first
// version of this did. The generating happens wherever the server's
// aiRoutineEndpoint setting points - on virtualtabletop.io the bot at
// agent.virtualtabletop.io (nothing is sent anywhere else and nothing is stored).
// It has no default, so a server nobody has pointed at a service has no button
// either: sending the rooms it hosts to somebody else's machine is its admin's
// decision and not an upgrade's. A single browser overrides it for itself with
// localStorage editor.aiRoutineEndpoint.

const AI_DONATE_URL = 'https://www.patreon.com/virtualtabletop/about';
// The one service whose handling of a request this can speak for. Any other
// endpoint is somebody else's, and what it keeps is theirs to say.
const AI_FIRST_PARTY_HOST = 'agent.virtualtabletop.io';
// The first polls are close together because the cheap end of the slider really
// does answer in about ten seconds; after that they widen out, because the
// expensive end takes a minute or more and asking sixty times a minute for
// something that cannot be ready yet is traffic somebody pays for.
const AI_POLL_INTERVAL = 1200;
const AI_POLL_MAX_INTERVAL = 5000;
const AI_POLL_BACKOFF = 1.3;
const AI_POLL_TIMEOUT = 5 * 60 * 1000;
const AI_MAX_REQUEST_SIZE = 8 * 1024 * 1024;

const AI_PROMPT_EXAMPLES = [
  'shuffle the deck and deal five cards to every player',
  'move all the cards on the table back into the deck',
  'add one to my score and pass the turn on',
  'hide the board until someone presses start'
];

// Mirrors the steps the service offers; the descriptions are what the player
// actually chooses between - a name like "Sonnet" would mean nothing to them,
// and neither does "more thinking" without the seconds it costs, which is the
// half of the trade the reader is about to sit through.
const AI_QUALITY_STEPS = [
  { label: 'Quickest', note: 'about 10 seconds - fine for a couple of operations' },
  { label: 'Quick', note: 'about 20 seconds - thinks a little before answering' },
  { label: 'Balanced', note: 'about half a minute - the usual choice' },
  { label: 'Careful', note: 'about a minute - for routines with several steps' },
  { label: 'Best', note: 'a minute or more - for the ones that need to get the game right' }
];
const AI_DEFAULT_QUALITY = 3;

function aiRoutineEndpoint() {
  let ownChoice = null;
  try {
    ownChoice = localStorage.getItem('editor.aiRoutineEndpoint');
  } catch(e) {
  }
  return ownChoice || config.aiRoutineEndpoint || '';
}

// An endpoint without a scheme ("/routine-assist") is on the server this editor
// was loaded from - which is a different promise from a third party's, and the
// one self-hosting setup that needs no CORS at all.
function aiRoutineIsSameOrigin() {
  const endpoint = aiRoutineEndpoint();
  return !!endpoint && !endpoint.match(/^[a-z]+:\/\//i);
}

// Where the request goes, for the line in the popup that says so.
function aiRoutineHost() {
  const endpoint = aiRoutineEndpoint();
  const host = endpoint.match(/^[a-z]+:\/\/([^/?#]+)/i);
  if(host)
    return host[1];
  if(aiRoutineIsSameOrigin() && typeof location == 'object' && location.host)
    return location.host;
  return endpoint;
}

// The job id is added as another parameter rather than as the first one: an
// endpoint is allowed a query string of its own, and a second "?" turns the job
// into part of the previous parameter's value, so every poll misses.
function aiPollURL(endpoint, jobId) {
  return `${endpoint}${endpoint.includes('?') ? '&' : '?'}job=${encodeURIComponent(jobId)}`;
}

function aiRoutineQuality() {
  try {
    const stored = Number(localStorage.getItem('editor.aiRoutineQuality'));
    if(stored >= 1 && stored <= AI_QUALITY_STEPS.length)
      return Math.round(stored);
  } catch(e) {
  }
  return AI_DEFAULT_QUALITY;
}

function setAiRoutineQuality(value) {
  try {
    localStorage.setItem('editor.aiRoutineQuality', String(value));
  } catch(e) {
  }
}

// The whole room as the validator and the assistant both want it: id -> state.
function aiRoomState() {
  return Object.fromEntries([ ...widgets ].map(([ id, w ])=>[ id, w.unalteredState ]));
}

// Inline images do not go along with the request: a data: URI is a few hundred kB
// of base64 that says nothing about what the widget is, and every widget of the
// room is sent. What is left of it still reads as an image property.
function aiWithoutInlineData(value) {
  if(typeof value == 'string')
    return value.match(/^data:[^,]*,./) ? `data: (${value.length} characters of inline data)` : value;
  if(Array.isArray(value))
    return value.map(aiWithoutInlineData);
  if(value && typeof value == 'object')
    return Object.fromEntries(Object.entries(value).map(([ key, entry ])=>[ key, aiWithoutInlineData(entry) ]));
  return value;
}

// The card the validator is given a deck's card routine on. cardDefaults is the
// one place it does not look inside ('any'), so a card routine checked on the
// deck is not checked at all - it is checked on a card of that deck instead,
// made up for the check, which is where it will really run. The suffix is on an
// id that already has to be unique in the room.
const AI_PROBE_CARD_SUFFIX = ' ai-routine-probe-card';

// The room with a candidate routine in it: a routine of the widget is a property
// of the widget, one a deck hands to its cards an entry of the deck's
// cardDefaults - plus the made-up card that carries it, because that is the
// widget the problems have to be about.
function aiRoomWithRoutine(room, widgetID, property, target, routine) {
  const state = room[widgetID];
  if(target != 'cardDefaults')
    return { ...room, [widgetID]: { ...state, [property]: routine } };
  const defaults = state && state.cardDefaults;
  const cardDefaults = defaults && typeof defaults == 'object' && !Array.isArray(defaults) ? defaults : {};
  const probe = widgetID + AI_PROBE_CARD_SUFFIX;
  return {
    ...room,
    [widgetID]: { ...state, cardDefaults: { ...cardDefaults, [property]: routine } },
    [probe]: { id: probe, type: 'card', deck: widgetID, [property]: routine }
  };
}

// The routine that is in that slot right now, which is what the candidate is
// compared against.
function aiRoutineFromState(state, property, target) {
  const source = target == 'cardDefaults' ? state && state.cardDefaults : state;
  const routine = source && typeof source == 'object' ? source[property] : undefined;
  return Array.isArray(routine) ? routine : [];
}

// Both the service and the copy of the validator the editor carries have looked
// at the routine, and they do not see the same things - the service checked it
// against the room while writing it, the bundled one is the version this editor
// actually runs. Neither list is allowed to swallow the other.
function aiMergeProblems(reported, found) {
  const problems = [];
  const seen = new Set();
  for(const problem of [ ...(Array.isArray(reported) ? reported : []), ...found ]) {
    const entry = typeof problem == 'string' ? { message: problem } : problem;
    if(!entry || !entry.message || seen.has(entry.message))
      continue;
    seen.add(entry.message);
    problems.push(entry);
  }
  return problems;
}

// What this routine would ADD to the room's problems. Rooms in the middle of
// being built are rarely clean, so the ones that were already there are not
// this routine's fault and would only bury the ones that are.
function aiValidateRoutine(widgetID, property, routine, target) {
  const room = aiRoomState();
  const current = aiRoutineFromState(room[widgetID], property, target);
  let before = [];
  try {
    // the same room with the routine that is there now, made-up card included, so
    // that card is not itself read as something the answer brought along
    before = validateGameFile(aiRoomWithRoutine(room, widgetID, property, target, current), false);
  } catch(e) {
  }
  try {
    const after = validateGameFile(aiRoomWithRoutine(room, widgetID, property, target, routine), false);
    const known = new Set(before.map(p=>JSON.stringify(p)));
    return after.filter(p=>!known.has(JSON.stringify(p)));
  } catch(e) {
    return [ { widget: widgetID, property: [ property ], message: `Validation error: ${e.message}` } ];
  }
}

// Which operations of the new routine are not in the old one, matched up in
// order (a longest common subsequence): an operation that only moved is not a
// change, and inserting one in the middle must not mark everything after it.
function aiChangedOperations(before, after) {
  const a = (Array.isArray(before) ? before : []).map(o=>JSON.stringify(o));
  const b = (Array.isArray(after) ? after : []).map(o=>JSON.stringify(o));
  const common = [ ...Array(a.length + 1) ].map(_=>new Array(b.length + 1).fill(0));
  for(let i=a.length-1; i>=0; --i)
    for(let j=b.length-1; j>=0; --j)
      common[i][j] = a[i] === b[j] ? common[i+1][j+1] + 1 : Math.max(common[i+1][j], common[i][j+1]);

  const changed = new Set(b.map((_, i)=>i));
  let i = 0, j = 0;
  while(i < a.length && j < b.length) {
    if(a[i] === b[j]) {
      changed.delete(j);
      ++i;
      ++j;
    } else if(common[i+1][j] >= common[i][j+1]) {
      ++i;
    } else {
      ++j;
    }
  }
  return changed;
}

// What the assistant last wrote, per routine of a widget, kept until the note
// above that routine is dismissed. Both the note and the marks on the changed
// operations live in DOM the editor throws away and builds again on every edit
// anywhere in the routine, so without a record of them they would last until
// the next keystroke - and "these are the operations it touched" is worth
// reading a minute later, next to the routine it is talking about.
const aiRoutineResults = new Map();

function aiResultKey(widgetID, routineKey) {
  // both halves can hold anything a widget id can, so they are keyed as a pair
  // rather than joined on a separator one of them could contain
  return JSON.stringify([ widgetID, routineKey ]);
}

// Asked once per session rather than on every answer: the ask belongs where the
// feature has just paid off, but on the tenth routine of an afternoon it is only
// in the way of the routine it is sitting on top of.
let aiDonateAsked = false;

function aiRecordResult(widgetID, routineKey, before, after, result, property) {
  aiRoutineResults.set(aiResultKey(widgetID, routineKey), {
    before: JSON.parse(JSON.stringify(Array.isArray(before) ? before : [])),
    after: JSON.parse(JSON.stringify(Array.isArray(after) ? after : [])),
    hadRoutine: Array.isArray(before) && before.length > 0,
    explanation: result && result.explanation,
    problems: (result && result.problems) || [],
    property, // the name a validator problem's path starts with
    donate: !aiDonateAsked,
    flashed: false
  });
  aiDonateAsked = true;
}

// Writing an answer onto the widget, with everything the note above the routine
// needs afterwards: what the routine was before, and which entry of the room's
// history the write became.
function aiApplyResult(widgetID, routineKey, before, routine, result, property, write) {
  aiRecordResult(widgetID, routineKey, before, routine, result, property);
  const historyLength = getUndoProtocol().length;
  write();
  const protocol = getUndoProtocol();
  const record = aiRoutineResults.get(aiResultKey(widgetID, routineKey));
  // a write that merged into the entry before it (the editor merges changes with
  // the same cause) would take that entry's other changes back with it, so there
  // is no step of its own to offer
  if(record)
    record.undoStep = protocol.length == historyLength + 1 ? protocol[protocol.length-1] : null;
}

// Whether the note's Undo would still put this routine back. It is the room's
// Undo, and that always takes back the latest change - so it is this routine's
// undo only for as long as writing this routine IS the latest change. Editing
// anything afterwards, in this routine or somewhere else entirely, takes the
// offer away rather than reverting a stranger in the routine's name.
function aiUndoStillAvailable(record, routine) {
  const protocol = getUndoProtocol();
  return !!record.undoStep && protocol[protocol.length-1] === record.undoStep
    && JSON.stringify(Array.isArray(routine) ? routine : []) === JSON.stringify(record.after);
}

// Which operations the validator's problems are about. A problem carries the
// path it was found at, which for a routine of the widget starts with the
// routine's own property and continues with the index of the operation - so the
// warning above the routine can be tied to the card it is warning about.
function aiProblemOperations(record) {
  const operations = new Set();
  for(const problem of record.problems) {
    const path = problem && problem.property;
    if(!Array.isArray(path) || path[0] !== record.property)
      continue;
    if(typeof path[1] == 'number')
      operations.add(path[1]);
  }
  return operations;
}

function aiForgetResult(widgetID, routineKey) {
  aiRoutineResults.delete(aiResultKey(widgetID, routineKey));
}

// Mark the operations that are not in the routine as it was before the
// assistant rewrote it. Called at the end of every render of a routine editor,
// because that is what rebuilds the cards these classes sit on.
function aiMarkChangedOperations(routineEditor) {
  const record = aiRoutineResults.get(aiResultKey(routineEditor.widgetID, routineEditor.routineKey));
  if(!record)
    return;
  const changed = aiChangedOperations(record.before, routineEditor.routine);
  const problems = aiProblemOperations(record);
  const cards = routineEditor.directChildCards();
  const marked = [];
  for(const index of changed) {
    if(!cards[index])
      continue;
    cards[index].classList.add('routine-editor-operation-ai-changed');
    aiOperationBadge(cards[index], 'auto_awesome', 'routine-editor-operation-ai-badge', 'Written by the AI assistant');
    marked.push(cards[index]);
  }
  for(const index of problems)
    if(cards[index])
      aiOperationBadge(cards[index], 'warning', 'routine-editor-operation-ai-problem', 'The note above the routine says what is wrong here');

  // the flash is for the moment the answer lands, and only once it can be seen:
  // the routine can be rendered below the fold, and replaying it on every later
  // render would make typing somewhere else in the routine a light show
  if(record.observer)
    record.observer.disconnect();
  if(!record.flashed && marked.length)
    record.observer = aiFlashWhenVisible(marked, _=>record.flashed = true);
}

// A mark in the operation's own header line, next to the name of the operation.
function aiOperationBadge(card, symbol, className, title) {
  const header = card.querySelector('.routine-editor-operation-func');
  if(!header || header.querySelector(`.${className}`))
    return;
  const badge = document.createElement('span');
  badge.className = `material-symbols ${className}`;
  badge.textContent = symbol;
  badge.title = title;
  header.append(badge);
}

// Play the flash once the cards are actually on screen. Without a viewport
// observer it is played straight away, which is what happens in a browser that
// has none and in the tests.
function aiFlashWhenVisible(cards, done) {
  const flash = _=>{
    for(const card of cards)
      card.classList.add('routine-editor-operation-ai-flash');
    done();
  };
  if(typeof IntersectionObserver != 'function') {
    flash();
    return null;
  }
  const observer = new IntersectionObserver(entries=>{
    if(!entries.some(entry=>entry.isIntersecting))
      return;
    observer.disconnect();
    flash();
  });
  observer.observe(cards[0]);
  return observer;
}

// The line above the routine saying what was just written into it, rebuilt
// whenever the Automations section re-renders and gone only once dismissed.
function aiShowResultNote(container, routineEditor) {
  for(const old of container.querySelectorAll('.ai-routine-note'))
    old.remove();
  const record = aiRoutineResults.get(aiResultKey(routineEditor.widgetID, routineEditor.routineKey));
  if(!record)
    return null;

  const routine = Array.isArray(routineEditor.routine) ? routineEditor.routine : [];
  const changed = aiChangedOperations(record.before, routine);
  const kept = routine.length - changed.size;
  // "0 of 5 changed" with nothing marked and nothing to undo is an empty result
  // dressed up as one: the answer was the routine that was already there
  const summary = !record.hadRoutine
    ? `Written - ${routine.length} operation${routine.length == 1 ? '' : 's'}.`
    : changed.size
      ? `Rewritten - ${changed.size} of ${routine.length} operations are new or changed${kept ? `, ${kept} kept` : ''}.`
      : 'It gave the routine back unchanged - try describing what should be different about it.';

  const note = document.createElement('div');
  note.className = 'ai-routine-note';
  // dismissing the note and undoing what it is about both end it: it stops being
  // shown from now on, and the marks it put on the cards go with it
  const forget = _=>{
    aiForgetResult(routineEditor.widgetID, routineEditor.routineKey);
    note.remove();
    for(const card of routineEditor.directChildCards()) {
      card.classList.remove('routine-editor-operation-ai-changed', 'routine-editor-operation-ai-flash');
      for(const badge of card.querySelectorAll('.routine-editor-operation-ai-badge, .routine-editor-operation-ai-problem'))
        badge.remove();
    }
  };
  div(note, 'ai-routine-note-head').textContent = summary;
  if(record.explanation)
    div(note, 'ai-routine-note-text').textContent = record.explanation;

  if(record.problems.length) {
    const warn = div(note, 'ai-routine-note-warning');
    const head = document.createElement('span');
    head.className = 'material-symbols';
    head.textContent = 'warning';
    warn.append(head, document.createTextNode(record.problems.length == 1
      ? ' It could not get one thing right:'
      : ` ${record.problems.length} things in it are still wrong:`));
    // one per line: joined into a sentence they wrap into a block nobody reads,
    // and a routine can come back with six of them
    const list = document.createElement('ul');
    list.className = 'ai-routine-note-problems';
    for(const problem of record.problems) {
      const item = document.createElement('li');
      item.textContent = problem.message;
      list.append(item);
    }
    warn.append(list);
  }

  // one press of undo only puts back what the assistant wrote for as long as
  // nothing has been changed since - and the note is where the offer belongs,
  // rather than sending the reader to look for the toolbar
  note.aiUndoStillAvailable = _=>aiUndoStillAvailable(record, routineEditor.routine);
  if(note.aiUndoStillAvailable()) {
    const actions = div(note, 'ai-routine-note-actions');
    const undo = button(actions, 'Undo - put the routine back', _=>{
      // the panel is not re-rendered for every change in the room, so what was
      // true when this was drawn is checked again before it is acted on
      if(!note.aiUndoStillAvailable()) {
        actions.textContent = 'Something else has been changed since, so undo would take that back instead of this routine.';
        actions.className = 'ai-routine-note-warning';
        return;
      }
      forget();
      undoLastChange();
    });
    undo.className = 'ai-routine-note-undo';
  }

  // asked for right where the feature has just paid off, which is the only
  // place the answer to "is this worth paying for" is in front of the reader
  if(record.donate) {
    const donate = div(note, 'ai-routine-note-donate');
    donate.append(document.createTextNode('If you like this feature, please consider '));
    const donateLink = document.createElement('a');
    donateLink.href = AI_DONATE_URL;
    donateLink.target = '_blank';
    donateLink.rel = 'noopener';
    donateLink.title = 'Opens virtualtabletop.io on Patreon in a new tab';
    donateLink.textContent = 'donating';
    donate.append(donateLink, document.createTextNode(". AI isn't free."));
  }

  const dismiss = document.createElement('span');
  dismiss.className = 'material-symbols ai-routine-note-close';
  dismiss.textContent = 'close';
  dismiss.title = 'Dismiss';
  focusable(dismiss, forget);
  note.append(dismiss);
  container.insertBefore(note, routineEditor.domElement);
  return note;
}

// The properties panel is only rebuilt for changes to the widget it is showing,
// so an offer that stops being true because something else was changed has to be
// taken back where it stands.
function aiRoutineDeltaReceived() {
  // a widget can be deleted while its note is up, and its id can be taken again
  // by a new one - which would then carry a note about a routine the assistant
  // never wrote, diffed against the routine of the widget that is gone
  for(const key of [ ...aiRoutineResults.keys() ])
    if(!widgets.has(JSON.parse(key)[0]))
      aiRoutineResults.delete(key);
  for(const note of document.querySelectorAll('.ai-routine-note')) {
    const actions = note.querySelector('.ai-routine-note-actions');
    if(actions && note.aiUndoStillAvailable && !note.aiUndoStillAvailable())
      actions.remove();
  }
}

// Bring what was just written on screen. The routine can be rendered far below
// the fold of the sidebar - the popup then closes, the panel still shows what it
// showed before, and nothing says the answer has landed at all.
function aiScrollToResult(note) {
  // the routine card the note belongs to, so what was written keeps the header
  // that says which routine it is
  const target = note && (note.closest('.events-editor-event') || note);
  if(target && typeof target.scrollIntoView == 'function')
    target.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

// What was last asked of a routine, so reopening the popup to say it differently
// starts from what was said the first time rather than from an empty box.
const aiLastPrompts = new Map();

// A new state replaces every widget in the room, and widget ids repeat across
// games - "deck" and "holder1" are in half of them. Kept records would then put
// "the assistant rewrote 2 of these 5 operations" on a routine it has never
// seen, diffed against a routine from another game. The editor's own state
// handler (selection.js) calls this.
function aiForgetAllResults() {
  aiRoutineResults.clear();
  aiLastPrompts.clear();
  aiDonateAsked = false;
}

// A routine as it is written down, for telling two of them apart. A routine that
// is not there at all and an empty one are the same thing to ask about.
function aiRoutineJSON(routine) {
  return JSON.stringify(Array.isArray(routine) ? routine : []);
}

class AiRoutinePopup extends Popup {
  // entry is the routine card this belongs to: { property, target, key }.
  // routineNow() reads the routine off the widget - it is read again when the
  // answer comes back, because a minute is long enough for it to have changed.
  // apply(routine, result) writes the result; the popup never touches the widget
  constructor(source, widget, entry, routineNow, apply) {
    super(source);
    this.widget = widget;
    this.widgetID = widget.get('id');
    this.property = entry.property;
    // 'widget' or, for a routine a deck hands to its cards, 'cardDefaults' - the
    // two are separate routines that run on different widgets
    this.target = entry.target || 'widget';
    this.routineNow = routineNow;
    this.currentRoutine = routineNow();
    this.apply = apply;
    this.busy = false;
    this.cancelled = false;
    this.abort = null;
    this.promptKey = aiResultKey(this.widgetID, entry.key || entry.property);
    this.domElement.classList.add('ai-routine-popup');
  }

  // A few sentences are typed into this one, and the half-window every other
  // popup settles for is a thirty-character box on a phone. Wider than a line of
  // prose reads comfortably is no use either, hence the cap.
  maxPopupWidth() {
    return Math.min(460, window.innerWidth * 0.9);
  }

  show() {
    super.show();
    // closing the popup gives up on the job: writing a routine takes long enough
    // that the answer can land after the editor has moved on, and one that writes
    // itself onto a widget nobody is looking at any more is worse than none
    this.registerCancelListener(_=>this.giveUp());
    const label = describeEventProperty(this.property).label;
    this.setTitle(`Write the ${label} routine${this.target == 'cardDefaults' ? ' of every card' : ''} with AI`);
    this.renderBody();
    this.moveIntoView();
  }

  // Nothing that is still in flight is waited for any more, and the requests
  // themselves are dropped rather than left running to completion.
  giveUp() {
    this.cancelled = true;
    if(this.abort)
      this.abort.abort();
  }

  renderBody() {
    if(this.bodyDOM)
      this.bodyDOM.remove();
    this.bodyDOM = div(this.domElement, 'ai-routine-body');

    // what it does for the reader first, the safety net second: the sentence
    // that might make someone hesitate is not the one to open with
    const has = Array.isArray(this.currentRoutine) && this.currentRoutine.length;
    div(this.bodyDOM, 'ai-routine-intro').textContent = has
      ? 'Say what this routine should do instead, or what to change about it. Name the things you see on the board - the widgets are looked up for you. It is rewritten as a whole; undo takes it back.'
      : 'Say what should happen, in your own words. Name the things you see on the board - the widgets are looked up for you.';
    // the one thing the name of the routine cannot say, and the thing the answer
    // is wrong about if it is not said: which widget this ends up running on
    if(this.target == 'cardDefaults')
      div(this.bodyDOM, 'ai-routine-intro').textContent
        = 'It runs on every card this deck hands out, not on the deck - so "this widget" is a card.';

    this.input = document.createElement('textarea');
    this.input.className = 'ai-routine-prompt';
    this.input.rows = 4;
    this.input.placeholder = AI_PROMPT_EXAMPLES[Math.floor(Math.random() * AI_PROMPT_EXAMPLES.length)];
    this.input.value = aiLastPrompts.get(this.promptKey) || '';
    this.bodyDOM.append(this.input);
    // Ctrl/Cmd+Enter sends, plain Enter is a new line: these are sentences
    this.input.addEventListener('keydown', e=>{
      if(e.key == 'Enter' && (e.ctrlKey || e.metaKey))
        this.generate();
      e.stopPropagation();
    });

    this.renderExamples();

    // a routine is written out of this room, so this room is what the request
    // carries - worth saying next to the box it is typed into rather than only
    // in the source of the thing sending it
    const privacy = div(this.bodyDOM, 'ai-routine-privacy');
    const privacyIcon = document.createElement('span');
    privacyIcon.className = 'material-symbols';
    privacyIcon.textContent = 'cloud_upload';
    const host = aiRoutineHost();
    privacy.append(privacyIcon, document.createTextNode(
      `What you write and the widgets in this room are sent to ${host}, so the routine can use the widgets you actually have. `
      + (host == AI_FIRST_PARTY_HOST
        ? 'They are not stored there.'
        : aiRoutineIsSameOrigin()
          ? 'That is the server this room is already on.'
          : 'What is kept of them there is up to whoever runs that service.')));

    this.renderQuality();

    const buttons = div(this.bodyDOM, 'ai-routine-buttons');
    this.generateButton = button(buttons, 'Write it', _=>this.generate());
    this.generateButton.classList.add('primary');
    this.generateButton.disabled = this.busy;
    // the x in the title bar gives up on the job, but nothing says so - and
    // "can I still stop this" is the question of a minute-long wait
    this.cancelButton = button(buttons, 'Cancel', _=>{
      this.giveUp();
      this.hide();
    });

    this.statusDOM = div(this.bodyDOM, 'ai-routine-status');
    if(!this.busy)
      setTimeout(_=>this.input.focus(), 0);
  }

  // The examples the placeholder can only show one of, offered as something to
  // press: "I don't know what to type" is the first wall, and they are also what
  // teaches how much detail the assistant wants.
  renderExamples() {
    const examples = div(this.bodyDOM, 'ai-routine-examples');
    for(const example of AI_PROMPT_EXAMPLES) {
      const chip = div(examples, 'ai-routine-example');
      chip.textContent = example;
      chip.title = 'Put this in the box';
      focusable(chip, _=>{
        this.input.value = example;
        this.input.focus();
      });
    }
  }

  renderQuality() {
    const row = div(this.bodyDOM, 'ai-routine-quality');
    div(row, 'ai-routine-quality-end').textContent = 'Fast';
    this.qualityInput = document.createElement('input');
    this.qualityInput.type = 'range';
    this.qualityInput.min = 1;
    this.qualityInput.max = AI_QUALITY_STEPS.length;
    this.qualityInput.step = 1;
    this.qualityInput.value = aiRoutineQuality();
    this.qualityInput.className = 'ai-routine-quality-slider';
    this.qualityInput.addEventListener('input', _=>{
      setAiRoutineQuality(this.qualityInput.value);
      this.showQualityLabel();
    });
    this.qualityInput.addEventListener('keydown', e=>e.stopPropagation());
    row.append(this.qualityInput);
    div(row, 'ai-routine-quality-end').textContent = 'Thorough';
    this.qualityLabel = div(this.bodyDOM, 'ai-routine-quality-label');
    this.showQualityLabel();
  }

  showQualityLabel() {
    const step = AI_QUALITY_STEPS[this.qualityInput.value - 1];
    this.qualityLabel.textContent = step ? `${step.label} - ${step.note}` : '';
  }

  setStatus(text, kind) {
    this.statusDOM.className = `ai-routine-status${kind ? ` ai-routine-${kind}` : ''}`;
    this.statusDOM.textContent = '';
    // something moving for as long as it is working: a line of text that changes
    // every other second reads as a popup that has stalled
    if(this.busy && !kind)
      div(this.statusDOM, 'ai-routine-spinner');
    this.statusDOM.append(document.createTextNode(text || ''));
    this.moveIntoView();
  }

  async generate() {
    if(this.busy)
      return;
    const prompt = this.input.value.trim();
    if(!prompt) {
      this.setStatus('Say what the routine should do first.', 'warning');
      return;
    }
    aiLastPrompts.set(this.promptKey, prompt);
    // what the answer will be written from, read again for a second attempt
    this.currentRoutine = this.routineNow();
    const asked = aiRoutineJSON(this.currentRoutine);
    this.busy = true;
    this.generateButton.disabled = true;
    this.qualityInput.disabled = true;
    this.setStatus('Reading the room…');

    try {
      const result = await this.request(prompt, Number(this.qualityInput.value));
      // the answer can arrive after the popup was closed or after the widget it
      // was asked about was deleted - writing a routine takes up to a minute
      if(this.cancelled)
        return;
      if(!widgets.has(this.widgetID)) {
        this.setStatus('The widget this routine belongs to is not in the room any more.', 'error');
      } else if(aiRoutineJSON(this.routineNow()) !== asked) {
        // rooms are edited by more than one person at a time, and a minute of
        // writing is long enough for the routine this was asked about to have
        // become somebody else's work - which an answer to the old one would
        // quietly throw away
        this.setStatus('This routine has changed since the request was sent, so nothing was written. Try again to have it written from the routine as it is now.', 'error');
      } else {
        // Straight onto the widget: the highlighted operations in the editor are
        // a better preview than any popup could be, and undo is one press away.
        result.problems = aiMergeProblems(result.problems, aiValidateRoutine(this.widgetID, this.property, result.routine, this.target));
        this.apply(result.routine, result);
        this.hide();
        return;
      }
    } catch(e) {
      if(this.cancelled)
        return;
      this.setStatus(e.message, 'error');
    }
    this.busy = false;
    this.generateButton.disabled = false;
    this.qualityInput.disabled = false;
    this.generateButton.textContent = 'Try again';
    this.cancelButton.textContent = 'Close';
  }

  // Start a job, then follow it: writing a routine takes long enough that a
  // single request would look like it had hung.
  async request(prompt, quality) {
    const endpoint = aiRoutineEndpoint();
    this.abort = typeof AbortController == 'function' ? new AbortController() : null;
    const signal = this.abort ? this.abort.signal : undefined;
    const body = JSON.stringify({
      async: true,
      quality,
      prompt,
      widgetId: this.widgetID,
      widgetType: this.widget.get('type'),
      routineProperty: this.property,
      // which of a deck's two kinds of routine this is: the one the deck runs,
      // or the one every card it hands out runs
      routineTarget: this.target,
      currentRoutine: Array.isArray(this.currentRoutine) ? this.currentRoutine : undefined,
      widgets: aiWithoutInlineData(aiRoomState())
    });
    // every attempt sends the whole room again, so a room that is too big to send
    // is worth saying before a minute is spent finding out
    if(body.length > AI_MAX_REQUEST_SIZE)
      throw new Error(`This room is too big to send (${Math.round(body.length / 1024 / 1024)} MB). Ask in a room with fewer widgets, or with less image data in them.`);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal
    });
    const started = await response.json().catch(_=>({}));
    if(!response.ok || started.error)
      throw new Error(started.error || `The AI service answered ${response.status}.`);
    if(!started.jobId)
      throw new Error('The AI service did not start a job.');

    const until = Date.now() + AI_POLL_TIMEOUT;
    let interval = AI_POLL_INTERVAL;
    while(!this.cancelled && Date.now() < until) {
      await new Promise(resolve=>setTimeout(resolve, interval));
      interval = Math.min(AI_POLL_MAX_INTERVAL, Math.round(interval * AI_POLL_BACKOFF));
      if(this.cancelled)
        break;
      const poll = await fetch(aiPollURL(endpoint, started.jobId), { signal });
      const state = await poll.json().catch(_=>({}));
      if(this.cancelled)
        break;
      if(state.status == 'running') {
        this.setStatus(state.step || 'Working…');
        continue;
      }
      if(state.status == 'done') {
        if(!Array.isArray(state.routine) || !state.routine.length)
          throw new Error('The AI service came back without a routine. Try again, or say it differently.');
        return state;
      }
      throw new Error(state.error || 'The AI service lost track of the request.');
    }
    throw new Error(this.cancelled ? 'The request was given up on.' : 'The AI service took too long. Try again, or ask for something smaller.');
  }
}

// The button that opens it, for one routine card of the Automations section.
function aiRoutineButton(headerDOM, widget, entry, getRoutine, apply) {
  // a server with no service configured has no button to press
  if(!aiRoutineEndpoint())
    return null;

  const aiButton = document.createElement('span');
  aiButton.className = 'material-symbols events-editor-ai';
  aiButton.textContent = 'auto_awesome';
  aiButton.title = 'Describe this routine in plain English and have it written';
  // the info buttons in the same header are reachable by keyboard; the icons
  // next to this one are not - this follows the better of the two
  focusable(aiButton, _=>new AiRoutinePopup(aiButton, widget, entry, getRoutine, apply).show());
  aiButton.dataset.routineKey = entry.key || entry.property;
  headerDOM.append(aiButton);
  return aiButton;
}

// The other way in: the icon on a routine card only exists once a routine does,
// and it is one of five 16px glyphs on a card an author has to have made first.
// This says it in words in the row that makes routines, which is where someone
// who has none yet - and does not know what to type - actually is.
function aiAddRoutineButton(container, onPick) {
  if(!aiRoutineEndpoint())
    return null;

  const addAI = button(container, 'write one with AI', _=>onPick(addAI));
  addAI.className = 'events-editor-add events-editor-add-ai';
  const icon = document.createElement('span');
  icon.className = 'material-symbols';
  icon.textContent = 'auto_awesome';
  addAI.prepend(icon);
  return addAI;
}
