class MoveDragButton extends DragButton {
  constructor() {
    super('control_camera', 'Move', 'Drag to move the selected widgets.');
  }

  async dragStart() {
    this.dragStartCoords = selectedWidgets.map(w=>[ w, w.get('x'), w.get('y') ]);
    this.gridArray = null;
    if(getDragToolbarMoveMode() == 'grid_on' && selectedWidgets.length) {
      const gridArray = selectedWidgets[0].get('grid');
      if(Array.isArray(gridArray) && gridArray.length)
        this.gridArray = gridArray;
    }
  }

  async dragMove(dx, dy, dxViewport, dyViewport) {
    if(this.gridArray) {
      for(const [ widget, startX, startY ] of this.dragStartCoords) {
        const snapped = snapToGridCoords(widget, startX + dx, startY + dy, this.gridArray);
        if(snapped) {
          await widget.setPosition(snapped.x, snapped.y, widget.get('z'));
          for(const p in snapped.grid)
            if(gridSnapIgnoredProps.indexOf(p) == -1)
              await widget.set(p, snapped.grid[p]);
        } else {
          await widget.set('x', Math.floor(startX + dx));
          await widget.set('y', Math.floor(startY + dy));
        }
      }
    } else {
      for(const [ widget, startX, startY ] of this.dragStartCoords) {
        await widget.set('x', Math.floor(startX + dx));
        await widget.set('y', Math.floor(startY + dy));
      }
    }

    const minX = Math.min(...selectedWidgets.map(w=>w.get('x')));
    const minY = Math.min(...selectedWidgets.map(w=>w.get('y')));

    const maxX = Math.max(...selectedWidgets.map(w=>w.get('x')+w.get('width')));
    const maxY = Math.max(...selectedWidgets.map(w=>w.get('y')+w.get('height')));

    const formatValue = this.gridArray ? formatGridValue : formatMoveValue;

    return `
      X change: <i>${dx>0 ? '+' : ''}${Math.floor(dx)}</i><br>
      Y change: <i>${dy>0 ? '+' : ''}${Math.floor(dy)}</i><br><br>

      Min X: <i>${formatValue(minX)}</i><br>
      Max X: <i>${formatValue(1600 - maxX)}</i> from right<br>
      Min Y: <i>${formatValue(minY)}</i><br>
      Max Y: <i>${formatValue(1000 - maxY)}</i> from bottom
    `;
  }
}

const gridSnapIgnoredProps = [ 'x', 'y', 'minX', 'minY', 'maxX', 'maxY', 'offsetX', 'offsetY', 'alignX', 'alignY' ];

function getDragToolbarMoveMode() {
  const moveButton = $('#editorDragToolbarSettings .dragToolbarMoveType');
  return moveButton ? moveButton.getAttribute('icon') : 'gesture';
}

function snapToGridCoords(widget, x, y, gridArray) {
  let closest = null;
  let closestDistance = 999999;

  for(const grid of gridArray) {
    if(!grid)
      continue;

    const alignX = (grid.alignX || 0) * widget.get('width');
    const alignY = (grid.alignY || 0) * widget.get('height');

    if(x < (grid.minX || -99999) || x > (grid.maxX || 99999))
      continue;
    if(y < (grid.minY || -99999) || y > (grid.maxY || 99999))
      continue;

    const snapX = x + alignX + grid.x/2 - gridMod(x + alignX + grid.x/2 - (grid.offsetX || 0), grid.x);
    const snapY = y + alignY + grid.y/2 - gridMod(y + alignY + grid.y/2 - (grid.offsetY || 0), grid.y);

    const distance = (snapX - x) ** 2 + (snapY - y) ** 2;
    if(distance < closestDistance) {
      closest = { x: snapX - alignX, y: snapY - alignY, grid };
      closestDistance = distance;
    }
  }

  return closest;
}

function gridMod(a, b) {
  return ((a % b) + b) % b;
}

function formatMoveValue(value) {
  return Math.round(value);
}

function formatGridValue(value) {
  return Math.round(value * 100) / 100;
}
