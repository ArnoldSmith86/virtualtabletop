export class CloseButton extends ToolbarButton {
  constructor() {
    super('close', 'Close the editor and return to playing the game.');
  }

  click() {
    $('#activeGameButton').click();
  }
}
