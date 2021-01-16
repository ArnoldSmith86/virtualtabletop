class Card extends Widget {
  constructor(id) {
    super(id);

    this.addDefaults({
      width: 103,
      height: 160,
      typeClasses: 'widget card',

      faceCycle: 'ordered',
      activeFace: 0,

      deck: null,
      cardType: null
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

  applyInitialDelta(delta) {
    if(!delta.deck)
      throw `card ${delta.id} requires property deck`;
    if(!delta.cardType)
      throw `card ${delta.id} requires property cardType`;
    if(!widgets.get(delta.deck).p('cardTypes')[delta.cardType])
      throw `card type "${delta.cardType}" not found in deck "${delta.deck}"`;
    super.applyInitialDelta(delta);
  }

  click() {
    this.flip();
  }

  createFaces(faceTemplates) {
    for(const face of faceTemplates) {
      const faceDiv = document.createElement('div');

      if (face.css !== undefined) {
        faceDiv.style.cssText = face.css;
      }
      faceDiv.style.border = face.border ? face.border + 'px black solid' : 'none';
      faceDiv.style.borderRadius = face.radius ? face.radius + 'px' : '0';

      for(const object of face.objects) {
        const objectDiv = document.createElement('div');
        const value = object.valueType == 'static' ? object.value : this.p(object.value);
        const x = face.border ? object.x-face.border : object.x;
        const y = face.border ? object.y-face.border : object.y;
        let css = object.css ? object.css + '; ' : '';
        css += `left: ${x}px; top: ${y}px; width: ${object.width}px; height: ${object.height}px; font-size: ${object.fontSize}px; text-align: ${object.textAlign}`;
        if (object.rotation !== undefined) {
          css += '; transform: rotate(${object.rotation}deg)';
        }
        objectDiv.style.cssText = css
        if(object.type == 'image') {
          if(value)
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
      this.p('activeFace', Math.floor(this.p('activeFace') + (this.p('faceCycle') == 'random' ? Math.random()*99999 : 1)) % this.deck.p('faceTemplates').length);
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
