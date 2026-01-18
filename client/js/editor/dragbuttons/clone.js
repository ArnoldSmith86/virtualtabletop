class CloneDragButton extends DragButton {
  constructor() {
    super('content_copy', 'Clone', 'Drag to clone the selected widgets into a grid.');
    this.clones = [];
  }

  createClone(widget, html, x, y) {
    const clone = document.createElement('div');
    clone.innerHTML = html;
    clone.className = widget.domElement.className;
    clone.classList.remove('selectedInEdit');
    clone.style.cssText = widget.domElement.style.cssText;
    const stepX = this.useGridSteps ? this.gridStepX : this.dx/getScale();
    const stepY = this.useGridSteps ? this.gridStepY : this.dy/getScale();
    let targetX = widget.get('x') + stepX * x;
    let targetY = widget.get('y') + stepY * y;
    if(this.useGridSteps && this.hexOffsetX && Math.abs(y) % 2 == 1)
      targetX += this.hexOffsetX;
    if(this.useGridSteps && this.gridArray) {
      const snapped = snapToGridCoordsClone(widget, targetX, targetY, this.gridArray);
      if(snapped) {
        targetX = snapped.x;
        targetY = snapped.y;
      }
    }
    clone.style.transform = `translate(${targetX}px, ${targetY}px)`;
    clone.style.opacity = 0.3;
    widget.domElement.parentElement.appendChild(clone);
    return clone;
  }

  async dragStart() {
    this.useGridSteps = false;
    this.gridStepX = 0;
    this.gridStepY = 0;
    this.gridArray = null;
    this.hexOffsetX = 0;
    this.hexOffsetY = 0;

    if(getDragToolbarMoveModeClone() == 'grid_on' && selectedWidgets.length) {
      const gridArray = selectedWidgets[0].get('grid');
      if(Array.isArray(gridArray) && gridArray.length) {
        const grid = gridArray.find(g=>g && g.x && g.y);
        if(grid) {
          this.useGridSteps = true;
          this.gridArray = gridArray;
          this.gridStepX = grid.x;
          const hexOffsets = getHexGridOffsets(selectedWidgets[0], gridArray);
          if(hexOffsets) {
            this.hexOffsetX = hexOffsets.offsetX;
            this.hexOffsetY = hexOffsets.offsetY;
            this.gridStepY = Math.abs(hexOffsets.offsetY) || grid.y;
          } else {
            this.gridStepY = grid.y;
          }
        }
      }
    }

    this.dragStartBounds = {
      left:   Math.min(...selectedWidgets.map(w=>w.domElement.getBoundingClientRect().left  )),
      top:    Math.min(...selectedWidgets.map(w=>w.domElement.getBoundingClientRect().top   )),
      right:  Math.max(...selectedWidgets.map(w=>w.domElement.getBoundingClientRect().right )),
      bottom: Math.max(...selectedWidgets.map(w=>w.domElement.getBoundingClientRect().bottom))
    };
    this.dx = this.dragStartBounds.right  - this.dragStartBounds.left;
    this.dy = this.dragStartBounds.bottom - this.dragStartBounds.top;

    this.dragStartHTML = selectedWidgets.map(w=>[ w, w.domElement.innerHTML ]);
  }

  async dragMove(dx, dy, dxViewport, dyViewport) {
    const ceil = n=>Math[n < 0 ? 'floor' : 'ceil'](n);

    const gridX = this.useGridSteps ? (ceil(dx/this.gridStepX) || 1) : (ceil(dxViewport/this.dx) || 1);
    const gridY = this.useGridSteps ? (ceil(dy/this.gridStepY) || 1) : (ceil(dyViewport/this.dy) || 1);

    if(Math.sign(gridX) != Math.sign(this.lastGridX) || Math.sign(gridY) != Math.sign(this.lastGridY))
      this.removeAllClones();

    for(let x=0; x<Math.abs(gridX); ++x) {
      this.x = x*Math.sign(gridX);
      if(!this.clones[x])
        this.clones[x] = [];
      for(let y=0; y<Math.abs(gridY); ++y) {
        this.y = y*Math.sign(gridY);
        if(x+y && !this.clones[x][y]) {
          this.clones[x][y] = [];
          for(const [ widget, html ] of this.dragStartHTML)
            this.clones[x][y].push(this.createClone(widget, html, x*Math.sign(gridX), y*Math.sign(gridY)));
        }
      }
    }

    for(let x=Math.abs(gridX); x<this.clones.length; ++x) {
      if(this.clones[x])
        for(const clonesX of this.clones[x])
          if(clonesX)
            for(const clone of clonesX)
              clone.remove();
      delete this.clones[x];
    }

    for(const clonesX of this.clones) {
      if(clonesX) {
        for(let y=Math.abs(gridY); y<clonesX.length; ++y) {
          if(clonesX[y]) {
            for(const clone of clonesX[y]) {
              clone.remove();
              delete clonesX[y];
            }
          }
        }
      }
    }

    this.lastGridX = gridX;
    this.lastGridY = gridY;

    return `Grid: <i>${Math.abs(gridX)}</i> x <i>${Math.abs(gridY)}</i>`;
  }

  async dragEnd() {
    this.removeAllClones();

    const copyMode = getDragToolbarCopyMode();
    const useInheritFrom = copyMode == 'file_copy' || copyMode == 'difference';
    const inheritProperties = useInheritFrom ? [''] : [];

    const newSelection = [...selectedWidgets];
    const problems = [];
    for(const [ widget, html ] of this.dragStartHTML) {
      const inheritFromSourceId = copyMode == 'difference' ? getInheritFromSourceId(widget) : null;
      const offsetX = this.useGridSteps ? Math.round(this.gridStepX*Math.sign(this.x)) : (this.x ? Math.round(this.dx/getScale()*Math.sign(this.x)) : 0);
      const offsetY = this.useGridSteps ? Math.round(this.gridStepY*Math.sign(this.y)) : (this.y ? Math.round(this.dy/getScale()*Math.sign(this.y)) : 0);
      const clonedWidgets = await duplicateWidget(
        widget,
        true,
        useInheritFrom,
        inheritProperties,
        'Numbers',
        'dropTarget,hand,index,inheritFrom,linkedToSeat,onlyVisibleForSeat,text'.split(','),
        offsetX,
        offsetY,
        Math.abs(this.x),
        Math.abs(this.y),
        problems,
        inheritFromSourceId
      );
      if(this.useGridSteps && this.gridArray) {
        for(const clonedWidget of clonedWidgets) {
          if(this.hexOffsetX && this.gridStepY) {
            const rowIndex = Math.round((clonedWidget.get('y') - widget.get('y')) / this.gridStepY);
            if(Math.abs(rowIndex) % 2 == 1)
              await clonedWidget.set('x', clonedWidget.get('x') + this.hexOffsetX);
          }
          const snapped = snapToGridCoordsClone(clonedWidget, clonedWidget.get('x'), clonedWidget.get('y'), this.gridArray);
          if(snapped) {
            await clonedWidget.setPosition(snapped.x, snapped.y, clonedWidget.get('z'));
            for(const p in snapped.grid)
              if(cloneGridSnapIgnoredProps.indexOf(p) == -1)
                await clonedWidget.set(p, snapped.grid[p]);
          }
        }
      }
      newSelection.push(...clonedWidgets);
    }

    setSelection(newSelection.filter(w=>newSelection.indexOf(widgets.get(w.get('parent'))) == -1));
  }

  removeAllClones() {
    for(const clonesX of this.clones)
      if(clonesX)
        for(const clonesY of clonesX)
          if(clonesY)
            for(const clone of clonesY)
              clone.remove();
    this.clones = [];
  }
}

