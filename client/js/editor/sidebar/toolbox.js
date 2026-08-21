class ToolboxModule extends SidebarModule {
  constructor() {
    super('home_repair_service', 'Toolbox', 'Miscellaneous tools that don\'t have a home yet.');
  }

  async button_circleAlign() {
    // Check if there are enough selected widgets to form a circle
    if (selectedWidgets.length < 3) {
      alert('Please select at least 3 widgets to align in a circle.');
      return;
    }

    // Calculate the center of the circle
    const center_x = selectedWidgets[0].get('x') + selectedWidgets[0].get('width') / 2;
    const center_y = selectedWidgets[0].get('y') + selectedWidgets[0].get('height') / 2;

    // Calculate the angle step between each widget
    const angle_step = (2 * Math.PI) / selectedWidgets.length;

    // Calculate the radius of the circle
    const radius = $('#circleRadius').value;
    const awayFromCenter = $('#rotateWidgets').checked;

    // Place the widgets in a circle
    batchStart();
    setDeltaCause(`${getPlayerDetails().playerName} aligned selected widgets in a circle in editor`);
    let index = 0;
    for (const widget of selectedWidgets) {
      const angle = angle_step * index;
      const x = Math.floor(center_x + radius * Math.cos(angle)) - widget.get('width') / 2;
      const y = Math.floor(center_y + radius * Math.sin(angle)) - widget.get('height') / 2;
      await widget.set('x', x);
      await widget.set('y', y);
      if(awayFromCenter)
        await widget.set('rotation', (angle + Math.PI) * 180 / Math.PI - 90);
      index++;
    }
    batchEnd();
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
    localStorage.setItem('widgetBuffer', JSON.stringify({ legacyModes: currentLegacyModes(), widgets: widgetBuffer }));
    this.renderWidgetBuffer();
  }

  async button_loadWidgetsFromBuffer() {
    const { widgets: widgetBuffer, legacyModes } = this.bufferContents();
    if (!await confirmLegacyModeDifferences(legacyModeDifferences(legacyModes, widgetBuffer)))
      return;
    const duplicates = widgetBuffer.filter(state=>widgets.has(state.id)).map(state=>state.id);
    if (duplicates.length) {
      // the dialog takes plain text, where a leading indent is dropped but a bullet survives
      const duplicatesList = duplicates.map(id=>`• ${id}`).join('\n');
      const overwriteAll = await confirmInEditor('Widget IDs already exist', `These widget IDs are already in this game:\n\n${duplicatesList}\n\nAdding the buffer replaces those widgets.`, 'Overwrite', 'Cancel', 'content_paste', 'close');
      if (!overwriteAll) return;
    }
    batchStart();
    setDeltaCause(`${getPlayerDetails().playerName} loaded widgets from the widget buffer in editor`);
    for(const state of widgetBuffer) {
      if(state.parent && !widgetBuffer.filter(w=>w.id==state.parent).length && !widgets.has(state.parent)) {
        delete state.parent;
        delete state.x;
        delete state.y;
      }
      if(state.type == 'card' && !widgetBuffer.filter(w=>w.id==state.deck).length && !widgets.has(state.deck))
        alert(`Widget ${state.id} references a deck that is not in the buffer and is not already in the room. It will not be loaded.`);
      else
        await addWidgetLocal(state);
    }
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

  // The buffer keeps the widget states and the legacy modes of the game they were taken from in
  // one stored value, so the two can never end up describing different games. A buffer written
  // before the modes were recorded is a bare array and simply has no snapshot.
  bufferContents() {
    let stored = null;
    try {
      stored = JSON.parse(localStorage.getItem('widgetBuffer'));
    } catch(e) {}
    if(Array.isArray(stored))
      return { widgets: stored, legacyModes: null };
    if(stored && Array.isArray(stored.widgets))
      return { widgets: stored.widgets, legacyModes: stored.legacyModes || null };
    return { widgets: [], legacyModes: null };
  }

  onMetaReceivedWhileActive(meta) {
    this.renderWidgetBuffer();
  }

  onStateReceivedWhileActive(state) {
    this.renderWidgetBuffer();
  }

  renderModule(target) {
    this.addHeader('Toolbox');
    this.widgetBuffer(target);
    this.searchAndReplace(target);
    this.cicleAlign(target);
  }

  renderWidgetBuffer() {
    const { widgets: widgetBuffer, legacyModes } = this.bufferContents();
    let contents = '';
    if(widgetBuffer.length) {
      let list = '';
      for(const state of widgetBuffer)
        list += `<li>${html(state.id)}</li>`;
      contents = `<p class=widgetBufferLabel>In the buffer (${widgetBuffer.length} widget${widgetBuffer.length == 1 ? '' : 's'}):</p><ul>${list}</ul>`;
    }
    contents += legacyModeWarningHTML(legacyModeDifferences(legacyModes, widgetBuffer));
    // every state the room receives re-renders the module, so an unchanged buffer keeps the DOM
    // it has instead of losing the reader's text selection in it
    if(contents == this.renderedWidgetBuffer)
      return;
    this.renderedWidgetBuffer = contents;
    this.currentContents.innerHTML = contents;
  }

  cicleAlign(target) {
    this.addSubHeader('Circle Align');
    const d = div(target, '', `
      <p>Here you can align the selected widgets in a circle with a specified radius.</p>
      <label for="circleRadius">Radius:</label>
      <input type="number" id="circleRadius" placeholder="Enter radius"><br><br>
      <input type="checkbox" id="rotateWidgets"><label for="rotateWidgets"> Rotate widgets away from center</label><br><br>
      <div class="buttonBar">
        <button icon="circle">Circle align</button>
      </div>
    `);
    $('button', d).onclick = e=>this.button_circleAlign();
  }

  searchAndReplace(target) {
    this.addSubHeader('Search and Replace');
    const d = div(target, '', `
      <p>Here you can search for text in all widgets of the current room state and replace it by something else.</p>
      <input id=globalSearchText placeholder="Search text"><br>
      <input id=globalReplaceText placeholder="Replace text"><br><br>
      <div>
        <input type=checkbox id=globalReplaceCase checked><label for=globalReplaceCase> Match case</label><br>
        <input type=checkbox id=globalReplaceWhole checked><label for=globalReplaceWhole> Match whole word</label><br>
        <input type=checkbox id=globalReplaceRegex><label for=globalReplaceRegex> Regular expression (<code>$1</code> references first capture group)</label><br><br>
      </div>
      <div class=buttonBar>
        <button icon=search>Search and replace</button>
      </div>
    `);
    $('button', d).onclick = e=>this.button_searchAndReplace();
  }

  widgetBuffer(target) {
    this.addSubHeader('Widget buffer');
    div(target, '', `
      <p>Here you can save the currently selected widgets (and their children) to a buffer so you can paste them later into a different game or room.</p>
    `);

    // the buffer contents and the legacy mode advisory sit above the buttons: they qualify what
    // pressing them does, and below them they fall off a short viewport unseen
    this.currentContents = div(target);
    this.renderedWidgetBuffer = null;
    this.renderWidgetBuffer();

    div(target, 'buttonBar', `
      <button icon=content_copy id=saveWidgetsToBuffer>Save widgets to buffer</button>
      <button icon=content_paste id=loadWidgetsFromBuffer>Put widgets into the game</button>
    `);
    $('#saveWidgetsToBuffer').onclick = e=>this.button_saveWidgetsToBuffer();
    $('#loadWidgetsFromBuffer').onclick = e=>this.button_loadWidgetsFromBuffer();
  }
}
