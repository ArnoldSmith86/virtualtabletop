import { Widget } from './widget';

class BasicWidget extends Widget {
  constructor(id) {
    super(id);

    this.addDefaults({
      typeClasses: 'widget basic',

      faces: [ {} ],
      faceCycle: 'forward',
      activeFace: 0,

      image: '',
      color: 'black',
      svgReplaces: {},
      layer: 1,
      text: '',
      html: null
    });
  }

  applyDeltaToDOM(delta) {
    super.applyDeltaToDOM(delta);
    if(delta.activeFace !== undefined || delta.faces !== undefined) {
      if(this.previouslyActiveFace !== undefined) {
        const undoDelta = {};
        for(const property in this.previouslyActiveFace)
          undoDelta[property] = this.state[property] !== undefined ? this.state[property] : null;
        delete undoDelta.faces;
        delete undoDelta.activeFace;
        this.applyDeltaToDOM(undoDelta);
        delete this.previouslyActiveFace;
      }

      const face = this.faces()[this.get('activeFace')];
      if(face && typeof face == 'object') {
        delete face.faces;
        delete face.activeFace;
        this.applyDeltaToDOM(face);
        this.previouslyActiveFace = face;
      }
    }
    if(delta.html !== undefined || delta.text !== undefined || this.getWithPropertyReplacements_checkDelta('html', delta)) {
      const childNodes = [...this.domElement.childNodes];
      this.domElement.innerHTML = '';
      if(this.get('html') === null) {
        setText(this.domElement, this.get('text'));
      } else {
        this.domElement.innerHTML = DOMPurify.sanitize(mapAssetURLs(this.getWithPropertyReplacements('html')), { USE_PROFILES: { html: true } });
      }
      for(const child of childNodes)
        if(String(child.className).match(/widget/))
          this.domElement.appendChild(child);
  }

    for(const property of Object.values(this.get('svgReplaces') || {}))
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
    p.push('image');
    return p;
  }

  async click(mode='respect') {
    if(!await super.click(mode))
      await this.flip();
  }

  css() {
    let css = super.css();

    if(this.get('color'))
      css += '; --color:' + this.get('color');
    if(this.get('image'))
      css += '; background-image: url("' + this.getImage() + '")';

    return css;
  }

  cssProperties() {
    const p = super.cssProperties();
    p.push('image', 'color', 'svgReplaces');
    return p;
  }

  faces() {
    const faces = this.get('faces');
    return Array.isArray(faces) ? faces : [];
  }

  async flip(setFlip, faceCycle) {
    if(setFlip !== undefined && setFlip !== null)
      await this.set('activeFace', setFlip);
    else {
      const fC = (faceCycle !== undefined && faceCycle !== null) ? faceCycle : this.get('faceCycle');
      if (fC == 'backward')
        await this.set('activeFace', this.get('activeFace') == 0 ? this.faces().length-1 : this.get('activeFace') -1);
      else
        await this.set('activeFace', Math.floor(this.get('activeFace') + (fC == 'random' ? rand()*99999 : 1)) % this.faces().length);
    }
  }

  get(property) {
    if(property == 'faces' || property == 'activeFace' || !this.faces()[this.get('activeFace')])
      return super.get(property);
    const d = this.faces()[this.get('activeFace')][property];
    if(d !== undefined)
      return d;
    return super.get(property);
  }

  getFaceCount() {
    return this.faces().length || 1;
  }

  getImage() {
    if(!Object.keys(this.get('svgReplaces') || {}).length)
      return this.get('image');

    const replaces = {};
    for(const key in this.get('svgReplaces'))
      replaces[key] = this.get(this.get('svgReplaces')[key]);
    return getSVG(this.get('image'), replaces, _=>this.domElement.style.cssText = this.css());
  }
}
