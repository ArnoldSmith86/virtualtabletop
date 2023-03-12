class RotateDragButton extends DragButton {
  constructor() {
    super('settings_backup_restore', 'Drag to rotate the selected widgets.');
  }

  async dragStart() {
    this.dragStartRotations = selectedWidgets.map(w=>[ w, w.get('rotation') ]);
  }

  async dragMove(dx, dy, dxViewport, dyViewport) {
    for(const [ widget, startRotation ] of this.dragStartRotations)
      await widget.set('rotation', Math.floor(startRotation + (dx+dy)/2));

    const min = Math.min(...selectedWidgets.map(w=>w.get('rotation')));
    const max = Math.max(...selectedWidgets.map(w=>w.get('rotation')));

    return `
      Rotation change: <i>${dx+dy>0 ? '+' : ''}${Math.floor((dx+dy)/2)}°</i><br><br>

      Min rotation: <i>${min}°</i><br>
      Max rotation: <i>${max}°</i>
    `;
  }
}
