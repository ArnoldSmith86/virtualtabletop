function initializeEditor() {
  renderToolbar([
    new NewButton(),
    new SaveButton(),
    new CloseButton()
  ]);

  renderSidebar([
    new PropertiesModule(),
    new UndoModule()
  ]);
}

function renderToolbar(buttons) {
  for(const button of buttons)
    button.render($('#editorToolbar'));
}

function renderSidebar(modules) {
  for(const module of modules)
    module.renderButton($('#editorSidebar'));
}

export function getAvailableRoomRectangle() {
  if(jeEnabled) {
    return {
      top: 35,
      right: $('#jeEditArea').offsetLeft,
      left: 0,
      bottom: window.innerHeight - 35
    };
  } else {
    return {
      top: 36,
      right: ($('#editor.moduleActive') ? $('#editorModule') : $('#editorSidebar')).offsetLeft,
      left: 0,
      bottom: window.innerHeight
    };
  }
}
