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
      if(child.get('type') == 'pile')
        // a pile dropped into a grid must break up into individual cards (grid
        // has preventPiles, so the cards won't re-merge) rather than staying a pile
        await this.breakUpPile(child);
      else
        await super.onChildAddAlign(child, oldParentID);
      return await this.updateAfterShuffle();
    }

    if(this.get('layout') == 'multipleSpread' && child.get('dropShadowOwner'))
      // the drop shadow snaps into an aligned single-card slot between the groups,
      // shifting the groups apart to show where the dragged card/group will land
      return await this.rearrangeGroups();

    // multipleSpread relies on the normal free-drop + pile-creation flow: a card
    // dropped onto another card merges into a (spread-out) pile group, a card
    // dropped on empty holder space starts a new group. So it deliberately falls
    // through to the default placement below rather than snapping/re-tidying here.

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
  async rearrangeChildrenGrid(children) {
    if(this.preventRearrangeDuringPileDrop || !children.length)
      return;

    const n = children.length;
    const marginX = this.get('dropOffsetX');
    const marginY = this.get('dropOffsetY');
    const gapX = Math.abs(this.get('stackOffsetX')) || 4;
    const gapY = Math.abs(this.get('stackOffsetY')) || 4;
    const cardW = children[0].get('width');
    const cardH = children[0].get('height');

    const availX = Math.max(0, this.get('width')  - 2 * marginX - cardW);  // room for column offsets
    const availY = Math.max(0, this.get('height') - 2 * marginY - cardH);  // room for row offsets
    const fullStepX = cardW + gapX;
    const fullStepY = cardH + gapY;

    let best = null;
    for(let cols=1; cols<=n; ++cols) {
      const rows = Math.ceil(n / cols);
      const stepX = cols > 1 ? Math.min(fullStepX, availX / (cols - 1)) : 0;
      const stepY = rows > 1 ? Math.min(fullStepY, availY / (rows - 1)) : 0;
      const overlapX = cols > 1 ? Math.max(0, (cardW - stepX) / cardW) : 0;
      const overlapY = rows > 1 ? Math.max(0, (cardH - stepY) / cardH) : 0;
      const score = Math.max(overlapX, overlapY) + (overlapX + overlapY) / 10;
      if(!best || score < best.score - 1e-9)
        best = { cols, stepX, stepY, score };
    }

    let z = 1;
    for(let i=0; i<n; ++i) {
      const column = i % best.cols;
      const row = Math.floor(i / best.cols);
      await children[i].setPosition(marginX + column * best.stepX, marginY + row * best.stepY, z++);
    }
  }

  // Lay out the holder's direct children (piles act as spread groups, loose cards
  // as groups of one) side by side, snapped into an aligned row and separated by
  // spreadOffset. Groups keep their left-to-right order so a group stays roughly
  // where the player dropped it, but is aligned rather than left freeform. Each
  // pile spreads its own cards using the holder's stackOffset values.
  async rearrangeGroups() {
    if(this.preventRearrangeDuringPileDrop)
      return;

    const stepX = this.get('stackOffsetX') || 0;
    const stepY = this.get('stackOffsetY') || 0;
    const spread = this.get('spreadOffset');
    const gap = spread === null || spread === undefined ? 8 : spread;

    const groups = this.childrenFilter(super.children(), true).slice().sort((a, b)=>(a.get('x') - b.get('x')) || (a.get('z') - b.get('z')));

    let x = this.get('dropOffsetX');
    const y = this.get('dropOffsetY');
    let z = 1;
    for(const group of groups) {
      if(group.get('type') == 'pile' && group.arrangeAsSpread)
        await group.arrangeAsSpread(stepX, stepY);
      await group.setPosition(x, y, z++);
      x += group.get('width') + gap;
    }
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
