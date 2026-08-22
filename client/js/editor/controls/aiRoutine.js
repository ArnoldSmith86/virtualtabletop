// Describe a routine in plain English and have it written for you.
//
// The button sits on every routine card of the Automations section, so the AI
// works on the routine you are already looking at rather than asking you to name
// a widget and a property first. What comes back is not shown as a preview to
// approve: it is written to the routine straight away, with the operations that
// changed highlighted, because reading a page of JSON in a popup is a worse way
// to judge a routine than looking at the routine itself. It goes through the
// same setRoutine() path the visual editor uses, so undo takes it back.
//
// The slider says how much thought to buy for it: a two-operation button does
// not need the expensive model, and a whole game's setup does. The position is
// remembered.
//
// The room is sent along with the request, because a routine is about this room:
// which widgets exist, what they are called, what the game already does. Without
// it the answers are generic ones full of invented ids - which is what the first
// version of this did. The generating happens on the bot at
// agent.virtualtabletop.io (nothing is sent anywhere else and nothing is stored);
// point it elsewhere with localStorage editor.aiRoutineEndpoint.

const AI_ROUTINE_ENDPOINT = 'https://agent.virtualtabletop.io/routine-assist';
const AI_POLL_INTERVAL = 1200;
const AI_POLL_TIMEOUT = 5 * 60 * 1000;

const AI_PROMPT_EXAMPLES = [
  'shuffle the deck and deal five cards to every player',
  'move all the cards on the table back into the deck',
  'add one to my score and pass the turn on',
  'hide the board until someone presses start'
];

// Mirrors the steps the service offers; the descriptions are what the player
// actually chooses between - a name like "Sonnet" would mean nothing to them.
const AI_QUALITY_STEPS = [
  { label: 'Quickest', note: 'seconds - fine for a couple of operations' },
  { label: 'Quick', note: 'thinks a little before answering' },
  { label: 'Balanced', note: 'the usual choice' },
  { label: 'Careful', note: 'for routines with several steps' },
  { label: 'Best', note: 'for the ones that need to get the game right' }
];
const AI_DEFAULT_QUALITY = 3;

