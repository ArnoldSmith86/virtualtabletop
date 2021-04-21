import { Widget } from './widget';

class BasicWidget extends Widget {
  constructor(id) {
    super(id);

    this.addDefaults({
      typeClasses: 'widget basic',
      clickable: true,

      faces: [ {} ],
      faceCycle: 'forward',
      activeFace: 0,

      image: '',
      color: 'black',
      svgReplaces: {},
      layer: 1,
      text: ''
    });
  }

  applyDeltaToDOM(delta) {
    super.applyDeltaToDOM(delta);
    if(delta.activeFace !== undefined || delta.faces !== undefined) {
      let face = this.get('faces')[this.get('activeFace')];
      if(face !== undefined)
        this.applyDelta(face);
    }
    if(delta.text !== undefined)
      this.domElement.textContent = delta.text;

    for(const property of Object.values(this.get('svgReplaces') || {}))
      if(delta[property] !== undefined)
        this.domElement.style.cssText = this.css();
  }

  classes() {
    let className = super.classes();

    if(this.get('image'))
      className += ' hasImage';

    return className;
  }

  classesProperties() {
    const p = super.classesProperties();
    p.push('image');
    return p;
  }

  async click() {
    if(!await super.click())
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

  async flip(setFlip, faceCycle) {
    if(setFlip !== undefined && setFlip !== null)
      await this.set('activeFace', setFlip);
    else {
      const fC = (faceCycle !== undefined && faceCycle !== null) ? faceCycle : this.get('faceCycle');
      if (fC == 'backward')
        await this.set('activeFace', this.get('activeFace') == 0 ? this.get('faces').length-1 : this.get('activeFace') -1);
      else
        await this.set('activeFace', Math.floor(this.get('activeFace') + (fC == 'random' ? Math.random()*99999 : 1)) % this.get('faces').length);
    }
  }

  getDefaultValue(property) {
    if(property == 'faces' || property == 'activeFace' || !this.get('faces') || !this.get('faces')[this.get('activeFace')])
      return super.getDefaultValue(property);
    const d = this.get('faces')[this.get('activeFace')][property];
    if(d !== undefined)
      return d;
    return super.getDefaultValue(property);
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
