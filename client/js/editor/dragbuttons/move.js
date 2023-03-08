class MoveDragButton extends DragButton {
  constructor() {
    super('control_camera', 'Move the selected widgets.');
  }

  dragStart() {
    this.dragStartCoords = selectedWidgets.map(w=>[ w, w.get('x'), w.get('y') ]);
  }

  async dragMove(dx, dy, dxViewport, dyViewport) {
    for(const [ widget, startX, startY ] of this.dragStartCoords) {
      if(widget.get('movableInEdit')) {
        await widget.set('x', startX + dx);
        await widget.set('y', startY + dy);
      }
    }
  }
}
