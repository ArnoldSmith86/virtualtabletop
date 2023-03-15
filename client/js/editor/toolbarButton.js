class ToolbarButton {
  constructor(icon, tooltip, hotkey) {
    this.icon = icon;
    this.tooltip = tooltip;
    this.hotkey = hotkey;
  }

  click() {
  }

  onKeyDown(e) {
    if(e.key == this.hotkey)
      this.click();
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
    this.domElement.onclick = e=>this.click(e);

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
    this.active = !this.active;
    this.domElement.classList.toggle('active');
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
}

class ToolbarDivider extends ToolbarButton {
  render(target) {
    this.domElement = document.createElement('div');
    this.domElement.className = 'divider';
    target.append(this.domElement);
  }
}
