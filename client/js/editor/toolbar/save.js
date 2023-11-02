class SaveButton extends ToolbarButtonWithContent {
  constructor() {
    super('save', 'Save', 'Save the game.');
    this.timer = setInterval(_=>this.timer_tick(), 300000);
  }

  async button_saveCurrentState(updateProgress, mode) {
    if((await (await fetch(`saveCurrentState/${roomID}/${mode}`)).text()) != 'OK')
      throw new Error('Saving failed.');
  }

  async button_quickDownload(updateProgress, mode) {
    loadJSZip();
    updateProgress('Fetching state...');
    const state = await (await fetch(`state/${roomID}`)).json();
    state._meta = {
      version: this.currentVersion,
      info: this.currentMetadata
    }
    updateProgress('Loading JSZip...');
    await waitForJSZip();
    updateProgress('Building file...');
    const zip = new JSZip();
    zip.file('0.json', JSON.stringify(state));
    updateProgress('Saving...');
    triggerDownload(URL.createObjectURL(await zip.generateAsync({type:"blob"})), `QuickDownload without assets ${new Date().toISOString().substr(0,16).replace(/T/, ' ').replace(/:/, '')} - ${this.currentMetadata.name}.vtt`);
  }

  onMetaReceived(data) {
    this.activeState = data.meta.activeState;
    this.currentMetadata = this.activeState ? Object.assign({}, data.meta.states[this.activeState.stateID], data.meta.states[this.activeState.stateID].variants[this.activeState.variantID]) : { name: 'Unnamed' };
    this.currentVersion = data.meta.version;
    for(const button of $a('.onlyIfActive', this.domContentElement))
      button.disabled = !data.meta.activeState || data.meta.activeState.stateID.match(/^PL:/) && !config.allowPublicLibraryEdits;
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
