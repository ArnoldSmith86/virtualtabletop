class Label extends Widget {
  receiveUpdate(object) {
    super.receiveUpdate(object);
    this.domElement.classList.add('label');

    if(object.text)
      this.domElement.textContent = object.text;
  }
}
