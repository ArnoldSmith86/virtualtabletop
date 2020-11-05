class Widget extends Draggable {
  constructor(object, surface) {
    const div = document.createElement('div');
    super(div, surface);
    surface.appendChild(div);
    this.receiveUpdate(object);
  }

  onDragStart() {
    this.dragZ = getMaxZ(this.sourceObject.layer || 0) + 1;
  }

  onDrag(x, y) {
    toServer("translate", { id: this.domElement.id, pos: [ x, y, this.dragZ ]});
  }

  receiveUpdate(object) {
    this.sourceObject = object;

    this.domElement.id = object.id;
    this.domElement.className = 'widget';
    if(object.css)
      this.domElement.style.cssText = object.css || '';
    if(object.width)
      this.domElement.style.width = object.width + 'px';
    if(object.height)
      this.domElement.style.height = object.height + 'px';

    this.isDraggable = this.sourceObject.movable !== false;
    this.setPositionFromServer(object.x || 0, object.y || 0, object.z || 0)
  }

  sendUpdate() {
    toServer('update', this.sourceObject);
  }

  setPositionFromServer(x, y, z) {
    this.sourceObject.x = x;
    this.sourceObject.y = y;
    this.sourceObject.z = z;
    this.domElement.style.zIndex = (((this.sourceObject.layer || 0) + 10) * 100000) + z;
    if(!this.active)
      this.setTranslate(x, y, this.domElement);
  }
}
