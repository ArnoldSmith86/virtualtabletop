class SaveButton extends ToolbarButtonWithContent {
  constructor() {
    super('save', 'Save', 'Save the game.');
  }

  async button_saveActiveVariant(updateProgress) {
    await sleep(1000);
    updateProgress('Step 1');
    await sleep(1000);
    updateProgress('Step 2');
    await sleep(1000);
  }

  onMetaReceived(data) {
    this.activeState = data.meta.activeState;
    $('[icon=save]', this.domContentElement).disabled = !data.meta.activeState;
    $('[icon=add]',  this.domContentElement).disabled = !data.meta.activeState;
  }

  renderContent(target) {
    div(target, 'saveContent', `
      <button icon=save>Save to active variant</button>
      <button icon=add>Save as new variant</button>
      <button icon=casino>Save as new game</button>
      <button icon=download>Quick Download</button>
      <button icon=support>Quick save</button>
      <div><input type=checkbox id=quickSaveCheckbox> <label for=quickSaveCheckbox>Auto-save every minute</label></div>
    `);

    progressButton($('[icon=save]', target), async updateProgress=>await this.button_saveActiveVariant(updateProgress));
  }
}
