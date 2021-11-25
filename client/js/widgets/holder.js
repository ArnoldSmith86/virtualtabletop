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
      dropLimit: -1,
      alignChildren: true,
      childrenPerOwner: false,

      onEnter: {},
      onLeave: {},

      stackOffsetX: 0,
      stackOffsetY: 0,

      text: ''
    });
  }

  applyDeltaToDOM(delta) {
    super.applyDeltaToDOM(delta);
    if(delta.text !== undefined)
      setText(this.domElement, delta.text);
  }

  children() {
    let children = this.childrenFilter(super.children(), true);
    if(children.length == 1 && children[0].get('type') == 'pile')
      children = this.childrenFilter(children[0].children(), false);
    return children;
  }

  childrenFilter(children, acceptPiles) {
    return children.filter(w=>{
      if(acceptPiles && w.get('type') == 'pile')
        return true;

      return compareDropTarget(w, this, true);
    });
  }

  async dispenseCard(card) {
    let toProcess = [ card ];
    if(card.get('type') == 'pile')
      toProcess = card.children();
    for(const w of toProcess) {
      if(!w.get('ignoreOnLeave')) {
        for(const property in this.get('onLeave')) {
          if(tracingEnabled)
            sendTraceEvent('onLeave', { w: w.get('id'), child: card.get('id'), property, value: this.get('onLeave')[property], toProcess: toProcess.map(w=>w.get('id')) });
          await w.set(property, this.get('onLeave')[property]);
        }
      }
    }
    if(this.get('alignChildren') && (this.get('stackOffsetX') || this.get('stackOffsetY')))
      await this.receiveCard(null);
    if(Array.isArray(this.get('leaveRoutine')))
      await this.evaluateRoutine('leaveRoutine', {}, { child: [ card ] });
  }

  async onChildAdd(child, oldParentID) {
    await super.onChildAdd(child, oldParentID);
    if(child.get('type') == 'deck')
      return;

    if(this.get('childrenPerOwner'))
      await child.set('owner', playerName);

    if(this != child.currentParent) { // FIXME: this isn't exactly pretty
      let toProcess = [ child ];
      if(child.get('type') == 'pile')
        toProcess = child.children();
      for(const property in this.get('onEnter')) {
        for(const w of toProcess) {
          if(tracingEnabled)
            sendTraceEvent('onEnter', { w: w.get('id'), child: child.get('id'), property, value: this.get('onEnter')[property], toProcess: toProcess.map(w=>w.get('id')) });
          await w.set(property, this.get('onEnter')[property]);
        }
      }
    }
  }

  async onChildAddAlign(child, oldParentID) {
    if(child.get('type') == 'deck')
      return await super.onChildAddAlign(child, oldParentID);

    if(this.get('alignChildren') && (this.get('stackOffsetX') || this.get('stackOffsetY')) && child.get('type') == 'pile') {
      let i=1;
      this.preventRearrangeDuringPileDrop = true;
      for(const w of child.children().reverse()) {
        await w.set('x', child.get('x') - this.absoluteCoord('x') + i/100);
        await w.set('y', child.get('y') - this.absoluteCoord('y') + i/100);
        await w.set('parent', this.get('id'));
        ++i;
      }
      delete this.preventRearrangeDuringPileDrop;
      await this.receiveCard();
      return true;
    }

    if(!this.get('alignChildren') || !this.get('stackOffsetX') && !this.get('stackOffsetY'))
      await super.onChildAddAlign(child, oldParentID);
    else if(child.movedByButton)
      await this.receiveCard(child, [ this.get('stackOffsetX')*999999, this.get('stackOffsetY')*999999 ]);
    else
      await this.receiveCard(child, [ child.get('x') - this.absoluteCoord('x'), child.get('y') - this.absoluteCoord('y') ]);
  }

  async receiveCard(card, pos) {
    // get children sorted by X or Y position
    // replace coordinates of the received card to its previous coordinates so it gets dropped at the correct position
    const children = this.childrenOwned().sort((a, b)=>{
      if(this.get('stackOffsetX'))
        return this.get('stackOffsetX') * ((a == card ? pos[0] : a.get('x')) - (b == card ? pos[0] : b.get('x')));
      return this.get('stackOffsetY') * ((a == card ? pos[1] : a.get('y')) - (b == card ? pos[1] : b.get('y')));
    });
    await this.rearrangeChildren(children, card);
  }

  async rearrangeChildren(children, card) {
    if(this.preventRearrangeDuringPileDrop)
      return;

    let xOffset = 0;
    let yOffset = 0;
    let z = 1;

    for(const child of children) {
      const newX = this.get('dropOffsetX') + xOffset;
      const newY = this.get('dropOffsetY') + yOffset;
      const newZ = z++;

      await child.setPosition(newX, newY, newZ);

      xOffset += !child.get('overlap') && this.get('stackOffsetX') ? child.get('width' ) + 4 : this.get('stackOffsetX');
      yOffset += !child.get('overlap') && this.get('stackOffsetY') ? child.get('height') + 4 : this.get('stackOffsetY');
    }
  }

  supportsPiles() {
    return !this.get('alignChildren') || !this.get('stackOffsetX') && !this.get('stackOffsetY');
  }

  async updateAfterShuffle() {
    if(!this.get('stackOffsetX') && !this.get('stackOffsetY'))
      return;

    const children = this.children();
    for(const owner of new Set(children.map(c=>c.get('owner')))) {
      await this.rearrangeChildren(children.filter(c=>!c.get('owner') || c.get('owner')===owner).sort((a, b)=>{
        return a.get('z') - b.get('z');
      }));
    }
  }
}
