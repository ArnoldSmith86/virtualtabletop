class JsonModule extends SidebarModule {
  constructor() {
    super('data_object', 'JSON', 'Edit the raw widget JSON directly.');
  }

  onClose() {
    jeToggle();
    removeSelectionBar(this.selectionBar);
    delete this.selectionBar;
    $('#jsonEditor').append($('#jeTextHighlight'));
    $('#jsonEditor').append($('#jeText'));
    $('#jsonEditor').append($('#jeCommands'));
  }

  onDeltaReceivedWhileActive(delta) {
    jeApplyDelta(delta);
  }

  onEditorClose() {
    super.onEditorClose();
    if(this.moduleDOM && jeEnabled)
      jeToggle();
  }

  onEditorOpen() {
    super.onEditorOpen();
    if(this.moduleDOM && !jeEnabled)
      jeToggle();
  }

  onSelectionChangedWhileActive(newSelection) {
    if(jeDeltaIsOurs)
      return;

    // Just opened while the deck editor covers the play area: show the deck being edited rather than whatever
    // the (invisible) room selection behind it happens to be - that deck is what is on screen.
    if(this.showDeckEditorDeck) {
      delete this.showDeckEditorDeck;
      jeSelectWidget(deckEditor.deck());
    } else if(newSelection.length == 1) {
      jeSelectWidget(newSelection[0]);
    } else if(newSelection.length) {
      jeSelectSetMulti(newSelection);
    } else if(deckEditor.isOpen() && deckEditor.deck()) {
      jeSelectWidget(deckEditor.deck());
    } else {
      jeEmpty();
    }
    $('#jeText').blur();
  }

  renderModule(target) {
    // openInTarget() fires onSelectionChanged() right after this, which is where the deck is picked up.
    this.showDeckEditorDeck = deckEditor.isOpen() && !!deckEditor.deck();
    jeToggle();
    this.selectionBar = renderSelectionBar(target, { key: this.title });
    target.append($('#jeTextHighlight'));
    target.append($('#jeText'));
    target.append($('#jeCommands'));
    $('#jsonEditor').style.display = 'none';
  }
}

// Called by the deck editor when it closes: the deck that was being edited is what the user was looking at,
// so leave the JSON editor on it instead of on a stale room selection made before the editor was opened.
function jeSelectDeckEditorDeck(deck) {
  if(jeEnabled && deck && widgets.has(deck.get('id')))
    jeSelectWidget(deck);
}

class DebugModule extends SidebarModule {
  constructor() {
    super('pest_control', 'Debug', 'View debug information for the most recent routine execution.');
    this.lastValidationTime = 0;
  }

  button_clearButton() {
    jeLoggingClear();
  }

  button_clearCheckbox() {
    jeRoutineAutoReset = !$('#clearLogButton').disabled;

    $('#clearLogButton').disabled = $('#autoClearLog').checked;
    this.setClearButtonTitle();
    if($('#clearLogButton').disabled)
      jeLoggingClear();
  }

  button_filter() {
    jeLoggingFilterLog($('#jeLogFilter').value);
  }

  button_validationProblem(problem) {
    // selecting the widget is useful on its own - the JSON editor is not always open
    const widget = widgets.get(problem.widget);
    if(widget)
      setSelection([widget]);

    if(!jeEnabled || !widget || !problem.property.length)
      return;
    const property = [...problem.property];
    const lastProperty = property.pop();
    let currentParent = jeStateNow;
    for(const prop of property) {
      currentParent = currentParent[prop];
    }

    const currentValue = currentParent[lastProperty];
    currentParent[lastProperty] = '###SELECT ME###';
    jeSetAndSelect(currentValue);
  }

  button_runValidation() {
    this.updateValidation(true);
  }

  onClose() {
    setJEroutineLogging(jeRoutineLogging = false);
    $('#jsonEditor').append($('#jeLog'));
  }

  onDeltaReceivedWhileActive(delta) {
    this.updateValidation();
  }

  // Routines are only logged while this panel is open to show the log, so playing the game costs
  // nothing - which is why the flag follows edit mode in both directions and not just the panel:
  // a panel that is still open when the editor is closed and reopened has to log again.
  onEditorClose() {
    super.onEditorClose();
    setJEroutineLogging(jeRoutineLogging = false);
  }

  onEditorOpen() {
    super.onEditorOpen();
    // Keyed on the flag actually being off rather than on onEditorClose() having run: edit mode can
    // also be left in ways that never reach it, and then nothing was missed and nothing is stale.
    if(this.moduleDOM && !jeRoutineLogging) {
      setJEroutineLogging(jeRoutineLogging = true);
      jeLoggingResumed();
    }
  }

  onStateReceivedWhileActive() {
    this.button_clearButton();
    this.updateValidation();
  }

