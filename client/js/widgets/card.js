class Card extends BasicWidget {
  constructor(id) {
    super(id);

    this.addDefaults({
      width: 103,
      height: 160,
      typeClasses: 'widget card',

      faceCycle: 'forward',
      activeFace: 0,

      deck: null,
      cardType: null,
      onPileCreation: {}
    });

    this.deck = null;
  }

  get(property) {
    return Widget.prototype.get.call(this, property);
  }

  applyDeltaToDOM(delta) {
    if(delta.deck !== undefined) {
      if(this.deck) {
        this.deck.removeCard(this);
      }
      if(delta.deck) {
        this.deck = widgets.get(delta.deck);
        this.deck.addCard(this);
      } else {
        this.deck = null;
      }
    }

    if((delta.cardType !== undefined || delta.deck !== undefined) && this.deck) {
      const defaultsFromDeck = {}
      const applyDefaultsFromDeck = {};
      if(delta.deck !== undefined)
        Object.assign(defaultsFromDeck, this.deck.get('cardDefaults') || {});
      Object.assign(defaultsFromDeck, this.deck.get('cardTypes')[this.get('cardType')] || {});
      for(const [ k, v ] of Object.entries(defaultsFromDeck))
        if(this.state[k] === undefined)
          applyDefaultsFromDeck[k] = v;
      this.applyDeltaToDOM(applyDefaultsFromDeck);
    }

    if (this.deck && (delta.deck !== undefined || delta.cardType !== undefined)) {
        delta.faces = this.generateFaces();
    }

    super.applyDeltaToDOM(delta);
  }

  applyInitialDelta(delta) {
    super.applyInitialDelta(delta);
    if(!delta.deck)
      throw `card "${delta.id}" requires property deck`;
    if(!delta.cardType)
      throw `card "${delta.id}" requires property cardType`;
    if(!(widgets.get(delta.deck) instanceof Deck))
      throw `card "${delta.id}" has "${delta.deck}" as a deck which is not a deck`;
    if(!widgets.get(delta.deck).get('cardTypes')[delta.cardType])
      throw `card type "${delta.cardType}" not found in deck "${delta.deck}"`;
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
        await this.set('activeFace', this.getActiveFace() == 0 ? this.getFaceCount()-1 : this.getActiveFace() -1);
      else
        await this.set('activeFace', Math.floor(this.getActiveFace() + (fC == 'random' ? rand()*99999 : 1)) % this.getFaceCount());
    }
  }

  getActiveFace() {
    const face = +this.get('activeFace');
    const count = this.getFaceCount();
    return (face % count + count) % count;
  }

  generateFaces() {
    const faceTemplates = this.deck.get('faceTemplates');
    if (!Array.isArray(faceTemplates)) {
      return [];
    }

    const newFaces = [];
    for (const face of faceTemplates) {
      let faceHtml = '';
      if (Array.isArray(face.objects)) {
        for (const object of face.objects) {
          const x = face.border ? object.x - face.border : object.x;
          const y = face.border ? object.y - face.border : object.y;
          
          let css = `position: absolute; left: ${x}px; top: ${y}px; width: ${object.width}px; height: ${object.height}px; font-size: ${object.fontSize}px; text-align: ${object.textAlign}`;
          if (object.rotation) {
            css += `; transform: rotate(${object.rotation}deg)`;
          }
          if (typeof object.display !== 'undefined' && !object.display) {
            css += '; display: none';
          }
          
          let objectCss = '';
           if (typeof object.css === 'string') {
               objectCss = object.css;
           } else if (typeof object.css === 'object' && object.css !== null) {
               for (const [key, value] of Object.entries(object.css)) {
                   if (typeof value !== 'object') {
                       objectCss += `${key}: ${value};`;
                   }
               }
           }
           css += '; ' + objectCss;

          let objectContent = '';
          const objectClasses = `cardFaceObject ${object.classes || ''}`;
          let objectHtml = '';

          if (object.type === 'html') {
            objectContent = object.value || '';
            objectHtml = `<div class="${objectClasses}" style="${css}">${objectContent}</div>`;
          } else if (object.type === 'text') {
            objectContent = object.value || '';
            css += `; color: ${object.color || 'black'};`;
            objectHtml = `<div class="${objectClasses}" style="${css}">${objectContent}</div>`;
          } else if (object.type === 'image') {
            if (object.value) {
              css += `; background-image: url('${object.value}');`;
            }
            css += `; background-color: ${object.color || 'white'};`;
            objectHtml = `<div class="${objectClasses}" style="${css}"></div>`;
          } else if (object.type === 'icon') {
            objectHtml = `<!-- icon type not yet supported in HTML cards -->`;
          }
          
          faceHtml += objectHtml;
        }
      }
      
      const faceDivClasses = `cardFace ${face.classes || ''}`;
      let faceCss = '';
      if (face.css) {
        if (typeof face.css === 'string') {
            faceCss = face.css;
        } else if (typeof face.css === 'object' && face.css !== null) {
            for (const [key, value] of Object.entries(face.css)) {
                if (typeof value !== 'object') {
                    faceCss += `${key}: ${value};`;
                }
            }
        }
      }
      if (face.border) {
        faceCss += `; border: ${face.border}px black solid;`;
      }
      if (face.radius) {
        faceCss += `; border-radius: ${face.radius}px;`;
      }

      newFaces.push({
        html: `<div class="${faceDivClasses}" style="${faceCss}">${faceHtml}</div>`
      });
    }
    return newFaces;
  }

  getDefaultValue(property) {
    if(this.deck && property != 'cardType' && property != 'activeFace') {
      const d = this.deck.cardPropertyGet(this.get('cardType'), this.get('activeFace'), property);
      if(d !== undefined)
        return d;
    }
    return super.getDefaultValue(property);
  }

  getFaceCount() {
    const faceTemplates = this.deck.get('faceTemplates');
    if(Array.isArray(faceTemplates))
      return faceTemplates.length;
    else
      return 0;
  }
}
