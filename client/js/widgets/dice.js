class Dice extends Widget {
  constructor(id) {
    super(id);

    this.addDefaults({
      width: 50,
      height: 50,
      typeClasses: 'widget dice',
      clickable: true,
      movable: false,

      borderRadius: '16%',

      options: [ 1, 2, 3, 4, 5, 6 ],
      value: 1,
      rollCount: 0
    });
    this.faceElements = {};
  }

  animate() {
    if(!this.facesElement || !this.activateAnimation)
      return;

    if(this.animateTimeout1)
      clearTimeout(this.animateTimeout1);
    if(this.animateTimeout2)
      clearTimeout(this.animateTimeout2);
    if(this.animateTimeout3)
      clearTimeout(this.animateTimeout3);

    this.facesElement.className = 'diceFaces animate1';

    this.animateTimeout1 = setTimeout(_=> {
      this.facesElement.className = 'diceFaces animate2';
    }, 100);
    this.animateTimeout3 = setTimeout(_=> {
      this.facesElement.className = 'diceFaces';
    }, 300);
  }

  applyDeltaToDOM(delta) {
    super.applyDeltaToDOM(delta);

    if(delta.options !== undefined)
      this.createChildNodes();

    if(delta.rollCount !== undefined)
      this.animate();

    if(delta.value !== undefined) {
      if(this.activeFace !== undefined)
        this.activeFace.classList.remove('active');
      this.activeFace = this.faceElements[delta.value];
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
      const o = this.get('options');
      await this.set('value', o[Math.floor(Math.random()*o.length)]);
      await this.set('rollCount', this.get('rollCount')+1);
    }
  }

  createChildNodes() {
    const childNodes = [...this.domElement.childNodes];
    this.domElement.innerHTML = '';

    this.facesElement = document.createElement('div');
    this.facesElement.className = 'diceFaces';

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
      this.faceElements[content] = face;
    }

    this.domElement.appendChild(this.facesElement);

    for(const child of childNodes)
      if(String(child.className).match(/widget/))
        this.domElement.appendChild(child);
  }

  css() {
    let css = super.css();

    css += '; --fontSize:' + Math.min(this.get('width'), this.get('height')) + 'px';

    return css;
  }
}
