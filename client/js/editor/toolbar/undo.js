class UndoButton extends ToolbarButton {
  constructor() {
    super('undo', 'Undo', 'Undo the last change.', 'z');
  }

  click() {
    // the History module steps back through the list it shows, which keeps what was undone
    // reachable in it - with the module closed there is no list to keep it in, so the protocol
    // is simply cut short
    if(undoModule && undoModule.undoOneStep())
      return;

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
