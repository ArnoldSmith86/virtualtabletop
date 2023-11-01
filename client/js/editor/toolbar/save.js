class SaveButton extends ToolbarButtonWithContent {
  constructor() {
    super('save', 'Save', 'Save the game.');
    this.timer = setInterval(_=>this.timer_tick(), 300000);
  }

  async button_saveCurrentState(updateProgress, mode) {
    if((await (await fetch(`saveCurrentState/${roomID}/${mode}`)).text()) != 'OK')
      throw new Error('Saving failed.');
  }

  onMetaReceived(data) {
    this.activeState = data.meta.activeState;
    for(const button of $a('.onlyIfActive', this.domContentElement))
      button.disabled = !data.meta.activeState;
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
  }

  timer_tick() {
    if($('#quickSaveCheckbox').checked)
      $('#quickSaveButton').click();
  }
}
