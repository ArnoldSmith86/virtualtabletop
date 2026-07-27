const AI_ROUTINE_ASSIST_ENDPOINT = 'https://agent.virtualtabletop.io/routine-assist';

const AI_ROUTINE_PROPERTY_PRESETS = [
  'clickRoutine', 'doubleClickRoutine', 'changeRoutine', 'gameStartRoutine',
  'globalUpdateRoutine', 'enterRoutine', 'leaveRoutine'
];

class AiAssistantModule extends SidebarModule {
  constructor() {
    super('smart_toy', 'AI', 'Describe a routine change in plain English; the AI writes and validates the JSON for you.');
    this.routineProperty = null;
    this.lastRoutine = null;
    this.lastExplanation = '';
    this.lastProblems = [];
    this.busy = false;
  }

  contextWidgets() {
    return [...widgets]
      .filter(([id]) => id !== this.widgetId)
      .slice(0, 80)
      .map(([id, w]) => ({ id, type: w.get('type'), name: w.get('text') || w.get('label') || undefined }));
  }

  currentSelection() {
    return selectedWidgets.length === 1 ? selectedWidgets[0] : null;
  }

  existingRoutineProperties(widget) {
    return Object.keys(widget.unalteredState).filter(k => /Routine$/.test(k));
  }

  onSelectionChangedWhileActive(newSelection) {
    this.widgetId = newSelection.length === 1 ? newSelection[0].get('id') : null;
    this.lastRoutine = null;
    this.lastProblems = [];
    this.render();
  }

  onStateReceivedWhileActive() {
    this.render();
  }

  button_generate() {
    this.runGenerate(false);
  }

  button_regenerate() {
    this.runGenerate(true);
  }

  button_apply() {
    const widget = this.currentSelection();
    if(!widget || !this.lastRoutine || !this.routineProperty)
      return;
    widget.set(this.routineProperty, this.lastRoutine);
    this.lastRoutine = null;
    this.lastProblems = [];
    this.render(`Applied to ${this.routineProperty}.`);
  }

  button_discard() {
    this.lastRoutine = null;
    this.lastProblems = [];
    this.render();
  }

