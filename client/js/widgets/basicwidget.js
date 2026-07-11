class BasicWidget extends ImageWidget {
  constructor(id) {
    super(id);

    this.addDefaults({
      typeClasses: 'widget basic',

      faces: [ {} ],
      faceCycle: 'forward',
      activeFace: 0,

      color: 'black',
      layer: 1,
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
    if(delta.html !== undefined || delta.text !== undefined || delta.icon !== undefined || this.getWithPropertyReplacements_checkDelta('html', delta)) {
      const childNodes = [...this.domElement.childNodes];
      this.domElement.innerHTML = '';
      if(this.get('html') === null) {
        setText(this.domElement, this.get('icon') ? '' : this.get('text'));
      } else {
        this.domElement.innerHTML = DOMPurify.sanitize(mapAssetURLs(this.getWithPropertyReplacements('html')), { USE_PROFILES: { html: true } });
      }
      for(const child of childNodes)
        if(String(child.className).match(/widget|symbolOuterWrapper/))
          this.domElement.appendChild(child);
    }
    if(delta.color !== undefined)
      this.updateIcon();
  }

  classes(includeTemporary = true) {
    let classes = super.classes(includeTemporary);
    if(this.get('html'))
      classes += ' usesHTML';
    return classes;
  }

  classesProperties() {
    const p = super.classesProperties();
    p.push('html');
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

    return css;
  }

  cssProperties() {
    const p = super.cssProperties();
    p.push('color');
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

  getDefaultIconColor() {
    return this.get('color');
  }

  getFaceCount() {
    return this.faces().length || 1;
  }
}
