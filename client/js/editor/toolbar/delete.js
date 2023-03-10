class DeleteButton extends ToolbarButton {
  constructor() {
    super('delete_forever', 'Delete the selected widgets.');
  }

  async click() {
    const previousSelection = [...selectedWidgets];
    setSelection([]);
    for(const widget of previousSelection)
      await removeWidgetLocal(widget.id);
  }
}
