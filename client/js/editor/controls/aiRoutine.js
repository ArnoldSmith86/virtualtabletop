// Describe a routine in plain English and have it written for you.
//
// The button sits on every routine card of the Automations section, so the AI
// works on the routine you are already looking at rather than asking you to name
// a widget and a property first. What comes back is shown before anything is
// written: a sentence saying what it does, the operations it is made of, and
// whatever the validator still objects to. Applying it goes through the same
// setRoutine() path the visual editor uses, so it lands in the undo history and
// can be edited normally afterwards.
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

function aiRoutineEndpoint() {
  try {
    return localStorage.getItem('editor.aiRoutineEndpoint') || AI_ROUTINE_ENDPOINT;
  } catch(e) {
    return AI_ROUTINE_ENDPOINT;
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

class AiRoutinePopup extends Popup {
  // apply(routine) writes the result; the popup never touches the widget itself
  constructor(source, widget, property, currentRoutine, apply) {
    super(source);
    this.widget = widget;
    this.property = property;
    this.currentRoutine = currentRoutine;
    this.apply = apply;
    this.result = null;
    this.problems = [];
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
      ? 'Say what this routine should do instead, or what to change about it. It is rewritten as a whole.'
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

    const buttons = div(this.bodyDOM, 'ai-routine-buttons');
    this.generateButton = button(buttons, this.result ? 'Try again' : 'Write it', _=>this.generate());
    this.generateButton.disabled = this.busy;

    this.statusDOM = div(this.bodyDOM, 'ai-routine-status');
    this.resultDOM = div(this.bodyDOM, 'ai-routine-result');
    this.renderResult();
    if(!this.busy)
      setTimeout(_=>this.input.focus(), 0);
  }

  setStatus(text, kind) {
    this.statusDOM.className = `ai-routine-status${kind ? ` ai-routine-${kind}` : ''}`;
    this.statusDOM.textContent = text || '';
    this.moveIntoView();
  }

  renderResult() {
    this.resultDOM.innerHTML = '';
    if(!this.result)
      return;

    div(this.resultDOM, 'ai-routine-explanation').textContent = this.result.explanation || '';

    const pre = document.createElement('pre');
    pre.className = 'ai-routine-json';
    pre.textContent = JSON.stringify(this.result.routine, null, 2);
    this.resultDOM.append(pre);

    if(this.problems.length) {
      const problems = div(this.resultDOM, 'ai-routine-problems');
      div(problems, 'ai-routine-warning').textContent = this.problems.length == 1
        ? 'The validator still objects to one thing:'
        : `The validator still objects to ${this.problems.length} things:`;
      const list = document.createElement('ul');
      for(const problem of this.problems.slice(0, 10)) {
        const item = document.createElement('li');
        item.textContent = `${problem.property.join('.') || 'routine'}: ${problem.message}`;
        list.append(item);
      }
      problems.append(list);
    }

    const actions = div(this.resultDOM, 'ai-routine-buttons');
    button(actions, this.problems.length ? 'Use it anyway' : 'Use it', _=>{
      this.apply(this.result.routine);
      this.hide();
    });
    button(actions, 'Discard', _=>{
      this.result = null;
      this.problems = [];
      this.renderBody();
    });
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
    this.result = null;
    this.problems = [];
    this.renderResult();
    this.generateButton.disabled = true;
    this.setStatus('Reading the room…');

    try {
      const routine = await this.request(prompt);
      this.result = routine;
      this.problems = aiValidateRoutine(this.widget.get('id'), this.property, routine.routine);
      // The server checks with the same validator, so a problem left here is
      // usually one it could not solve - say so rather than looking silent.
      this.setStatus(this.problems.length ? 'Here is the closest it got.' : 'Ready.', this.problems.length ? 'warning' : null);
    } catch(e) {
      this.setStatus(e.message, 'error');
    }
    this.busy = false;
    this.generateButton.disabled = false;
    this.generateButton.textContent = 'Try again';
    this.renderResult();
  }

  // Start a job, then follow it: writing a routine takes long enough that a
  // single request would look like it had hung.
  async request(prompt) {
    const endpoint = aiRoutineEndpoint();
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        async: true,
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
      if(state.status == 'done')
        return state;
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
