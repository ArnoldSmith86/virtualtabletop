class ToolbarButton {
  constructor(icon, tooltip) {
    this.icon = icon;
    this.tooltip = tooltip;
  }

  click() {
  }

  onSelectionChanged(newSelection, oldSelection) {
  }

  render(target) {
    const tooltip = document.createElement('span');
    tooltip.innerText = this.tooltip;

    this.domElement = document.createElement('button');
    this.domElement.setAttribute('icon', this.icon);
    this.domElement.append(tooltip);
    target.append(this.domElement);
    this.domElement.onclick = e=>this.click(e);
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
}
