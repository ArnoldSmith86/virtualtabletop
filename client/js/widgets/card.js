class Card extends Widget {
  constructor(object, surface, deck) {
    super(object, surface);

    Object.assign(this.defaults, {
      width: 103,
      height: 160,

      activeFace: 0,
      enlarge: false
    });

    this.deck = deck;
    deck.addCard(this);
    this.receiveUpdate(this.sourceObject);
  }

  click() {
    this.flip();
  }

  flip(setFlip, send=true) {
    if(typeof setFlip !== 'undefined')
      this.p('activeFace', setFlip);
    else
      this.p('activeFace', (this.p('activeFace') + 1) % this.deck.p('faceTemplates').length);
    if(send)
      this.sendUpdate();
  }

  propertyGet(property) {
    if(this.sourceObject[property] !== undefined)
      return this.sourceObject[property];

    const d = this.deck && this.deck.cardPropertyGet(this.p('cardType'), property);
    if(d !== undefined)
      return d;

    return this.defaults[property];
  }

  receiveUpdate(object) {
    super.receiveUpdate(object);
    this.domElement.classList.add('card');
    if(this.deck && !this.domElement.innerHTML) {
      this.domElement.style.width = this.p('width') + 'px';
      this.domElement.style.height = this.p('height') + 'px';

      for(const face of this.deck.p('faceTemplates')) {
        const faceDiv = document.createElement('div');

        faceDiv.style.border = face.includeBorder ? '1px black solid' : 'none';
        faceDiv.style.borderRadius = face.includeRadius ? '8px' : '0';

        for(const object of face.objects) {
          const objectDiv = document.createElement('div');
          const value = object.valueType == 'static' ? object.value : this.p(object.value);
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
      if(i == this.p('activeFace'))
        this.domElement.children[i].classList.add('active');
      else
        this.domElement.children[i].classList.remove('active');
    }
  }
}
