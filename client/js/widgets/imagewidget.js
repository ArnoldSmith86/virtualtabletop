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

  applyDeltaToDOM(delta, skipTextUpdate=false) {
    super.applyDeltaToDOM(delta);
    if(!skipTextUpdate && (delta.text !== undefined || delta.icon !== undefined))
      setText(this.domElement, this.get('icon') ? '' : this.get('text'));

    if(delta.icon !== undefined || delta.text !== undefined || delta.width !== undefined || delta.height !== undefined || delta.textColor !== undefined || this.getWithPropertyReplacements_checkDelta('icon', delta))
      this.updateIcon();

    for(const [ key, property ] of this.getSvgReplaces())
      for(const p of asArray(property))
        if(delta[p] !== undefined)
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

  css(skipImage=false) {
    let css = super.css();
    if(this.get('image') && !skipImage)
      css += '; background-image: url("' + this.getImage() + '")';
    return css;
  }

  cssProperties() {
    const p = super.cssProperties();
    p.push('image', 'svgReplaces');
    return p;
  }

  getDefaultIconColor() {
    return '#000';
  }

  getDefaultIconHoverColor() {
    return this.getDefaultIconColor();
  }

  getDefaultIconScale() {
    return 1;
  }

  getDefaultIconOpacity() {
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
    for(const [ key, property ] of svgReplaces) {
      if(Array.isArray(property))
        replaces[key] = property.map(p=>this.get(p));
      else
        replaces[key] = this.get(property);
    }
    return getSVG(this.get('image'), replaces, _=>this.domElement.style.cssText = this.css());
  }

  updateIcon() {
    if(this.symbolWrapper)
      this.symbolWrapper.remove();
    if(this.get('icon'))
      this.symbolWrapper = generateSymbolsDiv(this.domElement, this.get('width'), this.get('height'), this.getWithPropertyReplacements('icon'), this.get('text'), this.getDefaultIconScale(), this.getDefaultIconColor(), this.getDefaultIconHoverColor(), this.getDefaultIconOpacity());
  }
}
