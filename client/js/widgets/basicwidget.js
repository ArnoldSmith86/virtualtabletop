class BasicWidget extends Widget {
  constructor(id) {
    super(id);

    this.addDefaults({
      color: 'black',
      layer: 1
    });
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
}
