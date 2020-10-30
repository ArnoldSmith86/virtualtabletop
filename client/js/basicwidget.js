class BasicWidget extends Widget {
  constructor(object, surface) {
    super(object, surface);

    if(object.image)
      this.domElement.style.backgroundImage = `url(${object.image})`;
  }
}
