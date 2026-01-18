class ResizeDragButton extends DragButton {
  constructor(keepAspectRatio = false) {
    if(keepAspectRatio) {
      super('aspect_ratio', 'Resize (Keep Aspect Ratio)', 'Drag to resize the selected widgets. Aspect ratio is kept.');
    } else {
      super('fit_screen', 'Resize', 'Drag to resize the selected widgets.');
    }
    this.keepAspectRatio = keepAspectRatio;
  }

  async dragStart() {
    this.dragStartCoords = selectedWidgets.map(w=>[ w, w.get('x'), w.get('y'), w.get('width'), w.get('height') ]);
  }

  async dragMove(dx, dy, dxViewport, dyViewport) {
    for(const [ widget, startX, startY, startWidth, startHeight ] of this.dragStartCoords) {
      let resizeDx = dx;
      let resizeDy = dy;
      const keepAspectRatio = this.keepAspectRatio || isResizeLocked();
      if(keepAspectRatio) {
        if(resizeDx>resizeDy) {
          resizeDy = resizeDx * startHeight / startWidth;
        } else {
          resizeDx = resizeDy * startWidth / startHeight;
        }
      }
      if(Math.floor(startWidth + resizeDx) < 0) {
        await widget.set('x',      startX+Math.floor(startWidth  + resizeDx));
        await widget.set('width',        -Math.floor(startWidth  + resizeDx));
      } else {
        await widget.set('x',      startX                             );
        await widget.set('width',         Math.floor(startWidth  + resizeDx));
      }
      if(Math.floor(startHeight + resizeDy) < 0) {
        await widget.set('y',      startY+Math.floor(startHeight + resizeDy));
        await widget.set('height',       -Math.floor(startHeight + resizeDy));
      } else {
        await widget.set('y',      startY                             );
        await widget.set('height',        Math.floor(startHeight + resizeDy));
      }
    }

    const minWidth  = Math.min(...selectedWidgets.map(w=>w.get('width')));
    const minHeight = Math.min(...selectedWidgets.map(w=>w.get('height')));

    const maxWidth  = Math.max(...selectedWidgets.map(w=>w.get('width')));
    const maxHeight = Math.max(...selectedWidgets.map(w=>w.get('height')));

    return `
      Width change: <i>${dx>0 ? '+' : ''}${Math.floor(dx)}</i><br>
      Height change: <i>${dy>0 ? '+' : ''}${Math.floor(dy)}</i><br><br>

      Min Width: <i>${minWidth}</i><br>
      Max Width: <i>${maxWidth}</i><br>
      Min Height: <i>${minHeight}</i><br>
      Max Height: <i>${maxHeight}</i>
    `;
  }
}

function isResizeLocked() {
  const button = $('#editorDragToolbarSettings .dragToolbarResizeType');
  return button && button.getAttribute('icon') == 'lock';
}
