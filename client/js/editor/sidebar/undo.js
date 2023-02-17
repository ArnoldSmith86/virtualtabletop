class UndoModule extends SidebarModule {
  constructor() {
    super('undo', 'Undo', 'Undo changes from editing or playing.');
    this.lastRenderedIndex = -1;
  }

  onClose() {
    this.lastRenderedIndex = -1;
  }

  onDeltaReceivedWhileActive(delta) {
    if(!this.inUndoMode) {
      if(this.resetOnNextDelta) {
        this.moduleDOM.innerHTML = '';
        this.lastRenderedIndex = -1;
        this.resetOnNextDelta = false;
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
  }

  renderModule(target) {
    this.protocol = [...getUndoProtocol()];

    for(let i=this.lastRenderedIndex+1; i<this.protocol.length; ++i) {
      const div = document.createElement('div');
      const affectedWidgets = Object.keys(this.protocol[i].delta.s);
      div.innerText = `${i} - ` + (affectedWidgets.length > 5 ? `${affectedWidgets.length} widgets changed` : affectedWidgets.join(', '));
      div.onclick = _=>this.onEntryClick(i, div);
      div.style.padding = '2px';
      div.style.border = '2px solid black';
      this.moduleDOM.insertBefore(div, this.moduleDOM.firstChild);

      if(i == this.protocol.length-1)
        this.setActiveIndex(i, div);
    }

    this.lastRenderedIndex = this.protocol.length - 1;
  }

  setActiveIndex(index, dom) {
    if(this.activeDOM)
      this.activeDOM.style.background = 'white';
    this.activeDOM = dom;
    this.activeDOM.style.background = 'green';
    this.activeIndex = index;
  }
}
