import { $, removeFromDOM } from '../domhelpers.js';
import { StateManaged } from '../statemanaged.js';

export class Widget extends StateManaged {
  constructor(id) {
    const div = document.createElement('div');
    div.id = id;
    super();
    this.id = id;
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
      clickable: false,

      grid: [],
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
    return this.p(coord) + (this.p('parent') ? widgets.get(this.p('parent')).absoluteCoord(coord) : 0);
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
    for(const property of this.classesProperties()) {
      if(delta[property] !== undefined) {
        this.domElement.className = this.classes();
        break;
      }
    }

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
    this.applyCSS(delta);
    if(delta.z !== undefined)
      this.applyZ(true);

    if(delta.movable !== undefined)
      this.isDraggable = delta.movable;

    if(delta.parent !== undefined) {
      if(this.parent)
        this.parent.applyChildRemove(this);

      if(delta.parent === null)
        $('#topSurface').appendChild(this.domElement);
      else
        widgets.get(delta.parent).domElement.appendChild(this.domElement);

      if(delta.parent !== null) {
        this.parent = widgets.get(delta.parent);
        this.parent.applyChildAdd(this);
      } else {
        delete this.parent;
      }
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
      for(const child of this.childrenOwned())
        z = Math.max(z, child.calculateZ());
    return z;
  }

  children() {
    return this.childArray.sort((a,b)=>b.p('z')-a.p('z'));
  }

  childrenOwned() {
    return this.children().filter(c=>!c.p('owner') || c.p('owner')==playerName);
  }

  checkParent(forceDetach) {
    if(this.currentParent && (forceDetach || !overlap(this.domElement, this.currentParent.domElement))) {
      this.p('parent', null);
      this.p('owner',  null);
      if(this.currentParent.dispenseCard)
        this.currentParent.dispenseCard(this);
      delete this.currentParent;
    }
  }

  classes() {
    let className = this.p('typeClasses') + ' ' + this.p('classes');

    if(Array.isArray(this.p('owner')) && this.p('owner').indexOf(playerName) == -1)
      className += ' foreign';
    if(typeof this.p('owner') == 'string' && this.p('owner') != playerName)
      className += ' foreign';

    return className;
  }

  classesProperties() {
    return [ 'classes', 'owner', 'typeClasses' ];
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
    const newX = (jeEnabled ? x : Math.max(0-this.p('width' )*0.25, Math.min(1600+this.p('width' )*0.25, x))) - this.p('width' )/2;
    const newY = (jeEnabled ? y : Math.max(0-this.p('height')*0.25, Math.min(1000+this.p('height')*0.25, y))) - this.p('height')/2;

    this.setPosition(newX, newY, this.p('z'));
    const myCenter = center(this.domElement);

    this.checkParent();

    this.hoverTargetChanged = false;
    if(this.hoverTarget) {
      if(overlap(this.domElement, this.hoverTarget.domElement)) {
        this.hoverTargetDistance = distance(myCenter, this.hoverTargetCenter);
      } else {
        this.hoverTargetDistance = 99999;
        this.hoverTarget = null;
        this.hoverTargetChanged = true;
      }
    }

    for(const t of this.dropTargets) {
      const tCenter = center(t.domElement);
      const d = distance(myCenter, tCenter);
      if(d < this.hoverTargetDistance) {
        if(overlap(this.domElement, t.domElement)) {
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
    this.updatePiles();
  }

  onChildAdd(child, oldParentID) {
    this.childArray = this.childArray.filter(c=>c!=child);
    this.childArray.push(child);
    this.onChildAddAlign(child, oldParentID);
  }

  onChildAddAlign(child, oldParentID) {
    let childX = child.p('x');
    let childY = child.p('y');

    if(!oldParentID) {
      childX -= this.absoluteCoord('x');
      childY -= this.absoluteCoord('y');
    }

    if(this.p('alignChildren'))
      child.setPosition(this.p('dropOffsetX'), this.p('dropOffsetY'), child.p('z'));
    else
      child.setPosition(childX, childY, child.p('z'));
  }

  onChildRemove(child) {
    this.childArray = this.childArray.filter(c=>c!=child);
    this.applyZ();
  }

  onPropertyChange(property, oldValue, newValue) {
    if(property == 'parent') {
      if(oldValue)
        widgets.get(oldValue).onChildRemove(this);
      if(newValue)
        widgets.get(newValue).onChildAdd(this, oldValue);
      this.updatePiles();
    }
  }

  rotate(degrees, mode) {
    if(!mode || mode == 'add')
      this.p('rotation', (this.p('rotation') + degrees) % 360);
    else
      this.p('rotation', degrees);
  }

  setPosition(x, y, z) {
    if(this.p('grid').length && !this.p('parent')) {
      let closest = null;
      let closestDistance = 999999;

      for(const grid of this.p('grid')) {
        if(x < (grid.minX || -99999) || x > (grid.maxX || 99999))
          continue;
        if(y < (grid.minY || -99999) || y > (grid.maxY || 99999))
          continue;
        const distance = ((x + grid.x/2 - (grid.offsetX || 0)) % grid.x) + ((y + grid.y/2 - (grid.offsetY || 0)) % grid.y);
        if(distance < closestDistance) {
          closest = grid;
          closestDistance = distance;
        }
      }

      if(closest) {
        x = x + closest.x/2 - (x - (closest.offsetX || 0)) % closest.x;
        y = y + closest.y/2 - (y - (closest.offsetY || 0)) % closest.y;
        if(closest.rotation !== undefined)
          this.p('rotation', closest.rotation);
      }

      this.snappingToGrid = false;
    }
    super.setPosition(x, y, z);
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

  supportsPiles() {
    return true;
  }

  updateOwner() {
    this.domElement.className = this.classes();
  }

  updatePiles() {
    if(this.p('parent') && !widgets.get(this.p('parent')).supportsPiles())
      return;

    for(const [ widgetID, widget ] of widgets) {
      // check if this widget is closer than 10px from another widget in the same parent
      if(widget != this && widget.p('parent') == this.p('parent') && Math.abs(widget.p('x')-this.p('x')) < 10 && Math.abs(widget.p('y')-this.p('y')) < 10) {
        if(widget.p('owner') !== this.p('owner'))
          continue;

        // if a card gets dropped onto a card, they create a new pile and are added to it
        if(widget.p('type') == 'card' && this.p('type') == 'card') {
          const pile = {
            type: 'pile',
            parent: this.p('parent'),
            x: widget.p('x'),
            y: widget.p('y'),
            width: this.p('width'),
            height: this.p('height')
          };
          addWidgetLocal(pile);
          this.p('parent', pile.id);
          widget.p('parent', pile.id);
          break;
        }

        // if a pile gets dropped onto a pile, all children of one pile are moved to the other (the empty one destroys itself)
        if(widget.p('type') == 'pile' && this.p('type') == 'pile') {
          this.children().reverse().forEach(w=>{w.p('parent', widget.p('id')); w.bringToFront()});
          break;
        }

        // if a pile gets dropped onto a card, the card is added to the pile but the pile is moved to the original position of the card
        if(widget.p('type') == 'card' && this.p('type') == 'pile' && !this.removed) {
          this.children().reverse().forEach(w=>w.bringToFront());
          this.p('x', widget.p('x'));
          this.p('y', widget.p('y'));
          widget.p('parent', this.p('id'));
          break;
        }

        // if a card gets dropped onto a pile, it simply gets added to the pile
        if(widget.p('type') == 'pile' && this.p('type') == 'card' && !widget.removed) {
          this.bringToFront();
          this.p('parent', widget.p('id'));
          break;
        }
      }
    }
  }

  validDropTargets() {
    return getValidDropTargets(this);
  }
}
