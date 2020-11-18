class BasicWidget extends Widget {
  constructor(id) {
    super(id);

    this.addDefaults({
      color: 'black',
      color2: 'black',
      layer: 1
    });
  }

  css() {
    let css = super.css();

    if(this.p('color'))
      css += '; --color:' + this.p('color');
    if(this.p('color2'))
      css += '; --color2:' + this.p('color2');
    if(this.p('image'))
      css += '; background-image: url("' + this.p('image') + '")';

    return css;
  }

  cssProperties() {
    const p = super.cssProperties();
    p.push('color');
    p.push('color2');
    p.push('image');
    return p;
  }
}
