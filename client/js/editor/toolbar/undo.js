class UndoButton extends ToolbarButton {
  constructor() {
    super('undo', 'Undo', 'Undo the last change.', 'z');
  }

  click() {
    const protocol = [...getUndoProtocol()];

    if(protocol.length > 1) {
      sendRawDelta({s:protocol[protocol.length-1].undoDelta});
      setUndoProtocol(protocol.slice(0, protocol.length-1));
      setSelection([...selectedWidgets].filter(w=>widgets.has(w.id)));
      undoProtocolChanged();
    }
  }

  onDeltaReceived(delta) {
    this.updateEnabled();
  }

  onEditorOpen() {
    this.updateEnabled();
  }

  onUndoProtocolChanged() {
    this.updateEnabled();
  }

  // the first protocol entry is the room as it was loaded, so there is nothing left to
  // undo while it is the only one - clicking would be a silent no-op
  isDisabled() {
    return getUndoProtocol().length <= 1;
  }
}
