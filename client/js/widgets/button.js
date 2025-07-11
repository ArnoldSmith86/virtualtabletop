export class Button extends ImageWidget {
  constructor(id) {
    super(id);

    this.addDefaults({
      width: 80,
      height: 80,

      typeClasses: 'widget button',
      layer: -1,
      movable: false,

      color: 'black',

      backgroundColor: null,
      borderColor: null,
      textColor: '#ffffff',
      backgroundColorOH: null,
      borderColorOH: null,
      textColorOH: null,

      borderRadius: 800
    });
  }

  applyDeltaToDOM(delta) {
    super.applyDeltaToDOM(delta);

    if(delta.textColor !== undefined || delta.textColorOH !== undefined)
      this.updateIcon();
  }

  css() {
    let css = super.css();

    if(this.get('color'))
      css += '; --color:' + this.get('color');
    if(this.get('backgroundColor'))
      css += '; --wcMain:' + this.get('backgroundColor');
    if(this.get('borderColor'))
      css += '; --wcBorder:' + this.get('borderColor');
    if(this.get('textColor') && this.get('textColor') != '#ffffff')
      css += '; --wcFont:' + this.get('textColor');
    if(this.get('backgroundColorOH'))
      css += '; --wcMainOH:' + this.get('backgroundColorOH');
    if(this.get('borderColorOH'))
      css += '; --wcBorderOH:' + this.get('borderColorOH');
    if(this.get('textColorOH'))
      css += '; --wcFontOH:' + this.get('textColorOH');

    return css;
  }

  cssProperties() {
    const p = super.cssProperties();
    p.push('color', 'backgroundColor', 'borderColor', 'textColor',  'backgroundColorOH', 'borderColorOH', 'textColorOH');
    return p;
  }

  getDefaultIconColor() {
    return this.get('textColor');
  }

  getDefaultIconHoverColor() {
    return this.get('textColorOH') || this.get('textColor');
  }

  getDefaultIconScale() {
    return 0.66;
  }
}

