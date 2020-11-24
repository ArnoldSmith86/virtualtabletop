class Holder extends Widget {
  constructor(object, surface) {
    super(object, surface);

    this.addDefaults({
      width: 111,
      height: 168,
      movable: false,
      layer: -3,
      classes: 'widget holder default',

      dropTarget: { 'type': 'card' },
      dropOffsetX: 4,
      dropOffsetY: 4,
      alignChildren: true,

      onEnter: {},
      onLeave: {},

      stackOffsetX: 0,
      stackOffsetY: 0
    });
  }

  children() {
    let children = this.childrenFilter(super.children(), true);
    if(children.length == 1 && children[0].p('type') == 'pile')
      children = this.childrenFilter(children[0].children(), false);
    return children;
  }

  childrenFilter(children, acceptPiles) {
    return children.filter(w=>{
      if(acceptPiles && w.p('type') == 'pile')
        return true;
      for(const p in this.p('dropTarget'))
        if(w.p(p) != this.p('dropTarget')[p])
          return false;
      return true;
    });
  }

  dispenseCard(card) {
    for(const property in this.p('onLeave'))
      card.p(property, this.p('onLeave')[property]);
    this.receiveCard(null);
  }

  onChildAdd(child) {
    super.onChildAdd(child);
    if(this.p('childrenPerOwner'))
      child.p('owner', playerName);

    if(this != child.currentParent) // FIXME: this isn't exactly pretty
      for(const property in this.p('onEnter'))
        child.p(property, this.p('onEnter')[property]);
  }

  onChildAddAlign(child) {
    if(this.onChildAddManagePile(child))
      return true;

    if(this.p('stackOffsetX') || this.p('stackOffsetY'))
      this.receiveCard(child, [ child.p('x') - this.absoluteCoord('x'), child.p('y') - this.absoluteCoord('y') ]);
    else
      super.onChildAddAlign(child);
  }

  onChildAddManagePile(child) {
    if(this.p('alignChildren') && (this.p('stackOffsetX') || this.p('stackOffsetY')) && child.p('type') == 'pile') {
      child.children().forEach(w=>w.p('parent', this.p('id')));
      return true;
    }
    if(this.p('childrenPerOwner') || !this.p('alignChildren') || this.p('stackOffsetX') || this.p('stackOffsetY'))
      return false;

    const children = this.childrenFilter(super.children(), true);
    if(children.length == 2) {
      const piles = children.filter(w=>w.p('type') == 'pile');
      if(piles.length == 2) {
        piles[0].children().forEach(w=>w.p('parent', piles[1].p('id')));
      } else if(piles.length == 1) {
        piles[0].p('x', this.p('dropOffsetX'));
        piles[0].p('y', this.p('dropOffsetY'));
        children.filter(w=>w.p('type') != 'pile')[0].p('parent', piles[0].p('id'));
      } else {
        const pile = {
          type: 'pile',
          parent: this.p('id'),
          x: this.p('dropOffsetX'),
          y: this.p('dropOffsetY'),
          width: children[0].p('width'),
          height: children[0].p('height')
        };
        addWidgetLocal(pile);
        children.forEach(c=>c.p('parent', pile.id));
      }
      return true;
    } else {
      return false;
    }
  }

  receiveCard(card, pos) {
    // get children sorted by X or Y position
    // replace coordinates of the received card to its previous coordinates so it gets dropped at the correct position
    const children = this.children().filter(c=>!c.p('owner') || c.p('owner')==playerName).sort((a, b)=>{
      if(this.p('stackOffsetX'))
        return (a == card ? pos[0] : a.p('x')) - (b == card ? pos[0] : b.p('x'));
      return (a == card ? pos[1] : a.p('y')) - (b == card ? pos[1] : b.p('y'));
    });
    this.rearrangeChildren(children, card);
  }

  rearrangeChildren(children, card) {
    let xOffset = 0;
    let yOffset = 0;
    let z = 1;

    for(const child of children) {
      const newX = this.p('dropOffsetX') + xOffset;
      const newY = this.p('dropOffsetY') + yOffset;
      const newZ = z++;

      child.setPosition(newX, newY, newZ);

      xOffset += this.p('stackOffsetX');
      yOffset += this.p('stackOffsetY');
    }
  }

  updateAfterShuffle() {
    if(!this.p('stackOffsetX') && !this.p('stackOffsetY'))
      return;

    const children = this.children();
    for(const owner of new Set(children.map(c=>c.p('owner')))) {
      this.rearrangeChildren(children.filter(c=>!c.p('owner') || c.p('owner')==owner).sort((a, b)=>{
        return a.p('z') - b.p('z');
      }));
    }
  }
}
