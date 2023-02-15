export class ToolbarButton {
  constructor(icon, tooltip) {
    this.icon = icon;
    this.tooltip = tooltip;
  }

  click() {
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
