class CloseButton extends ToolbarButton {
  constructor() {
    super('close', 'Close editor', 'Close the editor and return to playing the game.');
  }

  click() {
    closeEditor();
  }
}
