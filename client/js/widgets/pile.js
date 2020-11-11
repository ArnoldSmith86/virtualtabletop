class Pile extends Widget {
  dispenseCard(card) {
    if(typeof this.sourceObject.flipLeave != 'undefined' && card.flip)
      card.flip(this.sourceObject.flipLeave, false);
    this.receiveCard(null);
  }

  receiveCard(card) {
    const o = this.sourceObject;

    if(o.childrenPerOwner && card)
      card.sourceObject.owner = playerName;

    if(card && typeof this.sourceObject.flipEnter != 'undefined' && card.flip)
      card.flip(this.sourceObject.flipEnter, false);

    let xOffset = 0;
    let yOffset = 0;
    let z = 1;

    for(const child of this.children().filter(c=>!c.sourceObject.owner || c.sourceObject.owner==playerName).reverse()) {
      const newX = o.x+(o.dropOffsetX || 4)+xOffset;
      const newY = o.y+(o.dropOffsetY || 4)+yOffset;
      const newZ = z++;

      if(newX != child.x || newY != child.y || newZ != child.z)
        child.setPosition(newX, newY, newZ, child != card);
      if(child == card)
        child.sendUpdate();

      xOffset += o.stackOffsetX || 0;
      yOffset += o.stackOffsetY || 0;
    }
  }

  receiveUpdate(object) {
    super.receiveUpdate(object);
    this.domElement.classList.add('pile');
    if(!this.sourceObject.transparent)
      this.domElement.classList.add('default');
  }
}
