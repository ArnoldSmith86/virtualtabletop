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

export function getEditorRight() {
  if(jeEnabled)
    return $('#jeEditArea').offsetLeft;
  else if($('#editor.moduleActive'))
    return $('#editorModule').offsetLeft;
  else
    return $('#editorSidebar').offsetLeft;
}
