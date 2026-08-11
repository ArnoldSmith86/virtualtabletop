class JsonModule extends SidebarModule {
  constructor() {
    super('data_object', 'JSON', 'Edit the raw widget JSON directly.');
  }

  onClose() {
    jeToggle();
    jeToggleTreeDropdown(true);
    $('#jsonEditor').append($('#jeWidgetSwitcher'));
    $('#jsonEditor').append($('#jeTextHighlight'));
    $('#jsonEditor').append($('#jeText'));
    $('#jsonEditor').append($('#jeCommands'));
    $('#jsonEditor').append($('#jeWidgetLayers'));
  }

  onDeltaReceivedWhileActive(delta) {
    jeApplyDelta(delta);
    if(jeTreeIsVisible())
      jeUpdateTree(delta.s);
    jeUpdateWidgetSwitcher();
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

    if(newSelection.length == 1) {
      jeSelectWidget(newSelection[0]);
    } else if(newSelection.length) {
      jeSelectSetMulti(newSelection);
    } else {
      jeEmpty();
    }
    $('#jeText').blur();
  }

  onStateReceivedWhileActive() {
    if(jeTreeIsVisible())
      jeDisplayTree();
    jeUpdateWidgetSwitcher();
  }

  renderModule(target) {
    jeToggle();
    target.append($('#jeWidgetSwitcher'));
    target.append($('#jeTextHighlight'));
    target.append($('#jeText'));
    target.append($('#jeCommands'));
    target.append($('#jeWidgetLayers'));
    $('#jsonEditor').style.display = 'none';
    jeUpdateWidgetSwitcher();
    if(jeTreeIsPinned())
      jeToggleTreeDropdown();
  }
}

class DebugModule extends SidebarModule {
  constructor() {
    super('pest_control', 'Debug', 'View debug information for the most recent routine execution.');
    this.lastValidationTime = 0;
  }

  button_clearButton() {
    jeLoggingHTML = '';
    $('#jeLog').innerHTML = '';
  }

  button_clearCheckbox() {
    jeRoutineAutoReset = !$('#clearLogButton').disabled;

    $('#clearLogButton').disabled = $('#autoClearLog').checked;
    if($('#clearLogButton').disabled)
      jeLoggingHTML = '';
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

  onStateReceivedWhileActive() {
    this.button_clearButton();
    this.updateValidation();
  }

  renderModule(target) {
    div(target, 'buttonBar', `
      <input type=text id=jeLogFilter placeholder="Filter log...">
      <input type=checkbox id=autoClearLog checked><label for=autoClearLog> Clear after each interaction</label>
      <button icon=backspace id=clearLogButton disabled>Clear</button>
    `);
    target.append($('#jeLog'));

    on('#jeLogFilter', 'input', e=>this.button_filter());
    on('#autoClearLog', 'change', e=>this.button_clearCheckbox());
    on('#clearLogButton', 'click', e=>this.button_clearButton());

    setJEroutineLogging(jeRoutineLogging = true);

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
      if (table) table.style.display = 'table';
      if (tbody) tbody.innerHTML = '';
      for (const problem of problems) {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${problem.widget || '-'}</td>
          <td>${problem.property && problem.property.length > 0 ? problem.property.join('.<wbr>') : '-'}</td>
          <td>${problem.message}</td>
        `;
        if (tbody) tbody.appendChild(row);
        row.addEventListener('click', e=>this.button_validationProblem(problem));
      }
    }
  }
}
