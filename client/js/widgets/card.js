// Engine properties that have no default: the ID, the widget type and the bookkeeping the editor keeps on a
// widget. Together with the widget defaults they are every property the engine itself owns on a card - see
// Card.reservedProperties(). validate_gamefile.js builds the same set from its own property table.
const enginePropertiesWithoutDefault = [ 'id', 'type', 'clonedFrom', 'editorGroup', 'editorAddToRoomRoutine' ];

// contenteditable="plaintext-only" keeps everything a player types or pastes plain text. The few browsers
// that don't know the value throw on the IDL setter and get plain contenteditable plus a paste handler.
let plainTextEditableSupport = null;
function plainTextEditable() {
  if(plainTextEditableSupport === null) {
    try {
      document.createElement('div').contentEditable = 'plaintext-only';
      plainTextEditableSupport = true;
    } catch(e) {
      plainTextEditableSupport = false;
    }
  }
  return plainTextEditableSupport;
}

// Keywords that stand for a font instead of naming one: quoting them would turn them into the name of a
// family nobody has.
const cssFontKeywords = [ 'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif',
  'ui-sans-serif', 'ui-monospace', 'ui-rounded', 'math', 'emoji', 'fangsong',
  'inherit', 'initial', 'unset', 'revert', 'revert-layer' ];

