class Holder extends ImageWidget {
  constructor(object, surface) {
    super(object, surface);
    // if legacy mode disableHolderImageWidget is enabled, skip the intermediary ImageWidget prototype and use the Widget prototype instead so that image/icon/text properties "work" like they did before the change
    this.base = legacyMode('disableHolderImageWidget') ? Widget.prototype : ImageWidget.prototype;

    this.addDefaults({
      width: 111,
      height: 168,
      movable: false,
      layer: -3,
      typeClasses: 'widget holder',
      color: 'white',
      textColor: '#0004',

      dropTarget: { type: 'card' },
      dropOffsetX: 4,
      dropOffsetY: 4,
      dropShadow: false,
      alignChildren: true,
      preventPiles: false,
      allowPiles: false,
      childrenPerOwner: false,
      showInactiveFaceToSeat: null,

      onEnter: {},
      onLeave: {},

      stackOffsetX: 0,
      stackOffsetY: 0,
      pilesOffsetX: null,
      pilesOffsetY: null,
      pilesGapX: null,
      pilesGapY: null,
      spreadMin: null,
      borderRadius: 8
    });
  }

  applyDeltaToDOM(delta) {
    this.base.applyDeltaToDOM.call(this, delta, true);
    if(this.textWrapper && !this.get('text')) {
      this.textWrapper.remove();
      this.textWrapper = null;
    }
  }

  children() {
    let children = this.childrenFilter(super.children(), true);
    if(children.length == 1 && children[0].get('type') == 'pile')
      children = this.childrenFilter(children[0].children(), false);
    else if(this.get('allowPiles'))
      // a holder that arranges piles still holds cards as far as everything
      // else is concerned: MOVE, COUNT and dropLimit count the cards, not the
      // piles they happen to be arranged in
      children = children.flatMap(c=>c.get('type') == 'pile' ? this.childrenFilter(c.children(), false) : [ c ]);
    return children;
  }

  // The widgets this holder lines up. A pile counts as one entry here, unlike
  // in children(), which reports the cards inside it.
  arrangedChildren() {
    return this.get('allowPiles') ? this.childrenFilter(super.children(), true) : this.children();
  }

  arrangedChildrenOwned() {
    return this.arrangedChildren().filter(c=>!c.get('owner') || c.get('owner') == playerName);
  }

  // The pile or card of this holder that a widget dropped at the given spot lands
  // on, which is the one it is meant to join. A pile counts across its whole box:
  // a card dropped anywhere on a fanned pile belongs to that pile, and hitting
  // the corner of it - all a pile outside a holder takes - would be guesswork
  // where the holder decides how far apart the piles sit. What aims the drop is
  // the card at the corner of what is being dragged, so that a long pile dropped
  // onto a short one still lands where its first card does.
  arrangedChildAt(child, x, y) {
    const aiming = child.get('type') == 'pile' && child.children().length ? child.children()[0] : child;
    const pointX = x + aiming.get('width' )/2;
    const pointY = y + aiming.get('height')/2;
    return this.arrangedChildrenOwned().filter(c=>c != child
      && pointX >= c.get('x') && pointX < c.get('x') + c.spreadExtent('X')
      && pointY >= c.get('y') && pointY < c.get('y') + c.spreadExtent('Y')
    ).sort((a, b)=>b.get('z') - a.get('z'))[0] || null;
  }

  childrenFilter(children, acceptPiles) {
    return children.filter(w=>{
      if(acceptPiles && w.get('type') == 'pile')
        return true;

      return compareDropTarget(w, this, true);
    });
  }

  classes(includeTemporary=false) {
    let className = this.base.classes.call(this, includeTemporary);

    if(this.get('showInactiveFaceToSeat'))
      if(widgetFilter(w=>asArray(this.get('showInactiveFaceToSeat')).indexOf(w.get('id'))!=-1&&w.get('player')==playerName).length)
        className += ' showCardBack';

    return className;
  }

  classesProperties() {
    const p = this.base.classesProperties.call(this);
    p.push('showInactiveFaceToSeat');
    return p;
  }

  css() {
    let css = this.base.css.call(this, true);

    if(!legacyMode('disableHolderImageWidget')) {
      css += '; --bgColor: ' + this.get('color');
      css += '; --holderTextColor: ' + this.get('textColor');
      css += '; --bgImage: url("' + this.getImage() + '")';
    }

    return css;
  }

