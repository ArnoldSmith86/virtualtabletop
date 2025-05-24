class DragButton extends ToolbarButton {
  async dragStart() {
  }

  async dragMove(dx, dy, dxViewport, dyViewport) {
  }

  async dragEnd() {
  }

  async mousedown(name, e) {
    $('body').classList.add('dragToolbarDragging');

    this.mousedownEvent = eventCoords(name, e);
    this.mousedownRect = this.domElement.parentElement.getBoundingClientRect();
    draggingDragButton = this;

    batchStart();
    setDeltaCause(`${getPlayerDetails().playerName} used "${this.name}" in editor`);
    this.setFeedback(await this.dragStart());
    batchEnd();
  }

  async mousemove(name, e) {
    const coords = eventCoords(name, e);

    const dx = coords.clientX - this.mousedownEvent.clientX;
    const dy = coords.clientY - this.mousedownEvent.clientY;

    batchStart();
    setDeltaCause(`${getPlayerDetails().playerName} used "${this.name}" in editor`);
    this.setFeedback(await this.dragMove(dx / getScale(), dy / getScale(), dx, dy));
    batchEnd();

    // Update toolbar position based on mouse movement
    this.domElement.parentElement.style.right = (window.innerWidth - this.mousedownRect.right - dx) + 'px';
    this.domElement.parentElement.style.top = (this.mousedownRect.top + dy) + 'px';

    // Get available area and dimensions
    const available = getAvailableRoomRectangle();
    const toolbarRect = this.domElement.parentElement.getBoundingClientRect();
    const feedbackRect = $('#editorDragToolbarFeedback').getBoundingClientRect();

    // Calculate bottom boundary, considering feedback height if displayed
    const maxBottom = available.bottom - feedbackRect.height;

    // Constrain top position within available area
    const newTop = Math.max(available.top, Math.min(maxBottom - toolbarRect.height - 1, toolbarRect.top));
    this.domElement.parentElement.style.top = newTop + 'px';

    // Constrain right position to ensure left edge is within bounds
    const maxRight = available.right;
    const minRight = available.left + toolbarRect.width;

    const newRight = Math.max(window.innerWidth - maxRight, Math.min(window.innerWidth - minRight, parseFloat(this.domElement.parentElement.style.right)));
    this.domElement.parentElement.style.right = newRight + 'px';
  }

  async mouseup(name, e) {
    $('body').classList.remove('dragToolbarDragging');

    draggingDragButton = null;

    batchStart();
    setDeltaCause(`${getPlayerDetails().playerName} used "${this.name}" in editor`);
    await this.dragEnd();
    batchEnd();
  }

  render(target) {
    super.render(target);

    this.domElement.onmousedown  = e=>this.mousedown('mousedown', e);
    this.domElement.ontouchstart = e=>this.mousedown('touchstart', e);
  }

  setFeedback(html) {
    $('#editorDragToolbarFeedback').innerHTML = html;
    $('#editorDragToolbarFeedback').classList.toggle('active', html || false);
  }
}
