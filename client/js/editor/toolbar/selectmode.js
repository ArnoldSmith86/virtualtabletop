class SelectModeButton extends ToolbarToggleButton {
  constructor() {
    super('highlight_alt', 'Toggle select mode', 'Toggle between drag to move and drag to select.\n\nUse the right mouse button to use the other mode.\n\nThe middle mouse button acts as if in play mode either way.');
    this.active = true;
  }

  toggle(state) {
    selectionModeActive = state;
    setSelection(selectedWidgets);
  }
}
