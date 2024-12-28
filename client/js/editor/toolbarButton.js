class ToolbarButton {
  constructor(icon, name, tooltip, hotkey) {
    this.icon = icon;
    this.name = name;
    this.tooltip = tooltip;
    this.hotkey = hotkey;
  }

  async click() {
  }

  async onClick() {
    batchStart();
    setDeltaCause(`${getPlayerDetails().playerName} used "${this.name}" in editor`);
    await this.click();
    batchEnd();
  }

  onEditorClose() {
  }

  onEditorOpen() {
  }

  onKeyDown(e) {
    if(e.key == this.hotkey && !$('button', this.domElement).disabled)
      this.onClick();
  }

  onMetaReceived(data) {
  }

  onSelectionChanged(newSelection, oldSelection) {
    this.setMinimumSelection(this.minimumSelection);
  }

  render(target) {
    this.domElement = div(target, 'editorToolbarButton', `
      <button icon=${this.icon}><span>${this.tooltip}${this.hotkey ? '<br><br>Hotkey: '+this.hotkey : ''}</span>
    `);
    $('button', this.domElement).onclick = e=>this.onClick();

    this.setMinimumSelection(this.minimumSelection);
  }

  setMinimumSelection(count) {
    this.minimumSelection = count;
    if(this.domElement && $('button', this.domElement))
      $('button', this.domElement).disabled = selectedWidgets.length < count;
  }
}

class ToolbarToggleButton extends ToolbarButton {
  click() {
    this.setState(!this.active);
    this.performAction();
  }

  performAction() {
    this.toggle(this.active);
    if(this.active)
      this.activate();
    else
      this.deactivate();
  }

  toggle(state) {
  }

  activate() {
  }

  deactivate() {
  }

  render(target) {
    super.render(target);
    if(this.active)
      $('button', this.domElement).classList.add('active');
  }

  setState(state) {
    this.active = state;
    $('button', this.domElement).classList.toggle('active', state);
  }
}

class PersistentToolbarToggleButton extends ToolbarToggleButton {
  onEditorOpen() {
    super.onEditorOpen();
    this.loadFromLocalStorage();
  }

  setState(state) {
    super.setState(state);
    this.saveToLocalStorage();
  }

  render(target) {
    super.render(target);
    if(this.active)
      this.domElement.classList.add('active');
  }

  loadFromLocalStorage() {
    const editorState = JSON.parse(localStorage.getItem('editorState') || '{"modules":{}}');
    if(editorState.toggleButtons && typeof editorState.toggleButtons[this.name] == 'boolean') {
      this.setState(editorState.toggleButtons[this.name]);
      this.performAction();
    }
  }

  saveToLocalStorage() {
    const editorState = JSON.parse(localStorage.getItem('editorState') || '{"modules":{}}');
    if(!editorState.toggleButtons)
      editorState.toggleButtons = {};
    editorState.toggleButtons[this.name] = this.active;
    localStorage.setItem('editorState', JSON.stringify(editorState));
  }
}

class ToolbarButtonWithContent extends ToolbarToggleButton {
  onDocumentClick(e) {
    if(this.active && !this.domContentElement.contains(e.target) && !this.domElement.contains(e.target))
      this.click();
  }

  render(target) {
    super.render(target);
    this.domContentElement = div(this.domElement, 'editorToolbarButtonContent');
    this.renderContent(this.domContentElement);
    this.domElement.classList.add('editorToolbarContentButton');
    document.addEventListener('click', e=>this.onDocumentClick(e));
  }

  renderContent(target) {
  }

  toggle(state) {
    $('.editorToolbarButtonContent', this.domElement).classList.toggle('active', state);
  }
}

class ToolbarDivider extends ToolbarButton {
  render(target) {
    this.domElement = document.createElement('div');
    this.domElement.className = 'divider';
    target.append(this.domElement);
  }
}
