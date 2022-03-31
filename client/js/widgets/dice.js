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
      layer: 1,

      borderRadius: '16%',
      pipColor: 'black',
      backgroundColor: 'white',

      options: [ 1, 2, 3, 4, 5, 6 ],
      activeFace: 0,
      rollCount: 0,

      pipSymbols: true,
      shape3d: false
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

    if(delta.options !== undefined || delta.pipSymbols !== undefined)
      this.createChildNodes();

    if(delta.rollCount !== undefined) {
      this.rollHash = funhash(this.get('id')+this.get('rollCount'));
      this.animate();
    }

    if(delta.activeFace !== undefined || delta.options !== undefined || delta.pipSymbols !== undefined) {
      if(this.activeFaceElement !== undefined) {
        this.activeFaceElement.classList.remove('active');
      }
      this.activeFaceElement = this.faceElements[this.activeFace()];
      if(this.activeFaceElement !== undefined)
        this.activeFaceElement.classList.add('active');
      this.previousActiveFace = this.activeFace();
    }
    if(delta.rollCount !== undefined || delta.activeFace !== undefined || delta.options !== undefined || delta.shape3d !== undefined)
      this.threeDfaces();
  }

  applyInitialDelta(delta) {
    super.applyInitialDelta(delta);
    this.activateAnimation = true;
  }

  classes() {
    let className = super.classes();

    if(this.get('shape3d'))
      className += ` shape3D d${this.threeDshape()}`;

    return className;
  }

  classesProperties() {
    const p = super.classesProperties();
    p.push('shape3d');
    return p;
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
      if(typeof content == 'number' && content>=1 && content<=9 && this.get('pipSymbols')) {
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

    if(this.get('shape3d'))
      css += this.threeDrotationsCSS();

    return css;
  }

  cssProperties() {
    const p = super.cssProperties();
    p.push('pipColor', 'backgroundColor', 'activeFace', 'rollCount', 'shape3d');
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

  threeDfaces() {
    if(!this.get('shape3d'))
      return;
    const n = this.threeDshape();
    if(this.faceElements.length > n) {
      const shift = Math.floor(32 / n);
      const fc = this.faceElements.length;
      const af = this.activeFace();
      const hash = this.rollHash? this.rollHash : 0;
      for(var side = 0; side < n && side < (fc - n); side++) {
        const facesOnSide = Math.floor((fc - 1 - side) / n ) + 1;
        const visibleFace = (side == af % n) ? af :
          n * ((hash >>> (side*shift)) % facesOnSide) + side;
        for(var i = side; i < fc; i += n ) {
          if(i == visibleFace)
            this.faceElements[i].classList.remove('extra3Dface');
          else
            this.faceElements[i].classList.add('extra3Dface');
        }
      }
    }
  }

  threeDrotationsCSS() {
    const rotations = {
      2: {
        x: [ 0 ],
        y: [ 0, 180 ],
        z: [ 0 ]
      },
      4: {
        x: [ -109.5, -109.5, -109.5, 0 ],
        y: [    0 ],
        z: [   60,    -60,    180,   0 ]
      },
      6: {
        x: [ 0, 90,  0,   0, -90,   0 ],
        y: [ 0,  0, 90, -90,   0, 180 ],
        z: [ 0 ]
      }
    };
    const shape = this.threeDshape();
    const af = this.activeFace();
    const rc = this.get('rollCount');
    const xRot = rotations[shape].x;
    const yRot = rotations[shape].y;
    const zRot = rotations[shape].z;

    let css = '';
    css += `; --rotX:${xRot[af % xRot.length] + rc * 360}deg`;
    css += `; --rotY:${yRot[af % yRot.length] + rc * 360}deg`;
    css += `; --rotZ:${zRot[af % zRot.length] + rc * 360}deg`;

    return css;
  }

  threeDshape() {
    const shapes = [2, 4, 6];
    let s3d = this.get('shape3d');
    if(shapes.indexOf(s3d) > -1)
      return s3d;
    const o = this.get('options').length || 0;
    return shapes.filter((v) => v>=o)[0] || shapes[shapes.length - 1];
  }
}
