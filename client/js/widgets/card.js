class Card extends Widget {
  constructor(id) {
    super(id);

    this.addDefaults({
      width: 103,
      height: 160,
      typeClasses: 'widget card',
      clickable: true,

      faceCycle: 'forward',
      activeFace: 0,

      deck: null,
      cardType: null,
      onPileCreation: {}
    });

    this.deck = null;
  }

  applyDeltaToDOM(delta) {
    if(delta.deck !== undefined) {
      const childNodes = [...this.domElement.childNodes];
      if(this.deck) {
        this.domElement.innerHTML = '';
        this.deck.removeCard(this);
      }
      if(delta.deck) {
        this.deck = widgets.get(delta.deck);
        this.deck.addCard(this);
        this.createFaces(this.deck.get('faceTemplates'));
      } else {
        this.deck = null;
      }
      for(const child of childNodes)
        if(!child.className.match(/cardFace/))
          this.domElement.appendChild(child);
    }

    if(delta.cardType !== undefined && this.deck) {
      const applyForCardType = {};
      for(const [ k, v ] of Object.entries(this.deck.get('cardTypes')[this.get('cardType')] || {}))
        if(this.state[k] === undefined)
          applyForCardType[k] = v;
      this.applyDeltaToDOM(applyForCardType);
    }

    if(delta.deck !== undefined || delta.activeFace !== undefined) {
      for(let i=0; i<this.domElement.children.length; ++i) {
        if(i == this.get('activeFace'))
          this.domElement.children[i].classList.add('active');
        else
          this.domElement.children[i].classList.remove('active');
      }
    }

    if(this.dynamicProperties)
      for(const p in delta)
        for(const callback of (this.dynamicProperties[p] || []))
          callback();

    super.applyDeltaToDOM(delta);
  }

  applyInitialDelta(delta) {
    if(!delta.deck)
      throw `card "${delta.id}" requires property deck`;
    if(!delta.cardType)
      throw `card "${delta.id}" requires property cardType`;
    if(!(widgets.get(delta.deck) instanceof Deck))
      throw `card "${delta.id}" has "${delta.deck}" as a deck which is not a deck`;
    if(!widgets.get(delta.deck).get('cardTypes')[delta.cardType])
      throw `card type "${delta.cardType}" not found in deck "${delta.deck}"`;
    super.applyInitialDelta(delta);
  }

  async click(mode='respect') {
    if(!await super.click(mode))
      await this.flip();
  }

  createFaces(faceTemplates) {
    this.dynamicProperties = {};
    for(const face of faceTemplates) {
      const faceDiv = document.createElement('div');

      faceDiv.classList.add('cardFace');
      if(face.css !== undefined)
        faceDiv.style.cssText = face.css;
      faceDiv.style.border = face.border ? face.border + 'px black solid' : 'none';
      faceDiv.style.borderRadius = face.radius ? face.radius + 'px' : '0';

      for(const original of face.objects) {
        const objectDiv = document.createElement('div');
        objectDiv.classList.add('cardFaceObject');

        const setValue = _=>{
          const object = JSON.parse(JSON.stringify(original));

          if(typeof object.dynamicProperties == 'object')
            for(const dp of Object.keys(object.dynamicProperties))
              if(object[dp] === undefined)
                object[dp] = this.get(object.dynamicProperties[dp]);

          const x = face.border ? object.x-face.border : object.x;
          const y = face.border ? object.y-face.border : object.y;
          let css = object.css ? object.css + '; ' : '';
          css += `left: ${x}px; top: ${y}px; width: ${object.width}px; height: ${object.height}px; font-size: ${object.fontSize}px; text-align: ${object.textAlign}`;
          css += object.rotation ? `; transform: rotate(${object.rotation}deg)` : '';
          objectDiv.style.cssText = css;

          if(object.type == 'image') {
            if(object.value) {
              if(object.svgReplaces) {
                const replaces = { ...object.svgReplaces };
                for(const key in replaces)
                  replaces[key] = this.get(replaces[key]);
                object.value = getSVG(object.value, replaces, _=>this.applyDeltaToDOM({ deck:this.get('deck') }));
              }
              objectDiv.style.backgroundImage = `url("${object.value}")`;
            }
            objectDiv.style.backgroundColor = object.color || 'white';
          } else {
            objectDiv.textContent = object.value;
            objectDiv.style.color = object.color;
          }
        }

        // add a callback that makes sure dynamic property changes are reflected on the DOM
        const properties = original.svgReplaces ? Object.values(original.svgReplaces) : [];
        if(typeof original.dynamicProperties == 'object')
          for(const dp of Object.keys(original.dynamicProperties))
            if(original[dp] === undefined)
              properties.push(original.dynamicProperties[dp]);
        for(const p of properties) {
          if(!this.dynamicProperties[p])
            this.dynamicProperties[p] = [];
          this.dynamicProperties[p].push(setValue);
        }

        setValue();
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

  async flip(setFlip, faceCycle) {
    if(setFlip !== undefined && setFlip !== null)
      await this.set('activeFace', setFlip);
    else {
      const fC = (faceCycle !== undefined && faceCycle !== null) ? faceCycle : this.get('faceCycle');
      if (fC == 'backward')
        await this.set('activeFace', this.get('activeFace') == 0 ? this.deck.get('faceTemplates').length-1 : this.get('activeFace') -1);
      else
        await this.set('activeFace', Math.floor(this.get('activeFace') + (fC == 'random' ? Math.random()*99999 : 1)) % this.deck.get('faceTemplates').length);
    }
  }

  getDefaultValue(property) {
    if(this.deck && property != 'cardType' && property != 'activeFace') {
      const d = this.deck.cardPropertyGet(this.get('cardType'), this.get('activeFace'), property);
      if(d !== undefined)
        return d;
    }
    return super.getDefaultValue(property);
  }
}
