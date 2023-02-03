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
      borderColor: null,

      faces: [ 1, 2, 3, 4, 5, 6 ],
      activeFace: 0,
      rollCount: 0,

      rollTime: 800,
      swapTime: 500,

      image: null,
      text: null,
      pips: null,
      svgReplaces: null,
      faceCSS: null,

      pipSymbols: null,
      shape3d: false
    });
  }

  activeFace() {
    return mod(Math.round(this.get('activeFace')), this.faceElements.length) || 0;
  }

  animate() {
    if(!this.facesElement || !this.faceElements.length)
      return;

    const faceElements = this.faceElements;

    const hash = this.rollHash ? this.rollHash : 0;
    const fc = faceElements.length;
    const af = this.activeFace();
    const f0 = this.previousActiveFace;
    let f1 = (f0 + (hash) % (fc - 1) + 1) % fc || 0;
    if(f1 == f0)
      f1 = (f1 + 1) % fc;
    let f2 = (f1 + (hash >>> 14) % (fc - (f1 == af ? 1 : 2)) + 1) % fc || (f1 + 1) % fc;
    if(f2 == af)
      f2 = (f2 + 1) % fc;

    this.facesElement.className = `diceFaces shake${hash >>> 29}`;

    for(const face of faceElements)
      face.classList.remove('animate1active', 'animate2active');
    faceElements[f1].classList.add('animate1active');
    faceElements[f2].classList.add('animate2active');
  }

  animateProperties() {
    const rules = super.animateProperties();
    const swap = this.get('swapTime');
    const roll = this.get('rollTime');
    rules.unshift(
      { property: 'activeFace', duration: typeof swap == 'number'? swap : 1000},
      { property: 'rollCount', duration: typeof roll == 'number'? roll + 50 : 1000},
      { property: 'rollCount', className: 'animateBegin', duration: 50 }
    );
    return rules;
  }

  applyDeltaToDOM(delta) {
    const diceDelta = {};
    if(delta.activeFace !== undefined || delta.faces !== undefined) {
      const priorFace = this.previousActiveFaceProps;
      if(typeof priorFace == 'object' && priorFace != null) {
        for(const prop in priorFace) {
          if(Object.prototype.hasOwnProperty.call(priorFace, prop))
            diceDelta[prop] = null;
        }
      } else {
        diceDelta['value'] = null;
      }
    }
    Object.assign(diceDelta,delta);
    if(delta.activeFace !== undefined || delta.faces !== undefined) {
      const face = this.faces()[this.get('activeFace')];
      if(typeof face == 'object' && face != null)
        Object.assign(diceDelta,face);
      else
        diceDelta['value'] = face;
      this.previousActiveFaceProps = face;
    }
    delta = diceDelta;

    super.applyDeltaToDOM(delta);

    let childNodesWereRecreated = false;
    if([ 'faces', 'shape3d', 'pipSymbols', 'faceCSS', 'image', 'text', 'pips', 'svgReplaces' ].reduce((result,p)=>(result||delta[p]!==undefined),false)) {
      this.createChildNodes();
      childNodesWereRecreated = true;
    } else {
      let needsUpdate = false;
      for(const f of this.faces())
        if(typeof f == 'object' && f !== null && typeof f.svgReplaces == 'object' && f.svgReplaces !== null)
          for(const property of Object.values(f.svgReplaces))
            if(delta[property] !== undefined)
              needsUpdate = true;
      if(needsUpdate) {
        this.createChildNodes();
        childNodesWereRecreated = true;
      }
    }

    if(delta.rollCount !== undefined) {
      this.rollHash = funhash(this.get('id')+this.get('rollCount'));
      this.animate();
    }

    if(delta.rollCount !== undefined || delta.activeFace !== undefined || childNodesWereRecreated)
      this.threeDfaces();

    if(delta.activeFace !== undefined || childNodesWereRecreated) {
      if(this.activeFaceElement !== undefined) {
        this.activeFaceElement.classList.remove('active');
      }
      this.activeFaceElement = this.faceElements[this.activeFace()];
      if(this.activeFaceElement !== undefined)
        this.activeFaceElement.classList.add('active');
      this.previousActiveFace = this.activeFace();
    }
  }

  classes(includeTemporary=true) {
    let className = super.classes(includeTemporary);

    if(this.get('shape3d'))
      className += ` shape3D ${this.threeDshape().shapeName.split('-').map((s,i,a)=>a.slice(0,i+1).join('-')).join(' ')}`;

    return className;
  }

  classesProperties() {
    const p = super.classesProperties();
    p.push('shape3d', 'faces');
    return p;
  }

  async click(mode='respect') {
    if(!await super.click(mode)) {
      await this.set('activeFace', Math.floor(Math.random()*this.faces().length));
      await this.set('rollCount', this.get('rollCount')+1);
    }
  }

  createChildNodes() {
    const applySVGreplaces = (faceDOM, faceDefinition, image, svgReplaces) => {
      let imageResult = mapAssetURLs(image);

      if(typeof svgReplaces == 'object' && svgReplaces !== null) {
        const replaces = {};
        for(const key in svgReplaces)
          replaces[key] = this.getFaceProperty(faceDefinition, svgReplaces[key]);
        imageResult = getSVG(image, replaces, _=>faceDOM.style.backgroundImage = `url("${getSVG(image, replaces)}")`);
      }

      faceDOM.style.backgroundImage = `url("${imageResult}")`;
    }

    this.facesElement.innerHTML = '';

    this.faceElements = [];
    const faces = this.faces();
    const polygonBorder = document.createElement('span');
    polygonBorder.className = "polygonBorder";
    for(const i in faces) {
      const content = faces[i];
      const face = document.createElement('div');

      if(this.getFaceProperty(content, 'faceCSS'))
        face.style = mapAssetURLs(this.cssAsText(this.getFaceProperty(content, 'faceCSS'), null, true));

      if(typeof content == 'object' && content !== null) {
        let pips = this.getFaceProperty(content, 'pips');
        const text = this.getFaceProperty(content, 'text');
        if(pips == undefined && text == undefined && content.image == undefined && this.pipSymbols()) 
          pips = content.value;
        if(Number.isInteger(pips) && pips >= 1 && pips <= 9) {
          face.textContent = `die_face_${pips}`;
          face.className = 'dicePip';
        } else if(text != undefined) {
          face.textContent = text;
        } else if(content.value != undefined && content.image == undefined) {
          face.textContent = content.value; // don't inherit value from widget because it's only defined
        } else if(pips != undefined) {
          face.textContent = pips;
        }
        const image = this.getFaceProperty(content, 'image');
        if(image)
          applySVGreplaces(face, content, image, this.getFaceProperty(content, 'svgReplaces'));
      } else if(Number.isInteger(content) && content>=1 && content<=9 && this.pipSymbols()) {
        face.textContent = `die_face_${content}`;
        face.className = 'dicePip';
      } else if(typeof content == 'string' && content.match(/^\/(assets|i)/)) {
        applySVGreplaces(face, content, content, this.get('svgReplaces'));
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
    css += '; --borderColor:' + (this.get('borderColor') || this.get('pipColor'));
    css += '; --size:' + Math.min(this.get('width'), this.get('height')) + 'px';
    css += '; --rollTime:' + this.get('rollTime') + 'ms';
    css += '; --swapTime:' + this.get('swapTime') + 'ms';

    return css;
  }

  cssProperties() {
    const p = super.cssProperties();
    p.push('pipColor', 'backgroundColor', 'borderColor', 'rollTime', 'swapTime');
    return p;
  }

  faces() {
    const f = this.get('faces');
    if(typeof f == 'string')
      return f.split('');
    return Array.isArray(f) ? f : [];
  }

  getDefaultValue(property) {
    if(property == 'value') {
      const o = this.getValueMap();
      if(Array.isArray(o) && o.length > this.activeFace())
        return o[this.activeFace()];
    }
    if(property == 'faces' || property == 'activeFace' || !this.faces()[this.get('activeFace')])
      return super.getDefaultValue(property);
    const d = this.faces()[this.get('activeFace')][property];
    if(d !== undefined)
      return d;
    return super.getDefaultValue(property);
  }

  getFaceProperty(face, property) {
    if(typeof face == 'object' && face !== null && typeof face[property] != 'undefined')
      return face[property];
    return this.get(property);
  }

  getValueMap() {
    return this.faces().map(function(v,k) {
      if(typeof v != 'object' || v === null)
        return v;
      else if(typeof v.pips != 'undefined')
        return v.pips;
      else if(typeof v.value != 'undefined')
        return v.value;
      else if(typeof v.text != 'undefined')
        return v.text;
      else
        return k+1;
    });
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
      const o = this.getValueMap();
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
    const calculateFacesRotation = (elem) => {
      if(!(elem instanceof HTMLElement))
        return '';
      const m = new DOMMatrix(getComputedStyle(elem).transform).invertSelf();
      m.m41 = 0; m.m42 = 0; m.m43 = 0; m.m44 = 1; m.m14 = 0; m.m24 = 0; m.m34 = 0;
      return m.toString()
    }
    const hash = this.rollHash? this.rollHash : 0;
    const af = this.activeFace();
    const pf = this.previousActiveFace;
    const curRot = calculateFacesRotation(this.faceElements[af]);
    const preRot = calculateFacesRotation(this.faceElements[(pf!=undefined)?pf:af]);
    const theda = Math.PI * (hash >> 12)/2**19;
    const z = ((hash << 20) >> 20)/2**11;
    const r = Math.sqrt(1 - z**2);
    const rollRot = `rotate3d(${r*Math.cos(theda)}, ${r*Math.sin(theda)}, ${z}, 3turn)`;
    this.facesElement.style = `--curRot: ${curRot}; --preRot: ${preRot}; --rollRot: ${rollRot}`

    const n = s3d.sides;
    const fc = this.faceElements.length;
    for(var i = 0; i < fc; i++) {
      this.faceElements[i].classList.remove('extra3Dface');
    }
    if(this.faceElements.length > n) {
      const shift = Math.floor(32 / n);
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

  threeDshape() {
    const s3d = this.get('shape3d');
    if(!s3d)
      return null;
    const shapes = [
      {
        "shapeName": "d2",
        "sides": 2,
        "rollX": 2,
        "rollY": 3,
        "rollZ": 1
      },
      {
        "shapeName": "d2-flip",
        "sides": 2,
        "rollX": 3,
        "rollY": 0,
        "rollZ": 0
      },
      {
        "shapeName": "d4",
        "sides": 4,
        "rollX": 2,
        "rollY": 2,
        "rollZ": 2
      },
      {
        "shapeName": "d6",
        "sides": 6,
        "rollX": 2,
        "rollY": 2,
        "rollZ": 2
      },
      {
        "shapeName": "d8",
        "sides": 8,
        "rollX": 1,
        "rollY": 0,
        "rollZ": 2
      },
      {
        "shapeName": "d10",
        "sides": 10,
        "rollX": 1,
        "rollY": 0,
        "rollZ": 2
      },
      {
        "shapeName": "d12",
        "sides": 12,
        "rollX": 2,
        "rollY": 2,
        "rollZ": 2
      },
      {
        "shapeName": "d20",
        "sides": 20,
        "rollX": 1,
        "rollY": 1,
        "rollZ": 2
      }
    ];
    let shape = shapes.filter((s) => (s.shapeName == s3d || s.sides == s3d));
    if(shape.length)
      return shape[0];
    const n = this.faces().length || 0;
    return shapes.reverse().filter((s) => s.sides<=n)[0] || shapes[shapes.length - 1];
  }
}
