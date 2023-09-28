class DeleteButton extends ToolbarButton {
  constructor() {
    super('delete_forever', 'Delete', 'Delete the selected widgets.', 'Delete');
    this.setMinimumSelection(1);
  }

  async click() {
    const previousSelection = [...selectedWidgets];
    setSelection([]);
    for(const widget of previousSelection)
      await removeWidgetLocal(widget.id);
  }
}
