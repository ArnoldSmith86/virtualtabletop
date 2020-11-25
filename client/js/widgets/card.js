class Card extends Widget {
  constructor(id) {
    super(id);

    this.addDefaults({
      width: 103,
      height: 160,
      classes: 'widget card',

      activeFace: 0,
      enlarge: false,
      overlap: true,
      ignoreOnLeave: false,

      deck: null
    });

    this.deck = null;
  }

  applyDeltaToDOM(delta) {
    if(delta.deck !== undefined) {
      if(this.deck) {
        this.domElement.innerHTML = '';
        this.deck.removeCard(this);
      }
      if(delta.deck) {
        this.deck = widgets.get(delta.deck);
        this.deck.addCard(this);
        this.createFaces(this.deck.p('faceTemplates'));
      } else {
        this.deck = null;
      }
    }

    if(delta.deck !== undefined || delta.activeFace !== undefined) {
      for(let i=0; i<this.domElement.children.length; ++i) {
        if(i == this.p('activeFace'))
          this.domElement.children[i].classList.add('active');
        else
          this.domElement.children[i].classList.remove('active');
      }
    }

    super.applyDeltaToDOM(delta);
  }

  click() {
    this.flip();
  }

  createFaces(faceTemplates) {
    for(const face of faceTemplates) {
      const faceDiv = document.createElement('div');

      faceDiv.style.border = face.includeBorder ? '1px black solid' : 'none';
      faceDiv.style.borderRadius = face.includeRadius ? '8px' : '0';

      for(const object of face.objects) {
        const objectDiv = document.createElement('div');
        const value = object.valueType == 'static' ? object.value : this.p(object.value);
        const x = face.includeBorder ? object.x-1 : object.x;
        const y = face.includeBorder ? object.y-1 : object.y;
        objectDiv.style.cssText = `left: ${x}px; top: ${y}px; width: ${object.w}px; height: ${object.h}px; font-size: ${object.fontSize}px; text-align: ${object.textAlign}`;
        if(object.type == 'image') {
          objectDiv.style.backgroundImage = `url(${value})`;
          objectDiv.style.backgroundColor = object.color || 'white';
        } else {
          objectDiv.textContent = value;
          objectDiv.style.color = object.color;
        }
        faceDiv.appendChild(objectDiv);
      }
      this.domElement.appendChild(faceDiv);
    }
  }

  cssProperties() {
    const p = super.cssProperties();
    p.push('deck');
    return p;
  }

  flip(setFlip) {
    if(setFlip !== undefined && setFlip !== null)
      this.p('activeFace', setFlip);
    else
      this.p('activeFace', (this.p('activeFace') + 1) % this.deck.p('faceTemplates').length);
  }

  getDefaultValue(property) {
    if(this.deck) {
      const d = this.deck.cardPropertyGet(this.p('cardType'), property);
      if(d !== undefined)
        return d;
    }
    return super.getDefaultValue(property);
  }
}
