class Pile extends Widget {
  receiveCard(card) {
    let xOffset = 0;
    let yOffset = 0;
    let z = 1;

    for(const child of this.children().reverse()) {
      const newX = this.sourceObject.x+(this.sourceObject.dropOffsetX || 4)+xOffset;
      const newY = this.sourceObject.y+(this.sourceObject.dropOffsetY || 4)+yOffset;
      const newZ = z++;

      if(newX != child.x || newY != child.y || newZ != child.z)
        child.setPosition(newX, newY, newZ, child != card);
      if(child == card)
        child.sendUpdate();

      xOffset += this.sourceObject.stackOffsetX || 0;
      yOffset += this.sourceObject.stackOffsetY || 0;
    }
  }

  receiveUpdate(object) {
    super.receiveUpdate(object);
    this.domElement.classList.add('pile');
    if(!this.sourceObject.transparent)
      this.domElement.classList.add('default');
  }
}