  async runGenerate(isRegenerate) {
    const widget = this.currentSelection();
    if(!widget || this.busy)
      return;

    const propertySelect = $('#aiRoutineProperty', this.moduleDOM);
    const customInput = $('#aiRoutinePropertyCustom', this.moduleDOM);
    this.routineProperty = (propertySelect.value === '__custom__' ? customInput.value : propertySelect.value).trim();
    const prompt = $('#aiPrompt', this.moduleDOM).value.trim();

    if(!/Routine$/.test(this.routineProperty)) {
      this.render('Routine property name must end in "Routine".', true);
      return;
    }
    if(!prompt) {
      this.render('Describe what you want the routine to do.', true);
      return;
    }

    const body = {
      prompt,
      widgetType: widget.get('type'),
      widgetId: widget.get('id'),
      routineProperty: this.routineProperty,
      contextWidgets: this.contextWidgets()
    };
    const existing = isRegenerate ? this.lastRoutine : widget.get(this.routineProperty);
    if(existing !== undefined && existing !== null)
      body.currentRoutine = existing;
    if(isRegenerate && this.lastProblems.length)
      body.validationErrors = this.lastProblems.map(p => ({ property: p.property.join('.'), message: p.message }));

    this.busy = true;
    this.render('Generating…');
    try {
      const response = await fetch(AI_ROUTINE_ASSIST_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await response.json();
      if(!response.ok || data.error) {
        this.busy = false;
        this.render(data.error || `Request failed (${response.status}).`, true);
        return;
      }
      this.lastRoutine = data.routine;
      this.lastExplanation = data.explanation || '';
      this.lastProblems = this.validate(widget, this.routineProperty, this.lastRoutine);
      this.busy = false;
      this.render();
    } catch(e) {
      this.busy = false;
      this.render(`Request failed: ${e.message}`, true);
    }
  }

  validate(widget, property, routine) {
    const baseState = Object.fromEntries([...widgets].map(([id, w]) => [id, w.unalteredState]));
    let before;
    try {
      before = validateGameFile(baseState, false);
    } catch(e) {
      before = [];
    }

    const modifiedState = { ...baseState, [widget.get('id')]: { ...baseState[widget.get('id')], [property]: routine } };
    let after;
    try {
      after = validateGameFile(modifiedState, false);
    } catch(e) {
      return [{ widget: widget.get('id'), property: [property], message: `Validation error: ${e.message}` }];
    }

    const beforeKeys = new Set(before.map(p => JSON.stringify(p)));
    return after.filter(p => !beforeKeys.has(JSON.stringify(p)));
  }

  render(statusMessage, isError) {
    if(!this.moduleDOM)
      return;
    this.moduleDOM.innerHTML = '';

    const widget = this.currentSelection();
    if(!widget) {
      div(this.moduleDOM, 'aiAssistantEmpty', '<p>Select exactly one widget to create or edit one of its routines.</p>');
      return;
    }

    const existingRoutines = this.existingRoutineProperties(widget);
    const options = [...new Set([...existingRoutines, ...AI_ROUTINE_PROPERTY_PRESETS])];
    const selected = this.routineProperty && options.includes(this.routineProperty) ? this.routineProperty : (options[0] || '');

    div(this.moduleDOM, 'aiAssistantHeader', `<p>Widget: <b>${widget.get('id')}</b> (${widget.get('type')})</p>`);

    const controls = div(this.moduleDOM, 'aiAssistantControls', `
      <label for=aiRoutineProperty>Routine property</label>
      <select id=aiRoutineProperty>
        ${options.map(o => `<option value="${o}"${o === selected ? ' selected' : ''}>${o}${existingRoutines.includes(o) ? ' (existing)' : ''}</option>`).join('')}
        <option value="__custom__">Custom…</option>
      </select>
      <input type=text id=aiRoutinePropertyCustom placeholder="e.g. myHelperRoutine" style="display:none">
      <label for=aiPrompt>What should it do?</label>
      <textarea id=aiPrompt rows=4 placeholder="e.g. When clicked, shuffle the deck and deal 5 cards to each active seat"></textarea>
      <button id=aiGenerateButton icon=smart_toy>Generate</button>
    `);
    on('#aiRoutineProperty', 'change', e => {
      $('#aiRoutinePropertyCustom', this.moduleDOM).style.display = e.target.value === '__custom__' ? 'block' : 'none';
    });
    on('#aiGenerateButton', 'click', () => this.button_generate());
    if(this.busy)
      $('#aiGenerateButton', controls).disabled = true;

    if(statusMessage)
      div(this.moduleDOM, isError ? 'aiAssistantError' : 'aiAssistantStatus', `<p>${statusMessage}</p>`);

    if(this.lastRoutine) {
      div(this.moduleDOM, 'aiAssistantResult', `
        <p>${this.lastExplanation}</p>
        <pre class=aiAssistantRoutinePreview>${JSON.stringify(this.lastRoutine, null, 2).replace(/</g, '&lt;')}</pre>
      `);

      if(this.lastProblems.length) {
        const problemsDiv = div(this.moduleDOM, 'aiAssistantProblems', `
          <p class=aiAssistantError>Validator found ${this.lastProblems.length} problem(s):</p>
          <ul>${this.lastProblems.map(p => `<li>${p.property.join('.') || '-'}: ${p.message}</li>`).join('')}</ul>
          <button id=aiRegenerateButton icon=autorenew>Ask AI to fix</button>
          <button id=aiApplyAnywayButton icon=warning>Apply anyway</button>
        `);
        on('#aiRegenerateButton', 'click', () => this.button_regenerate());
        on('#aiApplyAnywayButton', 'click', () => this.button_apply());
      } else {
        const okDiv = div(this.moduleDOM, 'aiAssistantOk', `
          <p class=aiAssistantSuccess>No validation problems.</p>
          <button id=aiApplyButton icon=check>Apply</button>
          <button id=aiDiscardButton icon=close>Discard</button>
        `);
        on('#aiApplyButton', 'click', () => this.button_apply());
        on('#aiDiscardButton', 'click', () => this.button_discard());
      }
    }
  }

  renderModule(target) {
    this.render();
  }
}
