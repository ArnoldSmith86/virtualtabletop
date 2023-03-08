class RotateDragButton extends DragButton {
  constructor() {
    super('settings_backup_restore', 'Rotate the selected widgets.');
  }

  dragStart() {
    this.dragStartRotations = selectedWidgets.map(w=>[ w, w.get('rotation') ]);
  }

  async dragMove(dx, dy, dxViewport, dyViewport) {
    for(const [ widget, startRotation ] of this.dragStartRotations)
      if(widget.get('movableInEdit'))
        await widget.set('rotation', Math.floor(startRotation + (dx+dy)/2));
  }
}
