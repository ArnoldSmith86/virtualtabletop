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
    return super.get(property);
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
    if(this.get('layout') == 'grid' || this.get('layout') == 'multipleSpread')
      await this.updateAfterShuffle();
    else if(this.get('alignChildren') && (this.get('stackOffsetX') || this.get('stackOffsetY')))
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

    if(this.get('layout') == 'grid') {
      if(child.get('type') == 'pile') {
        // a pile dropped into a grid must break up into individual cards (grid
        // has preventPiles, so the cards won't re-merge) rather than staying a pile
        await this.breakUpPile(child);
        return await this.updateAfterShuffle();
      }
      if(child.movedByButton)
        // MOVE fills the grid sequentially
        return await this.updateAfterShuffle();
      // an interactive drop lands in the grid cell nearest the cursor, leaving
      // the other cards untouched
      return await this.snapToGridCell(child, oldParentID);
    }

    if(this.get('layout') == 'multipleSpread') {
      if(child.get('dropShadowOwner'))
        // the drop shadow snaps into an aligned single-card slot between the groups,
        // shifting the groups apart to show where the dragged card/group will land
        return await this.rearrangeGroups();
      return await this.placeInSpreadGroups(child, oldParentID);
    }

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

  // Snap an interactively-dropped card to the grid cell nearest where it was
  // dropped, leaving the other cards where they are. This lets a designer/player
  // place a card in a specific grid position instead of it always flowing to the
  // next sequential slot (which is what happens for MOVE and re-layouts).
  async snapToGridCell(child, oldParentID) {
    let coord = { x: child.get('x'), y: child.get('y') };
    if(!oldParentID)
      coord = this.coordLocalFromCoordGlobal(coord);

    const m = this.gridMetrics(this.children().length);
    const column = Math.max(0, Math.min(m.cols - 1, Math.round((coord.x - m.marginX) / m.stepX)));
    const row = Math.max(0, Math.round((coord.y - m.marginY) / m.stepY));
    await child.setPosition(m.marginX + column * m.stepX, m.marginY + row * m.stepY, child.get('z'));
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
  async rearrangeGroups() {
    if(this.preventRearrangeDuringPileDrop)
      return;

    const stepX = this.get('stackOffsetX') || 0;
    const stepY = this.get('stackOffsetY') || 0;
    const spread = this.get('spreadOffset');
    const gap = spread === null || spread === undefined ? 8 : spread;

    const all = this.childrenFilter(super.children(), true).slice();
    const shadow = all.find(w=>w.get('dropShadowOwner'));
    const groups = all.filter(w=>!w.get('dropShadowOwner')).sort((a, b)=>(a.get('x') - b.get('x')) || (a.get('z') - b.get('z')));

    // fan the piles first so their widths are up to date before we place them
    for(const group of groups)
      if(group.get('type') == 'pile' && group.arrangeAsSpread)
        await group.arrangeAsSpread(stepX, stepY);

    // decide where the shadow goes: over a group (join, no slot) or between two
    // groups / at an end (insert, open a one-card slot)
    let insertIndex = -1;
    if(shadow) {
      // the shadow is positioned in global coordinates while the groups store
      // holder-relative x, so convert to the same frame before comparing
      const shadowCenter = shadow.get('x') - this.absoluteCoord('x') + shadow.get('width') / 2;
      // join (no slot) when the cursor is over the central part of a group;
      // otherwise open an insertion slot at the matching index
      const overGroup = groups.some(g=>Math.abs(shadowCenter - (g.get('x') + g.get('width') / 2)) <= g.get('width') * 0.25);
      if(!overGroup) {
        insertIndex = 0;
        for(const g of groups)
          if(g.get('x') + g.get('width') / 2 < shadowCenter)
            ++insertIndex;
      }
    }

    const shadowW = shadow ? shadow.get('width') : 0;
    let x = this.get('dropOffsetX');
    const y = this.get('dropOffsetY');
    let z = 1;
    for(let i=0; i<groups.length; ++i) {
      if(i === insertIndex) {
        await shadow.setPosition(x, y, z++);
        x += shadowW + gap;
      }
      await groups[i].setPosition(x, y, z++);
      x += groups[i].get('width') + gap;
    }
    if(insertIndex >= groups.length)
      await shadow.setPosition(x, y, z++);
  }

  // Decide what happens to a card dropped into a multipleSpread holder based on
  // where it landed, mirroring what the drop shadow showed. If it is over the
  // central part of an existing group it is left there so it merges into that
  // group (updatePiles turns them into one spread-out pile). Otherwise it is
  // snapped to the clean slot between groups so it does not overlap a neighbour
  // and therefore becomes a new group at that position. A final rearrangeGroups
  // (from moveEnd) then tidies the whole row.
  async placeInSpreadGroups(child, oldParentID) {
    await super.onChildAddAlign(child, oldParentID);

    const spread = this.get('spreadOffset');
    const gap = spread === null || spread === undefined ? 8 : spread;

    const others = this.childrenFilter(super.children(), true).filter(w=>w != child && !w.get('dropShadowOwner')).sort((a, b)=>a.get('x') - b.get('x'));
    const center = child.get('x') + child.get('width') / 2;

    if(others.some(g=>Math.abs(center - (g.get('x') + g.get('width') / 2)) <= g.get('width') * 0.25))
      return; // over a group: let updatePiles merge the card into it

    let index = 0;
    for(const g of others)
      if(g.get('x') + g.get('width') / 2 < center)
        ++index;
    let x = this.get('dropOffsetX');
    for(let i=0; i<index; ++i)
      x += others[i].get('width') + gap;
    await child.setPosition(x, this.get('dropOffsetY'), child.get('z'));
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
    if(this.get('layout') == 'multipleSpread')
      return await this.rearrangeGroups();

    if(this.get('layout') != 'grid' && !this.get('stackOffsetX') && !this.get('stackOffsetY'))
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
