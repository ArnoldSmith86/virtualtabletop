class Dice extends Widget {
  constructor(id) {
    super(id);

    this.facesElement = document.createElement('div');
    this.facesElement.className = 'diceFaces';

    this.domElement.appendChild(this.facesElement);

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

      pipSymbols: null,
      shape3d: false
    });
  }

  activeFace() {
    return mod(Math.round(this.get('activeFace')), this.faceElements.length) || 0;
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

    if(delta.options !== undefined || delta.shape3d !== undefined || delta.pipSymbols !== undefined)
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
    if(delta.rollCount !== undefined || delta.activeFace !== undefined || delta.options !== undefined || delta.shape3d !== undefined || delta.pipSymbols !== undefined)
      this.threeDfaces();
  }

  applyInitialDelta(delta) {
    super.applyInitialDelta(delta);
    this.activateAnimation = true;
  }

  classes() {
    let className = super.classes();

    if(this.get('shape3d'))
      className += ` shape3D ${this.threeDshape().shapeName.split('-').map((s,i,a)=>a.slice(0,i+1).join('-')).join(' ')}`;

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
    this.facesElement.innerHTML = '';

    this.faceElements = [];
    const options = this.get('options');
    const polygonBorder = document.createElement('span');
    polygonBorder.className = "polygonBorder";
    for(const i in options) {
      const content = options[i];
      const face = document.createElement('div');
      if(typeof content == 'number' && content>=1 && content<=9 && this.pipSymbols()) {
        face.textContent = `die_face_${content}`;
        face.className = 'dicePip';
      } else if(typeof content == 'string' && content.match(/^\/(assets|i)/)) {
        face.style.backgroundImage = `url("${mapAssetURLs(content)}")`;
      } else {
        face.textContent = content;
      }
      face.appendChild(polygonBorder.cloneNode(true));
      face.appendChild(polygonBorder.cloneNode(true));

      face.classList.add(`diceFace`);
      face.classList.add(`face${+i+1}`);
      this.facesElement.appendChild(face);
      this.faceElements.push(face);
    }
  }

  css() {
    let css = super.css();

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

  pipSymbols() {
    const pipSymb = this.get('pipSymbols');
    if(pipSymb != null)
      return pipSymb;
    const shape = this.threeDshape();
    return (shape == null || shape.shapeName == 'd6');      
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
    const s3d = this.threeDshape();
    if(!s3d)
      return;
    const n = s3d.sides;
    const fc = this.faceElements.length;
    for(var i = 0; i < fc; i++) {
      this.faceElements[i].classList.remove('extra3Dface');
    }
    if(this.faceElements.length > n) {
      const shift = Math.floor(32 / n);
      const af = this.activeFace();
      const hash = this.rollHash? this.rollHash : 0;
      for(var side = 0; side < n && side < (fc - n); side++) {
        const facesOnSide = Math.floor((fc - 1 - side) / n ) + 1;
        const visibleFace = (side == af % n) ? af :
          n * ((hash >>> (side*shift)) % facesOnSide) + side;
        for(var i = side; i < fc; i += n ) {
          if(i != visibleFace)
            this.faceElements[i].classList.add('extra3Dface');
        }
      }
    }
  }

  threeDrotationsCSS() {
    const s3d = this.threeDshape();
    const af = this.activeFace();
    const rc = this.get('rollCount');
    const xRot = s3d.faceX;
    const yRot = s3d.faceY;
    const zRot = s3d.faceZ;

    let css = '';
    css += `; --rotX:${xRot[af % xRot.length] + s3d.rollX * rc * 360}deg`;
    css += `; --rotY:${yRot[af % yRot.length] + s3d.rollY * rc * 360}deg`;
    css += `; --rotZ:${zRot[af % zRot.length] + s3d.rollZ * rc * 360}deg`;

    return css;
  }

  threeDshape() {
    const s3d = this.get('shape3d');
    if(!s3d)
      return null;
    const shapes = [
      {
        "shapeName": "d2",
        "sides": 2,
        "faceX": [ 0 ],
        "faceY": [ 0, 180 ],
        "faceZ": [ 0 ],
        "rollX": 2,
        "rollY": 3,
        "rollZ": 1
      },
      {
        "shapeName": "d2-flip",
        "sides": 2,
        "faceX": [ 0, 180 ],
        "faceY": [ 0 ],
        "faceZ": [ 0 ],
        "rollX": 3,
        "rollY": 0,
        "rollZ": 0
      },
      {
        "shapeName": "d4",
        "sides": 4,
        "faceX": [ -109.5, -109.5, -109.5, 0 ],
        "faceY": [  0 ],
        "faceZ": [     300,    180,  60, 0 ],
        "rollX": 2,
        "rollY": 2,
        "rollZ": 2
      },
      {
        "shapeName": "d6",
        "sides": 6,
        "faceX": [ 0, 90,  90,  90, 90,   180 ],
        "faceY": [ 0,  0,  0, 0,  0, 0 ],
        "faceZ": [ 0,  0, 90,  -90,  -180,   -180 ],
        "rollX": 2,
        "rollY": 2,
        "rollZ": 2
      },
      {
        "shapeName": "d8",
        "sides": 8,
        "faceX": [ 54.7, -125.3 ],
        "faceY": [ 0 ],
        "faceZ": [ 45, -45, 225, 135, 135, 225, 315, 405 ],
        "rollX": 1,
        "rollY": 0,
        "rollZ": 2
      },
      {
        "shapeName": "d10",
        "sides": 10,
        "faceX": [ 65, -115 ],
        "faceY": [ 0 ],
        "faceZ": [ 0, -72, -144, -216, -288, -288, -216, -144, -72, 0 ],
        "rollX": 1,
        "rollY": 0,
        "rollZ": 2
      },
      {
        "shapeName": "d12",
        "sides": 12,
        "faceX": [    0, 116.5650512, -63.43494882, 116.5650512, -63.43494882, 116.5650512, 
           -63.43494882, 116.5650512, -63.43494882, 116.5650512, -63.43494882, -180 ],
        "faceY": [ 0 ],
        "faceZ": [     0,    -180,     -108,      -36,       36,     108,
                       108,    36,      -36,       -108,     -180,     0 ],
        "rollX": 2,
        "rollY": 2,
        "rollZ": 2
      },
      {
        "shapeName": "d20",
        "sides": 20,
        "faceX": [ 37.37736814, 100.812317, -79.18768304, -142.6226319 ],
        "faceY": [ 0 ],
        "faceZ": [ -144, 108, 180, 72, 144, 36, 108, 0, 72, -36,
                   36, -72, 0, -108, -36, -144, -72, 180, -108, 144 ],
        "rollX": 1,
        "rollY": 1,
        "rollZ": 2
      }
    ];
    let shape = shapes.filter((s) => (s.shapeName == s3d || s.sides == s3d));
    if(shape.length)
      return shape[0];
    const n = this.get('options').length || 0;
    return shapes.filter((s) => s.sides>=n)[0] || shapes[shapes.length - 1];
  }
}
