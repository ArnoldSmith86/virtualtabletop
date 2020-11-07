class Deck extends Widget {
  constructor(object, surface) {
    super(object, surface);
    const div = document.createElement('div');
    this.domElement.addEventListener('click', e=>this.click(e));
    this.cards = {};
  }

  addCard(card) {
    this.cards[card.sourceObject.id] = card;
  }

  receiveUpdate(object) {
    super.receiveUpdate(object);
    this.domElement.classList.add('deck');
  }
}
