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
    if(newSelection.length) {
      jeSelectWidget(newSelection[0]);
      for(let i=1; i<newSelection.length; ++i)
        jeSelectWidget(newSelection[i], true);
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

  onSelectionChangedWhileActive(newSelection) {
    if(newSelection.length) {
      jeSelectWidget(newSelection[0]);
      for(let i=1; i<newSelection.length; ++i)
        jeSelectWidget(newSelection[i], true);
    } else {
      jeEmpty();
    }
    jeDisplayTree();
    $('#jeText').blur();
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

  onClose() {
    $('#jsonEditor').append($('#jeLog'));
  }

  renderModule(target) {
    target.append($('#jeLog'));
  }
}
