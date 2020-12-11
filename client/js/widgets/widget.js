class Widget extends StateManaged {
  constructor(id) {
    const div = document.createElement('div');
    div.id = id;
    super();
    this.domElement = div;
    this.childArray = [];

    this.addDefaults({
      x: 0,
      y: 0,
      z: 0,
      width: 100,
      height: 100,
      layer: 0,
      rotation: 0,
      scale: 1,

      typeClasses: 'widget',
      classes: '',
      css: '',
      movable: true,
      movableInEdit: true,

      enlarge: false,
      overlap: true,
      ignoreOnLeave: false,

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

  absoluteCoord(coord) {
    return this.p(coord) + (this.p('parent') ? widgets.get(this.p('parent')).p(coord) : 0);
  }

  applyChildAdd(child) {
    this.childArray = this.childArray.filter(c=>c!=child);
    this.childArray.push(child);
    this.applyZ();
  }

  applyChildRemove(child) {
    this.childArray = this.childArray.filter(c=>c!=child);
    this.applyZ();
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
    if(delta.classes !== undefined || delta.typeClasses !== undefined || delta.owner !== undefined)
      this.domElement.className = this.classes();
    this.applyCSS(delta);
    if(delta.z !== undefined)
      this.applyZ(true);

    if(delta.movable !== undefined)
      this.isDraggable = delta.movable;

    if(delta.parent !== undefined) {
      if(this.domElement.parentNode && widgets.has(this.domElement.parentNode.id))
        widgets.get(this.domElement.parentNode.id).applyChildRemove(this);

      if(delta.parent === null)
        $('#topSurface').appendChild(this.domElement);
      else
        widgets.get(delta.parent).domElement.appendChild(this.domElement);

      if(delta.parent !== null)
        widgets.get(delta.parent).applyChildAdd(this);
    }

    if($('#enlarged').dataset.id == this.p('id') && !$('#enlarged').className.match(/hidden/))
      this.showEnlarged();
  }

  applyRemove() {
    if(this.p('parent'))
      widgets.get(this.p('parent')).applyChildRemove(this);
    removeFromDOM(this.domElement);
  }

  applyZ(force) {
    if(this.p('inheritChildZ') || force) {
      this.domElement.style.zIndex = this.calculateZ();
      if(this.p('parent') && this.p('inheritChildZ'))
        widgets.get(this.p('parent')).applyZ();
    }
  }

  bringToFront() {
    this.p('z', getMaxZ(this.p('layer')) + 1);
  }

  calculateZ() {
    let z = ((this.p('layer') + 10) * 100000) + this.p('z');
    if(this.p('inheritChildZ'))
      for(const child of this.children())
        z = Math.max(z, child.calculateZ());
    return z;
  }

  children() {
    return this.childArray.sort((a,b)=>b.p('z')-a.p('z'));
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
    let className = this.p('typeClasses') + ' ' + this.p('classes');

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
    return [ 'css', 'height', 'inheritChildZ', 'layer', 'width' ];
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
    return [ 'rotation', 'scale', 'x', 'y' ];
  }

  hideEnlarged() {
    $('#enlarged').classList.add('hidden');
  }

  moveToHolder(holder) {
    this.bringToFront();
    if(this.p('parent') && !this.currentParent)
      this.currentParent = widgets.get(this.p('parent'));
    if(this.currentParent != holder)
      this.checkParent(true);

    this.p('owner',  null);
    this.p('parent', holder.p('id'));
  }

  moveStart() {
    this.bringToFront();
    this.dropTargets = this.validDropTargets();
    this.currentParent = widgets.get(this.p('parent'));
    this.hoverTargetDistance = 99999;
    this.hoverTarget = null;

    this.p('parent', null);

    for(const t of this.dropTargets)
      t.domElement.classList.add('droppable');
  }

  move(x, y) {
    const newX = Math.max(0-this.p('width' )*0.25, Math.min(1600+this.p('width' )*0.25, x)) - this.p('width' )/2;
    const newY = Math.max(0-this.p('height')*0.25, Math.min(1000+this.p('height')*0.25, y)) - this.p('height')/2;

    this.setPosition(newX, newY, this.p('z'));
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
          this.hoverTargetChanged = this.hoverTarget != t;
          this.hoverTarget = t;
          this.hoverTargetCenter = tCenter;
          this.hoverTargetDistance = d;
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

  onChildAdd(child) {
    this.childArray = this.childArray.filter(c=>c!=child);
    this.childArray.push(child);
    this.onChildAddAlign(child);
  }

  onChildAddAlign(child) {
    const childX = child.p('x') - this.absoluteCoord('x');
    const childY = child.p('y') - this.absoluteCoord('y');

    if(this.p('alignChildren'))
      child.setPosition(this.p('dropOffsetX'), this.p('dropOffsetY'), child.p('z'));
    else
      child.setPosition(childX, childY, child.p('z'));
  }

  onChildRemove(child) {
    this.childArray = this.childArray.filter(c=>c!=child);
  }

  onPropertyChange(property, oldValue, newValue) {
    if(property == 'parent') {
      if(oldValue)
        widgets.get(oldValue).onChildRemove(this);
      if(newValue)
        widgets.get(newValue).onChildAdd(this);
    }
  }

  rotate(degrees) {
    this.p('rotation', (this.p('rotation') + degrees) % 360);
  }

  showEnlarged(event) {
    if(this.p('enlarge')) {
      const e = $('#enlarged');
      e.innerHTML = this.domElement.innerHTML;
      e.className = this.domElement.className;
      e.dataset.id = this.p('id');
      e.style.cssText = this.domElement.style.cssText;
      e.style.display = this.domElement.style.display;
      e.style.transform = `scale(calc(${this.p('enlarge')} * var(--scale)))`;
      if(this.domElement.getBoundingClientRect().left < window.innerWidth/2)
        e.classList.add('right');
    }
    if(event)
      event.preventDefault();
  }

  updateOwner(oldName, newName) {
    const o = this.p('owner');
    if(o && o == oldName)
      this.domElement.classList.add('foreign');
    if(o && o == newName)
      this.domElement.classList.remove('foreign');
  }

  validDropTargets() {
    return getValidDropTargets(this);
  }
}
