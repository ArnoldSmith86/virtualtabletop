class SpacingDragButton extends DragButton {
  constructor() {
    super('format_line_spacing', 'Drag to adjust spacing between selected widgets.');
  }

  async dragStart() {
    const minX = Math.min(...selectedWidgets.map(w=>w.domElement.getBoundingClientRect().left));
    const minY = Math.min(...selectedWidgets.map(w=>w.domElement.getBoundingClientRect().top ));
    const maxX = Math.max(...selectedWidgets.map(w=>w.domElement.getBoundingClientRect().left));
    const maxY = Math.max(...selectedWidgets.map(w=>w.domElement.getBoundingClientRect().top ));
    let i = 0;
    if(minX == maxX && minY == minY)
      this.dragStartOffsets = selectedWidgets.map(w=>[ w, w.get('x'), w.get('y'), i/(selectedWidgets.length-1), i++/(selectedWidgets.length-1) ]);
    else if(minX == maxX)
      this.dragStartOffsets = selectedWidgets.sort((a,b)=>a.domElement.getBoundingClientRect().top-b.domElement.getBoundingClientRect().top).map(w=>[ w, w.get('x'), w.get('y'), i++/(selectedWidgets.length-1), (w.domElement.getBoundingClientRect().top - minY)/(maxY - minY) ]);
    else if(minY == maxY)
      this.dragStartOffsets = selectedWidgets.sort((a,b)=>a.domElement.getBoundingClientRect().left-b.domElement.getBoundingClientRect().left).map(w=>[ w, w.get('x'), w.get('y'), (w.domElement.getBoundingClientRect().left - minX)/(maxX - minX), i++/(selectedWidgets.length-1) ]);
    else
      this.dragStartOffsets = selectedWidgets.map(w=>[ w, w.get('x'), w.get('y'), (w.domElement.getBoundingClientRect().left - minX)/(maxX - minX), (w.domElement.getBoundingClientRect().top - minY)/(maxY - minY) ]);
  }

  async dragMove(dx, dy, dxViewport, dyViewport) {
    for(const [ widget, startX, startY, offsetX, offsetY ] of this.dragStartOffsets) {
      if(widget.get('movableInEdit')) {
        await widget.set('x', Math.floor(startX + offsetX*dx));
        await widget.set('y', Math.floor(startY + offsetY*dy));
      }
    }
  }
}
