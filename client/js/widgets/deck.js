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
    if(delta.cardDefaults !== undefined || delta.cardTypes !== undefined || delta.faceTemplates !== undefined) {
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

  cardPropertyGet(cardType, property) {
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