  cssProperties() {
    const p = this.base.cssProperties.call(this);
    if(!legacyMode('disableHolderImageWidget'))
      p.push('color', 'textColor');
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
    if(this.get('alignChildren') && this.spreadsChildren())
      await this.receiveCard(null);
    if(Array.isArray(this.get('leaveRoutine')))
      await this.evaluateRoutine('leaveRoutine', {}, { child: [ card ] });
  }

  getDefaultIconScale() {
    return 0.85;
  }

  getDefaultIconOpacity() {
    return 0.2;
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

    const spreads = this.get('alignChildren') && this.spreadsChildren();

    // a holder that arranges piles takes a dropped pile as it is - everywhere
    // else the pile is emptied into the holder, one card per slot
    if((this.get('preventPiles') || spreads && !this.get('allowPiles')) && child.get('type') == 'pile') {
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

    if(!spreads)
      await super.onChildAddAlign(child, oldParentID);
    else if(child.movedByButton) {
      const [ axis, direction ] = this.spreadDirection();
      await this.receiveCard(child, axis == 'X' ? [ direction*999999, 0 ] : [ 0, direction*999999 ]);
    } else {
      const x = child.get('x') - this.absoluteCoord('x');
      const y = child.get('y') - this.absoluteCoord('y');
      // Where the widget lands decides whether it piles up with what is already
      // there, so that has to be settled before the holder pulls it into its
      // slot: from there on it sits a whole slot away from its neighbours and
      // could never combine with any of them.
      const target = this.get('allowPiles') ? this.arrangedChildAt(child, x, y) : null;
      if(target) {
        await child.setPosition(target.get('x'), target.get('y'), child.get('z'));
        await child.updatePiles();
      }
      await this.receiveCard(child, [ x, y ]);
    }
  }

  async onPropertyChange(property, oldValue, newValue) {
    await super.onPropertyChange(property, oldValue, newValue);
    // the piles took their layout from this holder, so they lose it here and
    // have to collect their cards again - arrangedChildren() no longer sees them
    if(property == 'allowPiles' && !newValue)
      for(const child of this.childrenFilter(super.children(), true))
        if(child.get('type') == 'pile')
          await child.arrangeChildren(false, true);
    if([ 'dropOffsetX', 'dropOffsetY', 'stackOffsetX', 'stackOffsetY', 'allowPiles', 'pilesOffsetX', 'pilesOffsetY', 'pilesGapX', 'pilesGapY', 'spreadMin' ].indexOf(property) != -1) {
      await this.updateAfterShuffle();
    }
  }

  async receiveCard(card, pos) {
    // get children sorted by their position along the axis this holder spreads along
    // replace coordinates of the received card to its previous coordinates so it gets dropped at the correct position
    const [ axis, direction ] = this.spreadDirection();
    const property = axis == 'X' ? 'x' : 'y';
    const index = axis == 'X' ? 0 : 1;
    const children = this.arrangedChildrenOwned().sort((a, b)=>{
      return direction * ((a == card ? pos[index] : a.get(property)) - (b == card ? pos[index] : b.get(property)));
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

      xOffset += this.childSpacing(child, 'X');
      yOffset += this.childSpacing(child, 'Y');
    }
  }

  // How far the next child is placed from this one along one axis. Cards follow
  // stackOffset; where piles are arranged, a pile is a block of its own: pilesGap
  // starts the next one behind its cards, pilesOffset at a fixed distance
  // regardless of how many cards it holds, and with neither of them given the
  // piles are placed flush, one right after the other.
  childSpacing(child, axis) {
    const stackOffset = this.get('stackOffset' + axis);

    if(this.get('allowPiles')) {
      const gap = this.get('pilesGap' + axis);
      if(gap !== null)
        return child.spreadExtent(axis) + gap;
      const offset = this.get('pilesOffset' + axis);
      if(offset !== null)
        return offset;
      // A holder that spaces its piles out on the other axis lines them up
      // along that one alone: its stackOffset describes how the cards inside
      // the piles are spread, not where the next pile begins.
      if(this.pilesSpacingSet())
        return 0;
      if(child.get('type') == 'pile')
        return stackOffset ? child.spreadExtent(axis) : 0;
    }

    return !child.get('overlap') && stackOffset ? child.get(axis == 'X' ? 'width' : 'height') + 4 : stackOffset;
  }

  pilesSpacingSet() {
    return [ 'pilesOffsetX', 'pilesOffsetY', 'pilesGapX', 'pilesGapY' ].some(p=>this.get(p) !== null);
  }

  // Whether this holder lines its children up instead of dropping them all on
  // the same spot. stackOffset does that for every child; a holder that
  // arranges piles can space them out through pilesOffset/pilesGap alone.
  spreadsChildren() {
    return !!(this.get('stackOffsetX') || this.get('stackOffsetY') || this.get('allowPiles') && this.pilesSpacingSet());
  }

  // The axis the children are lined up along and the direction along it, which
  // is what decides the order they are arranged in. Where piles are spaced out,
  // that spacing names the axis - the stackOffset then belongs to the cards
  // inside the piles.
  spreadDirection() {
    if(this.get('allowPiles')) {
      for(const axis of [ 'X', 'Y' ]) {
        if(this.get('pilesGap' + axis) !== null)
          return [ axis, 1 ];
        if(this.get('pilesOffset' + axis) !== null)
          return [ axis, Math.sign(this.get('pilesOffset' + axis)) || 1 ];
      }
    }
    for(const axis of [ 'X', 'Y' ]) {
      const stackOffset = this.get('stackOffset' + axis);
      if(stackOffset)
        return [ axis, Math.sign(stackOffset) ];
    }
    return [ 'X', 1 ];
  }

  // Cards a routine moves in arrive one by one. In a holder that arranges piles
  // they are meant to land as one pile of their own rather than being fed into
  // whichever pile the holder already ends with.
  async groupDroppedCards(cards) {
    if(!this.get('allowPiles') || !this.supportsPiles() || !this.get('alignChildren') || !this.spreadsChildren())
      return;

    const dropped = cards.filter(c=>c.get('parent') == this.get('id') && c.get('type') == 'card');
    if(dropped.length < 2)
      return;

    const bottom = dropped[0];
    const pile = Object.assign({
      type: 'pile',
      parent: this.get('id'),
      x: bottom.get('x'),
      y: bottom.get('y'),
      width: bottom.get('width'),
      height: bottom.get('height')
    }, bottom.get('onPileCreation'));
    if(bottom.get('owner') !== null)
      pile.owner = bottom.get('owner');

    const pileID = await addWidgetLocal(pile);
    for(const card of dropped) {
      // z before parent: the pile lays its cards out by z, so it has to be the
      // final one - the order the routine moved the cards in - by then
      await card.bringToFront();
      await card.set('parent', pileID);
    }
    await this.receiveCard(null);
  }

  supportsPiles() {
    return !this.get('preventPiles') && (this.get('allowPiles') || !this.get('alignChildren') || !this.spreadsChildren());
  }

  async updateAfterShuffle() {
    if(!this.spreadsChildren())
      return;

    const children = this.arrangedChildren();
    // the piles take their own layout from this holder and lay their cards out
    // by z, so both a shuffle and a changed offset reach them first - how much
    // room they end up taking is what the arrangement below is measured against
    for(const child of children)
      if(child.get('type') == 'pile')
        await child.arrangeChildren(false);
    for(const owner of new Set(children.map(c=>c.get('owner')))) {
      await this.rearrangeChildren(children.filter(c=>!c.get('owner') || c.get('owner')===owner).sort((a, b)=>{
        return a.get('z') - b.get('z');
      }));
    }
  }

  updateIcon() {
    if(legacyMode('disableHolderImageWidget'))
      return;

    if(this.textWrapper) {
      this.textWrapper.remove();
      this.textWrapper = null;
    }

    if(this.get('text') && !this.get('icon')) {
      if(this.symbolWrapper)
        this.symbolWrapper.remove();
      this.textWrapper = document.createElement('div');
      this.textWrapper.className = 'holderTextOnly';
      this.textWrapper.textContent = this.get('text');
      this.domElement.appendChild(this.textWrapper);

      setTextAndAdjustFontSize(this.textWrapper, this.get('text'), this.textWrapper.clientWidth, this.textWrapper.clientHeight, 25, 1);
    } else {
      super.updateIcon();
    }
  }
}
