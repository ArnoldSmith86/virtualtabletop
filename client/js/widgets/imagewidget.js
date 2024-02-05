class ImageWidget extends Widget {
  constructor(id) {
    super(id);

    this.addDefaults({
      image: '',
      icon: null,
      svgReplaces: {},
      text: ''
    });
  }

  applyDeltaToDOM(delta) {
    super.applyDeltaToDOM(delta);
    if(delta.text !== undefined || delta.icon !== undefined)
      setText(this.domElement, this.get('icon') ? '' : this.get('text'));

    if(delta.icon !== undefined || delta.text !== undefined || delta.width !== undefined || delta.height !== undefined || delta.textColor !== undefined) {
      if(this.symbolWrapper)
        this.symbolWrapper.remove();
      if(this.get('icon'))
        this.symbolWrapper = generateSymbolsDiv(this.domElement, this.get('width')-10, this.get('height')-10, this.get('icon'), this.get('text'), this.getDefaultIconScale(), this.getDefaultIconColor());
    }

    for(const [ key, property ] of this.getSvgReplaces())
      if(delta[property] !== undefined)
        this.domElement.style.cssText = mapAssetURLs(this.css());
  }

  classes(includeTemporary=true) {
    let className = super.classes(includeTemporary);

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

    if(this.get('image'))
      css += '; background-image: url("' + this.getImage() + '")';

    return css;
  }

  cssProperties() {
    const p = super.cssProperties();
    p.push('image');
    return p;
  }

  getDefaultIconColor() {
    return '#000';
  }

  getDefaultIconScale() {
    return 1;
  }

  getIconDetails() {
    return getIconDetails(this.get('icon'));
  }

  getSvgReplaces() {
    return Object.entries(this.get('svgReplaces') || {});
  }

  getImage() {
    const svgReplaces = this.getSvgReplaces();
    if(!svgReplaces.length)
      return this.get('image');

    const replaces = {};
    for(const [ key, property ] of svgReplaces)
      replaces[key] = this.get(property);
    return getSVG(this.get('image'), replaces, _=>this.domElement.style.cssText = this.css());
  }
}
