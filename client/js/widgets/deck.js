class Deck extends Widget {
  constructor(id) {
    super(id);

    this.addDefaults({
      classes: 'widget deck',
      cardDefaults: {}
    });

    this.cards = {};
    this.domElement.textContent = 0;
  }

  addCard(card) {
    this.cards[card.p('id')] = card;
    ++this.domElement.textContent;
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
