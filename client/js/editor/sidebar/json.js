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
    setSelection([widgets.get(problem.widget)]);
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

  onClose() {
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
    div(target, 'staticErrors', `
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
    div(target, 'buttonBar', `
      <input type=text id=jeLogFilter placeholder="Filter log...">
      <input type=checkbox id=autoClearLog checked><label for=autoClearLog> Clear after each interaction</label>
      <button icon=backspace id=clearLogButton disabled>Clear</button>
    `);
    target.append($('#jeLog'));

    on('#jeLogFilter', 'input', e=>this.button_filter());
    on('#autoClearLog', 'change', e=>this.button_clearCheckbox());
    on('#clearLogButton', 'click', e=>this.button_clearButton());
    this.updateValidation();
  }

  updateValidation() {
    const state = Object.fromEntries(widgets.entries().map(([id, w])=>[id, w.unalteredState]));
    const problems = validateGameFile(state, false);
    
    if (problems.length === 0) {
      $('.staticErrors .success', this.moduleDOM).style.display = 'block';
      $('.staticErrors .validation-table', this.moduleDOM).style.display = 'none';
    } else {
      $('.staticErrors .success', this.moduleDOM).style.display = 'none';
      $('.staticErrors .validation-table', this.moduleDOM).style.display = 'block';
      for (const problem of problems) {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${problem.widget || '-'}</td>
          <td>${problem.property && problem.property.length > 0 ? problem.property.join('.') : '-'}</td>
          <td>${problem.message}</td>
        `;
        $('.staticErrors .validation-table tbody', this.moduleDOM).appendChild(row);
        row.addEventListener('click', e=>this.button_validationProblem(problem));
      }
    }
  }
}
