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
      childrenPerOwner: false,
      showInactiveFaceToSeat: null,

      onEnter: {},
      onLeave: {},

      stackOffsetX: 0,
      stackOffsetY: 0,
      borderRadius: 8,

      layout: null,
      spreadOffset: null
    });
  }

  // The `layout` property is a high-level way to describe how a holder arranges
  // its children. When set (non-null) it overrides the lower-level properties
  // (alignChildren, preventPiles, stackOffsetX/Y) that would otherwise have to be
  // combined by hand to reach the same effect. Reading those properties through
  // get() therefore returns the value implied by the layout, so both this class
  // and the base Widget logic behave consistently.
  get(property) {
    // Only these properties are ever derived from a non-null layout. For every
    // other property read (the common case) skip the layout lookup entirely so
    // get() stays cheap on this hot path.
    if(property == 'dropShadow' || property == 'alignChildren' || property == 'preventPiles' || property == 'stackOffsetX' || property == 'stackOffsetY') {
      const layout = super.get('layout');
      if(layout) {
        if(property == 'dropShadow' && layout == 'multipleSpread')
          // multipleSpread always shows a drop shadow so players can see where a
          // dragged card/group will be inserted
          return true;
        if(property == 'alignChildren')
          // multipleSpread and freeform leave children where the player drops them
          // (multipleSpread then merges overlapping cards into spread-out pile groups)
          return layout != 'freeform' && layout != 'multipleSpread';
        if(property == 'preventPiles') {
          if(layout == 'grid')
            return true;
          if(layout == 'pile' || layout == 'multipleSpread')
            return false;
        }
        if((property == 'stackOffsetX' || property == 'stackOffsetY') && layout == 'pile')
          return 0;
      }
    }
    return super.get(property);
  }

  // A game that toggles the legacy alignChildren property while it runs has to
  // keep working after the file updater replaced an authored alignChildren:false
  // with layout:'freeform': writing the property hands the decision back to it
  // instead of leaving the holder stuck with the layout the migration added. The
  // write reaching the widget is what says so - a holder authored with a layout
  // and never written to keeps it. Only 'freeform' is affected because that is
  // the only layout the migration produces.
  async set(property, value) {
    if(property == 'alignChildren' && super.get('layout') == 'freeform')
      await super.set('layout', null);
    return await super.set(property, value);
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
    return children;
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

  // isLeaving is set by checkParent, which only calls this once the card really
  // has left the holder (dropped elsewhere or dragged off it).
  async dispenseCard(card, isLeaving=false) {
    // in a multipleSpread holder a card often just moves between groups (drag
    // between fans, regroupBy, merges) - its new parent is still this holder or a
    // pile inside it. It is not leaving the holder, so onLeave and leaveRoutine
    // must not fire (they would e.g. flip the card face down).
    let stillInside = false;
    if(this.get('layout') == 'multipleSpread' && !isLeaving) {
      const newParent = card.get('parent');
      stillInside = newParent == this.get('id') || widgets.has(newParent) && widgets.get(newParent).get('parent') == this.get('id')
        // picking a card up out of one of the groups detaches it from that pile
        // before it is dropped, which is what makes the pile dispense it. The
        // drag remembers the holder it came from in currentParent, so a card in
        // that state is still inside: if it does end up somewhere else, that is
        // what the isLeaving call from checkParent is for.
        || card.currentParent === this;
    }

    let toProcess = [ card ];
    if(card.get('type') == 'pile')
      toProcess = card.children();
    if(!stillInside) {
      for(const w of toProcess) {
        if(!w.get('ignoreOnLeave')) {
          for(const property in this.get('onLeave')) {
            if(tracingEnabled)
              sendTraceEvent('onLeave', { w: w.get('id'), child: card.get('id'), property, value: this.get('onLeave')[property], toProcess: toProcess.map(w=>w.get('id')) });
            await w.set(property, this.get('onLeave')[property]);
          }
        }
      }
    }
    if(this.get('layout') == 'grid' || this.get('layout') == 'multipleSpread')
      await this.updateAfterShuffle();
    else if(this.get('alignChildren') && (this.get('stackOffsetX') || this.get('stackOffsetY')))
      await this.receiveCard(null);
    if(!stillInside && Array.isArray(this.get('leaveRoutine')))
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

    if(this.get('layout') == 'grid') {
      if(child.get('type') == 'pile') {
        // a pile dropped into a grid breaks up into individual cards (grid has
        // preventPiles, so they won't re-merge). MOVE appends them; an interactive
        // drop inserts them at the cell under the cursor.
        if(child.movedByButton) {
          await this.breakUpPile(child);
          return await this.updateAfterShuffle();
        }
        return await this.snapPileToGrid(child, oldParentID);
      }
      if(child.movedByButton)
        // MOVE fills the grid sequentially
        return await this.updateAfterShuffle();
      // an interactive drop is inserted at the grid cell under the cursor and the
      // other cards reflow around it
      return await this.snapToGridCell(child, oldParentID);
    }

    if(this.get('layout') == 'multipleSpread') {
      if(child.get('dropShadowOwner'))
        // the drop shadow snaps into an aligned single-card slot between the groups,
        // shifting the groups apart to show where the dragged card/group will land
        return await this.rearrangeGroups(this.childOwner(child));
      return await this.placeInSpreadGroups(child, oldParentID);
    }

    // a spread-out group dropped into a holder that is not multipleSpread
    // collapses back into a normal stacked pile
    if(child.get('type') == 'pile' && child.collapse)
      await child.collapse();

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
    if(property == 'dropOffsetX' || property == 'dropOffsetY' || property == 'stackOffsetX' || property == 'stackOffsetY' || property == 'layout' || property == 'spreadOffset') {
      await this.updateAfterShuffle();
    }
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

    if(this.get('layout') == 'grid')
      return await this.rearrangeChildrenGrid(children);

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

  // Arrange all children in a grid, keeping every card fully inside the holder.
  // dropOffset is the margin from the edges and stackOffset the desired gap
  // between cells; when the cards do not all fit at that spacing they overlap
  // instead of spilling outside. The column/row count is chosen to minimise
  // overlap, so a short holder stacks horizontally, a narrow one vertically, and
  // one about a card tall/wide keeps a single row/column with no stacking.
  // Compute the grid geometry for n cards: the column count and per-cell step
  // that keep every card inside the holder with the least overlap (see above).
  // Note: the cell size is taken from the first child, so the grid assumes all
  // children share one size (as a card deck does); mixed-size children may
  // overlap or overflow. This limitation is documented on the wiki.
  gridMetrics(n) {
    const marginX = this.get('dropOffsetX');
    const marginY = this.get('dropOffsetY');
    const gapX = Math.abs(this.get('stackOffsetX')) || 4;
    const gapY = Math.abs(this.get('stackOffsetY')) || 4;
    const first = this.children()[0];
    const cardW = first ? first.get('width')  : this.get('width');
    const cardH = first ? first.get('height') : this.get('height');

    const availX = Math.max(0, this.get('width')  - 2 * marginX - cardW);
    const availY = Math.max(0, this.get('height') - 2 * marginY - cardH);
    const fullStepX = cardW + gapX;
    const fullStepY = cardH + gapY;

    let best = null;
    for(let cols=1; cols<=Math.max(1, n); ++cols) {
      const rows = Math.ceil(n / cols);
      const stepX = cols > 1 ? Math.min(fullStepX, availX / (cols - 1)) : fullStepX;
      const stepY = rows > 1 ? Math.min(fullStepY, availY / (rows - 1)) : fullStepY;
      const overlapX = cols > 1 ? Math.max(0, (cardW - stepX) / cardW) : 0;
      const overlapY = rows > 1 ? Math.max(0, (cardH - stepY) / cardH) : 0;
      const score = Math.max(overlapX, overlapY) + (overlapX + overlapY) / 10;
      if(!best || score < best.score - 1e-9)
        best = { cols, stepX, stepY, score };
    }
    return { cols: best.cols, stepX: best.stepX, stepY: best.stepY, marginX, marginY, cardW, cardH };
  }

  async rearrangeChildrenGrid(children) {
    if(this.preventRearrangeDuringPileDrop || !children.length)
      return;

    const m = this.gridMetrics(children.length);
    let z = 1;
    for(let i=0; i<children.length; ++i) {
      const column = i % m.cols;
      const row = Math.floor(i / m.cols);
      await children[i].setPosition(m.marginX + column * m.stepX, m.marginY + row * m.stepY, z++);
    }
  }

  // Insert an interactively-dropped card into the grid at the cell nearest where
  // it was dropped and reflow the rest so the whole grid stays in order with the
  // new card at that position (rather than the card always landing in the next
  // sequential slot, which is what MOVE does). The other cards flow around it.
  async snapToGridCell(child, oldParentID) {
    let coord = { x: child.get('x'), y: child.get('y') };
    if(!oldParentID)
      coord = this.coordLocalFromCoordGlobal(coord);

    const owner = this.childOwner(child);
    const others = this.children().filter(w=>w != child && !w.get('dropShadowOwner') && (!w.get('owner') || w.get('owner') === owner)).sort((a, b)=>a.get('z') - b.get('z'));
    const m = this.gridMetrics(others.length + 1);
    const column = Math.max(0, Math.min(m.cols - 1, Math.round((coord.x - m.marginX) / m.stepX)));
    const row = Math.max(0, Math.round((coord.y - m.marginY) / m.stepY));
    const index = Math.max(0, Math.min(others.length, row * m.cols + column));

    const ordered = others.slice();
    ordered.splice(index, 0, child);
    // position this lane's cards (including the drop shadow, if child is one)
    // directly, since updateAfterShuffle deliberately skips shadows
    await this.layoutGridCells(ordered);
  }

  // Break a pile dropped interactively into a grid and insert its cards at the
  // cell under the cursor (reflowing the rest), instead of appending them.
  async snapPileToGrid(pile, oldParentID) {
    let coord = { x: pile.get('x'), y: pile.get('y') };
    if(!oldParentID)
      coord = this.coordLocalFromCoordGlobal(coord);

    const incoming = pile.children().slice().sort((a, b)=>a.get('z') - b.get('z'));
    const owner = this.childOwner(pile);
    await this.breakUpPile(pile);

    const others = this.children().filter(w=>!incoming.includes(w) && !w.get('dropShadowOwner') && (!w.get('owner') || w.get('owner') === owner)).sort((a, b)=>a.get('z') - b.get('z'));
    const m = this.gridMetrics(others.length + incoming.length);
    const column = Math.max(0, Math.min(m.cols - 1, Math.round((coord.x - m.marginX) / m.stepX)));
    const row = Math.max(0, Math.round((coord.y - m.marginY) / m.stepY));
    const index = Math.max(0, Math.min(others.length, row * m.cols + column));

    const ordered = others.slice(0, index).concat(incoming, others.slice(index));
    await this.layoutGridCells(ordered);
  }

  // Position an ordered list of cards into grid cells and assign matching z.
  async layoutGridCells(cards) {
    if(!cards.length)
      return;
    const m = this.gridMetrics(cards.length);
    let z = 1;
    for(let i=0; i<cards.length; ++i) {
      const column = i % m.cols;
      const row = Math.floor(i / m.cols);
      await cards[i].setPosition(m.marginX + column * m.stepX, m.marginY + row * m.stepY, z++);
    }
  }

  // Lay out the holder's direct children (piles act as spread groups, loose cards
  // as groups of one) side by side, snapped into an aligned row and separated by
  // spreadOffset. Groups keep their stable left-to-right order (so they don't jump
  // around while a card is dragged over them); each pile spreads its own cards
  // using the holder's stackOffset values.
  //
  // While a drop shadow is present the row makes room for it: when the shadow sits
  // between two groups a single-card-width slot opens up there (the groups shift
  // apart) to show a new group being inserted; when the shadow sits over a group,
  // no slot opens and the card will join that group instead. The insertion index
  // is derived from the group order (not from re-sorting the shadow into it), so
  // the opened slot is stable and a card can reliably be dropped between groups.
  async rearrangeGroups(owner) {
    if(this.preventRearrangeDuringPileDrop)
      return;

    let stepX = this.get('stackOffsetX') || 0;
    let stepY = this.get('stackOffsetY') || 0;
    const spread = this.get('spreadOffset');
    let gap = spread === null || spread === undefined ? 8 : spread;

    // arrange only the groups belonging to one owner's "lane" (a null owner is
    // shared and part of every lane) so each player's groups are laid out
    // independently in the same space
    const all = this.childrenFilter(super.children(), true).slice();
    const shadow = all.find(w=>w.get('dropShadowOwner') && (owner === undefined || this.childOwner(w) === owner));
    const groups = all.filter(w=>!w.get('dropShadowOwner') && (owner === undefined || !w.get('owner') || w.get('owner') === owner)).sort((a, b)=>(a.get('x') - b.get('x')) || (a.get('z') - b.get('z')));

    // decide where the shadow goes: over a group (insert within that group's fan)
    // or between two groups / at an end (insert a new group). The shadow is
    // positioned in global coordinates while the groups store holder-relative
    // coordinates,
    // so convert to the holder's frame (via coordLocalFromCoordGlobal, which
    // accounts for any scaling/nesting between the holder and the root) before
    // comparing.
    let insertIndex = -1, overGroup = null, fanIndex = -1;
    if(shadow) {
      const shadowPosition = this.coordLocalFromCoordGlobal({ x: shadow.get('x'), y: shadow.get('y') });
      const shadowCenter = { x: shadowPosition.x + shadow.get('width') / 2, y: shadowPosition.y + shadow.get('height') / 2 };
      overGroup = groups.find(g=>shadowCenter.x >= g.get('x') && shadowCenter.x <= g.get('x') + g.get('width') && shadowCenter.y >= g.get('y') && shadowCenter.y <= g.get('y') + g.get('height'));
      if(overGroup) {
        fanIndex = this.spreadFanIndex(overGroup, shadowPosition);
      } else {
        insertIndex = 0;
        for(const g of groups)
          if(g.get('x') + g.get('width') / 2 < shadowCenter.x)
            ++insertIndex;
      }
    }

    // fan the piles; open a single-card gap in the group the shadow is over
    for(const group of groups)
      if(group.get('type') == 'pile' && group.arrangeAsSpread)
        await group.arrangeAsSpread(stepX, stepY, group === overGroup ? fanIndex : -1);

    const shadowW = shadow ? shadow.get('width') : 0;
    const shadowH = shadow ? shadow.get('height') : 0;
    // keep the shadow inside the holder so it only ever snaps to a valid position
    const maxShadowX = Math.max(this.get('dropOffsetX'), this.get('width') - this.get('dropOffsetX') - shadowW);
    const maxShadowY = Math.max(this.get('dropOffsetY'), this.get('height') - this.get('dropOffsetY') - shadowH);
    const placeShadow = async (sx, sy, sz)=>await shadow.setPosition(Math.max(this.get('dropOffsetX'), Math.min(sx, maxShadowX)), Math.max(this.get('dropOffsetY'), Math.min(sy, maxShadowY)), sz);

    let x = this.get('dropOffsetX');
    const y = this.get('dropOffsetY');
    let z = 1, overGroupShadowX = 0, overGroupShadowY = 0;
    for(let i=0; i<groups.length; ++i) {
      if(i === insertIndex) {
        await placeShadow(x, y, z++);
        x += shadowW + gap;
      }
      // remember where the group the shadow is over ends up, to place the shadow in its fan
      if(groups[i] === overGroup) {
        overGroupShadowX = x + fanIndex * (stepX || (!stepY ? shadowW : 0));
        overGroupShadowY = y + fanIndex * stepY;
      }
      await groups[i].setPosition(x, y, z++);
      x += groups[i].get('width') + gap;
    }
    if(insertIndex >= groups.length)
      await placeShadow(x, y, z++);
    else if(overGroup)
      await placeShadow(overGroupShadowX, overGroupShadowY, z++);
  }

  // Decide what happens to a card or group (pile) dropped into a multipleSpread
  // holder based on where it landed, mirroring what the drop shadow showed. If it
  // is over the central part of an existing group it is merged into that group (a
  // spread-out pile); otherwise it is snapped to the clean slot between groups and
  // becomes a new group at that position. A final rearrangeGroups (from moveEnd)
  // then tidies the whole row. multipleSpread does its own grouping here so that
  // wide groups can be inserted between others without accidentally merging.
  // The fan index (position within a group's spread) that a drop at a
  // holder-relative coordinate maps to. Use the dominant spread axis so both
  // horizontal and vertical fans can insert at a specific spot.
  spreadFanIndex(group, position) {
    const stepX = this.get('stackOffsetX') || 0;
    const stepY = this.get('stackOffsetY') || 0;
    const vertical = Math.abs(stepY) > Math.abs(stepX);
    const coordinate = vertical ? position.y : position.x;
    const origin = group.get(vertical ? 'y' : 'x');
    const count = group.get('type') == 'pile' ? group.children().length : 1;
    // derive the actual per-card step from the group's rendered size
    const card = group.get('type') == 'pile' ? group.children()[0] : group;
    const cardSize = card ? card.get(vertical ? 'height' : 'width') : 0;
    let step = count > 1 ? (group.get(vertical ? 'height' : 'width') - cardSize) / (count - 1) : 0;
    if(!step)
      step = (vertical ? stepY : stepX) || cardSize || 1;
    return Math.max(0, Math.min(count, Math.round((coordinate - origin) / step)));
  }

  // The owner a dragged/dropped child ends up with in this holder, used to arrange
  // each player's cards independently. childrenPerOwner assigns the dragging or
  // target player; otherwise the child keeps its own owner (e.g. a seat hand).
  childOwner(child) {
    if(child.get('dropShadowOwner'))
      return this.get('childrenPerOwner') ? child.get('dropShadowOwner') : (child.get('owner') || null);
    if(this.get('childrenPerOwner'))
      return child.targetPlayer || child.get('owner') || playerName;
    return child.get('owner') || null;
  }

  // Start of a MOVE batch into this holder: all the moved cards should end up in
  // one group. Pick the target group implied by the MOVE `position` (an existing
  // group for pileBottom/pileTop, or a fresh group at the start/end otherwise).
  beginSpreadMove(position) {
    // the target group is resolved lazily on the first card, once its owner is
    // known, so the batch joins the correct player's group
    this._spreadMove = { position, resolved: false, target: null, atStart: position == 'pileBottom' || position == 'groupStart' };
  }

  async endSpreadMove() {
    delete this._spreadMove;
    await this.updateAfterShuffle();
  }

  async placeInSpreadGroups(child, oldParentID) {
    // while regroupBy rebuilds the groups it assigns parents/positions itself
    if(this._regrouping)
      return;

    await super.onChildAddAlign(child, oldParentID);

    // a card returning to the holder because its own group dissolved (down to its
    // last card) must stay a single group of its own, not be re-merged into a
    // neighbouring group; just re-lay this player's groups
    if(oldParentID && widgets.has(oldParentID) && widgets.get(oldParentID).isBeingRemoved)
      return await this.rearrangeGroups(this.childOwner(child));

    // during a MOVE batch, funnel every moved card into the one target group
    if(this._spreadMove) {
      const sm = this._spreadMove;
      if(!sm.resolved) {
        // resolve the batch target group now that we know the moved cards' owner
        sm.resolved = true;
        const owner = this.childOwner(child);
        const groups = this.childrenFilter(super.children(), true).filter(w=>w != child && !w.get('dropShadowOwner') && (!w.get('owner') || w.get('owner') === owner)).sort((a, b)=>a.get('x') - b.get('x'));
        if(sm.position == 'pileBottom' && groups.length)
          sm.target = groups[0];
        else if(sm.position == 'pileTop' && groups.length)
          sm.target = groups[groups.length - 1];
      }
      if(sm.target) {
        sm.target = await this.mergeGroups(child, sm.target);
      } else {
        // first card of a brand new group for this batch
        await child.setPosition(sm.atStart ? -1 : this.get('width') * 1000, this.get('dropOffsetY'), child.get('z'));
        sm.target = child;
      }
      return;
    }

    const spread = this.get('spreadOffset');
    const gap = spread === null || spread === undefined ? 8 : spread;

    // only consider this player's own groups (a null owner is shared), so a card
    // never joins or is positioned relative to another player's groups
    const owner = this.childOwner(child);
    const others = this.childrenFilter(super.children(), true).filter(w=>w != child && !w.get('dropShadowOwner') && (!w.get('owner') || w.get('owner') === owner)).sort((a, b)=>a.get('x') - b.get('x'));
    const center = { x: child.get('x') + child.get('width') / 2, y: child.get('y') + child.get('height') / 2 };

    // dropped over an existing group -> insert into that group's fan at the
    // position under the cursor; dropped in a gap -> new group between groups
    const joinGroup = others.find(g=>center.x >= g.get('x') && center.x <= g.get('x') + g.get('width') && center.y >= g.get('y') && center.y <= g.get('y') + g.get('height'));
    if(joinGroup)
      return await this.mergeGroups(child, joinGroup, this.spreadFanIndex(joinGroup, { x: child.get('x'), y: child.get('y') }));

    let index = 0;
    for(const g of others)
      if(g.get('x') + g.get('width') / 2 < center.x)
        ++index;
    let x = this.get('dropOffsetX');
    for(let i=0; i<index; ++i)
      x += others[i].get('width') + gap;
    await child.setPosition(x, this.get('dropOffsetY'), child.get('z'));
  }

  // Merge a dropped card or group (child) into an existing group, inserting it at
  // fan position `index` (default: the end). If the target group is still a single
  // loose card, a pile is created for it first. Cards from a dropped pile are moved
  // individually so the result is one spread-out group, and z is reassigned so the
  // fan order (and layering) matches the requested position.
  async mergeGroups(child, group, index) {
    let pile = group;
    if(group.get('type') != 'pile') {
      const pileDef = Object.assign({
        type: 'pile',
        parent: this.get('id'),
        x: group.get('x'),
        y: group.get('y'),
        width: group.get('width'),
        height: group.get('height')
      }, group.get('onPileCreation'));
      if(group.get('owner') !== null && group.get('owner') !== undefined)
        pileDef.owner = group.get('owner');
      pile = widgets.get(await addWidgetLocal(pileDef));
      await group.set('parent', pile.get('id'));
    }

    const incoming = child.get('type') == 'pile' ? child.children().slice().sort((a, b)=>a.get('z') - b.get('z')) : [ child ];
    for(const c of incoming)
      await c.set('parent', pile.get('id'));

    const existing = pile.children().slice().filter(c=>!incoming.includes(c)).sort((a, b)=>a.get('z') - b.get('z'));
    const at = index === undefined ? existing.length : Math.max(0, Math.min(existing.length, index));
    const ordered = existing.slice(0, at).concat(incoming, existing.slice(at));
    let z = 1;
    for(const c of ordered)
      await c.set('z', z++);
    await pile.reSpreadForHolder();
    return pile;
  }

  // SORT on a multipleSpread holder sorts the cards within each spread group
  // (pile) individually and leaves the groups themselves where they are, i.e. it
  // behaves like sorting each pile in the holder rather than reordering groups.
  async sortGroupContents(key, reverse, locales, options) {
    for(const group of this.childrenFilter(super.children(), true))
      if(group.get('type') == 'pile')
        await sortWidgets(group.children(), key, reverse, locales, options, true);
    await this.updateAfterShuffle();
  }

  // SORT with groupBy on a multipleSpread holder: sort all of a lane's cards by
  // `key` and re-partition them into one spread group per distinct value of the
  // groupBy property (e.g. one group per suit), per owner lane.
  async regroupBy(property, key, reverse, locales, options) {
    const all = this.childrenFilter(super.children(), true).filter(w=>!w.get('dropShadowOwner'));
    const owners = new Set(all.map(c=>c.get('owner') || null));
    this._regrouping = true;
    for(const owner of (owners.size ? owners : [ null ])) {
      const lane = all.filter(c=>!c.get('owner') || c.get('owner') === owner);
      const cards = [];
      for(const g of lane)
        cards.push(...(g.get('type') == 'pile' ? g.children() : [ g ]));
      if(!cards.length)
        continue;

      await sortWidgets(cards, key || property, reverse, locales, options, true);

      // every card with the same groupBy value forms one group, no matter where
      // the sort put it: sorting by rank interleaves the suits, so cutting the
      // sorted cards into consecutive runs would create one group per run
      // instead of one per suit. The groups follow the order in which the sorted
      // cards first mention their value, the cards within a group the sort.
      const runs = [];
      const runByValue = new Map();
      for(const c of cards) {
        const value = c.get(property);
        const valueKey = JSON.stringify(value === undefined ? null : value);
        if(!runByValue.has(valueKey)) {
          runByValue.set(valueKey, { value, cards: [] });
          runs.push(runByValue.get(valueKey));
        }
        runByValue.get(valueKey).cards.push(c);
      }

      let z = 1;
      for(const run of runs) {
        if(run.cards.length == 1) {
          const c = run.cards[0];
          await c.set('parent', this.get('id'));
          await c.setPosition(this.get('dropOffsetX'), this.get('dropOffsetY'), z++);
        } else {
          const first = run.cards[0];
          const pileDef = Object.assign({
            type: 'pile',
            parent: this.get('id'),
            x: this.get('dropOffsetX'),
            y: this.get('dropOffsetY'),
            width: first.get('width'),
            height: first.get('height')
          }, first.get('onPileCreation'));
          if(owner)
            pileDef.owner = owner;
          const pile = widgets.get(await addWidgetLocal(pileDef));
          let pz = 1;
          for(const c of run.cards) {
            await c.set('parent', pile.get('id'));
            await c.set('z', pz++);
          }
          await pile.set('z', z++);
        }
      }
    }
    delete this._regrouping;
    await this.updateAfterShuffle();
  }

  // Move all of a dropped pile's cards into this holder as loose cards so the
  // pile dissolves (its handle disappears). The caller arranges them afterwards.
  async breakUpPile(pile) {
    this.preventRearrangeDuringPileDrop = true;
    for(const w of pile.children().reverse()) {
      await w.set('x', this.get('dropOffsetX'));
      await w.set('y', this.get('dropOffsetY'));
      await w.set('parent', this.get('id'));
      await w.bringToFront();
    }
    delete this.preventRearrangeDuringPileDrop;
  }

  supportsPiles() {
    const layout = this.get('layout');
    if(layout == 'multipleSpread')
      return true;
    if(layout == 'grid')
      return false;
    return !this.get('preventPiles') && (!this.get('alignChildren') || !this.get('stackOffsetX') && !this.get('stackOffsetY'));
  }

  async updateAfterShuffle() {
    if(this._regrouping)
      return;

    const layout = this.get('layout');

    // grid and multipleSpread arrange each owner's cards independently (a null
    // owner is shared and included in every lane), so different players' cards in
    // the same holder don't get laid out as if they were one player's
    if(layout == 'multipleSpread' || layout == 'grid') {
      const groups = this.childrenFilter(super.children(), true).filter(w=>!w.get('dropShadowOwner'));
      const owners = new Set(groups.map(c=>c.get('owner') || null));
      for(const owner of (owners.size ? owners : [ null ])) {
        if(layout == 'multipleSpread')
          await this.rearrangeGroups(owner);
        else
          await this.rearrangeChildrenGrid(groups.filter(c=>!c.get('owner') || c.get('owner')===owner).sort((a, b)=>a.get('z') - b.get('z')));
      }
      return;
    }

    if(!this.get('stackOffsetX') && !this.get('stackOffsetY'))
      return;

    const children = this.children();
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
