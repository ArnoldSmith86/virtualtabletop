class SaveButton extends ToolbarButtonWithContent {
  constructor() {
    super('save', 'Save', 'Save the game.');
    this.timer = setInterval(_=>this.timer_tick(), 300000);
  }

  async button_saveCurrentState(updateProgress, mode) {
    let name = mode == 'addState' ? prompt('Enter a name', this.activeState ? this.currentMetadata.name : 'Unnamed') : '';
    if(name === null)
      throw new Error('Canceled.');
    if(!name)
      name = `New Game ${new Date().toISOString().substr(11,5)}`;
    if((await (await fetch(`saveCurrentState/${roomID}/${mode}/${encodeURIComponent(name)}`)).text()) != 'OK')
      throw new Error('Saving failed.');
  }

  async button_quickDownload(updateProgress, mode) {
    loadJSZip();
    updateProgress('Fetching state...');
    const state = await (await fetch(`state/${roomID}`)).json();
    state._meta.info = this.currentMetadata;
    updateProgress('Loading JSZip...');
    await waitForJSZip();
    updateProgress('Building file...');
    const zip = new JSZip();
    zip.file('0.json', JSON.stringify(state));
    updateProgress('Saving...');
    triggerDownload(URL.createObjectURL(await zip.generateAsync({type:"blob"})), `QuickDownload without assets ${new Date().toISOString().substr(0,16).replace(/T/, ' ').replace(/:/, '')} - ${this.currentMetadata.name}.vtt`);
  }

  onEditorClose() {
    this.timer_tick();
  }

  onMetaReceived(data) {
    this.activeState = data.meta.activeState;
    const isValidState = this.activeState && data.meta.states[this.activeState.stateID] && data.meta.states[this.activeState.stateID].variants[this.activeState.variantID];
    this.currentMetadata = isValidState ? Object.assign({}, data.meta.states[this.activeState.stateID], data.meta.states[this.activeState.stateID].variants[this.activeState.variantID]) : { name: 'Unnamed' };
    this.currentVersion = data.meta.version;
    $('[data-mode=addVariant]', this.domContentElement).innerText = isValidState ? `Save as new variant of ${this.currentMetadata.name}` : 'Save as new variant';
    for(const button of $a('.onlyIfActive', this.domContentElement))
      button.disabled = !isValidState || data.meta.activeState.stateID.match(/^PL:/) && !config.allowPublicLibraryEdits;
  }

  renderContent(target) {
    div(target, 'saveContent', `
      <button data-mode=activeVariant icon=save class=onlyIfActive>Save to active variant</button>
      <button data-mode=addVariant icon=add class=onlyIfActive>Save as new variant</button>
      <button data-mode=addState icon=casino>Save as new game</button>
      <button icon=download>Quick Download</button>
      <button data-mode=quickSave icon=support id=quickSaveButton>Quick save</button>
      <div><input type=checkbox id=quickSaveCheckbox> <label for=quickSaveCheckbox>Auto-save every 5 minutes</label></div>
    `);

    for(const button of $a('[data-mode]', target))
      progressButton(button, async updateProgress=>await this.button_saveCurrentState(updateProgress, button.dataset.mode));
    progressButton($('[icon=download]', target), async updateProgress=>await this.button_quickDownload(updateProgress));
  }

  timer_tick() {
    if($('#quickSaveCheckbox').checked)
      $('#quickSaveButton').click();
  }
}
