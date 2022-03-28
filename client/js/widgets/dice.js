class Dice extends Widget {
  constructor(id) {
    super(id);

    this.addDefaults({
      width: 50,
      height: 50,
      typeClasses: 'widget dice',
      classes: 'shaking',
      clickable: true,
      movable: false,

      borderRadius: '16%',
      pipColor: 'black',
      backgroundColor: 'white',

      options: [ 1, 2, 3, 4, 5, 6 ],
      activeFace: 0,
      rollCount: 0
    });
  }

  animate() {
    if(!this.facesElement || !this.activateAnimation)
      return;

    if(this.animateTimeout1)
      clearTimeout(this.animateTimeout1);
    if(this.animateTimeout2)
      clearTimeout(this.animateTimeout2);

    const faceElements = this.faceElements;

    this.facesElement.className = 'diceFaces animate1';

    for(const face of faceElements)
      face.classList.remove('animate1active', 'animate2active');
    faceElements[(this.get('rollCount')*997) % faceElements.length].classList.add('animate1active');
    faceElements[(this.get('rollCount')*887) % faceElements.length].classList.add('animate2active');

    this.animateTimeout1 = setTimeout(_=> {
      this.facesElement.className = 'diceFaces animate2';
    }, 100);
    this.animateTimeout2 = setTimeout(_=> {
      this.facesElement.className = 'diceFaces';
    }, 300);
  }

  applyDeltaToDOM(delta) {
    super.applyDeltaToDOM(delta);

    if(delta.options !== undefined)
      this.createChildNodes();

    if(delta.rollCount !== undefined)
      this.animate();

    if(delta.activeFace !== undefined) {
      if(this.activeFace !== undefined)
        this.activeFace.classList.remove('active');
      this.activeFace = this.faceElements[delta.activeFace];
      if(this.activeFace !== undefined)
        this.activeFace.classList.add('active');
    }
  }

  applyInitialDelta(delta) {
    super.applyInitialDelta(delta);
    this.activateAnimation = true;
  }

  async click(mode='respect') {
    if(!await super.click(mode)) {
      await this.set('activeFace', Math.floor(Math.random()*this.get('options').length));
      await this.set('rollCount', this.get('rollCount')+1);
    }
  }

  createChildNodes() {
    const childNodes = [...this.domElement.childNodes];
    this.domElement.innerHTML = '';

    this.facesElement = document.createElement('div');
    this.facesElement.className = 'diceFaces';

    this.faceElements = [];
    const options = this.get('options');
    for(const i in options) {
      const content = options[i];
      const face = document.createElement('div');
      if(typeof content == 'number' && content>=1 && content<=9) {
        face.textContent = `die_face_${content}`;
        face.className = 'dicePip';
      } else if(typeof content == 'string' && content.match(/^\/(assets|i)/)) {
        face.style.backgroundImage = `url("${mapAssetURLs(content)}")`;
      } else {
        face.textContent = content;
      }

      face.classList.add(`diceFace`);
      face.classList.add(`face${+i+1}`);
      this.facesElement.appendChild(face);
      this.faceElements.push(face);
    }

    this.domElement.appendChild(this.facesElement);

    for(const child of childNodes)
      if(child.classList.contains('widget'))
        this.domElement.appendChild(child);
  }

  css() {
    let css = super.css();

    css += '; --size:' + Math.min(this.get('width'), this.get('height')) + 'px';

    css += '; --pipColor:' + this.get('pipColor');
    css += '; --backgroundColor:' + this.get('backgroundColor');

    const xRotations = [ 0, 90,  0,   0, -90,   0 ];
    const yRotations = [ 0,  0, 90, -90,   0, 180 ];
    let i = this.get('activeFace');
    if(typeof i != 'number')
      i = 0;

    css += '; --rotX:' + (xRotations[i % 6] + this.get('rollCount')*360) + 'deg';
    css += '; --rotY:' + (yRotations[i % 6] + this.get('rollCount')*360) + 'deg';

    return css;
  }

  cssProperties() {
    const p = super.cssProperties();
    p.push('pipColor', 'backgroundColor', 'activeFace', 'rollCount');
    return p;
  }

  getDefaultValue(property) {
    if(property == 'value') {
      const activeFace = this.get('activeFace');
      const o = this.get('options');
      if(Array.isArray(o) && typeof activeFace == 'number' && o.length > activeFace)
        return o[activeFace];
    }
    return super.getDefaultValue(property);
  }

  set(property, value) {
    if(property == 'value' && value != null) {
      const o = this.get('options');
      if(Array.isArray(o) && o.indexOf(value) > -1 && this.getDefaultValue(property) != value)
        this.set('activeFace', o.indexOf(value));
    } else if(property == 'activeFace' && this.state['value'] != undefined) {
      this.set('value', null);
    }
    return super.set(property, value);
  }
}
