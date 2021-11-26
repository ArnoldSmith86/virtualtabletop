import { Widget } from './widget.js';

export class Button extends Widget {
  constructor(id) {
    super(id);

    this.addDefaults({
      width: 80,
      height: 80,

      typeClasses: 'widget button',
      layer: -1,
      movable: false,
      clickable: true,

      image: '',
      color: 'black',
      svgReplaces: {},

      backgroundColor: null,
      borderColor: null,
      textColor:null,
      backgroundColorOH: null,
      borderColorOH: null,
      textColorOH:null,

      text: ''
    });
  }

  applyDeltaToDOM(delta) {
    super.applyDeltaToDOM(delta);
    if(delta.text !== undefined)
      setText(this.domElement, delta.text);

    for(const property of Object.values(this.get('svgReplaces') || {}))
      if(delta[property] !== undefined)
        this.domElement.style.cssText = this.css();
  }

  css() {
    let css = super.css();

    if(this.get('backgroundColor'))
      css += '; --wcMain:' + this.get('backgroundColor');
    if(this.get('borderColor'))
      css += '; --wcBorder:' + this.get('borderColor');
    if(this.get('textColor'))
      css += '; --wcFont:' + this.get('textColor');
    if(this.get('backgroundColorOH'))
      css += '; --wcMainOH:' + this.get('backgroundColorOH');
    if(this.get('borderColorOH'))
      css += '; --wcBorderOH:' + this.get('borderColorOH');
    if(this.get('textColorOH'))
      css += '; --wcFontOH:' + this.get('textColorOH');
    if(this.get('image'))
      css += '; background-image: url("' + this.getImage() + '")';

    return css;
  }

  cssProperties() {
    const p = super.cssProperties();
    p.push('image', 'svgReplaces',  'backgroundColor', 'borderColor', 'textColor',  'backgroundColorOH', 'borderColorOH', 'textColorOH');
    return p;
  }

  getImage() {
    if(!Object.keys(this.get('svgReplaces')).length)
      return this.get('image');

    const replaces = {};
    for(const key in this.get('svgReplaces'))
      replaces[key] = this.get(this.get('svgReplaces')[key]);
    return getSVG(this.get('image'), replaces, _=>this.domElement.style.cssText = this.css());
  }
}

