// One step back in the room's history. A free function because the toolbar
// button is not the only place it is offered: the AI assistant's note offers it
// too, right next to the routine it would put back.
function undoLastChange() {
  // the History module steps back through the list it shows, which keeps what was undone
  // reachable in it - with the module closed there is no list to keep it in, so the protocol
  // is simply cut short
  if(undoModule && undoModule.undoOneStep())
    return;

  const protocol = [...getUndoProtocol()];

  if(protocol.length > 1) {
    // between the undo delta and the shortened protocol the entry being undone is still the
    // last one of the protocol, so a render in between would give that undo a row of its own
    if(undoModule)
      undoModule.inUndoMode = true;

    sendRawDelta({s:protocol[protocol.length-1].undoDelta});
    setUndoProtocol(protocol.slice(0, protocol.length-1));

    if(undoModule)
      undoModule.inUndoMode = false;

    setSelection([...selectedWidgets].filter(w=>widgets.has(w.id)));
    undoProtocolChanged();
  }
}

class UndoButton extends ToolbarButton {
  constructor() {
    super('undo', 'Undo', 'Undo the last change.', 'z');
  }

  click() {
    undoLastChange();
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
