class Label extends Widget {
  constructor(object, surface) {
    super(object, surface);

    Object.assign(this.defaults, {
      movable: false,
      layer: -3,

      text: ''
    });
    this.receiveUpdate(object);
  }

  receiveUpdate(object) {
    super.receiveUpdate(object);

    this.domElement.classList.add('label');
    this.domElement.textContent = this.p('text');
  }

  setText(text, mode) {
    if(!mode || mode == 'set')
      this.p('text', text);
    else
      this.p('text', this.p('text') + (mode == 'dec' ? -1 : 1) * text);
  }
}
