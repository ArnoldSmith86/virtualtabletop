class Label extends Widget {
  receiveUpdate(object) {
    super.receiveUpdate(object);
    this.domElement.classList.add('label');

    if(typeof object.text != 'undefined')
      this.domElement.textContent = object.text;
  }

  setText(text, mode) {
    if(!mode || mode == 'set')
      this.sourceObject.text = text;
    else
      this.sourceObject.text += (mode == 'dec' ? -1 : 1) * text;
    this.sendUpdate();
  }
}
