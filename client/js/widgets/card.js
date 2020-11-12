class Card extends Widget {
  constructor(object, surface, deck) {
    super(object, surface);
    this.deck = deck;
    deck.addCard(this);
    this.receiveUpdate(this.sourceObject);
  }

  click() {
    this.flip();
  }

  flip(setFlip, send=true) {
    if(typeof setFlip !== 'undefined')
      this.sourceObject.activeFace = setFlip;
    else
      this.sourceObject.activeFace = ((this.sourceObject.activeFace || 0) + 1) % this.deck.sourceObject.faceTemplates.length;
    if(send)
      this.sendUpdate();
  }

  receiveUpdate(object) {
    super.receiveUpdate(object);
    this.domElement.classList.add('card');
    if(this.deck && !this.domElement.innerHTML) {
      if(typeof this.enlarge == 'undefined' && this.deck.sourceObject.enlarge)
        this.enlarge = this.deck.sourceObject.enlarge;

      this.domElement.style.width = (this.width = this.deck.sourceObject.cardWidth || 103) + 'px';
      this.domElement.style.height = (this.height = this.deck.sourceObject.cardHeight || 160) + 'px';

      for(const face of this.deck.sourceObject.faceTemplates) {
        const faceDiv = document.createElement('div');

        faceDiv.style.border = face.includeBorder ? '1px black solid' : 'none';
        faceDiv.style.borderRadius = face.includeRadius ? '8px' : '0';

        for(const object of face.objects) {
          const objectDiv = document.createElement('div');
          const value = object.valueType == 'static' ? object.value : this.deck.sourceObject.cardTypes[this.sourceObject.cardType][object.value];
          objectDiv.style.cssText = `left: ${object.x}px; top: ${object.y}px; width: ${object.w}px; height: ${object.h}px; font-size: ${object.fontSize}px; text-align: ${object.textAlign}`;
          if(object.type == 'image') {
            objectDiv.style.backgroundImage = `url(${value})`;
            objectDiv.style.backgroundColor = object.color || 'white';
          } else {
            objectDiv.textContent = value;
            objectDiv.style.color = object.color;
          }
          faceDiv.appendChild(objectDiv);
        }
        this.domElement.appendChild(faceDiv);
      }
    }
    for(let i=0; i<this.domElement.children.length; ++i) {
      if(i == (this.sourceObject.activeFace || 0))
        this.domElement.children[i].classList.add('active');
      else
        this.domElement.children[i].classList.remove('active');
    }
  }
}
