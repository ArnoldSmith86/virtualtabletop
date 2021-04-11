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
    this.cards[card.p('id')] = card;
    ++this.domElement.textContent;
  }

  applyDeltaToDOM(delta) {
    super.applyDeltaToDOM(delta);
    if(delta.cardDefaults !== undefined || delta.cardTypes !== undefined || delta.faceTemplates !== undefined)
      for(const cardID in this.cards)
        this.cards[cardID].applyDeltaToDOM({ deck: this.p('id') });
  }

  cardPropertyGet(cardType, property) {
    if(this.p('cardTypes')[cardType][property] !== undefined)
      return this.p('cardTypes')[cardType][property];

    return this.p('cardDefaults')[property];
  }

  removeCard(card) {
    delete this.cards[card.p('id')];
    --this.domElement.textContent;
  }
}
