class FullscreenButton extends ToolbarToggleButton {
  constructor() {
    super('fullscreen', 'Toggle fullscreen', 'Toggle fullscreen mode.');
    // compat-fallback api.Document.fullscreenElement: the webkit spelling of the event and of the property is right below
    document.addEventListener('fullscreenchange',       e=>this.setState(document.fullscreenElement));
    document.addEventListener('webkitfullscreenchange', e=>this.setState(document.webkitFullscreenElement));
    // compat-fallback api.Document.fullscreenElement: falls through to webkitFullscreenElement on the same line
    this.setState(document.fullscreenElement || document.webkitFullscreenElement);
  }

  toggle() {
    $('#fullscreenButton').click();
  }
}
