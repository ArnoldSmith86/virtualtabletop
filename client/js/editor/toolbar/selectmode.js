class SelectModeButton extends ToolbarToggleButton {
  constructor() {
    super('highlight_alt', 'Toggle select mode', 'Toggle between drag to move and drag to select.');
    this.active = true;
  }

  toggle(state) {
    selectionModeActive = state;
    setSelection(selectedWidgets);
  }
}
