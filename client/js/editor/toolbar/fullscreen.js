class FullscreenButton extends ToolbarToggleButton {
  constructor() {
    super('fullscreen', 'Toggle fullscreen', 'Toggle fullscreen mode.');
  }

  toggle() {
    $('#fullscreenButton').click();
  }
}
