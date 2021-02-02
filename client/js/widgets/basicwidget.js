import { Widget } from './widget';

class BasicWidget extends Widget {
  constructor(id) {
    super(id);

    this.addDefaults({
      typeClasses: 'widget basic',

      faces: [ {} ],
      faceCycle: 'ordered',
      activeFace: 0,

      image: '',
      color: 'black',
      layer: 1,
      text: ''
    });
  }

  applyDeltaToDOM(delta) {
    super.applyDeltaToDOM(delta);
    if(delta.activeFace !== undefined || delta.faces !== undefined)
      this.applyDelta(this.p('faces')[this.p('activeFace')]);
    if(delta.text !== undefined)
      this.domElement.textContent = delta.text;
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

  click() {
    if(!super.click())
      this.flip();
  }

  css() {
    let css = super.css();

    if(this.p('color'))
      css += '; --color:' + this.p('color');
    if(this.p('image'))
      css += '; background-image: url("' + this.p('image') + '")';

    return css;
  }

  cssProperties() {
    const p = super.cssProperties();
    p.push('color');
    p.push('image');
    return p;
  }

  flip(setFlip) {
    if(setFlip !== undefined && setFlip !== null)
      this.p('activeFace', setFlip);
    else
      this.p('activeFace', Math.floor(this.p('activeFace') + (this.p('faceCycle') == 'random' ? Math.random()*99999 : 1)) % this.p('faces').length);
  }

  getDefaultValue(property) {
    if(property == 'faces' || property == 'activeFace' || !this.p('faces') || !this.p('faces')[this.p('activeFace')])
      return super.getDefaultValue(property);
    const d = this.p('faces')[this.p('activeFace')][property];
    if(d !== undefined)
      return d;
    return super.getDefaultValue(property);
  }
}