// The "font" of a face object, ready to be put behind "font-family:". It is a family name (or a list of
// them), so anything that could close the declaration and start another one is dropped rather than escaped.
// Every name is then quoted: an unquoted family has to be a sequence of css identifiers, which no family
// with a word starting with a digit is ("Exo 2", "Press Start 2P") - a browser drops the whole declaration
// for those and the text silently falls back to the default font.
// The family has to be declared somewhere the document can see it - client/css/fonts.css ships a handful,
// and a deck declares the web fonts listed in its "fonts" property (see Deck.fontFaceCSS).
export function cardFaceObjectFont(object) {
  if(!object.font)
    return '';
  return String(object.font).split(',')
    .map(family=>family.replace(/[;{}"'\\]/g, '').trim())
    .filter(family=>family)
    .map(family=>cssFontKeywords.indexOf(family.toLowerCase()) != -1 ? family : `"${family}"`)
    .join(', ');
}

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
      // a deck that is not in the room, or an id that names a widget which is no deck,
      // leaves the card without faces instead of throwing halfway through updating the
      // DOM - the same widgets a state load refuses to build a card for
      const referenced = delta.deck && widgets.get(delta.deck) || null;
      this.deck = referenced instanceof Deck ? referenced : null;
      if(this.deck) {
        this.deck.addCard(this);
        const faceTemplates = this.deck.get('faceTemplates');
        this.createFaces(Array.isArray(faceTemplates) ? faceTemplates : []);
      } else if(delta.deck) {
        console.error(`Card ${this.get('id')} has no faces because ${referenced ? `widget ${delta.deck} is not a deck` : `its deck ${delta.deck} does not exist`}!`);
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

    // a flip shows other boxes, and a delta can have changed the text in one of them
    if(this.writeBoxes && this.writeBoxes.length)
      this.updateOverflowHints();

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
    this.writeBoxes = [];
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
          const objectDiv = document.createElement(useIframe ? 'iframe' : 'div');
          objectDiv.classList.add('cardFaceObject');
          if(original.type == 'write')
            objectDiv.classList.add('write');

          // Reads back what a player typed: the browser expresses their line breaks as newlines or as <br>
          // depending on how it implements plain text editing, and it keeps an empty last line around that
          // a card should not store. innerText would cover the line breaks too, but it returns what
          // text-transform makes of the text rather than what was actually typed.
          const typedText = _=>{
            let text = '';
            for(const node of objectDiv.childNodes)
              text += node.nodeName == 'BR' ? '\n' : node.textContent;
            return text.replace(/\n$/, '');
          };
          // What was last typed here, so that a card property arriving back from the server as the echo of
          // it does not rewrite the text under the caret (see setValue below).
          let lastTyped = null;

          // A write object is made writable with contenteditable rather than being a text area, so that it
          // stays the same div in all three of its states - writable, locked and the readonly copy the deck
          // editor and the card previews render. That keeps the css a game author writes for it doing the
          // same thing everywhere: a form control lays its text out itself, so e.g. flexbox alignment that
          // works on every other face object type has no effect inside a text area.
          if(editProperty) {
            this.writeBoxes.push(objectDiv);
            objectDiv.addEventListener('input', async _=>{
              // the hint is gone as soon as there is something typed - also before reading the text back,
              // because it is generated content and would otherwise be part of it
              objectDiv.classList.remove('cardFacePlaceholder');
              this.updateOverflowHints();
              const typed = lastTyped = typedText();
              const stored = this.get(editProperty);
              if(typed === (stored === undefined || stored === null ? '' : String(stored)))
                return;
              batchStart();
              setDeltaCause(`${playerName} typed into ${this.id}`);
              await this.set(editProperty, typed);
              batchEnd();
            });
            if(!plainTextEditable())
              objectDiv.addEventListener('paste', e=>{
                e.preventDefault();
                document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
              });
          }

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
            const font = cardFaceObjectFont(object);
            if(font)
              css += `; font-family: ${font}`;
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
                // A frame is its own document, so the fonts the deck imported have to be declared in it
                // again - the styles of the page around it do not reach inside.
                const deckFonts = this.deck ? this.deck.fontFaceCSS() : '';
                const html = `<!DOCTYPE html>\n` +
                    `<html><head><link rel="stylesheet" href="fonts.css"><style>${deckFonts}html,body {height: 100%; margin: 0;} html {font-size: 14px; font-family: ${font ? `${font}, ` : ''}'Roboto', sans-serif;} body {overflow: hidden;}${extraStyles}` +
                    `</style></head><body class="${object.classes || ""}">${mapAssetURLs(content)}</body></html>`;
                objectDiv.srcdoc = html;
              } else {
                let inlineCSS = '';
                let finalHTML = '';

                if (object.css) {
                    if (typeof object.css === 'object' && object.css !== null && !Array.isArray(object.css)) {
                        const faceIndex = faceTemplates.indexOf(face);
                        const objectIndex = face.objects.indexOf(original);
                        const uniqueScope = `html-object-${this.cssScope}-${faceIndex}-${objectIndex}`;
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
              // writable unless "editable" (usually bound per card) says otherwise, which is how a card is
              // locked once it has been filled in - and never on a readonly copy, whose card is not in the
              // room, so nothing typed there could be stored anywhere
              const writable = editProperty && !this.isReadonlyCopy && !(object.editable !== undefined && object.editable !== null && !object.editable);
              if(writable)
                objectDiv.setAttribute('contenteditable', plainTextEditable() ? 'plaintext-only' : 'true');
              else
                objectDiv.removeAttribute('contenteditable');
              objectDiv.setAttribute('spellcheck', object.spellCheck === true);
              // Don't rewrite the text while it is being typed into - that would move the caret to the end
              // and drop the empty line a player just opened with Enter. Only what this player typed is left
              // alone though: a change made by somebody else has to show up here, caret or not.
              if(typedText() !== text && !(document.activeElement === objectDiv && text === lastTyped))
                objectDiv.textContent = text;
              // The hint an empty object shows: on the table while it can still be written on, and on a
              // readonly copy always - the deck editor would otherwise show a blank box. A locked card shows
              // nothing: what is on it is what it says, and it can not be written on anymore. It is drawn as
              // generated content (see card.css) so that it can neither be typed into nor read back as text.
              objectDiv.dataset.placeholder = placeholder;
              // !! because classList.toggle takes an undefined second argument as "no second argument" and
              // flips the class instead - which showed the hint on exactly the locked object that must not.
              objectDiv.classList.toggle('cardFacePlaceholder', !!(text === '' && placeholder !== '' && (writable || this.isReadonlyCopy)));
              objectDiv.style.color = object.color;
              // A locked box with nothing written in it is a field that can neither be read nor used, so it
              // is not outlined at all: that part of the card is simply blank instead of looking broken.
              const lockedEmpty = !writable && !this.isReadonlyCopy && text === '';
              // The box a player writes in is part of the type, so its fill and outline are properties of
              // their own instead of something that has to be written as a css object. Only what the object
              // actually sets is applied inline - the defaults (transparent, the text color) are in card.css,
              // which keeps a css object on the object working for everything they do not name.
              objectDiv.style.backgroundColor = object.backgroundColor === undefined ? '' : object.backgroundColor;
              objectDiv.style.borderColor = lockedEmpty ? 'transparent' : object.borderColor === undefined ? '' : object.borderColor;
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
    this.updateOverflowHints();
  }

  // Marks the write boxes holding more text than they show, so that css can say so (see card.css). Called
  // wherever their content or their size can have changed: after a face is built, when a card is flipped and
  // whenever a property behind one of them arrives - plus on every keystroke, from the input handler.
  updateOverflowHints() {
    for(const box of this.writeBoxes || [])
      box.classList.toggle('cardFaceOverflow', box.scrollHeight > box.clientHeight);
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
    const faceTemplates = this.deck && this.deck.get('faceTemplates');
    if(Array.isArray(faceTemplates))
      return faceTemplates.length;
    else
      return 0;
  }
}
