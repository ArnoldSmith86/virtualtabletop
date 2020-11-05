class Widget extends Draggable {
  constructor(object, surface) {
    const div = document.createElement('div');
    super(div, surface);
    surface.appendChild(div);
    this.receiveUpdate(object);
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
    this.domElement.style.zIndex = (object.z || 0);

    this.setPositionFromServer(object.x || 0, object.y || 0)
  }

  sendUpdate() {
    toServer('update', this.sourceObject);
  }

  setPositionFromServer(x, y) {
    this.sourceObject.x = x;
    this.sourceObject.y = y;
    if(!this.active)
      this.setTranslate(x, y, this.domElement);
  }
}
