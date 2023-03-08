class DragButton extends ToolbarButton {
  async dragStart() {
  }

  async dragMove(dx, dy, dxViewport, dyViewport) {
  }

  async dragEnd() {
  }

  async mousedown(e) {
    this.mousedownEvent = e;
    this.mousedownRect = this.domElement.parentElement.getBoundingClientRect();
    draggingDragButton = this;

    batchStart();
    setDeltaCause(`${getPlayerDetails().playerName} used drag button ${this.icon} in editor`);
    await this.dragStart();
    batchEnd();
  }

  async mousemove(e) {
    const dx = e.clientX - this.mousedownEvent.clientX;
    const dy = e.clientY - this.mousedownEvent.clientY;

    this.domElement.parentElement.style.right = (window.innerWidth-this.mousedownRect.right - dx) + 'px';
    this.domElement.parentElement.style.top   = (                  this.mousedownRect.top   + dy) + 'px';

    batchStart();
    setDeltaCause(`${getPlayerDetails().playerName} used drag button ${this.icon} in editor`);
    await this.dragMove(dx/getScale(), dy/getScale(), dx, dy);
    batchEnd();
  }

  async mouseup(e) {
    this.mousedownEvent = e;
    draggingDragButton = null;

    batchStart();
    setDeltaCause(`${getPlayerDetails().playerName} used drag button ${this.icon} in editor`);
    await this.dragEnd();
    batchEnd();
  }

  render(target) {
    super.render(target);

    this.domElement.onclick = e=>this.click(e);
    this.domElement.onmousedown = e=>this.mousedown(e);
  }
}
