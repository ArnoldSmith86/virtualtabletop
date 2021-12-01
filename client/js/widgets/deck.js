class Deck extends Widget {
  constructor(id) {
    super(id);

    this.addDefaults({
      width: 86,
      height: 86,
      typeClasses: 'widget deck',
      cardDefaults: {},
      cardTypes: {},
      faceTemplates: []
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
    if(delta.cardDefaults !== undefined || delta.cardTypes !== undefined || delta.faceTemplates !== undefined)
      for(const cardID in this.cards)
        this.cards[cardID].applyDeltaToDOM({ deck: this.get('id') });
  }

  cardPropertyGet(cardType, face, property) {
    const thisFaceTemplates = this.get('faceTemplates');
    if(thisFaceTemplates[face] && thisFaceTemplates[face][property] !== undefined)
      return thisFaceTemplates[face][property];
    const thisCardTypes = this.get('cardTypes');
    if(thisCardTypes[cardType] && thisCardTypes[cardType][property] !== undefined)
      return thisCardTypes[cardType][property];

    return this.get('cardDefaults')[property];
  }

  removeCard(card) {
    delete this.cards[card.get('id')];
    --this.domElement.textContent;
  }
}
