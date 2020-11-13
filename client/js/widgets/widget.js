class Widget extends Draggable {
  constructor(object, surface) {
    const div = document.createElement('div');
    super(div, surface);

    this.defaults = {
      x: 200,
      y: 100,
      z: 0,
      width: 100,
      height: 100,
      layer: 0,
      rotation: 0,

      css: '',
      movable: true,

      dropOffsetX: 0,
      dropOffsetY: 0
    };

    surface.appendChild(div);
    this.receiveUpdate(object);

    this.domElement.addEventListener('contextmenu', e => this.showEnlarged(e), false);
    this.domElement.addEventListener('mouseenter',  e => this.showEnlarged(e), false);
    this.domElement.addEventListener('mouseleave',  e => this.hideEnlarged(e), false);
  }

  children() {
    return Array.from(widgets.values()).filter(w=>w.p('parent')==this.p('id')&&w.p('type')!='deck').sort((a,b)=>b.p('z')-a.p('z'));
  }

  checkParent(forceDetach) {
    if(this.currentParent && (forceDetach || !overlap(this, this.currentParent))) {
      this.p('parent', null);
      this.p('owner',  null);
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
    const thisX = this.p('x');
    const thisY = this.p('y');

    if(this.p('parent') && !this.currentParent)
      this.currentParent = widgets.get(this.p('parent'));
    if(this.currentParent != pile)
      this.checkParent(true);

    this.p('parent', pile.p('id'));
    this.p('owner',  null);
    this.setPosition(pile.p('x')+pile.p('dropOffsetX'), pile.p('y')+pile.p('dropOffsetY'), getMaxZ(this.p('layer')) + 1);

    if(pile.receiveCard) {
      pile.receiveCard(this, [ thisX, thisY ], this.currentParent != pile);
    } else {
      this.sendUpdate();
    }
  }

  onDragStart() {
    this.dragZ = getMaxZ(this.p('layer')) + 1;
    this.dropTargets = getValidDropTargets(this);
    this.currentParent = widgets.get(this.p('parent'));
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
      this.moveToPile(this.hoverTarget);
      this.hoverTarget.domElement.classList.remove('droptarget');
    }

    this.hideEnlarged();
  }

  p(property, value) {
    if(value === undefined)
      return this.propertyGet(property);
    else
      this.propertySet(property, value);
  }

  propertyGet(property) {
    if(this.sourceObject[property] !== undefined)
      return this.sourceObject[property];
    else
      return this.defaults[property];
  }

  propertySet(property, value) {
    if(value === null)
      delete this.sourceObject[property];
    else
      this.sourceObject[property] = value;
  }

  receiveUpdate(object) {
    this.sourceObject = object;

    this.domElement.id = this.p('id');
    this.domElement.className = 'widget';
    this.domElement.style.cssText = this.p('css');
    this.domElement.style.width = this.p('width') + 'px';
    this.domElement.style.height = this.p('height') + 'px';
    if(this.p('owner') && this.p('owner') != playerName)
      this.domElement.classList.add('foreign');

    this.isDraggable = this.p('movable');
    this.extraTransform = this.p('rotation') ? `rotate(${this.p('rotation')}deg)` : '';
    this.setPositionFromServer(this.p('x'), this.p('y'), this.p('z'));
  }

  remove() {
    this.domElement.parentNode.removeChild(this.domElement);
  }

  rotate(degrees) {
    this.p('rotation', (this.p('rotation') + degrees) % 360);
    this.sendUpdate();
  }

  sendUpdate() {
    toServer('update', this.sourceObject);
  }

  setPosition(x, y, z, send=true) {
    this.p('x', x);
    this.p('y', y);
    this.p('z', z);
    if(send)
      toServer("translate", { id: this.p('id'), pos: [ x, y, z ]});
  }

  setPositionFromServer(x, y, z) {
    this.p('x', x);
    this.p('y', y);
    this.p('z', z);
    this.domElement.style.zIndex = ((this.p('layer') + 10) * 100000) + z;
    if(!this.active)
      this.setTranslate(x, y, this.domElement);
  }

  setZ(z) {
    this.setPosition(this.p('x'), this.p('y'), z);
  }

  showEnlarged(event) {
    if(this.p('enlarge')) {
      const e = $('#enlarged');
      e.innerHTML = this.domElement.innerHTML;
      e.className = this.domElement.className;
      e.style.cssText = this.domElement.style.cssText;
      e.style.display = this.domElement.style.display;
      if(this.p('x') < 600)
        e.classList.add('right');
    }
    event.preventDefault();
  }

  updateOwner(oldName, newName) {
    const o = this.p('owner');
    if(o && o == oldName)
      this.domElement.classList.add('foreign');
    if(o && o == newName)
      this.domElement.classList.remove('foreign');
  }
}
