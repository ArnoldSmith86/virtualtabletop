class Deck extends Widget {
  constructor(object, surface) {
    super(object, surface);

    Object.assign(this.defaults, {
      cardDefaults: {
        width: 103,
        height: 160,

        activeFace: 0,
        enlarge: false
      }
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
    if(this.p('cardDefaults')[property] !== undefined)
      return this.p('cardDefaults')[property];
    else
      return this.defaults.cardDefaults[property];
  }

  receiveUpdate(object) {
    super.receiveUpdate(object);
    this.domElement.classList.add('deck');
  }
}
