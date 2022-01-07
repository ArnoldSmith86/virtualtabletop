class Deck extends Widget {
  constructor(id) {
    super(id);

    this.addDefaults({
      width: 86,
      height: 86,
      typeClasses: 'widget deck',
      cardDefaults: {},
      cardTypes: {},
      faceTemplates: [],
      borderRadius: '50%'
    });

    this.cards = {};
    this.domInner.textContent = 0;
  }

  addCard(card) {
    this.cards[card.get('id')] = card;
    ++this.domInner.textContent;
    this.domBox.setAttribute('data-text', this.domInner.textContent);
  }

  applyDeltaToDOM(delta) {
    super.applyDeltaToDOM(delta);
    if(delta.cardDefaults !== undefined || delta.cardTypes !== undefined || delta.faceTemplates !== undefined)
      for(const cardID in this.cards)
        this.cards[cardID].applyDeltaToDOM({ deck: this.get('id') });
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

  getFaceProperties(face) {
    const template = this.get('faceTemplates')[face];
    return template ? {...template.properties || {}} : {};
  }

  removeCard(card) {
    delete this.cards[card.get('id')];
    --this.domInner.textContent;
    this.domBox.setAttribute('data-text', this.domInner.textContent);
  }
}
