class AddButton extends ToolbarButton {
  constructor() {
    super('add', 'Add widget', 'Add a new widget.', 'a');
  }

  click() {
    setSelection([]);
    showOverlay("addOverlay")
  }
}
