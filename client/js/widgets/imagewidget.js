class ImageWidget extends Widget {
  constructor(id) {
    super(id);

    this.addDefaults({
      image: '',
      icon: null,
      iconScale: 0.75,
      svgReplaces: {},
      text: ''
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
    if(this.get('image'))
      className += ' hasImage';

    return className;
  }

  classesProperties() {
    const p = super.classesProperties();
    p.push('icon', 'image');
    return p;
  }

  css() {
    let css = super.css();

    if(this.get('icon') || this.get('image')) {
      css += '; background-image: url("' + this.getImage() + '")';
      if(this.get('icon'))
        css += `; --iconScale: ${+this.get('iconScale')}; font-size: ${+this.get('iconScale')*Math.min(this.get('width'), this.get('height'))}px`;
    }

    return css;
  }

  cssProperties() {
    const p = super.cssProperties();
    p.push('image', 'icon', 'iconScale', 'svgReplaces');
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
