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

      image: '',
      icon: null,
      iconScale: 0.75,
      color: 'black',
      svgReplaces: {},

      backgroundColor: null,
      borderColor: null,
      textColor: '#ffffff',
      backgroundColorOH: null,
      borderColorOH: null,
      textColorOH: null,

      text: '',
      borderRadius: 800
    });
  }

  applyDeltaToDOM(delta) {
    super.applyDeltaToDOM(delta);
    if(delta.text !== undefined || delta.icon !== null)
      setText(this.domElement, this.getIconDetails().text || this.get('text'));

    for(const [ key, property ] of this.getSvgReplaces())
      if(delta[property] !== undefined)
        this.domElement.style.cssText = mapAssetURLs(this.css());
  }

  classes(includeTemporary=true) {
    let className = super.classes(includeTemporary);

    if(this.get('icon'))
      className += ` autoIconAlign ${this.getIconDetails().class}`;

    return className;
  }

  classesProperties() {
    const p = super.classesProperties();
    p.push('icon');
    return p;
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
    if(this.get('icon') || this.get('image')) {
      css += '; background-image: url("' + this.getImage() + '")';
      if(this.get('icon'))
        css += `; --iconScale: ${+this.get('iconScale')}; font-size: ${+this.get('iconScale')*Math.min(this.get('width'), this.get('height'))}px`;
    }

    return css;
  }

  cssProperties() {
    const p = super.cssProperties();
    p.push('image', 'icon', 'iconScale', 'color', 'svgReplaces',  'backgroundColor', 'borderColor', 'textColor',  'backgroundColorOH', 'borderColorOH', 'textColorOH');
    return p;
  }

  getIconDetails() {
    const icon = this.get('icon');
    if(!icon)
      return { image: null, text: null };
    if(icon.match(/\//))
      return { image: `/i/game-icons.net/${icon}.svg`, text: ' ', class: 'autoIconAlignImage autoIconAlignGameIcons', svgReplaces: { '#000': 'textColor' } };
    if(icon.match(/^\[/))
      return { image: ' ', text: icon, class: 'autoIconAlignFont autoIconAlignSymbols' };
    if(icon.match(/^[a-z0-9]/))
      return { image: ' ', text: icon, class: 'autoIconAlignFont autoIconAlignMaterialIcons' };
    return { image: `/i/noto-emoji/emoji_u${emojiToFilename(icon)}.svg`, text: ' ', class: 'autoIconAlignImage autoIconAlignNotoEmoji' };
  }

  getSvgReplaces() {
    const svgReplaces = Object.entries(this.get('svgReplaces') || {});
    return svgReplaces.length ? svgReplaces : Object.entries(this.getIconDetails().svgReplaces || {});
  }

  getImage() {
    const svgReplaces = this.getSvgReplaces();
    if(!svgReplaces.length)
      return this.getIconDetails().image || this.get('image');

    const replaces = {};
    for(const [ key, property ] of svgReplaces)
      replaces[key] = this.get(property);
    return getSVG(this.getIconDetails().image || this.get('image'), replaces, _=>this.domElement.style.cssText = this.css());
  }
}

