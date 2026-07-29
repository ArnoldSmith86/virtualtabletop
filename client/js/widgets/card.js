// Engine properties that have no default: the ID, the widget type and the bookkeeping the editor keeps on a
// widget. Together with the widget defaults they are every property the engine itself owns on a card - see
// Card.reservedProperties(). validate_gamefile.js builds the same set from its own property table.
const enginePropertiesWithoutDefault = [ 'id', 'type', 'clonedFrom', 'editorGroup', 'editorAddToRoomRoutine' ];

export class Card extends Widget {
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

      if(Array.isArray(face.objects)) {
        for(const original of face.objects) {
          const useIframe = original.type == 'html' && legacyMode('useIframeForHtmlCards');
          const editProperty = this.editableProperty(original);
          let objectDiv = document.createElement(useIframe ? 'iframe' : 'div');
          objectDiv.classList.add('cardFaceObject');
          if(original.type == 'write')
            objectDiv.classList.add('write');

          const makeTextarea = _=>{
            const textarea = document.createElement('textarea');
            textarea.addEventListener('input', async _=>{
              const stored = this.get(editProperty);
              if(textarea.value === (stored === undefined || stored === null ? '' : String(stored)))
                return;
              batchStart();
              setDeltaCause(`${playerName} typed into ${this.id}`);
              await this.set(editProperty, textarea.value);
              batchEnd();
            });
            return textarea;
          };

          // A write object is a textarea while it can be typed into and a plain div while it is locked:
          // a textarea clips text that does not fit and can then only be scrolled by typing in it, while a
          // div overflows like every other text object, so a locked note stays readable.
          const useTextarea = editable=>{
            if(editable == (objectDiv.tagName == 'TEXTAREA'))
              return;
            const replacement = editable ? makeTextarea() : document.createElement('div');
            replacement.className = objectDiv.className;
            if(objectDiv.parentNode)
              objectDiv.parentNode.replaceChild(replacement, objectDiv);
            objectDiv = replacement;
          };

          const setValue = _=>{
            const usedProperties = new Set();
            const object = JSON.parse(JSON.stringify(original));

            if(typeof object.dynamicProperties == 'object')
              for(const dp of Object.keys(object.dynamicProperties))
                if(object[dp] === undefined)
                  object[dp] = this.get(object.dynamicProperties[dp]);

            // a write object is writable unless "editable" (usually bound per card) says otherwise, which is
            // how a card is locked once it has been filled in
            if(editProperty)
              useTextarea(!this.isReadonlyCopy && !(object.editable !== undefined && object.editable !== null && !object.editable));

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
            } else if(object.type == 'icon') {
              if(object.value) {
                if($('.symbolOuterWrapper', objectDiv))
                  $('.symbolOuterWrapper', objectDiv).remove();
                generateSymbolsDiv(objectDiv, object.size || object.width, object.size || object.height, typeof object.value == 'object' ? object.value : Object.assign({ name:object.value }, object, { rotation: 0 }), object.text || '', 1, object.color);
              }
            } else if (object.type == 'html') {
              const content = String(object.value).replaceAll(/\$\{PROPERTY ([A-Za-z0-9_-]+)\}/g, (m, n) => {
                usedProperties.add(n);
                return this.get(n) || '';
              });

              if(useIframe) {
                // Prevent input from going to frame.
                objectDiv.style.pointerEvents = 'none';
                objectDiv.setAttribute('sandbox', 'allow-same-origin');
                objectDiv.setAttribute('width', object.width);
                objectDiv.setAttribute('height', object.height);
                objectDiv.setAttribute('allow', 'autoplay');
                // Applies a template which fills available space, uses the same classes and applies
                // nested CSS style rules.
                const css = object['css'];
                const extraStyles = typeof css == 'object' ? this.cssToStylesheet(css, usedProperties, true) : '';
                const html = `<!DOCTYPE html>\n` +
                    `<html><head><link rel="stylesheet" href="fonts.css"><style>html,body {height: 100%; margin: 0;} html {font-size: 14px; font-family: 'Roboto', sans-serif;} body {overflow: hidden;}${extraStyles}` +
                    `</style></head><body class="${object.classes || ""}">${mapAssetURLs(content)}</body></html>`;
                objectDiv.srcdoc = html;
              } else {
                let inlineCSS = '';
                let finalHTML = '';

                if (object.css) {
                    if (typeof object.css === 'object' && object.css !== null && !Array.isArray(object.css)) {
                        const faceIndex = faceTemplates.indexOf(face);
                        const objectIndex = face.objects.indexOf(original);
                        const uniqueScope = `html-object-${this.id}-${faceIndex}-${objectIndex}`;
                        objectDiv.classList.add(uniqueScope);

                        let styleString = '';
                        for (const selector in object.css) {
                            if (selector === 'inline') {
                                inlineCSS = this.cssAsText(object.css.inline, usedProperties, true);
                                continue;
                            }
                            const newSelector = selector.split(',').map(s => {
                                const trimmed = s.trim();
                                if (trimmed.startsWith('body')) {
                                    return `.${uniqueScope}${trimmed.substring(4)}`;
                                }
                                return `.${uniqueScope} ${trimmed}`;
                            }).join(', ');
                            styleString += `${newSelector} { ${this.cssAsText(object.css[selector], usedProperties, true)} }\n`;
                        }
                        if (styleString) {
                            const style = document.createElement('style');
                            style.textContent = this.cssReplaceProperties(styleString, usedProperties);
                            finalHTML += style.outerHTML;
                        }
                    } else {
                        inlineCSS = this.cssAsText(object.css, usedProperties, true);
                    }
                }

                let sanitizedContent = DOMPurify.sanitize(mapAssetURLs(content), { USE_PROFILES: { html: true } });
                const bodyMatch = sanitizedContent.match(/<body[^>]*>([\s\S]*)<\/body>/i);
                if (bodyMatch) {
                    sanitizedContent = bodyMatch;
                }
                finalHTML += sanitizedContent;
                
                objectDiv.innerHTML = finalHTML;

                if (inlineCSS) objectDiv.style.cssText += ';' + this.cssReplaceProperties(inlineCSS, usedProperties);
              }
            } else if(object.type == 'write') {
              const text = object.value === undefined || object.value === null ? '' : String(object.value);
              const placeholder = object.placeholder === undefined || object.placeholder === null ? '' : String(object.placeholder);
              if(objectDiv.tagName == 'TEXTAREA') {
                // don't touch the field while it is being typed into - that would move the cursor to the end
                if(objectDiv.value !== text)
                  objectDiv.value = text;
                objectDiv.placeholder = placeholder;
                objectDiv.setAttribute('spellcheck', object.spellCheck === true);
              } else {
                // A readonly copy (deck editor, card previews) is never typed into, so it shows the
                // placeholder the same way the real card's text area does - otherwise an empty write
                // object is invisible there. A locked card shows nothing: it can not be written on anymore.
                const showPlaceholder = this.isReadonlyCopy && text === '' && placeholder !== '';
                objectDiv.classList.toggle('cardFacePlaceholder', showPlaceholder);
                if(showPlaceholder) {
                  // the hint is dimmed like a text area dims its ::placeholder - it goes into a span of its
                  // own so that only the text fades, not the box: dimming the object itself would wash out
                  // its backgroundColor and borderColor with no way for the game author to get them back
                  objectDiv.textContent = '';
                  const hint = document.createElement('span');
                  hint.textContent = placeholder;
                  objectDiv.appendChild(hint);
                } else {
                  objectDiv.textContent = text;
                }
              }
              objectDiv.style.color = object.color;
              // The box a player writes in is part of the type, so its fill and outline are properties of
              // their own instead of something that has to be written as a css object. Only what the object
              // actually sets is applied inline - the defaults (transparent, VTTblue) are in card.css, which
              // keeps a css object on the object working for everything they do not name.
              if(object.backgroundColor !== undefined)
                objectDiv.style.backgroundColor = object.backgroundColor;
              if(object.borderColor !== undefined)
                objectDiv.style.borderColor = object.borderColor;
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
      }
      this.domElement.appendChild(faceDiv);
    }
  }

