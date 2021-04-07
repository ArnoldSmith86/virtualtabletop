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
      let face = this.p('faces')[this.p('activeFace')];
      if(face !== undefined)
        this.applyDelta(face);
    }
    if(delta.text !== undefined)
      this.domElement.textContent = delta.text;

    for(const property of Object.values(this.p('svgReplaces') || {}))
      if(delta[property] !== undefined)
        this.domElement.style.cssText = this.css();
  }

  classes() {
    let className = super.classes();

    if(this.p('image'))
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
      this.flip();
  }

  css() {
    let css = super.css();

    if(this.p('color'))
      css += '; --color:' + this.p('color');
    if(this.p('image'))
      css += '; background-image: url("' + this.getImage() + '")';

    return css;
  }

  cssProperties() {
    const p = super.cssProperties();
    p.push('image', 'color', 'svgReplaces');
    return p;
  }

  flip(setFlip, faceCycle) {
    if(setFlip !== undefined && setFlip !== null)
      this.p('activeFace', setFlip);
    else {
      const fC = (faceCycle !== undefined && faceCycle !== null) ? faceCycle : this.p('faceCycle');
      if (fC == 'backward')
        this.p('activeFace', this.p('activeFace') == 0 ? this.p('faces').length-1 : this.p('activeFace') -1);
      else
        this.p('activeFace', Math.floor(this.p('activeFace') + (fC == 'random' ? Math.random()*99999 : 1)) % this.p('faces').length);
    }
  }

  getDefaultValue(property) {
    if(property == 'faces' || property == 'activeFace' || !this.p('faces') || !this.p('faces')[this.p('activeFace')])
      return super.getDefaultValue(property);
    const d = this.p('faces')[this.p('activeFace')][property];
    if(d !== undefined)
      return d;
    return super.getDefaultValue(property);
  }

  getImage() {
    if(!Object.keys(this.p('svgReplaces')).length)
      return this.p('image');

    const replaces = {};
    for(const key in this.p('svgReplaces'))
      replaces[key] = this.p(this.p('svgReplaces')[key]);
    return getSVG(this.p('image'), replaces, _=>this.domElement.style.cssText = this.css());
  }
}
