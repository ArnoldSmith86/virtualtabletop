import { contrastAnyColor } from '../color.js';

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
      color: 'white',
      pipColor: null,
      borderColor: null,

      faces: [ 1, 2, 3, 4, 5, 6 ],
      activeFace: 0,
      rollCount: 0,

      rollTime: 800,
      swapTime: 500,

      image: null,
      imageScale: 0.8,
      text: null,
      pips: null,
      svgReplaces: null,
      faceCSS: null,

      pipSymbols: null,
      shape3d: false
    });
  }

  activeFace() {
    const af = Math.round(this.get('activeFace',{ignoreFaceProperties:true})) || 0;
    const fc = this.faces().length;
    return (af % fc + fc) % fc;
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
      { property: 'activeFace', duration: typeof swap == 'number'? swap + 50 : 1000},
      { property: 'rollCount', duration: typeof roll == 'number'? roll + 50 : 1000},
      { property: 'activeFace', className: 'animateBegin', duration: 50 },
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
        diceDelta.value = null;
      }
    }
    Object.assign(diceDelta,delta);
    if(delta.activeFace !== undefined || delta.faces !== undefined) {
      const face = this.faces()[this.activeFace()];
      if(typeof face == 'object' && face != null)
        Object.assign(diceDelta,face);
      else
        diceDelta.value = face;
      this.previousActiveFaceProps = face;
    }

    super.applyDeltaToDOM(diceDelta);

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

      const sR = this.get('svgReplaces');
      if(typeof sR == 'object' && sR !== null)
        for(const property of Object.values(sR))
          if(delta[property] !== undefined)
            needsUpdate = true;

      if(needsUpdate) {
        this.createChildNodes();
        childNodesWereRecreated = true;
      }
    }

    if(delta.rollCount !== undefined) {
      this.rollHash = funhash(this.get('id',{ignoreFaceProperties:true})+this.get('rollCount',{ignoreFaceProperties:true}));
      this.animate();
    }

    if(diceDelta.rollCount !== undefined || delta.activeFace !== undefined || childNodesWereRecreated)
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
      await this.set('activeFace', Math.floor(rand()*this.faces().length));
      await this.set('rollCount', this.get('rollCount',{ignoreFaceProperties:true})+1);
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
      let content = faces[i];
      const face = document.createElement('div');

      if(typeof content != 'object' || content == null) {
        if(typeof content == 'string' && content.match(/^\/(assets|i)/))
          content = {image:content};
        else
          content = {value:content};
      }

      let faceCSS = this.getFaceProperty(content, 'faceCSS');
      faceCSS = faceCSS ? mapAssetURLs(this.cssAsText(faceCSS, null, true)) : '';
      faceCSS += this.faceCssVariables(prop=>content[prop]);
      if(faceCSS !='')
        face.style = faceCSS;

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

      face.appendChild(polygonBorder.cloneNode(true));
      face.appendChild(polygonBorder.cloneNode(true));

      face.classList.add(`diceFace`);
      face.classList.add(`face${+i+1}`);
      this.facesElement.appendChild(face);
      this.faceElements.push(face);
    }

    if(faces.length <= this.previousActiveFace)
      this.previousActiveFace = faces.length - 1;
  }

  css() {
    let css = super.css();

    css += this.faceCssVariables((prop)=>this.get(prop,{ignoreFaceProperties:true}));
    css += '; --size:' + Math.min(this.get('width'), this.get('height')) + 'px';
    css += '; --rollTime:' + this.get('rollTime') + 'ms';
    css += '; --swapTime:' + this.get('swapTime') + 'ms';

    return css;
  }

  cssProperties() {
    const p = super.cssProperties();
    p.push('pipColor', 'color', 'borderColor', 'imageScale', 'rollTime', 'swapTime');
    return p;
  }

  faceCssVariables(getFunction) {
    let css = '';
    ['color','pipColor','borderColor','imageScale'].forEach(prop=>{
      const value = getFunction(prop);
      if(value)
        if(prop == 'color') {
          css += `; --backgroundColor:${value}`;
          if(!getFunction('pipColor') && !this.get('pipColor',{ignoreFaceProperties:true}))
            css += `; --pipColor:${contrastAnyColor(value, 1)}`;
        } else {
          css += `; --${prop}:${value}`;
        }
    });
    return css;
  }

  faces() {
    const f = this.get('faces',{ignoreFaceProperties:true});
    if(typeof f == 'string')
      return f.split('');
    return Array.isArray(f) ? f : [];
  }

  get(property, options) {
    if(property !='faces' && property !='activeFace' && (typeof options != 'object' || options == null || !options.ignoreFaceProperties) ) {
      if(property == 'value') {
        const o = this.getValueMap();
        if(Array.isArray(o) && o.length > this.activeFace())
          return o[this.activeFace()];
      }
      const faceProps = this.faces()[this.activeFace()];
      if(typeof faceProps == 'object' && Object.hasOwnProperty(faceProps, property))
        return faceProps[property];
    }
    return super.get(property);
  }

  getFaceCount() {
    return this.faces().length || 1;
  }

  getFaceProperty(face, property) {
    if(typeof face == 'object' && face !== null && typeof face[property] != 'undefined')
      return face[property];
    return this.get(property, {ignoreFaceProperties:true});
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
    function rotationMatrix(elem) {
      if(!(elem instanceof HTMLElement))
        return new DOMMatrix();
      const R = new DOMMatrix(getComputedStyle(elem).transform);
      // assumes no scale or skew transformations
      R.m14 = 0; R.m24 = 0; R.m34 = 0; R.m41 = 0; R.m42 = 0; R.m43 = 0; R.m44 = 1;
      return R
    }
    function axisAngle(matrix) {
      if(!(matrix instanceof DOMMatrix))
        return '';
      const M = matrix.toFloat64Array();
      const Q = [M.slice(0,3),M.slice(4,7),M.slice(8,11)];
      let l = Q.map(v=>Math.sqrt(v.reduce((p,c)=>p+c**2,0)));
      if(l.indexOf(0) != -1)
        return '';
      Q.forEach((v,i)=>v.forEach(c=>c/l[i]));
      //compute quarternion
      const t = Q[0][0] + Q[1][1] + Q[2][2];
      let r, s, w, x, y, z;
      if(1+t > .001) {
        r = Math.sqrt(1 + t);
        s = .5 / r;
        w = .5 * r;
        x = (Q[1][2] - Q[2][1]) * s;
        y = (Q[2][0] - Q[0][2]) * s;
        z = (Q[0][1] - Q[1][0]) * s;
      } else if (Q[0][0] > Q[1][1] && Q[0][0] > Q[2][2]) {
        r = Math.sqrt(1 + Q[0][0] - Q[1][1] - Q[2][2]);
        s = .5 / r;
        x = .5 * r;
        y = (Q[1][0] + Q[0][1]) * s;
        z = (Q[2][0] + Q[0][2]) * s;
        w = (Q[1][2] - Q[2][1]) * s;
      } else if (Q[1][1] > Q[2][2]) {
        r = Math.sqrt(1 - Q[0][0] + Q[1][1] - Q[2][2]);
        s = .5 / r;
        x = (Q[0][1] + Q[1][0]) * s;
        y = .5 * r;
        z = (Q[2][1] + Q[1][2]) * s;
        w = (Q[2][0] - Q[0][2]) * s;
      } else {
        r = Math.sqrt(1 - Q[0][0] - Q[1][1] + Q[2][2]);
        s = .5 / r;
        x = (Q[0][2] + Q[2][0]) * s;
        y = (Q[1][2] + Q[2][1]) * s;
        z = .5 * r;
        w = (Q[0][1] - Q[1][0]) * s;
      }
      if(w<0)
        w = -w; x=-x; y=-y; z=-z;
      return `rotate3d(${x},${y},${z},${Math.acos(w)*-2}rad)`;
    }
    const hash = this.rollHash? this.rollHash : 0;
    const af = this.activeFace();
    const afRot = rotationMatrix(this.faceElements[af]);
    const pf = this.previousActiveFace;
    const pfRot = rotationMatrix(this.faceElements[pf]);
    const curRot = axisAngle(afRot.inverse());
    const transRot = axisAngle(afRot.multiply(pfRot.inverse()));
    const theda = Math.PI * (hash >> 12)/2**19;
    const z = ((hash << 20) >> 20)/2**11;
    const r = Math.sqrt(1 - z**2);
    const rollRot = `rotate3d(${r*Math.cos(theda)}, ${r*Math.sin(theda)}, ${z}, 3turn)`;
    this.facesElement.style = `--curRot: ${curRot}; --transRot: ${transRot}; --rollRot: ${rollRot}`

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
