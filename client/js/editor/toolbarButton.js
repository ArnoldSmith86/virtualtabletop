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

  onEditorOpen() {
  }

  onKeyDown(e) {
    if(e.key == this.hotkey && !this.domElement.disabled)
      this.onClick();
  }

  onSelectionChanged(newSelection, oldSelection) {
    this.setMinimumSelection(this.minimumSelection);
  }

  render(target) {
    const tooltip = document.createElement('span');
    tooltip.innerText = this.tooltip;

    if(this.hotkey)
      tooltip.innerHTML += `<br><br>Hotkey: ${this.hotkey}`;

    this.domElement = document.createElement('button');
    this.domElement.setAttribute('icon', this.icon);
    this.domElement.append(tooltip);
    target.append(this.domElement);
    this.domElement.onclick = e=>this.onClick();

    this.setMinimumSelection(this.minimumSelection);
  }

  setMinimumSelection(count) {
    this.minimumSelection = count;
    if(this.domElement)
      this.domElement.disabled = selectedWidgets.length < count;
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
      this.domElement.classList.add('active');
  }

  setState(state) {
    this.active = state;
    this.domElement.classList.toggle('active', state);
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

class ToolbarDivider extends ToolbarButton {
  render(target) {
    this.domElement = document.createElement('div');
    this.domElement.className = 'divider';
    target.append(this.domElement);
  }
}
