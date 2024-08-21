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

  onClose() {
    $('#jsonEditor').append($('#jeLog'));
  }

  onStateReceivedWhileActive() {
    this.button_clearButton();
  }

  renderModule(target) {
    div(target, 'buttonBar', `
      <input type=checkbox id=autoClearLog checked><label for=autoClearLog> Clear after each interaction</label>
      <button icon=backspace id=clearLogButton disabled>Clear</button>
    `);
    target.append($('#jeLog'));

    on('#autoClearLog', 'change', e=>this.button_clearCheckbox());
    on('#clearLogButton', 'click', e=>this.button_clearButton());
  }
}
