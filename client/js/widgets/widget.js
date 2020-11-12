class Widget extends Draggable {
  constructor(object, surface) {
    const div = document.createElement('div');
    super(div, surface);
    surface.appendChild(div);
    this.receiveUpdate(object);

    this.domElement.addEventListener('contextmenu', e => this.showEnlarged(e), false);
    this.domElement.addEventListener('mouseenter',  e => this.showEnlarged(e), false);
    this.domElement.addEventListener('mouseleave',  e => this.hideEnlarged(e), false);
  }

  children() {
    return Array.from(widgets.values()).filter(w=>w.sourceObject.parent==this.sourceObject.id&&w.sourceObject.type!='deck').sort((a,b)=>b.sourceObject.z-a.sourceObject.z);
  }

  checkParent(forceDetach) {
    if(this.currentParent && (forceDetach || !overlap(this, this.currentParent))) {
      delete this.sourceObject.parent;
      delete this.sourceObject.owner;
      if(this.currentParent.dispenseCard)
        this.currentParent.dispenseCard(this);
      delete this.currentParent;
      this.sendUpdate();
    }
  }

  hideEnlarged() {
    $('#enlarged').classList.add('hidden');
  }

  moveToPile(pile) {
    const thisX = this.x;
    const thisY = this.y;

    const p = pile.sourceObject;
    this.sourceObject.parent = p.id;
    delete this.sourceObject.owner;
    this.setPosition(p.x+(p.dropOffsetX || 4), p.y+(p.dropOffsetY || 4), getMaxZ(this.sourceObject.layer || 0) + 1);

    if(pile.receiveCard) {
      pile.receiveCard(this, [ thisX, thisY ], this.currentParent != pile);
    } else {
      this.sendUpdate();
    }
  }

  onDragStart() {
    this.dragZ = getMaxZ(this.sourceObject.layer || 0) + 1;
    this.dropTargets = getValidDropTargets(this.sourceObject);
    this.currentParent = widgets.get(this.sourceObject.parent);
    this.hoverTargetDistance = 99999;
    this.hoverTarget = null;
    for(const t of this.dropTargets)
      t.domElement.classList.add('droppable');
  }

  onDrag(x, y) {
    this.setPosition(x, y, this.dragZ);
    const myCenter = center(this);

    this.checkParent();

    this.hoverTargetChanged = false;
    if(this.hoverTarget) {
      if(overlap(this, this.hoverTarget)) {
        this.hoverTargetDistance = distance(myCenter, this.hoverTargetCenter);
      } else {
        this.hoverTargetDistance = 99999;
        this.hoverTarget = null;
        this.hoverTargetChanged = true;
      }
    }

    for(const t of this.dropTargets) {
      const tCenter = center(t);
      const d = distance(myCenter, tCenter);
      if(d < this.hoverTargetDistance) {
        if(overlap(this, t)) {
          this.hoverTarget = t;
          this.hoverTargetCenter = tCenter;
          this.hoverTargetDistance = d;
          this.hoverTargetChanged = true;
        }
      }
    }

    if(this.hoverTargetChanged) {
      if(this.lastHoverTarget)
        this.lastHoverTarget.domElement.classList.remove('droptarget');
      if(this.hoverTarget)
        this.hoverTarget.domElement.classList.add('droptarget');
      this.lastHoverTarget = this.hoverTarget;
    }
  }

  onDragEnd() {
    for(const t of this.dropTargets)
      t.domElement.classList.remove('droppable');

    this.checkParent();

    if(this.hoverTarget) {
      if(this.currentParent != this.hoverTarget)
        this.checkParent(true);
      this.moveToPile(this.hoverTarget);
      this.hoverTarget.domElement.classList.remove('droptarget');
    }

    this.hideEnlarged();
  }

  receiveUpdate(object) {
    this.sourceObject = object;

    this.enlarge = object.enlarge;

    this.domElement.id = object.id;
    this.domElement.className = 'widget';
    if(object.css)
      this.domElement.style.cssText = object.css || '';
    if(object.width)
      this.domElement.style.width = (this.width = object.width) + 'px';
    if(object.height)
      this.domElement.style.height = (this.height = object.height) + 'px';
    if(object.owner && object.owner != playerName)
      this.domElement.classList.add('foreign');

    this.isDraggable = this.sourceObject.movable !== false;
    this.extraTransform = object.rotation ? `rotate(${object.rotation}deg)` : '';
    this.setPositionFromServer(object.x || 0, object.y || 0, object.z || 0);
  }

  remove() {
    this.domElement.parentNode.removeChild(this.domElement);
  }

  rotate(degrees) {
    this.sourceObject.rotation = ((this.sourceObject.rotation || 0) + degrees) % 360;
    this.sendUpdate();
  }

  sendUpdate() {
    toServer('update', this.sourceObject);
  }

  setPosition(x, y, z, send=true) {
    this.sourceObject.x = this.x = x;
    this.sourceObject.y = this.y = y;
    this.sourceObject.z = this.z = z;
    if(send)
      toServer("translate", { id: this.sourceObject.id, pos: [ x, y, z ]});
  }

  setPositionFromServer(x, y, z) {
    this.sourceObject.x = this.x = x;
    this.sourceObject.y = this.y = y;
    this.sourceObject.z = z;
    this.domElement.style.zIndex = (((this.sourceObject.layer || 0) + 10) * 100000) + z;
    if(!this.active)
      this.setTranslate(x, y, this.domElement);
  }

  setZ(z) {
    this.setPosition(this.x, this.y, z);
  }

  showEnlarged(event) {
    if(this.enlarge) {
      const e = $('#enlarged');
      e.innerHTML = this.domElement.innerHTML;
      e.className = this.domElement.className;
      e.style.cssText = this.domElement.style.cssText;
      e.style.display = this.domElement.style.display;
      if(this.x < 600)
        e.classList.add('right');
    }
    event.preventDefault();
  }
}
