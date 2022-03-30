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

  activeFace() {
    return Math.abs(Math.round(this.get('activeFace')) || 0);
  }

  animate() {
    if(!this.facesElement || !this.activateAnimation)
      return;

    if(this.animateTimeout1)
      clearTimeout(this.animateTimeout1);
    if(this.animateTimeout2)
      clearTimeout(this.animateTimeout2);

    const faceElements = this.faceElements;

    const hash = this.rollHash ? this.rollHash : 0;
    const fc = faceElements.length? faceElements.length : 1;
    const af = this.activeFace();
    const f0 = this.previousActiveFace;
    let f1 = (f0 + (hash) % (fc - 1) + 1) % fc || 0;
    if(f1 == f0)
      f1 = (f1 + 1) % fc;
    let f2 = (f1 + (hash >>> 14) % (fc - (f1 == af ? 1 : 2)) + 1) % fc || (f1 + 1) % fc;
    if(f2 == af)
      f2 = (f2 + 1) % fc;

    this.facesElement.className = `diceFaces animate animateBegin shake${hash >>> 29}`;

    for(const face of faceElements)
      face.classList.remove('animate1active', 'animate2active');
    faceElements[f1].classList.add('animate1active');
    faceElements[f2].classList.add('animate2active');

    this.animateTimeout1 = setTimeout(_=> {
      this.facesElement.classList.remove('animateBegin');
    }, 50);
    this.animateTimeout2 = setTimeout(_=> {
      this.facesElement.className = 'diceFaces';
    }, 1000);
  }

  applyDeltaToDOM(delta) {
    super.applyDeltaToDOM(delta);

    if(delta.options !== undefined)
      this.createChildNodes();

    if(delta.rollCount !== undefined) {
      this.rollHash = funhash(this.get('id')+this.get('rollCount'));
      this.animate();
    }

    if(delta.activeFace !== undefined) {
      if(this.activeFaceElement !== undefined) {
        this.activeFaceElement.classList.remove('active');
      }
      this.activeFaceElement = this.faceElements[this.activeFace()];
      if(this.activeFaceElement !== undefined)
        this.activeFaceElement.classList.add('active');
      this.previousActiveFace = this.activeFace();
    }
    if(delta.rollCount !== undefined || delta.activeFace !== undefined || delta.options !== undefined)
      this.threeDFaces();
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

    if(this.get('classes') == 'd6') {
      const xRotations = [ 0, 90,  0,   0, -90,   0 ];
      const yRotations = [ 0,  0, 90, -90,   0, 180 ];

      css += '; --rotX:' + (xRotations[this.activeFace() % 6] + this.get('rollCount')*360) + 'deg';
      css += '; --rotY:' + (yRotations[this.activeFace() % 6] + this.get('rollCount')*360) + 'deg';
    } else {
      const xRotations = [ 0,   0 ];
      const yRotations = [ 0, 180 ];

      css += '; --rotX:' + (xRotations[this.activeFace() % 2] + this.get('rollCount')*360) + 'deg';
      css += '; --rotY:' + (yRotations[this.activeFace() % 2] + this.get('rollCount')*360) + 'deg';
    }

    return css;
  }

  cssProperties() {
    const p = super.cssProperties();
    p.push('pipColor', 'backgroundColor', 'activeFace', 'rollCount');
    return p;
  }

  getDefaultValue(property) {
    if(property == 'value') {
      const o = this.get('options');
      if(Array.isArray(o) && o.length > this.activeFace())
        return o[this.activeFace()];
    }
    return super.getDefaultValue(property);
  }

  async set(property, value) {
    if(property == 'value' && value != null) {
      const o = this.get('options');
      if(Array.isArray(o) && o.indexOf(value) > -1 && this.getDefaultValue(property) != value)
        await this.set('activeFace', o.indexOf(value));
    } else if(property == 'activeFace' && this.state['value'] != undefined) {
      await this.set('value', null);
    }
    return await super.set(property, value);
  }

  threeDFaces() {
    if(this.faceElements.length > 6) {
      const fc = this.faceElements.length;
      const af = this.activeFace();
      const hash = this.rollHash? this.rollHash : 0;
      for(var side = 0; side < 6 && side < (fc - 6); side++) {
        const facesOnSide = Math.floor((fc - 1 - side) / 6 ) + 1;
        const visibleFace = (side == af % 6) ? af :
          6 * ((hash >>> (side*5)) % facesOnSide) + side;
        for(var i = side; i < fc; i += 6 ) {
          if(i == visibleFace)
            this.faceElements[i].classList.remove('moreThanSix');
          else
            this.faceElements[i].classList.add('moreThanSix');
        }
      }
    }
  }
}