  // The Clear button spends most of its life disabled because the log clears itself. Saying so in
  // its tooltip keeps it from reading like a button that is simply broken.
  setClearButtonTitle() {
    $('#clearLogButton').title = $('#clearLogButton').disabled
      ? 'The log is cleared automatically. Uncheck the box to keep it and clear it yourself.'
      : 'Empty the log now.';
  }

  renderModule(target) {
    this.addHeader('Debug', target);
    this.addSubHeader('Routine log', target);
    div(target, 'buttonBar', `
      <input type=text id=jeLogFilter placeholder="Filter log...">
      <label id=autoClearLogLabel title="Keep only the routines started by the most recent interaction with the room."><input type=checkbox id=autoClearLog checked> Clear after each interaction</label>
      <button icon=backspace id=clearLogButton disabled>Clear</button>
    `);
    this.setClearButtonTitle();
    target.append($('#jeLog'));
    div(target, 'jeLogNote jeLogEmptyNote', 'Nothing has been logged yet. Routines are only logged while this Debug panel is open in edit mode.');

    on('#jeLogFilter', 'input', e=>this.button_filter());
    on('#autoClearLog', 'change', e=>this.button_clearCheckbox());
    on('#clearLogButton', 'click', e=>this.button_clearButton());

    setJEroutineLogging(jeRoutineLogging = true);

    this.addSubHeader('Validation', target);
    div(target, 'staticErrors', `
      <div class="validation-controls" style="margin-top: 10px; display: none;">
        <button id="runValidationButton" icon=data_check>Run Validation</button>
        <span class="validation-time"></span>
      </div>
      <div class="success">No validation problems found!</div>
      <div class="validation-summary"></div>
      <table class="validation-table">
        <thead>
          <tr>
            <th>Widget</th>
            <th>Location</th>
            <th>Message</th>
          </tr>
        </thead>
        <tbody>
        </tbody>
      </table>
    `);

    on('#runValidationButton', 'click', e=>this.button_runValidation());
    this.lastValidationTime = 0;
    this.updateValidation();
  }

  updateValidation(force = false) {
    // Safety check: ensure moduleDOM is available
    if (!this.moduleDOM || !force && this.lastValidationTime > 50) {
      return;
    }

    const state = Object.fromEntries([...widgets].map(([id, w])=>[id, w.unalteredState]));
    
    // Hide manual validation controls
    const controls = $('.validation-controls', this.moduleDOM);
    if (controls) controls.style.display = 'none';

    // Measure validation time
    const startTime = performance.now();
    let problems;
    try {
      problems = validateGameFile(state, false);
    } catch (error) {
      console.error('Validation error:', error);
      problems = [{
        widget: '',
        property: [],
        message: `Validation error: ${error.message}`
      }];
    }
    const endTime = performance.now();
    const validationTime = endTime - startTime;
    
    this.lastValidationTime = validationTime;

    if (validationTime > 50) {
      // Show manual validation button
      const controls = $('.validation-controls', this.moduleDOM);
      const timeSpan = $('.validation-time', this.moduleDOM);
      if (controls) controls.style.display = 'block';
      if (timeSpan) timeSpan.textContent = `Validation took ${Math.round(validationTime)}ms - click to run now`;
    }
    
    const success = $('.staticErrors .success', this.moduleDOM);
    const summary = $('.staticErrors .validation-summary', this.moduleDOM);
    const table = $('.staticErrors .validation-table', this.moduleDOM);

    if (problems.length === 0) {
      if (success) success.style.display = 'block';
      if (summary) summary.style.display = 'none';
      if (table) table.style.display = 'none';
    } else {
      const tbody = $('.staticErrors .validation-table tbody', this.moduleDOM);
      if (success) success.style.display = 'none';
      if (summary) {
        summary.style.display = 'block';
        summary.textContent = `${problems.length} validation problem${problems.length == 1 ? '' : 's'} found:`;
      }
      if (table) table.style.display = '';
      if (tbody) tbody.innerHTML = '';
      const cell = text=>{
        const td = document.createElement('td');
        td.textContent = text;
        return td;
      };
      for (const problem of problems) {
        const row = document.createElement('tr');
        // widget IDs, property names and messages come from the game file - build the cells as text
        // nodes so that a widget called '<img src=x onerror=...>' cannot run script here
        row.appendChild(cell(problem.widget || '-'));
        const path = document.createElement('td');
        if (problem.property && problem.property.length > 0) {
          // allow the path to wrap at its dots instead of mid-segment
          problem.property.forEach((segment, i)=>{
            if (i) {
              path.appendChild(document.createTextNode('.'));
              path.appendChild(document.createElement('wbr'));
            }
            path.appendChild(document.createTextNode(String(segment)));
          });
        } else {
          path.textContent = '-';
        }
        row.appendChild(path);
        row.appendChild(cell(problem.message));
        if (tbody) tbody.appendChild(row);
        row.addEventListener('click', e=>this.button_validationProblem(problem));
      }
    }
  }
}
