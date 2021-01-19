class Holder extends Widget {
  constructor(object, surface) {
    super(object, surface);

    this.addDefaults({
      width: 111,
      height: 168,
      movable: false,
      layer: -3,
      typeClasses: 'widget holder',

      dropTarget: { type: 'card' },
      dropOffsetX: 4,
      dropOffsetY: 4,
      alignChildren: true,
      childrenPerOwner: false,

      onEnter: {},
      onLeave: {},

      stackOffsetX: 0,
      stackOffsetY: 0
    });
  }

  children() {
    return super.children().filter(w=>{
      for(const p in this.p('dropTarget'))
        if(w.p(p) != this.p('dropTarget')[p])
          return false;
      return true;
    });
  }

  onChildAdd(child, oldParentID) {
    super.onChildAdd(child, oldParentID);
    if(child.p('type') == 'deck')
      return;

    if(this.p('childrenPerOwner'))
      child.p('owner', playerName);
    for(const property in this.p('onEnter'))
      child.p(property, this.p('onEnter')[property]);
  }

  onChildAddAlign(child, oldParentID) {
    if(child.p('type') == 'deck')
      return super.onChildAddAlign(child, oldParentID);

    if(!this.p('alignChildren') || !this.p('stackOffsetX') && !this.p('stackOffsetY'))
      super.onChildAddAlign(child, oldParentID);
    else if(child.movedByButton)
      this.receiveCard(child, [ this.p('stackOffsetX')*999999, this.p('stackOffsetY')*999999 ]);
    else
      this.receiveCard(child, [ child.p('x') - this.absoluteCoord('x'), child.p('y') - this.absoluteCoord('y') ]);
  }

  onChildRemove(child) {
    super.onChildRemove(child);
    if(this.p('childrenPerOwner'))
      child.p('owner', null);
    if(!child.p('ignoreOnLeave'))
      for(const property in this.p('onLeave'))
        child.p(property, this.p('onLeave')[property]);
    if(this.p('alignChildren') && (this.p('stackOffsetX') || this.p('stackOffsetY')))
      this.receiveCard(null);
  }

  receiveCard(card, pos) {
    // get children sorted by X or Y position
    // replace coordinates of the received card to its previous coordinates so it gets dropped at the correct position
    const children = this.childrenOwned().sort((a, b)=>{
      if(this.p('stackOffsetX'))
        return this.p('stackOffsetX') * ((a == card ? pos[0] : a.p('x')) - (b == card ? pos[0] : b.p('x')));
      return this.p('stackOffsetY') * ((a == card ? pos[1] : a.p('y')) - (b == card ? pos[1] : b.p('y')));
    });
    this.rearrangeChildren(children, card);
  }

  rearrangeChildren(children) {
    let xOffset = 0;
    let yOffset = 0;
    let z = 1;

    for(const child of children) {
      const newX = this.p('dropOffsetX') + xOffset;
      const newY = this.p('dropOffsetY') + yOffset;
      const newZ = z++;

      child.setPosition(newX, newY, newZ);

      xOffset += !child.p('overlap') && this.p('stackOffsetX') ? child.p('width' ) + 4 : this.p('stackOffsetX');
      yOffset += !child.p('overlap') && this.p('stackOffsetY') ? child.p('height') + 4 : this.p('stackOffsetY');
    }
  }

  supportsPiles() {
    return super.supportsPiles() && (!this.p('alignChildren') || !this.p('stackOffsetX') && !this.p('stackOffsetY'));
  }

  updateAfterShuffle() {
    if(!this.p('stackOffsetX') && !this.p('stackOffsetY'))
      return;

    const children = this.children();
    for(const owner of new Set(children.map(c=>c.p('owner')))) {
      this.rearrangeChildren(children.filter(c=>!c.p('owner') || c.p('owner')===owner).sort((a, b)=>{
        return a.p('z') - b.p('z');
      }));
    }
  }
}
