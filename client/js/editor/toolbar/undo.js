class UndoButton extends ToolbarButton {
  constructor() {
    super('undo', 'Undo', 'Undo the last change.', 'z');
  }

  click() {
    const protocol = [...getUndoProtocol()];

    if(protocol.length) {
      sendRawDelta({s:protocol[protocol.length-1].undoDelta});
      setUndoProtocol(protocol.slice(0, protocol.length-1));
      setSelection([...selectedWidgets].filter(w=>widgets.has(w.id)));
    }
  }
}