  cssProperties() {
    const p = super.cssProperties();
    p.push('deck');
    return p;
  }

  // Properties the engine itself owns on a card - a write object must not be bound to one of these because
  // every keystroke would overwrite it: a field bound to 'parent' makes the card vanish, one bound to 'type'
  // replaces the card with a different widget. Every engine property has a default, except the handful
  // listed above and the computed read-only ones, which routines are refused as well.
  reservedProperties() {
    return [ ...Object.keys(this.defaults), ...enginePropertiesWithoutDefault, ...this.readOnlyProperties() ];
  }

  // The engine names every computed property with a leading underscore, so reject that whole namespace
  // rather than just today's list - that keeps the guard closed when a new computed property is added.
  isReservedProperty(property) {
    return property.charAt(0) == '_' || this.reservedProperties().includes(property);
  }

  // A "write" face object is a text object players can write on while playing. What they type has to go
  // somewhere, so such an object must have its value bound to a card property through dynamicProperties -
  // that property is returned here (and null for every object that can not be written on).
  editableProperty(object) {
    const dynamicProperties = typeof object.dynamicProperties == 'object' && object.dynamicProperties !== null ? object.dynamicProperties : {};
    if(object.type == 'write' && object.value === undefined && typeof dynamicProperties.value == 'string' && !this.isReservedProperty(dynamicProperties.value))
      return dynamicProperties.value;
    return null;
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
