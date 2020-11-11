class Pile extends Widget {
  receiveUpdate(object) {
    super.receiveUpdate(object);
    this.domElement.classList.add('pile');
    if(!this.sourceObject.transparent)
      this.domElement.classList.add('default');
  }
}
