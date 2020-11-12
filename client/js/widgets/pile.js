class Pile extends Widget {
  dispenseCard(card) {
    if(typeof this.sourceObject.flipLeave != 'undefined' && card.flip)
      card.flip(this.sourceObject.flipLeave);
    this.receiveCard(null);
  }

  receiveCard(card, pos, parentChanged) {
    const o = this.sourceObject;

    if(o.childrenPerOwner && card)
      card.sourceObject.owner = playerName;

    if(card && parentChanged && typeof this.sourceObject.flipEnter != 'undefined' && card.flip)
      card.flip(this.sourceObject.flipEnter, !o.stackOffsetX && !o.stackOffsetY);

    if(!o.stackOffsetX && !o.stackOffsetY)
      return;

    let xOffset = 0;
    let yOffset = 0;
    let z = 1;

    // get children sorted by X or Y position
    // replace coordinates of the received card to its previous coordinates so it gets dropped at the correct position
    const children = this.children().filter(c=>!c.sourceObject.owner || c.sourceObject.owner==playerName).sort(function(a, b) {
      if(o.stackOffsetX)
        return (a == card ? pos[0] : a.x) - (b == card ? pos[0] : b.x);
      return (a == card ? pos[1] : a.y) - (b == card ? pos[1] : b.y);
    });

    for(const child of children) {
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
