class Deck extends Widget {
  constructor(object, surface) {
    super(object, surface);
    const div = document.createElement('div');
    this.domElement.addEventListener('click', e=>this.click(e));
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
