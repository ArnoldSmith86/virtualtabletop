class Widget extends Draggable {
  constructor(object, surface) {
    const div = document.createElement('div');
    super(div, surface);
    surface.appendChild(div);
    this.receiveUpdate(object);
  }

  onDragStart() {
    this.dragZ = getMaxZ(this.sourceObject.layer || 0) + 1;
    this.dropTargets = getValidDropTargets(this.sourceObject);
    this.hoverTargetDistance = 99999;
    this.hoverTarget = null;
    for(const [ _, t ] of this.dropTargets)
      t.domElement.classList.add('droppable');
  }

  onDrag(x, y) {
    toServer("translate", { id: this.sourceObject.id, pos: [ x, y, this.dragZ ]});
    const myCenter = center(this);

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

    for(const [ _, t ] of this.dropTargets) {
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
    for(const [ _, t ] of this.dropTargets)
      t.domElement.classList.remove('droppable');
    if(this.hoverTarget) {
      this.sourceObject.x = this.x = this.hoverTarget.sourceObject.x+4;
      this.sourceObject.y = this.y = this.hoverTarget.sourceObject.y+4;
      this.sourceObject.z = this.dragZ;
      this.sourceObject.parent = this.hoverTarget.sourceObject.id;
      this.sendUpdate();
      this.hoverTarget.domElement.classList.remove('droptarget');
    }
  }

  receiveUpdate(object) {
    this.sourceObject = object;

    this.domElement.id = object.id;
    this.domElement.className = 'widget';
    if(object.css)
      this.domElement.style.cssText = object.css || '';
    if(object.width)
      this.domElement.style.width = (this.width = object.width) + 'px';
    if(object.height)
      this.domElement.style.height = (this.height = object.height) + 'px';

    this.isDraggable = this.sourceObject.movable !== false;
    this.setPositionFromServer(object.x || 0, object.y || 0, object.z || 0)
  }

  sendUpdate() {
    toServer('update', this.sourceObject);
  }

  setPositionFromServer(x, y, z) {
    this.sourceObject.x = this.x = x;
    this.sourceObject.y = this.y = y;
    this.sourceObject.z = z;
    this.domElement.style.zIndex = (((this.sourceObject.layer || 0) + 10) * 100000) + z;
    if(!this.active)
      this.setTranslate(x, y, this.domElement);
  }
}
