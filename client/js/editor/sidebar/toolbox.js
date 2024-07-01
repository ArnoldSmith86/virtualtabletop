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
    for(const state of widgetBuffer)
      await addWidgetLocal(state);
    batchEnd();
  }

  async button_searchAndReplace() {
    const globalSearchText = $('#globalSearchText').value;
    const globalReplaceText = $('#globalReplaceText').value;
    const globalReplaceRegex = $('#globalReplaceRegex').checked;
    const globalReplaceCase = $('#globalReplaceCase').checked;
    const globalReplaceWhole = $('#globalReplaceWhole').checked;

    let regex = globalSearchText;
    if(!globalReplaceRegex) {
      regex = regexEscape(regex);
      if(globalReplaceWhole)
        regex = `\\b${regex}\\b`;
    }
    const flags = globalReplaceCase ? 'g' : 'gi';

    try {
      regex = new RegExp(regex, flags);
    } catch(e) {
      alert('Invalid regular expression');
      return;
    }

    batchStart();
    setDeltaCause(`${getPlayerDetails().playerName} searched and replaced text in widgets in editor`);
    for(const widget of [...widgets.values()]) {
      const oldState = JSON.stringify(widget.state);
      let newState = oldState.replace(regex, globalReplaceText);
      try {
        newState = JSON.stringify(JSON.parse(newState));
      } catch(e) {
        alert('Replacement resulted in invalid JSON. This feauture is working on the JSON level, so make sure the replacement is valid JSON.');
        batchEnd();
        return;
      }
      await updateWidget(newState, oldState)
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

    this.addSubHeader('Search and Replace');
    div(target, '', `
      <p>Here you can search for text in all widgets of the current room state and replace it by something else.</p>
      <input id=globalSearchText placeholder="Search text"><br>
      <input id=globalReplaceText placeholder="Replace text"><br><br>
      <div>
        <input type=checkbox id=globalReplaceCase><label for=globalReplaceCase> Match case</label><br>
        <input type=checkbox id=globalReplaceWhole><label for=globalReplaceWhole> Match whole word</label><br>
        <input type=checkbox id=globalReplaceRegex><label for=globalReplaceRegex> Regular expression (<code>$1</code> references first capture group)</label><br><br>
      </div>
      <div class=buttonBar>
        <button icon=search id=searchAndReplace>Search and replace</button>
      </div>
    `);
    $('#searchAndReplace').onclick = e=>this.button_searchAndReplace();
  }
}
