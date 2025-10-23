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
      dropShadow: false,
      alignChildren: true,
      preventPiles: false,
      childrenPerOwner: false,
      showInactiveFaceToSeat: null,

      onEnter: {},
      onLeave: {},

      stackOffsetX: 0,
      stackOffsetY: 0,
      borderRadius: 8
    });
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

  classes() {
    let className = super.classes();

    if(this.get('showInactiveFaceToSeat'))
      if(widgetFilter(w=>asArray(this.get('showInactiveFaceToSeat')).indexOf(w.get('id'))!=-1&&w.get('player')==playerName).length)
        className += ' showCardBack';

    return className;
  }

  classesProperties() {
    const p = super.classesProperties();
    p.push('showInactiveFaceToSeat');
    return p;
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
      await child.set('owner', child.targetPlayer||playerName);

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

    if((this.get('preventPiles') || this.get('alignChildren') && (this.get('stackOffsetX') || this.get('stackOffsetY'))) && child.get('type') == 'pile') {
      let i=1;
      this.preventRearrangeDuringPileDrop = true;
      for(const w of child.children().reverse()) {
        await w.set('x', child.get('x') - this.absoluteCoord('x') + i/100);
        await w.set('y', child.get('y') - this.absoluteCoord('y') + i/100);
        await w.set('parent', this.get('id'));
        ++i;
        if(this.get('preventPiles')) {
          if(this.get('alignChildren') && !this.get('stackOffsetX') && !this.get('stackOffsetY')) {
            await w.set('x', this.get('dropOffsetX'));
            await w.set('y', this.get('dropOffsetY'));
          }
          await w.bringToFront();
        }
      }
      delete this.preventRearrangeDuringPileDrop;
      if(!this.get('preventPiles'))
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

  async onPropertyChange(property, oldValue, newValue) {
    await super.onPropertyChange(property, oldValue, newValue);
    if(property == 'dropOffsetX' || property == 'dropOffsetY' || property == 'stackOffsetX' || property == 'stackOffsetY') {
      await this.updateAfterShuffle();
    } else if((property == 'width' || property == 'height') && this.usesSmartRearrange()) {
      await this.updateAfterShuffle();
    }
  }

  async receiveCard(card, pos) {
    const soX = this.get('stackOffsetX');
    const soY = this.get('stackOffsetY');
    // get children sorted by X or Y position
    // replace coordinates of the received card to its previous coordinates so it gets dropped at the correct position
    const children = this.childrenOwned().sort((a, b)=>{
      if(soX)
        return (soX == 'auto' ? 1 : soX) * ((a == card ? pos[0] : a.get('x')) - (b == card ? pos[0] : b.get('x')));
      return (soY == 'auto' ? 1 : soY) * ((a == card ? pos[1] : a.get('y')) - (b == card ? pos[1] : b.get('y')));
    });
    await this.rearrangeChildren(children, card);
  }

  async rearrangeChildren(children, card) {
    if(this.preventRearrangeDuringPileDrop)
      return;

    if(this.usesSmartRearrange())
      return await this.rearrangeChildren_smart(children, card);

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

  async rearrangeChildren_smart(children, card) {
    const widths = children.map(c=>c.get('width'));
    const heights = children.map(c=>c.get('height'));
    const biggestWidth  = Math.max(...widths);
    const biggestHeight = Math.max(...heights);
    const totalWidth = widths.reduce((a,b)=>a+b);
    const totalHeight = heights.reduce((a,b)=>a+b);
    const useMultipleColumns = biggestWidth *1.5 < this.get('width' ) && this.get('stackOffsetX');
    const useMultipleRows    = biggestHeight*1.5 < this.get('height') && this.get('stackOffsetY');

    if(useMultipleColumns && useMultipleRows) {
      // Calculate optimal number of rows to maximize visible area per card
      const padding = 4;
      const holderWidth = this.get('width');
      const holderHeight = this.get('height');
      const numCards = children.length;
      
      let bestRows = 1;
      let maxVisibleArea = 0;
      
      // Try different row counts to find the one that maximizes visible area
      for(let r = 1; r <= Math.min(numCards, Math.floor((holderHeight - padding*2) / (biggestHeight/2))); r++) {
        const cardsPerRow = Math.ceil(numCards / r);
        
        // Calculate visible width per card for this row configuration
        const widthOffset = (holderWidth - biggestWidth - padding*2) / Math.max(1, cardsPerRow - 1);
        const visibleWidth = Math.min(biggestWidth, widthOffset);
        
        // Calculate visible height per card for this row configuration
        const heightOffset = (holderHeight - biggestHeight - padding*2) / Math.max(1, r - 1);
        const visibleHeight = Math.min(biggestHeight, heightOffset);
        
        const visibleArea = visibleWidth * visibleHeight;
        
        if(visibleArea > maxVisibleArea) {
          maxVisibleArea = visibleArea;
          bestRows = r;
        }
      }
      
      const rows = bestRows;
      const cardsPerRow = Math.ceil(children.length / rows);
      let yOffset = 4;
      if(biggestHeight*rows + padding*(rows+1) < this.get('height') && this.get('dropOffsetY') == 'center')
        yOffset = (this.get('height') - biggestHeight*rows - padding*(rows-1)) / 2;
      if(biggestHeight*rows + padding*(rows+1) < this.get('height') && this.get('dropOffsetY') == 'bottom')
        yOffset = this.get('height') - biggestHeight*rows - padding*rows;
      let z = 1;
      for(let i=0; i<rows; i++) {
        let xOffset = padding;
        if(biggestWidth*cardsPerRow + padding*(cardsPerRow+1) < this.get('width') && this.get('dropOffsetX') == 'center')
          xOffset = (this.get('width') - biggestWidth*cardsPerRow - padding*(cardsPerRow-1)) / 2;
        if(biggestWidth*cardsPerRow + padding*(cardsPerRow+1) < this.get('width') && this.get('dropOffsetX') == 'right')
          xOffset = this.get('width') - biggestWidth*cardsPerRow - padding*cardsPerRow;
        console.log(i, xOffset, i*cardsPerRow, (i+1)*cardsPerRow);
        for(const child of children.slice(i*cardsPerRow, (i+1)*cardsPerRow)) {
          const offsetX = Math.min(child.get('width') + Math.max(4, padding), Math.floor(this.get('width') - child.get('width') - padding*2) / (cardsPerRow - 1));
          await child.setPosition(xOffset, yOffset, z++);
          xOffset += offsetX;
        }
        const offsetY = Math.min(biggestHeight + padding, Math.floor(this.get('height') - biggestHeight - padding*2) / (rows - 1));
        yOffset += offsetY;
      }
    } else if(useMultipleColumns) {
      const padding = (this.get('height') - biggestHeight) / 2;
      let z = 1;
      let xOffset = padding;
      if(totalWidth + padding*(children.length+1) < this.get('width') && this.get('dropOffsetX') == 'center')
        xOffset = (this.get('width') - totalWidth - padding*(children.length-1)) / 2;
      if(totalWidth + padding*(children.length+1) < this.get('width') && this.get('dropOffsetX') == 'right')
        xOffset = this.get('width') - totalWidth - padding*children.length;
      console.log(xOffset);
      for(const child of children) {
        const offsetX = Math.min(child.get('width') + Math.max(4, padding), Math.floor(this.get('width') - child.get('width') - padding*2) / (children.length - 1));
        await child.setPosition(xOffset, padding, z++);
        xOffset += offsetX;
      }
    } else if(useMultipleRows) {
      const padding = (this.get('width') - biggestWidth) / 2;
      let z = 1;
      let yOffset = padding;
      if(totalHeight + padding*(children.length+1) < this.get('height') && this.get('dropOffsetY') == 'center')
        yOffset = (this.get('height') - totalHeight - padding*(children.length-1)) / 2;
      if(totalHeight + padding*(children.length+1) < this.get('height') && this.get('dropOffsetY') == 'bottom')
        yOffset = this.get('height') - totalHeight - padding*children.length;
      console.log(yOffset);
      for(const child of children) {
        const offsetY = Math.min(child.get('height') + Math.max(4, padding), Math.floor(this.get('height') - child.get('height') - padding*2) / (children.length - 1));
        await child.setPosition(padding, yOffset, z++);
        yOffset += offsetY;
      }
    } else {
      let z = 1;
      for(const child of children)
        await child.setPosition(0, 0, z++);
    }
  }

  supportsPiles() {
    return !this.get('preventPiles') && (!this.get('alignChildren') || !this.get('stackOffsetX') && !this.get('stackOffsetY'));
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

  usesSmartRearrange() {
    return [ 'left', 'center', 'right' ].includes(this.get('dropOffsetX')) || [ 'top', 'center', 'bottom' ].includes(this.get('dropOffsetY')) || this.get('stackOffsetX') == 'auto' || this.get('stackOffsetY') == 'auto';
  }
}
