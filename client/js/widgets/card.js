class Card extends Widget {
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
        const faceTemplates = this.deck.get('faceTemplates');
        this.createFaces(Array.isArray(faceTemplates) ? faceTemplates : []);
      } else {
        this.deck = null;
      }
      for(const child of childNodes)
        if(!child.className.match(/cardFace/))
          this.domElement.appendChild(child);
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

    if(delta.deck !== undefined || delta.activeFace !== undefined) {
      for(let i=0; i<this.domElement.children.length; ++i) {
        if(i == this.getActiveFace())
          this.domElement.children[i].classList.add('active');
        else
          this.domElement.children[i].classList.remove('active');
      }

      const deltaForFaceChange = {};
      if(this.previousFaceProperties)
        for(const key in this.previousFaceProperties)
          deltaForFaceChange[key] = this.get(key);
      if(this.deck) {
        this.previousFaceProperties = this.deck.getFaceProperties(this.getActiveFace());
        for(const key in this.previousFaceProperties)
          deltaForFaceChange[key] = this.get(key);
      }
      this.applyDeltaToDOM(deltaForFaceChange);
    }

    if(this.dynamicProperties)
      for(const p in delta)
        for(const callback of (this.dynamicProperties[p] || []))
          callback();

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
        faceDiv.style.cssText = mapAssetURLs(this.cssAsText(face.css,null,true));
      if(face.classes !== undefined)
        faceDiv.classList.add(face.classes);
      faceDiv.style.border = face.border ? face.border + 'px black solid' : 'none';
      faceDiv.style.borderRadius = face.radius ? face.radius + 'px' : '0';

      for(const original of face.objects) {
        const objectDiv = document.createElement(original.type == 'html' ? 'iframe' : 'div');
        objectDiv.classList.add('cardFaceObject');

        const setValue = _=>{
          const usedProperties = new Set();
          const object = JSON.parse(JSON.stringify(original));

          if(typeof object.dynamicProperties == 'object')
            for(const dp of Object.keys(object.dynamicProperties))
              if(object[dp] === undefined)
                object[dp] = this.get(object.dynamicProperties[dp]);

          const x = face.border ? object.x-face.border : object.x;
          const y = face.border ? object.y-face.border : object.y;
          let css = object.css ? this.cssAsText(object.css,usedProperties,true) + '; ' : '';
          css += `left: ${x}px; top: ${y}px; width: ${object.width}px; height: ${object.height}px; font-size: ${object.fontSize}px; text-align: ${object.textAlign}`;
          css += object.rotation ? `; transform: rotate(${object.rotation}deg)` : '';
          if(typeof object.display !== 'undefined' && !object.display)
            css += '; display: none';
          objectDiv.style.cssText = mapAssetURLs(css);
          if(object.classes)
            objectDiv.classList.add(object.classes);

          if(object.type == 'image') {
            if(object.value) {
              if(object.svgReplaces) {
                const replaces = { ...object.svgReplaces };
                for(const key in replaces)
                  replaces[key] = this.get(replaces[key]);
                const svgResult = getSVG(object.value, replaces, _=>{
                  objectDiv.style.backgroundImage = `url("${getSVG(object.value, replaces)}")`;
                });
                objectDiv.style.backgroundImage = `url("${svgResult}")`;
              } else {
                objectDiv.style.backgroundImage = mapAssetURLs(`url("${object.value}")`);
              }
            }
            objectDiv.style.backgroundColor = object.color || 'white';
          } else if (object.type == 'html') {
            // Prevent input from going to frame.
            objectDiv.style.pointerEvents = 'none';
            objectDiv.setAttribute('sandbox', 'allow-same-origin');
            objectDiv.setAttribute('width', object.width);
            objectDiv.setAttribute('height', object.height);
            objectDiv.setAttribute('allow', 'autoplay');
            const content = String(object.value).replaceAll(/\$\{PROPERTY ([A-Za-z0-9_-]+)\}/g, (m, n) => {
              usedProperties.add(n);
              return this.get(n) || '';
            });
            // Applies a template which fills available space, uses the same classes and applies
            // nested CSS style rules.
            const css = object['css'];
            const extraStyles = typeof css == 'object' ? this.cssToStylesheet(css, usedProperties, true) : '';
            const html = `<!DOCTYPE html>\n` +
                `<html><head><link rel="stylesheet" href="fonts.css"><style>html,body {height: 100%; margin: 0;} html {font-size: 14px; font-family: 'Roboto', sans-serif;} body {overflow: hidden;}${extraStyles}` +
                `</style></head><body class="${object.classes || ""}">${content}</body></html>`;
            objectDiv.srcdoc = html;
          } else {
            objectDiv.textContent = object.value;
            objectDiv.style.color = object.color;
          }
          return usedProperties;
        }

        // add a callback that makes sure dynamic property changes are reflected on the DOM
        const properties = setValue();
        if (original.svgReplaces)
          for (const property of Object.values(original.svgReplaces))
            properties.add(property);
        if(typeof original.dynamicProperties == 'object')
          for(const dp of Object.keys(original.dynamicProperties))
            if(original[dp] === undefined)
              properties.add(original.dynamicProperties[dp]);
        for(const p of properties) {
          if(!this.dynamicProperties[p])
            this.dynamicProperties[p] = [];
          this.dynamicProperties[p].push(setValue);
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

  getDefaultValue(property) {
    if(this.deck && property != 'cardType' && property != 'activeFace') {
      const d = this.deck.cardPropertyGet(this.get('cardType'), this.getActiveFace(), property);
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
