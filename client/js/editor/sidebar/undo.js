class UndoModule extends SidebarModule {
  constructor() {
    super('undo', 'History', 'Undo changes from editing or playing.');
    this.lastRenderedIndex = -2;
    this.latestEntryDOM = null;
  }

  onClose() {
    this.lastRenderedIndex = -2;
  }

  onDeltaReceivedWhileActive(delta) {
    if(!this.inUndoMode) {
      if(this.resetOnNextDelta) {
        for(const entry of $a('.undoEntry', this.moduleDOM))
          entry.remove();
        this.lastRenderedIndex = -1;
        this.resetOnNextDelta = false;
        this.latestEntryDOM = null;
      }
      this.renderModule(this.moduleDOM);
    }
  }

  onEntryClick(index, dom) {
    this.inUndoMode = true;
    for(let i=this.activeIndex; i>index; --i)
      sendRawDelta({s:this.protocol[i].undoDelta});
    for(let i=this.activeIndex+1; i<=index; ++i)
      sendRawDelta(this.protocol[i].delta);
    this.setActiveIndex(index, dom);
    this.inUndoMode = false;

    setUndoProtocol(this.protocol.slice(0, index+1));
    this.resetOnNextDelta = true;

    setSelection([...selectedWidgets].filter(w=>topSurface.widgets.has(w.id)));
  }

  renderModule(target) {
    if(this.lastRenderedIndex == -2) {
      this.addHeader('History');
      const hintDiv = hint('This lists all the changes that were done to this room until you loaded the page.<br><br>You can click on any row to return the room to the state after the described action.<br><br>You can afterwards return to a future state by clicking that one but as soon as you make new changes after returning to a state in the past, you can no longer restore anything from the now parallel timeline.');
      this.moduleDOM.append(hintDiv);
      this.lastRenderedIndex = -1;
    }

    this.protocol = [...getUndoProtocol()];

    if(this.latestEntryDOM) {
      const d = this.protocol[this.lastRenderedIndex].delta;
      this.latestEntryDOM.innerText = `${this.lastRenderedIndex+1} - ${d.c || 'unknown'} (${Object.keys(d.s).length} widget${Object.keys(d.s).length == 1 ? '' : 's'} changed)`;
    }

    for(let i=this.lastRenderedIndex+1; i<this.protocol.length; ++i) {
      const div = document.createElement('div');
      const affectedWidgets = Object.keys(this.protocol[i].delta.s);
      div.innerText = `${i+1} - ${this.protocol[i].delta.c || 'unknown'} (${affectedWidgets.length} widget${affectedWidgets.length == 1 ? '' : 's'} changed)`;
      div.onclick = _=>this.onEntryClick(i, div);
      div.className = 'undoEntry';
      this.moduleDOM.insertBefore(div, $('.undoEntry', this.moduleDOM));
      this.latestEntryDOM = div;

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
