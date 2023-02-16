class JsonModule extends SidebarModule {
  constructor() {
    super('data_object', 'JSON', 'Edit the raw widget JSON directly.');
  }

  onClose() {
    jeToggle();
    $('#jsonEditor').append($('#jeTextHighlight'));
    $('#jsonEditor').append($('#jeText'));
    $('#jsonEditor').append($('#jeCommands'));
  }

  onSelectionChangedWhileActive(newSelection) {
    if(newSelection.length) {
      jeSelectWidget(newSelection[0]);
      for(let i=1; i<newSelection.length; ++i)
        jeSelectWidget(newSelection[i], false, true);
    } else {
      jeEmpty();
    }
  }

  renderModule(target) {
    jeToggle();
    target.append($('#jeTextHighlight'));
    target.append($('#jeText'));
    target.append($('#jeCommands'));
    $('#jsonEditor').style.display = 'none';
  }
}
