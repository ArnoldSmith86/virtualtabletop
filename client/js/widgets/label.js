class Label extends Widget {
  receiveUpdate(object) {
    super.receiveUpdate(object);
    this.domElement.classList.add('label');

    if(typeof object.text != 'undefined')
      this.domElement.textContent = object.text;
  }

  setText(text, mode) {
    if(!mode || mode == 'set')
      this.p('text', text);
    else
      this.p('text', this.p('text') + (mode == 'dec' ? -1 : 1) * text);
    this.sendUpdate();
  }
}
