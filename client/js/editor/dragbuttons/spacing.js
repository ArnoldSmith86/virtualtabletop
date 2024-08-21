class SpacingDragButton extends DragButton {
  constructor() {
    super('format_line_spacing', 'Spacing', 'Drag to adjust spacing between selected widgets.');
    this.setMinimumSelection(2);
  }

  async dragStart() {
    const minX = Math.min(...selectedWidgets.map(w=>w.domElement.getBoundingClientRect().left));
    const minY = Math.min(...selectedWidgets.map(w=>w.domElement.getBoundingClientRect().top ));
    const maxX = Math.max(...selectedWidgets.map(w=>w.domElement.getBoundingClientRect().left));
    const maxY = Math.max(...selectedWidgets.map(w=>w.domElement.getBoundingClientRect().top ));
    let i = 0;
    if(minX == maxX && minY == maxY)
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
      await widget.set('x', Math.floor(startX + offsetX*dx));
      await widget.set('y', Math.floor(startY + offsetY*dy));
    }

    let minGapX = 1600;
    let maxGapX = -1600;
    let minGapY = 1000;
    let maxGapY = -1000;
    for(const widget of selectedWidgets) {
      const rect = widget.domElement.getBoundingClientRect();
      const biggerX = selectedWidgets.map(w=>w.domElement.getBoundingClientRect().left).filter(l=>l>rect.left).sort();
      if(biggerX.length) {
        const gap = (biggerX[0] - rect.right)/getScale();
        minGapX = Math.min(minGapX, gap);
        maxGapX = Math.max(maxGapX, gap);
      }
      const biggerY = selectedWidgets.map(w=>w.domElement.getBoundingClientRect().top).filter(t=>t>rect.top).sort();
      if(biggerY.length) {
        const gap = (biggerY[0] - rect.bottom)/getScale();
        minGapY = Math.min(minGapY, gap);
        maxGapY = Math.max(maxGapY, gap);
      }
    }

    return `
      Total width:  <i>${dx>0 ? '+' : ''}${Math.floor(dx)}</i><br>
      Total height: <i>${dy>0 ? '+' : ''}${Math.floor(dy)}</i><br><br>

      Min gap width: <i>${Math.round(minGapX)}</i><br>
      Max gap width: <i>${Math.round(maxGapX)}</i><br>
      Min gap height: <i>${Math.round(minGapY)}</i><br>
      Max gap height: <i>${Math.round(maxGapY)}</i>
    `;
  }
}
