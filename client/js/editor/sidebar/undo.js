// Set when this module is constructed so the toolbar's undo button can take its step back through
// the list this module shows instead of cutting the protocol short behind its back.
let undoModule = null;

class UndoModule extends SidebarModule {
  constructor() {
    super('undo', 'History', 'See and return to earlier states of this room.');
    undoModule = this;
    this.clearRows();
  }

  onClose() {
    this.clearRows();
  }

  onDeltaReceivedWhileActive(delta) {
    if(!this.inUndoMode)
      this.renderModule(this.moduleDOM);
  }

  onUndoProtocolChangedWhileActive() {
    if(!this.inUndoMode)
      this.renderModule(this.moduleDOM);
  }

  // one per row of the list, oldest first: the protocol entry the row describes, the delta that
  // entry held when the row was rendered - a change can merge into an entry in place, which leaves
  // the entry itself the same object - and the row.
  clearRows() {
    this.rows = [];
    this.activeIndex = -1;
    this.hintRendered = false;
  }

  // the entries between the active row and the clicked one are undone or replayed, and the
  // protocol is cut short at the clicked entry so a new change continues from there. The rows
  // above it stay in the list, so their states can be returned to until a new change lands where
  // they were and makes them unreachable.
  onEntryClick(index) {
    this.inUndoMode = true;
    for(let i=this.activeIndex; i>index; --i)
      sendRawDelta({s:this.rows[i].entry.undoDelta});
    for(let i=this.activeIndex+1; i<=index; ++i)
      sendRawDelta(this.rows[i].entry.delta);
    this.setActiveIndex(index);

    setUndoProtocol(this.rows.slice(0, index+1).map(row=>row.entry));
    undoProtocolChanged();
    this.inUndoMode = false;

    setSelection([...selectedWidgets].filter(w=>widgets.has(w.id)));
  }

  removeLatestRow() {
    this.rows.pop().dom.remove();
  }

  renderModule(target) {
    if(!this.hintRendered) {
      this.addHeader('History');
      const hintDiv = hint('This lists all the changes that were done to this room until you loaded the page.<br><br>You can click on any row to return the room to the state after the described action.<br><br>You can afterwards return to a future state by clicking that one but as soon as you make new changes after returning to a state in the past, you can no longer restore anything from the now parallel timeline.<br><br>The Undo button in the toolbar takes the same step as clicking the row below the active one, so what it undoes can be restored here as well.');
      this.moduleDOM.append(hintDiv);
      this.hintRendered = true;
    }

    const protocol = getUndoProtocol();

    // how much of the list the protocol still confirms - it only ever changes at its end: a new
    // entry, a return to an earlier state cutting it short, or a change merging into the last entry
    let confirmed = Math.min(protocol.length, this.rows.length);
    while(confirmed && (this.rows[confirmed-1].entry !== protocol[confirmed-1] || this.rows[confirmed-1].delta !== protocol[confirmed-1].delta.s))
      --confirmed;

    // the rows past the end of the protocol describe the states an undo stepped over: they stay
    // clickable so the step can be taken back, and go once a new change lands where they were
    if(confirmed < protocol.length)
      while(this.rows.length > confirmed)
        this.removeLatestRow();

    for(let i=this.rows.length; i<protocol.length; ++i) {
      const dom = document.createElement('div');
      const affectedWidgets = Object.keys(protocol[i].delta.s);
      dom.innerText = `${i+1} - ${protocol[i].delta.c || 'change with no description'} (${affectedWidgets.length} widget${affectedWidgets.length == 1 ? '' : 's'} changed)`;
      dom.className = 'undoEntry';
      focusable(dom, _=>this.onEntryClick(i));
      this.moduleDOM.insertBefore(dom, $('.undoEntry', this.moduleDOM));
      this.rows[i] = { entry: protocol[i], delta: protocol[i].delta.s, dom };
    }

    // the room is in the state the last entry of the protocol describes, whatever is still listed
    // above it
    this.setActiveIndex(protocol.length-1);
  }

  setActiveIndex(index) {
    if(this.rows[this.activeIndex])
      this.rows[this.activeIndex].dom.classList.remove('active');
    this.activeIndex = index;
    if(this.rows[index])
      this.rows[index].dom.classList.add('active');
  }

  // the toolbar's undo button takes the same step as a click on the row below the active one, so
  // that what it undoes stays reachable - as long as the list is showing the protocol it shortens
  undoOneStep() {
    if(!this.moduleDOM || this.activeIndex < 1 || this.activeIndex != getUndoProtocol().length-1)
      return false;

    this.onEntryClick(this.activeIndex-1);
    return true;
  }
}
