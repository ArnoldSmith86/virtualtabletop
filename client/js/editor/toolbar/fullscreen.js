class FullscreenButton extends ToolbarToggleButton {
  constructor() {
    super('fullscreen', 'Toggle fullscreen', 'Toggle fullscreen mode.');
    document.addEventListener('fullscreenchange',       e=>this.setState(document.fullscreenElement));
    document.addEventListener('webkitfullscreenchange', e=>this.setState(document.webkitFullscreenElement));
    this.setState(document.fullscreenElement || document.webkitFullscreenElement);
  }

  toggle() {
    $('#fullscreenButton').click();
  }
}