function getDragToolbarCopyMode() {
  const copyButton = $('#editorDragToolbarSettings .dragToolbarCopyType');
  return copyButton ? copyButton.getAttribute('icon') : 'content_copy';
}

function getDragToolbarMoveModeClone() {
  const moveButton = $('#editorDragToolbarSettings .dragToolbarMoveType');
  return moveButton ? moveButton.getAttribute('icon') : 'gesture';
}

function getInheritFromSourceId(widget) {
  let current = widget;
  const visited = new Set();
  while(current && current.inheritFrom) {
    const inheritMap = current.inheritFrom();
    const sourceIds = Object.keys(inheritMap || {}).filter(id => widgets.has(id));
    if(!sourceIds.length)
      break;
    const sourceId = sourceIds[0];
    if(visited.has(sourceId))
      break;
    visited.add(sourceId);
    current = widgets.get(sourceId);
  }
  return current ? current.get('id') : widget.get('id');
}

function getHexGridOffsets(widget, gridArray) {
  const base = snapToGridCoordsClone(widget, widget.get('x'), widget.get('y'), gridArray);
  if(!base || !base.grid)
    return null;

  const baseGrid = base.grid;
  const altGrid = gridArray.find(g=>g && g !== baseGrid && g.x == baseGrid.x && g.y == baseGrid.y);
  if(!altGrid)
    return null;

  const offsetX = (altGrid.offsetX || 0) - (baseGrid.offsetX || 0);
  const offsetY = (altGrid.offsetY || 0) - (baseGrid.offsetY || 0);
  if(!offsetX || !offsetY)
    return null;
  return { offsetX, offsetY };
}

const cloneGridSnapIgnoredProps = [ 'x', 'y', 'minX', 'minY', 'maxX', 'maxY', 'offsetX', 'offsetY', 'alignX', 'alignY' ];

function snapToGridCoordsClone(widget, x, y, gridArray) {
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

    const snapX = x + alignX + grid.x/2 - cloneGridMod(x + alignX + grid.x/2 - (grid.offsetX || 0), grid.x);
    const snapY = y + alignY + grid.y/2 - cloneGridMod(y + alignY + grid.y/2 - (grid.offsetY || 0), grid.y);

    const distance = (snapX - x) ** 2 + (snapY - y) ** 2;
    if(distance < closestDistance) {
      closest = { x: snapX - alignX, y: snapY - alignY, grid };
      closestDistance = distance;
    }
  }

  return closest;
}

function cloneGridMod(a, b) {
  return ((a % b) + b) % b;
}
