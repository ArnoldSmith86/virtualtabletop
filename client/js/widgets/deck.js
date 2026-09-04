class Deck extends Widget {
  constructor(id) {
    super(id);

    this.addDefaults({
      width: 86,
      height: 86,
      typeClasses: 'widget deck',
      clickable: false,
      cardDefaults: {},
      cardTypes: {},
      faceTemplates: [],
      fonts: [],
      borderRadius: '50%'
    });

    this.cards = {};
    this.domElement.textContent = 0;
  }

  addCard(card) {
    this.cards[card.get('id')] = card;
    ++this.domElement.textContent;
  }

  applyDeltaToDOM(delta) {
    super.applyDeltaToDOM(delta);
    if(delta.fonts !== undefined)
      this.applyFonts();
    if(delta.cardDefaults !== undefined || delta.cardTypes !== undefined || delta.faceTemplates !== undefined || delta.fonts !== undefined) {
      for(const cardID in this.cards) {
        const card = this.cards[cardID];

        const deltaForCard = {};
        if(this.previousCardDefaults)
          for(const key in this.previousCardDefaults)
            deltaForCard[key] = card.get(key);
        for(const key in this.get('cardDefaults'))
          deltaForCard[key] = card.get(key);
        if(this.previousCardTypes)
          for(const key in this.previousCardTypes[card.get('cardType')])
          deltaForCard[key] = card.get(key);
        for(const key in this.get('cardTypes')[card.get('cardType')])
          deltaForCard[key] = card.get(key);
        for(const key in card.state)
          deltaForCard[key] = card.get(key);

        card.applyDeltaToDOM(deltaForCard);
      }
      this.previousCardDefaults = this.get('cardDefaults');
      this.previousCardTypes = this.get('cardTypes');
    }
  }

  // The web fonts this deck brought along, as @font-face rules in a style element of its own. A font
  // family is global to the document once it is declared, so the families a deck imports can be used
  // by its own cards through their "font" and "css", and by any other widget of the game as well.
  applyFonts() {
    const existing = $(`#FONTS_${this.cssScope}`);
    if(existing)
      removeFromDOM(existing);

    const rules = this.fontFaceCSS();
    if(!rules)
      return;

    const style = document.createElement('style');
    style.id = `FONTS_${this.cssScope}`;
    style.appendChild(document.createTextNode(rules));
    $('head').appendChild(style);
  }

  applyRemove() {
    super.applyRemove();
    const style = $(`#FONTS_${this.cssScope}`);
    if(style)
      removeFromDOM(style);
  }

  cardPropertyGet(cardType, face, property) {
    const thisFaceTemplates = this.get('faceTemplates');
    const thisCardTypes = this.get('cardTypes');
    if(thisCardTypes[cardType] && thisCardTypes[cardType][property] !== undefined)
      return thisCardTypes[cardType][property];
    if(thisFaceTemplates[face] && thisFaceTemplates[face].properties && thisFaceTemplates[face].properties[property] !== undefined)
      return thisFaceTemplates[face].properties[property];

    return this.get('cardDefaults')[property];
  }

  fontFaceCSS() {
    const fonts = this.get('fonts');
    if(!Array.isArray(fonts))
      return '';
    return fonts.filter(font=>font && font.family && font.src).map(font=>{
      // both values end up inside a css rule, so anything that could close it and start something
      // else of its own is dropped rather than escaped
      const family = String(font.family).replace(/[;{}"'\\]/g, '').trim();
      const src = mapAssetURLs(String(font.src).replace(/[;{}"'()\\]/g, '').trim());
      const weight = String(font.weight || 400).replace(/[^0-9]/g, '') || '400';
      const style = font.style == 'italic' ? 'italic' : 'normal';
      return family && src ? `@font-face { font-family: "${family}"; src: url("${src}"); font-weight: ${weight}; font-style: ${style}; font-display: swap; }` : '';
    }).join('\n');
  }

  getFaceProperties(face) {
    const template = this.get('faceTemplates')[face];
    return template ? {...template.properties || {}} : {};
  }

  removeCard(card) {
    delete this.cards[card.get('id')];
    --this.domElement.textContent;
  }
}
