class Deck extends Widget {
  constructor(object, surface) {
    super(object, surface);
    this.cards = {};
    this.domElement.textContent = 0;
  }

  addCard(card) {
    this.cards[card.sourceObject.id] = card;
    ++this.domElement.textContent;
  }

  receiveUpdate(object) {
    super.receiveUpdate(object);
    this.domElement.classList.add('deck');
  }
}
