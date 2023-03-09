class SelectModeButton extends ToolbarToggleButton {
  constructor() {
    super('highlight_alt', 'Toggle between drag to move and drag to select.\n\nUse the right mouse button to use the other mode.');
  }

  toggle(state) {
    selectionModeActive = state;
    setSelection(selectedWidgets);
  }
}
