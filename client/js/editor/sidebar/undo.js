class UndoModule extends SidebarModule {
  constructor() {
    super('undo', 'History', 'See and return to earlier states of this room.');
    this.lastRenderedIndex = -2;
    this.renderedEntries = [];
    this.latestEntryDOM = null;
  }

  onClose() {
    this.lastRenderedIndex = -2;
    this.renderedEntries = [];
    this.latestEntryDOM = null;
  }

  onDeltaReceivedWhileActive(delta) {
    if(!this.inUndoMode)
      this.renderModule(this.moduleDOM);
  }

  onEntryClick(index, dom) {
    this.inUndoMode = true;
    for(let i=this.activeIndex; i>index; --i)
      sendRawDelta({s:this.protocol[i].undoDelta});
    for(let i=this.activeIndex+1; i<=index; ++i)
      sendRawDelta(this.protocol[i].delta);
    this.setActiveIndex(index, dom);

    // the rows above the clicked one stay in the DOM and this.protocol keeps their
    // entries, so they can be clicked to return to that state - until the next
    // change arrives and renderModule drops the now unreachable timeline
    setUndoProtocol(this.protocol.slice(0, index+1));
    undoProtocolChanged();
    this.inUndoMode = false;

    setSelection([...selectedWidgets].filter(w=>widgets.has(w.id)));
  }

  onUndoProtocolChangedWhileActive() {
    if(!this.inUndoMode)
      this.renderModule(this.moduleDOM);
  }

  // the newest row is the first one in the DOM, so the row of the last rendered entry
  // is what a shortened protocol drops
  removeLatestEntry() {
    if(this.activeDOM === this.latestEntryDOM)
      this.activeDOM = null;
    this.latestEntryDOM.remove();
    this.renderedEntries.pop();
    this.lastRenderedIndex = this.renderedEntries.length - 1;
    this.latestEntryDOM = $('.undoEntry', this.moduleDOM);
  }

  renderModule(target) {
    if(this.lastRenderedIndex == -2) {
      this.addHeader('History');
      const hintDiv = hint('This lists all the changes that were done to this room until you loaded the page.<br><br>You can click on any row to return the room to the state after the described action.<br><br>You can afterwards return to a future state by clicking that one but as soon as you make new changes after returning to a state in the past, you can no longer restore anything from the now parallel timeline.<br><br>The Undo button in the toolbar works differently: it removes the change from this list for good, together with everything that happened after it, so those rows disappear and their states cannot be returned to.');
      this.moduleDOM.append(hintDiv);
      this.lastRenderedIndex = -1;
    }

    this.protocol = [...getUndoProtocol()];

    // returning to an earlier state cuts the protocol short, so the rows rendered so far
    // can describe entries that are gone by now - drop those rows instead of writing to a
    // row that has no entry behind it anymore
    while(this.lastRenderedIndex >= 0 && this.protocol[this.lastRenderedIndex] !== this.renderedEntries[this.lastRenderedIndex])
      this.removeLatestEntry();

    // the row of the entry that was dropped can have been the active one, in which case the
    // room is now in the state the row below it describes
    if(!this.activeDOM && this.latestEntryDOM)
      this.setActiveIndex(this.lastRenderedIndex, this.latestEntryDOM);

    if(this.latestEntryDOM) {
      const d = this.protocol[this.lastRenderedIndex].delta;
      this.latestEntryDOM.innerText = `${this.lastRenderedIndex+1} - ${d.c || 'change with no description'} (${Object.keys(d.s).length} widget${Object.keys(d.s).length == 1 ? '' : 's'} changed)`;
    }

    for(let i=this.lastRenderedIndex+1; i<this.protocol.length; ++i) {
      const div = document.createElement('div');
      const affectedWidgets = Object.keys(this.protocol[i].delta.s);
      div.innerText = `${i+1} - ${this.protocol[i].delta.c || 'change with no description'} (${affectedWidgets.length} widget${affectedWidgets.length == 1 ? '' : 's'} changed)`;
      focusable(div, _=>this.onEntryClick(i, div));
      div.className = 'undoEntry';
      this.moduleDOM.insertBefore(div, $('.undoEntry', this.moduleDOM));
      this.latestEntryDOM = div;
      this.renderedEntries[i] = this.protocol[i];

      if(i == this.protocol.length-1)
        this.setActiveIndex(i, div);
    }

    this.lastRenderedIndex = this.protocol.length - 1;
  }

  setActiveIndex(index, dom) {
    if(this.activeDOM)
      this.activeDOM.classList.remove('active');
    this.activeDOM = dom;
    this.activeDOM.classList.add('active');
    this.activeIndex = index;
  }
}
