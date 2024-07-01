class ToolboxModule extends SidebarModule {
  constructor() {
    super('home_repair_service', 'Toolbox', 'Miscellaneous tools that don\'t have a home yet.');
  }

  button_saveWidgetsToBuffer() {
    function addRecursively(widget) {
      widgetBuffer.push(widget.state);
      for(const w of widgetFilter(w=>w.get('parent')==widget.id))
        addRecursively(w);
    }
    const widgetBuffer = [];
    for(const widget of selectedWidgets)
      addRecursively(widget);
    localStorage.setItem('widgetBuffer', JSON.stringify(widgetBuffer));
    this.renderWidgetBuffer();
  }

  async button_loadWidgetsFromBuffer() {
    const widgetBuffer = JSON.parse(localStorage.getItem('widgetBuffer') || '[]');
    batchStart();
    setDeltaCause(`${getPlayerDetails().playerName} loaded widgets from the widget buffer in editor`);
    for(const state of widgetBuffer) {
      if(!widgetBuffer.filter(w=>w.id==state.parent).length && !widgets.has(state.parent))
        delete state.parent;
      if(!widgetBuffer.filter(w=>w.id==state.deck).length && !widgets.has(state.deck))
        alert(`Widget ${state.id} references a deck that is not in the buffer and is not already in the room. It will not be loaded.`);
      else
        await addWidgetLocal(state);
    }
    batchEnd();
  }

  renderModule(target) {
    this.addHeader('Toolbox');
    this.widgetBuffer(target);
  }

  renderWidgetBuffer() {
    const widgetBuffer = JSON.parse(localStorage.getItem('widgetBuffer') || '[]');
    let list = '';
    for(const state of widgetBuffer)
      list += `<li>${html(state.id)}</li>`;
    this.currentContents.innerHTML = `<ul>${list}</ul>`;
  }

  widgetBuffer(target) {
    this.addSubHeader('Widget buffer');
    div(target, 'buttonBar', `
      <p>Here you can save the currently selected widgets (and their children) to a buffer so you can paste them later into a different game or room.</p>
      <button icon=content_copy id=saveWidgetsToBuffer>Save widgets to buffer</button>
      <button icon=content_paste id=loadWidgetsFromBuffer>Put widgets into the game</button>
    `);
    $('#saveWidgetsToBuffer').onclick = e=>this.button_saveWidgetsToBuffer();
    $('#loadWidgetsFromBuffer').onclick = e=>this.button_loadWidgetsFromBuffer();

    const widgetBuffer = JSON.parse(localStorage.getItem('widgetBuffer') || '[]');
    let list = '';
    for(const state of widgetBuffer)
      list += `<li>${html(state.id)}</li>`;
    this.currentContents = div(target);
    this.renderWidgetBuffer();
  }
}
