class Label extends Widget {
  constructor(id) {
    super(id);

    this.addDefaults({
      height: 20,
      movable: false,
      layer: -3,
      classes: 'widget label',

      text: ''
    });
  }

  applyDeltaToDOM(delta) {
    super.applyDeltaToDOM(delta);
    if(delta.text !== undefined)
      this.domElement.textContent = delta.text;
  }

  setText(text, mode) {
    if(!mode || mode == 'set')
      this.p('text', text);
    else
      this.p('text', this.p('text') + (mode == 'dec' ? -1 : 1) * text);
  }
}
