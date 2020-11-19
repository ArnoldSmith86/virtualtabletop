class BasicWidget extends Widget {
  constructor(id) {
    super(id);

    this.addDefaults({
      faces: [ {} ],
      activeFace: 0,
      color: 'black',
      layer: 1
    });
  }

  applyDeltaToDOM(delta) {
    super.applyDeltaToDOM(delta);
    if(delta.activeFace !== undefined || delta.faces !== undefined)
      this.applyDelta(this.p('faces')[this.p('activeFace')]);
  }

  click() {
    this.flip();
  }

  css() {
    let css = super.css();

    if(this.p('color'))
      css += '; --color:' + this.p('color');
    if(this.p('image'))
      css += '; background-image: url("' + this.p('image') + '")';

    return css;
  }

  cssProperties() {
    const p = super.cssProperties();
    p.push('color');
    p.push('image');
    return p;
  }

  flip(setFlip) {
    if(setFlip !== undefined && setFlip !== null)
      this.p('activeFace', setFlip);
    else
      this.p('activeFace', (this.p('activeFace') + 1) % this.p('faces').length);
  }

  getDefaultValue(property) {
    if(property == 'faces' || property == 'activeFace' || !this.p('faces'))
      return super.getDefaultValue(property);
    const d = this.p('faces')[this.p('activeFace')][property];
    if(d !== undefined)
      return d;
    return super.getDefaultValue(property);
  }
}
