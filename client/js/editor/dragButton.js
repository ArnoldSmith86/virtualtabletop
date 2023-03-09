class DragButton extends ToolbarButton {
  async dragStart() {
  }

  async dragMove(dx, dy, dxViewport, dyViewport) {
  }

  async dragEnd() {
  }

  async mousedown(name, e) {
    this.mousedownEvent = eventCoords(name, e);
    this.mousedownRect = this.domElement.parentElement.getBoundingClientRect();
    draggingDragButton = this;

    batchStart();
    setDeltaCause(`${getPlayerDetails().playerName} used drag button ${this.icon} in editor`);
    await this.dragStart();
    batchEnd();
  }

  async mousemove(name, e) {
    const coords = eventCoords(name, e);

    const dx = coords.clientX - this.mousedownEvent.clientX;
    const dy = coords.clientY - this.mousedownEvent.clientY;

    this.domElement.parentElement.style.right = (window.innerWidth-this.mousedownRect.right - dx) + 'px';
    this.domElement.parentElement.style.top   = (                  this.mousedownRect.top   + dy) + 'px';

    batchStart();
    setDeltaCause(`${getPlayerDetails().playerName} used drag button ${this.icon} in editor`);
    await this.dragMove(dx/getScale(), dy/getScale(), dx, dy);
    batchEnd();
  }

  async mouseup(name, e) {
    draggingDragButton = null;

    batchStart();
    setDeltaCause(`${getPlayerDetails().playerName} used drag button ${this.icon} in editor`);
    await this.dragEnd();
    batchEnd();
  }

  render(target) {
    super.render(target);

    this.domElement.onmousedown  = e=>this.mousedown('mousedown', e);
    this.domElement.ontouchstart = e=>this.mousedown('touchstart', e);
  }
}