function aiRoutineEndpoint() {
  try {
    return localStorage.getItem('editor.aiRoutineEndpoint') || AI_ROUTINE_ENDPOINT;
  } catch(e) {
    return AI_ROUTINE_ENDPOINT;
  }
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

// What this routine would ADD to the room's problems. Rooms in the middle of
// being built are rarely clean, so the ones that were already there are not
// this routine's fault and would only bury the ones that are.
function aiValidateRoutine(widgetID, property, routine) {
  const room = aiRoomState();
  let before = [];
  try {
    before = validateGameFile(room, false);
  } catch(e) {
  }
  try {
    const after = validateGameFile({ ...room, [widgetID]: { ...room[widgetID], [property]: routine } }, false);
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

// Mark what the assistant just wrote, on the routine itself, and say in one
// line what it did. Called after the Automations section has re-rendered, so
// the operation cards exist.
function aiHighlightResult(routineEditor, before, after, result) {
  if(!routineEditor || !routineEditor.domElement)
    return;
  const changed = aiChangedOperations(before, after);
  const cards = routineEditor.directChildCards();
  for(const index of changed)
    if(cards[index])
      cards[index].classList.add('routine-editor-operation-ai-changed');

  const container = routineEditor.domElement.parentElement;
  if(!container)
    return;
  for(const old of container.querySelectorAll('.ai-routine-note'))
    old.remove();

  const note = document.createElement('div');
  note.className = 'ai-routine-note';
  const kept = after.length - changed.size;
  const summary = before && before.length
    ? `Rewritten - ${changed.size} of ${after.length} operations are new or changed${kept ? `, ${kept} kept` : ''}.`
    : `Written - ${after.length} operation${after.length == 1 ? '' : 's'}.`;
  div(note, 'ai-routine-note-head').textContent = `${summary} Undo puts it back.`;
  if(result && result.explanation)
    div(note, 'ai-routine-note-text').textContent = result.explanation;

  if(result && result.problems && result.problems.length) {
    const warn = div(note, 'ai-routine-note-warning');
    warn.textContent = result.problems.length == 1
      ? `It could not get one thing right: ${result.problems[0].message}`
      : `${result.problems.length} things in it are still wrong: ${result.problems.map(p=>p.message).join('; ')}`;
  }

  const dismiss = document.createElement('span');
  dismiss.className = 'material-symbols ai-routine-note-close';
  dismiss.textContent = 'close';
  dismiss.title = 'Dismiss';
  dismiss.addEventListener('click', _=>{
    note.remove();
    for(const card of cards)
      card.classList.remove('routine-editor-operation-ai-changed');
  });
  note.append(dismiss);
  container.insertBefore(note, routineEditor.domElement);
  return changed;
}

class AiRoutinePopup extends Popup {
  // apply(routine, result) writes the result; the popup never touches the widget
  constructor(source, widget, property, currentRoutine, apply) {
    super(source);
    this.widget = widget;
    this.property = property;
    this.currentRoutine = currentRoutine;
    this.apply = apply;
    this.busy = false;
    this.domElement.classList.add('ai-routine-popup');
  }

  onClick(e) {
  }

  show() {
    super.show();
    this.setTitle(`Write ${describeEventProperty(this.property).label} with AI`);
    this.renderBody();
    this.moveIntoView();
  }

  renderBody() {
    if(this.bodyDOM)
      this.bodyDOM.remove();
    this.bodyDOM = div(this.domElement, 'ai-routine-body');

    const has = Array.isArray(this.currentRoutine) && this.currentRoutine.length;
    div(this.bodyDOM, 'ai-routine-intro').textContent = has
      ? 'Say what this routine should do instead, or what to change about it. It is rewritten as a whole and applied right away - undo takes it back.'
      : 'Say what should happen, in your own words. Name the things you see on the board - the widgets are looked up for you.';

    this.input = document.createElement('textarea');
    this.input.className = 'ai-routine-prompt';
    this.input.rows = 4;
    this.input.placeholder = AI_PROMPT_EXAMPLES[Math.floor(Math.random() * AI_PROMPT_EXAMPLES.length)];
    this.input.value = this.lastPrompt || '';
    this.bodyDOM.append(this.input);
    // Ctrl/Cmd+Enter sends, plain Enter is a new line: these are sentences
    this.input.addEventListener('keydown', e=>{
      if(e.key == 'Enter' && (e.ctrlKey || e.metaKey))
        this.generate();
      e.stopPropagation();
    });

    this.renderQuality();

    const buttons = div(this.bodyDOM, 'ai-routine-buttons');
    this.generateButton = button(buttons, 'Write it', _=>this.generate());
    this.generateButton.disabled = this.busy;

    this.statusDOM = div(this.bodyDOM, 'ai-routine-status');
    if(!this.busy)
      setTimeout(_=>this.input.focus(), 0);
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
    div(row, 'ai-routine-quality-end').textContent = 'Good';
    this.qualityLabel = div(this.bodyDOM, 'ai-routine-quality-label');
    this.showQualityLabel();
  }

  showQualityLabel() {
    const step = AI_QUALITY_STEPS[this.qualityInput.value - 1];
    this.qualityLabel.textContent = step ? `${step.label} - ${step.note}` : '';
  }

  setStatus(text, kind) {
    this.statusDOM.className = `ai-routine-status${kind ? ` ai-routine-${kind}` : ''}`;
    this.statusDOM.textContent = text || '';
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
    this.lastPrompt = prompt;
    this.busy = true;
    this.generateButton.disabled = true;
    this.qualityInput.disabled = true;
    this.setStatus('Reading the room…');

    try {
      const result = await this.request(prompt, Number(this.qualityInput.value));
      // Straight onto the widget: the highlighted operations in the editor are
      // a better preview than any popup could be, and undo is one press away.
      result.problems = aiValidateRoutine(this.widget.get('id'), this.property, result.routine);
      this.apply(result.routine, result);
      this.hide();
      return;
    } catch(e) {
      this.setStatus(e.message, 'error');
    }
    this.busy = false;
    this.generateButton.disabled = false;
    this.qualityInput.disabled = false;
    this.generateButton.textContent = 'Try again';
  }

  // Start a job, then follow it: writing a routine takes long enough that a
  // single request would look like it had hung.
  async request(prompt, quality) {
    const endpoint = aiRoutineEndpoint();
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        async: true,
        quality,
        prompt,
        widgetId: this.widget.get('id'),
        widgetType: this.widget.get('type'),
        routineProperty: this.property,
        currentRoutine: Array.isArray(this.currentRoutine) ? this.currentRoutine : undefined,
        widgets: aiRoomState()
      })
    });
    const started = await response.json().catch(_=>({}));
    if(!response.ok || started.error)
      throw new Error(started.error || `The AI service answered ${response.status}.`);
    if(!started.jobId)
      throw new Error('The AI service did not start a job.');

    const until = Date.now() + AI_POLL_TIMEOUT;
    while(Date.now() < until) {
      await new Promise(resolve=>setTimeout(resolve, AI_POLL_INTERVAL));
      const poll = await fetch(`${endpoint}?job=${encodeURIComponent(started.jobId)}`);
      const state = await poll.json().catch(_=>({}));
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
    throw new Error('The AI service took too long. Try again, or ask for something smaller.');
  }
}

// The button that opens it, for one routine card of the Automations section.
function aiRoutineButton(headerDOM, widget, property, getRoutine, apply) {
  const aiButton = document.createElement('span');
  aiButton.className = 'material-symbols events-editor-ai';
  aiButton.textContent = 'auto_awesome';
  aiButton.title = 'Describe this routine in plain English and have it written';
  aiButton.addEventListener('click', e=>{
    e.stopPropagation();
    new AiRoutinePopup(aiButton, widget, property, getRoutine(), apply).show();
  });
  headerDOM.append(aiButton);
  return aiButton;
}
