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
    localStorage.setItem('widgetBuffer', JSON.stringify(widgetBuffer));
    localStorage.setItem('widgetBufferLegacyModes', JSON.stringify(this.currentLegacyModes()));
    this.renderWidgetBuffer();
  }

  async button_loadWidgetsFromBuffer() {
    const widgetBuffer = JSON.parse(localStorage.getItem('widgetBuffer') || '[]');
    const differences = widgetBuffer.length ? this.legacyModeDifferences() : [];
    if (differences.length) {
      const differencesList = differences.map(d=>`  ${d.label}: ${d.inSource ? 'on' : 'off'} in the source game, ${d.inSource ? 'off' : 'on'} here`).join('\n');
      const loadAnyway = confirm(`The widgets in the buffer were saved in a game with different legacy modes:\n\n${differencesList}\n\nLegacy modes change how widgets behave, so the widgets can work differently in this game.\n\nPress OK to load them anyway, or Cancel to abort loading.`);
      if (!loadAnyway) return;
    }
    const duplicates = widgetBuffer.filter(state=>widgets.has(state.id)).map(state=>state.id);
    if (duplicates.length) {
      const duplicatesList = duplicates.join(', ');
      const overwriteAll = confirm(`The following widget IDs already exist: ${duplicatesList}\n\nPress OK to overwrite these widgets, or Cancel to abort loading.`);
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

  // Legacy modes decide what widget JSON means, so the modes of the game a buffer was filled
  // in are remembered next to it: the game it is pasted into can run with different ones.
  currentLegacyModes() {
    const modes = {};
    for(const name in LEGACY_MODES)
      modes[name] = !!legacyMode(name);
    return modes;
  }

  // The modes the source game and the current game disagree on. A buffer that was saved before
  // the modes were recorded has none - unknown is not the same as different.
  legacyModeDifferences() {
    let sourceModes = null;
    try {
      sourceModes = JSON.parse(localStorage.getItem('widgetBufferLegacyModes'));
    } catch(e) {
    }
    if(!sourceModes)
      return [];
    return Object.keys(LEGACY_MODES).filter(name=>!!sourceModes[name] != !!legacyMode(name)).map(name=>({
      label: LEGACY_MODES[name].label,
      inSource: !!sourceModes[name]
    }));
  }

  legacyModeWarningHTML(differences) {
    if(!differences.length)
      return '';
    let list = '';
    for(const difference of differences)
      list += `<li>${html(difference.label)}: <b>${difference.inSource ? 'on' : 'off'}</b> in the source game, <b>${difference.inSource ? 'off' : 'on'}</b> here</li>`;
    return `<div class=widgetBufferWarning>
      <b>These widgets come from a game with different legacy modes:</b>
      <ul>${list}</ul>
      Legacy modes change how widgets behave, so the widgets can work differently in this game.
    </div>`;
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
    const widgetBuffer = JSON.parse(localStorage.getItem('widgetBuffer') || '[]');
    let list = '';
    for(const state of widgetBuffer)
      list += `<li>${html(state.id)}</li>`;
    const differences = widgetBuffer.length ? this.legacyModeDifferences() : [];
    this.currentContents.innerHTML = `<ul>${list}</ul>${this.legacyModeWarningHTML(differences)}`;
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
