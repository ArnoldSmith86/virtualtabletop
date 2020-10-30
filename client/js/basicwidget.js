class BasicWidget extends Widget {
  constructor(object, surface) {
    super(object, surface);

    this.domElement.style.backgroundImage = `url(${object.image})`;
  }
}
