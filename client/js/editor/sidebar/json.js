class JsonModule extends SidebarModule {
  constructor() {
    super('data_object', 'JSON', 'Edit the raw widget JSON directly.');
  }

  onClose() {
    jeToggle();
    $('#jsonEditor').append($('#jeTextHighlight'));
    $('#jsonEditor').append($('#jeText'));
    $('#jsonEditor').append($('#jeCommands'));
    $('#jsonEditor').append($('#jeWidgetLayers'));
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

    if(newSelection.length == 1) {
      jeSelectWidget(newSelection[0]);
    } else if(newSelection.length) {
      jeSelectSetMulti(newSelection);
    } else {
      jeEmpty();
    }
    $('#jeText').blur();
  }

  renderModule(target) {
    jeToggle();
    target.append($('#jeTextHighlight'));
    target.append($('#jeText'));
    target.append($('#jeCommands'));
    target.append($('#jeWidgetLayers'));
    $('#jsonEditor').style.display = 'none';
  }
}

class TreeModule extends SidebarModule {
  constructor() {
    super('account_tree', 'Tree', 'View and select your widgets in a tree based on their parents.');
  }

  onClose() {
    $('#jsonEditor').append($('#jeTree'));
  }

  onDeltaReceivedWhileActive(delta) {
    jeUpdateTree(delta.s);
  }

  onSelectionChangedWhileActive(newSelection) {
    if(jeDeltaIsOurs) {
      jeCenterSelection();
      return;
    }

    if(newSelection.length == 1) {
      jeSelectWidget(newSelection[0]);
    } else if(newSelection.length) {
      jeSelectSetMulti(newSelection);
    } else {
      jeEmpty();
      jeCenterSelection();
    }
    $('#jeText').blur();
  }

  onStateReceivedWhileActive() {
    jeDisplayTree();
  }

  renderModule(target) {
    target.append($('#jeTree'));
    jeInitTree();
    jeDisplayTree();
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
    if(!jeEnabled)
      return;
    setSelection([topSurface.widgets.get(problem.widget)]);
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
      <table class="validation-table">
        <thead>
          <tr>
            <th>Widget</th>
            <th>Property</th>
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

    const state = Object.fromEntries([...topSurface.widgets].map(([id, w])=>[id, w.unalteredState]));
    
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
    
    if (problems.length === 0) {
      const success = $('.staticErrors .success', this.moduleDOM);
      const table = $('.staticErrors .validation-table', this.moduleDOM);
      if (success) success.style.display = 'block';
      if (table) table.style.display = 'none';
    } else {
      const success = $('.staticErrors .success', this.moduleDOM);
      const table = $('.staticErrors .validation-table', this.moduleDOM);
      const tbody = $('.staticErrors .validation-table tbody', this.moduleDOM);
      if (success) success.style.display = 'none';
      if (table) table.style.display = 'block';
      if (tbody) tbody.innerHTML = '';
      for (const problem of problems) {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${problem.widget || '-'}</td>
          <td>${problem.property && problem.property.length > 0 ? problem.property.join('.') : '-'}</td>
          <td>${problem.message}</td>
        `;
        if (tbody) tbody.appendChild(row);
        row.addEventListener('click', e=>this.button_validationProblem(problem));
      }
    }
  }
}
