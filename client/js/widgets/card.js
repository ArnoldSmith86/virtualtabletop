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

    if(delta.cardType !== undefined && this.deck) {
      const applyForCardType = {};
      for(const [ k, v ] of Object.entries(this.deck.p('cardTypes')[this.p('cardType')] || {}))
        if(this.state[k] === undefined)
          applyForCardType[k] = v;
      this.applyDeltaToDOM(applyForCardType);
    }

    if(delta.deck !== undefined || delta.activeFace !== undefined) {
      for(let i=0; i<this.domElement.children.length; ++i) {
        if(i == this.p('activeFace'))
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
    if(!widgets.get(delta.deck).p('cardTypes')[delta.cardType])
      throw `card type "${delta.cardType}" not found in deck "${delta.deck}"`;
    super.applyInitialDelta(delta);
  }

  async click() {
    if(!await super.click())
      this.flip();
  }

  createFaces(faceTemplates) {
    this.dynamicProperties = {};
    for(const face of faceTemplates) {
      const faceDiv = document.createElement('div');

      if(face.css !== undefined)
        faceDiv.style.cssText = face.css;
      faceDiv.style.border = face.border ? face.border + 'px black solid' : 'none';
      faceDiv.style.borderRadius = face.radius ? face.radius + 'px' : '0';

      for(const object of face.objects) {
        const objectDiv = document.createElement('div');
        const x = face.border ? object.x-face.border : object.x;
        const y = face.border ? object.y-face.border : object.y;
        let css = object.css ? object.css + '; ' : '';
        css += `left: ${x}px; top: ${y}px; width: ${object.width}px; height: ${object.height}px; font-size: ${object.fontSize}px; text-align: ${object.textAlign}`;
        css += object.rotation ? `; transform: rotate(${object.rotation}deg)` : '';
        objectDiv.style.cssText = css;
        const setValue = _=>{
          let value = object.valueType == 'static' ? object.value : this.p(object.value);
          if(object.type == 'image') {
            if(value) {
              if(object.svgReplaces) {
                const replaces = { ...object.svgReplaces };
                for(const key in replaces)
                  replaces[key] = this.p(replaces[key]);
                value = getSVG(value, replaces, _=>this.applyDeltaToDOM({ deck:this.p('deck') }));
              }
              objectDiv.style.backgroundImage = `url("${value}")`;
            }
            objectDiv.style.backgroundColor = object.color || 'white';
          } else {
            objectDiv.textContent = value;
            objectDiv.style.color = object.color;
          }
        }

        // add a callback that makes sure dynamic property changes are reflected on the DOM
        const properties = object.svgReplaces ? Object.values(object.svgReplaces) : [];
        if(object.valueType != 'static')
          properties.push(object.value);
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

  flip(setFlip, faceCycle) {
    if(setFlip !== undefined && setFlip !== null)
      this.p('activeFace', setFlip);
    else {
      const fC = (faceCycle !== undefined && faceCycle !== null) ? faceCycle : this.p('faceCycle');
      if (fC == 'backward')
        this.p('activeFace', this.p('activeFace') == 0 ? this.deck.p('faceTemplates').length-1 : this.p('activeFace') -1);
      else
        this.p('activeFace', Math.floor(this.p('activeFace') + (fC == 'random' ? Math.random()*99999 : 1)) % this.deck.p('faceTemplates').length);
    }
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
