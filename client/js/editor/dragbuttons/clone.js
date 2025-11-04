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
    clone.style.transform = `translate(${widget.get('x')+this.dx*x/getScale()}px, ${widget.get('y')+this.dy*y/getScale()}px)`;
    clone.style.opacity = 0.3;
    widget.domElement.parentElement.appendChild(clone);
    return clone;
  }

  async dragStart() {
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

    const gridX = ceil(dxViewport/this.dx) || 1;
    const gridY = ceil(dyViewport/this.dy) || 1;

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

    const newSelection = [...selectedWidgets];
    const problems = [];
    for(const [ widget, html ] of this.dragStartHTML)
      newSelection.push(...await duplicateWidget(widget, true, false, [], 'Numbers', 'dropTarget,hand,index,inheritFrom,linkedToSeat,onlyVisibleForSeat,text'.split(','), this.x ? Math.round(this.dx/getScale()*Math.sign(this.x)) : 0, this.y ? Math.round(this.dy/getScale()*Math.sign(this.y)) : 0, Math.abs(this.x), Math.abs(this.y), problems));

    setSelection(newSelection.filter(w=>newSelection.indexOf(topSurface.widgets.get(w.get('parent'))) == -1));
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
