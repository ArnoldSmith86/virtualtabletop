class Dice extends Widget {
  constructor(id) {
    super(id);

    this.addDefaults({
      width: 50,
      height: 50,
      typeClasses: 'widget dice',
      clickable: true,

      borderRadius: 8,

      options: [ 1, 2, 3, 4, 5, 6 ],
      value: 1,
      angle: 0
    });
    this.faceElements = {};
  }

  applyDeltaToDOM(delta) {
    super.applyDeltaToDOM(delta);

    if(delta.options !== undefined)
      this.createChildNodes();

    if(delta.value !== undefined) {
      if(this.activeFace !== undefined)
        this.activeFace.classList.remove('active');
      this.activeFace = this.faceElements[delta.value];
      if(this.activeFace !== undefined)
        this.activeFace.classList.add('active');
    }
  }

  async click(mode='respect') {
    if(!await super.click(mode)) {
      const o = this.get('options');
      await this.set('value', o[Math.floor(Math.random()*o.length)]);
    }
  }

  createChildNodes() {
    const childNodes = [...this.domElement.childNodes];
    this.domElement.innerHTML = '';

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

      face.classList.add('diceFace');
      this.domElement.appendChild(face);
      this.faceElements[content] = face;
    }

    for(const child of childNodes)
      if(String(child.className).match(/widget/))
        this.domElement.appendChild(child);
  }
}
