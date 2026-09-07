class ZoomOutButton extends ToolbarToggleButton {
  constructor() {
    super('zoom_out', 'Toggle zoom out', 'Zoom out to see the area around the board.\n\nWidgets are parked there to keep them off screen while playing. In this view they can be moved, and a holder there takes drops while you edit - during play, only the board does.');
  }

  toggle(state) {
    $('body').classList.toggle('zoomedOut', state);
    setZoomAndOffset(state ? 0.5 : 1, 0, 0);
    resetZoomAndPan();
  }
}
