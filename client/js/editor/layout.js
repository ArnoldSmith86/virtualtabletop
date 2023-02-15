function initializeEditor() {
  renderToolbar([
    new NewButton(),
    new SaveButton(),
    new CloseButton()
  ]);
}

function renderToolbar(buttons) {
  for(const button of buttons)
    button.render($('#editorToolbar'));
}
