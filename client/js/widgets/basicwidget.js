class BasicWidget extends Widget {
  constructor(object, surface) {
    super(object, surface);

    Object.assign(this.defaults, {
      layer: 1
    });
    this.receiveUpdate(object);
  }

  receiveUpdate(object) {
    super.receiveUpdate(object);
    this.domElement.style.backgroundImage = object.image ? `url(${object.image})` : '';
  }
}
