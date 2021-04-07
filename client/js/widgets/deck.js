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

  cardPropertyGet(cardType, property) {
    if(this.cards[cardId].deck.state.faceTemplates[activeFace || 0][property] !== undefined)
      return this.cards[cardId].deck.state.faceTemplates[activeFace || 0][property];
    if(this.p('cardTypes')[cardType][property] !== undefined)
      return this.p('cardTypes')[cardType][property];

    return this.p('cardDefaults')[property];
  }

  removeCard(card) {
    delete this.cards[card.p('id')];
    --this.domElement.textContent;
  }
}
