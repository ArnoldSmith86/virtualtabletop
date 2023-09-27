class MoveDragButton extends DragButton {
  constructor() {
    super('control_camera', 'Move', 'Drag to move the selected widgets.');
  }

  async dragStart() {
    this.dragStartCoords = selectedWidgets.map(w=>[ w, w.get('x'), w.get('y') ]);
  }

  async dragMove(dx, dy, dxViewport, dyViewport) {
    for(const [ widget, startX, startY ] of this.dragStartCoords) {
      await widget.set('x', Math.floor(startX + dx));
      await widget.set('y', Math.floor(startY + dy));
    }

    const minX = Math.min(...selectedWidgets.map(w=>w.get('x')));
    const minY = Math.min(...selectedWidgets.map(w=>w.get('y')));

    const maxX = Math.max(...selectedWidgets.map(w=>w.get('x')+w.get('width')));
    const maxY = Math.max(...selectedWidgets.map(w=>w.get('y')+w.get('height')));

    return `
      X change: <i>${dx>0 ? '+' : ''}${Math.floor(dx)}</i><br>
      Y change: <i>${dy>0 ? '+' : ''}${Math.floor(dy)}</i><br><br>

      Min X: <i>${minX}</i><br>
      Max X: <i>${1600 - maxX}</i> from right<br>
      Min Y: <i>${minY}</i><br>
      Max Y: <i>${1000 - maxY}</i> from bottom
    `;
  }
}
