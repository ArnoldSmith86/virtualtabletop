class AddButton extends ToolbarButton {
  constructor() {
    super('add', 'Add a new widget.', 'a');
  }

  async click() {
    setSelection([]);
    showOverlay("addOverlay")
  }
}
