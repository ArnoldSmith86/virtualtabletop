class Widget extends StateManaged {
  constructor(id) {
    const div = document.createElement('div');
    div.id = id;
    super();
    this.domElement = div;

    this.addDefaults({
      x: 0,
      y: 0,
      z: 0,
      width: 100,
      height: 100,
      layer: 0,
      rotation: 0,
      scale: 1,

      classes: 'widget',
      css: '',
      movable: true,

      parent: null,
      owner: null,
      dropOffsetX: 0,
      dropOffsetY: 0,
      inheritChildZ: false
    });

    this.domElement.addEventListener('contextmenu', e => this.showEnlarged(e), false);
    this.domElement.addEventListener('mouseenter',  e => this.showEnlarged(e), false);
    this.domElement.addEventListener('mouseleave',  e => this.hideEnlarged(e), false);
  }

  applyCSS(delta) {
    for(const property of this.cssProperties()) {
      if(delta[property] !== undefined) {
        this.domElement.style.cssText = this.css();
        return;
      }
    }

    for(const property of this.cssTransformProperties()) {
      if(delta[property] !== undefined) {
        this.domElement.style.transform = this.cssTransform();
        return;
      }
    }
  }

  applyDeltaToDOM(delta) {
    if(delta.classes !== undefined || delta.owner !== undefined)
      this.domElement.className = this.classes();
    this.applyCSS(delta);
    if(delta.z !== undefined)
      this.domElement.style.zIndex = this.calculateZ();

    if(delta.movable !== undefined)
      this.isDraggable = delta.movable;

    if(delta.parent !== undefined) {
      if(delta.parent === null)
        $('#topSurface').appendChild(this.domElement);
      else
        widgets.get(delta.parent).domElement.appendChild(this.domElement);
    }
  }

  calculateZ() {
    let layer = this.p('layer');
    let z = this.p('z');
    if(this.p('inheritChildZ')) {
      for(const child of this.children()) {
        layer = Math.max(layer, child.p('layer'));
        z     = Math.max(z,     child.p('z'));
      }
    }
    return ((layer + 10) * 100000) + z;
  }

  children() {
    return Array.from(widgets.values()).filter(w=>w.p('parent')==this.p('id')&&w.p('type')!='deck'&&w.p('type')!='label'&&w.p('type')!='button').sort((a,b)=>b.p('z')-a.p('z'));
  }

  checkParent(forceDetach) {
    if(this.currentParent && (forceDetach || !overlap(this, this.currentParent))) {
      this.p('parent', null);
      this.p('owner',  null);
      if(this.currentParent.dispenseCard)
        this.currentParent.dispenseCard(this);
      delete this.currentParent;
    }
  }

  classes() {
    let className = this.p('classes');

    if(this.p('owner') && this.p('owner') != playerName)
      className += ' foreign';

    return className;
  }

  css() {
    let css = this.p('css');

    css += '; width:'  + this.p('width')  + 'px';
    css += '; height:' + this.p('height') + 'px';
    css += '; z-index:' + this.calculateZ();
    css += '; transform:' + this.cssTransform();

    return css;
  }

  cssProperties() {
    return [ 'height', 'inheritChildZ', 'layer', 'width' ];
  }

  cssTransform() {
    let transform = `translate(${this.p('x')}px, ${this.p('y')}px)`;

    if(this.p('rotation'))
      transform += ` rotate(${this.p('rotation')}deg)`;
    if(this.p('scale') != 1)
      transform += ` scale(${this.p('scale')})`;

    return transform;
  }

  cssTransformProperties() {
    return [ 'rotate', 'scale', 'x', 'y' ];
  }

  hideEnlarged() {
    $('#enlarged').classList.add('hidden');
  }

  moveToHolder(holder) {
    if(this.p('parent') && !this.currentParent)
      this.currentParent = widgets.get(this.p('parent'));
    if(this.currentParent != holder)
      this.checkParent(true);

    this.p('parent', holder.p('id'));
    this.p('owner',  null);

    const thisX = this.p('x') - holder.p('x');
    const thisY = this.p('y') - holder.p('y');

    if(holder.p('alignChildren'))
      this.setPosition(holder.p('dropOffsetX'), holder.p('dropOffsetY'), this.p('z'));
    else
      this.setPosition(thisX, thisY, this.p('z'));

    if(holder.receiveCard)
      holder.receiveCard(this, [ thisX, thisY ], this.currentParent != holder);
  }

  moveStart() {
    this.p('z', getMaxZ(this.p('layer')) + 1);
    this.dropTargets = getValidDropTargets(this);
    this.currentParent = widgets.get(this.p('parent'));
    this.hoverTargetDistance = 99999;
    this.hoverTarget = null;

    this.p('parent', null);

    for(const t of this.dropTargets)
      t.domElement.classList.add('droppable');
  }

  move(x, y) {
    this.setPosition(Math.max(0, Math.min(1600, x)) - this.p('width')/2, Math.max(0, Math.min(1000, y)) - this.p('height')/2, this.p('z'));
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

  moveEnd() {
    for(const t of this.dropTargets)
      t.domElement.classList.remove('droppable');

    this.checkParent();

    if(this.hoverTarget) {
      this.moveToHolder(this.hoverTarget);
      this.hoverTarget.domElement.classList.remove('droptarget');
    }

    this.hideEnlarged();
  }

  remove() {
    removeFromDOM(this.domElement);
  }

  rotate(degrees) {
    this.p('rotation', (this.p('rotation') + degrees) % 360);
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
