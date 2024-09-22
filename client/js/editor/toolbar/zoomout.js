class ZoomOutButton extends ToolbarToggleButton {
  constructor() {
    super('zoom_out', 'Toggle zoom out', 'Toggle between the normal view and a zoomed out view that allows to hide widgets off screen.');
  }

  toggle(state) {
    $('body').classList.toggle('zoomedOut', state);
    setZoomAndOffset(state ? 0.5 : 1, 0, 0);
  }
}
