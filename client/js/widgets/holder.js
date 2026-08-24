// What each layout decides for the holder. Only the properties named here are
// overridden while the layout is in effect; every other property keeps its raw
// value and acts as a knob of the layout (the fan step of a multipleSpread, the
// margins of a grid, ...).
const layoutDerivedProperties = {
  pile:           { alignChildren: true,  allowPiles: false, stackOffsetX: 0, stackOffsetY: 0 },
  singleSpread:   { alignChildren: true,  allowPiles: false, preventPiles: false },
  multipleSpread: { alignChildren: true,  allowPiles: true,  preventPiles: false, dropShadow: true },
  grid:           { alignChildren: true,  allowPiles: false, preventPiles: true },
  random:         { alignChildren: true,  allowPiles: false, preventPiles: true },
  freeform:       { alignChildren: false },
  // allowPiles is derived from the holder's size - see Holder.get
  auto:           { alignChildren: true,  preventPiles: false }
};

// The properties a get() on a holder may derive from its layout instead of
// answering from the state (see Holder.get below).
const layoutDerivableProperties = new Set([ 'alignChildren', 'preventPiles', 'allowPiles', 'dropShadow', 'stackOffsetX', 'stackOffsetY', 'dropOffsetX', 'dropOffsetY', 'pilesGapX' ]);

// The raw arrangement properties that switch an auto layout off: while any of
// them is written to a value that differs from its classic default, the holder
// behaves exactly as if its layout were 'custom'. That way JSON written
// against the classic properties - copied from an older game or from the wiki -
// keeps meaning exactly what it always did, while a written default (like
// allowPiles: false) stays the classic no-op it always was and leaves the
// auto layout in charge.
const autoDeferProperties = [ 'alignChildren', 'preventPiles', 'allowPiles', 'stackOffsetX', 'stackOffsetY', 'dropOffsetX', 'dropOffsetY', 'pilesOffsetX', 'pilesOffsetY', 'pilesGapX', 'pilesGapY', 'spreadMin' ];

// The padding the auto layout keeps between its children and to the border.
const autoLayoutPadding = 4;

// How far the random layout tilts its pieces, in degrees to either side.
const randomLayoutMaxTilt = 15;

export class Holder extends ImageWidget {
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

      layout: 'auto',
      stackOffsetX: 0,
      stackOffsetY: 0,
      pilesOffsetX: null,
      pilesOffsetY: null,
      pilesGapX: null,
      pilesGapY: null,
      spreadMin: null,
      gridColumns: null,
      gridRows: null,
      borderRadius: 8
    });
  }

  // Games from before the layout property keep the classic default: every one
  // of their holders behaves exactly as it always did, while holders in newer
  // games start from 'auto'. Only the class default is replaced - an answer
  // that came through inheritFrom went through the source's get() and is
  // already legacy-aware.
  getDefaultValue(property) {
    const value = super.getDefaultValue(property);
    if(property == 'layout' && value === 'auto' && legacyMode('classicHolderLayout'))
      return 'custom';
    return value;
  }

  // The layout the holder actually follows. 'auto' only applies while the game
  // leaves the raw arrangement properties at their classic defaults - as soon
  // as one of them is written to something else, in the holder's own state or
  // served through inheritFrom, the holder answers to it like it always has.
  // getDefaultValue resolves what inheritFrom serves (or the class default),
  // so the check below compares the value each property actually follows.
  // The optional parameter lets a property change ask what another layout
  // value would mean.
  effectiveLayout(layoutValue) {
    let layout = layoutValue !== undefined ? layoutValue : super.get('layout');
    if(layout === null || layout === undefined)
      layout = 'custom';
    if(layout == 'auto' && autoDeferProperties.some(p=>(this.state[p] !== undefined ? this.state[p] : super.getDefaultValue(p)) !== this.defaults[p]))
      return 'custom';
    return layout;
  }

  usesAutoLayout() {
    return this.effectiveLayout() == 'auto';
  }

  // What get('allowPiles') answers under the given effective layout. The auto
  // layout only allows piles where it has no room to line the cards up anyway
  // - the classic holder that fits just one card - and a game that writes
  // allowPiles: false itself keeps them off there as well (writing true is a
  // classic arrangement setup and switches the auto layout off entirely, see
  // effectiveLayout). onPropertyChange also asks this about the layout a
  // change just left behind.
  derivedAllowPiles(layout) {
    const derived = layoutDerivedProperties[layout];
    if(derived && derived.allowPiles !== undefined)
      return derived.allowPiles;
    // a value the game wrote (or serves through inheritFrom) can only be the
    // default false under an active auto layout - anything else would have
    // switched it off - so its mere presence means piles are off
    if(layout == 'auto')
      return this.state.allowPiles === undefined && !(this.inheritedProperties && this.inheritedProperties.allowPiles) && !this.autoSpreads();
    return !!super.get('allowPiles');
  }

  // The layout decides the lower-level properties it owns, so reading them
  // through get() returns what the layout implies and this class and the base
  // Widget stay consistent. Only the properties in layoutDerivableProperties
  // are ever derived - everything else (the common case) skips the layout
  // lookup entirely so get() stays cheap on this hot path.
  get(property) {
    if(property == 'layout') {
      const layout = super.get('layout');
      return layout === null ? 'custom' : layout;
    }
    if(layoutDerivableProperties.has(property)) {
      const layout = this.effectiveLayout();
      const derived = layoutDerivedProperties[layout];
      if(derived && derived[property] !== undefined)
        return derived[property];
      // choosing a spread has to visibly spread, so a singleSpread without any
      // stack offset gets the classic hand fan as its starting point
      if(layout == 'singleSpread' && (property == 'stackOffsetX' || property == 'stackOffsetY') && !super.get('stackOffsetX') && !super.get('stackOffsetY'))
        return property == 'stackOffsetX' ? 40 : 0;
      // the groups of a multipleSpread sit a small default gap apart until the
      // game spaces them out itself (an explicit pilesGapX of 0 packs them flush)
      if(layout == 'multipleSpread' && property == 'pilesGapX' && [ 'pilesOffsetX', 'pilesOffsetY', 'pilesGapX', 'pilesGapY' ].every(p=>super.get(p) === null))
        return 8;
      // an auto holder too small to arrange its cards centers them: the classic
      // paths put children at the drop offset, so that is where centering lives
      if(layout == 'auto' && (property == 'dropOffsetX' || property == 'dropOffsetY') && !this.autoSpreads())
        return this.autoCenteredDropOffset(property == 'dropOffsetX' ? 'X' : 'Y');
      // piles fight an arrangement, so the auto layout decides from its size
      // whether it allows them - see derivedAllowPiles
      if(layout == 'auto' && property == 'allowPiles')
        return this.derivedAllowPiles(layout);
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
    else if(this.get('allowPiles'))
      // a holder that arranges piles still holds cards as far as everything
      // else is concerned: MOVE, COUNT and dropLimit count the cards, not the
      // piles they happen to be arranged in
      children = children.flatMap(c=>c.get('type') == 'pile' ? this.childrenFilter(c.children(), false) : [ c ]);
    return children;
  }

  // The widgets this holder lines up. A pile counts as one entry here, unlike
  // in children(), which reports the cards inside it - even where piles are
  // not allowed: one that is inside anyway (say, put there by a routine) is
  // arranged as the block it is rather than reaching into its cards, whose
  // coordinates are relative to the pile.
  arrangedChildren() {
    return this.childrenFilter(super.children(), true);
  }

  arrangedChildrenOwned() {
    return this.arrangedChildren().filter(c=>!c.get('owner') || c.get('owner') == playerName);
  }

  // The pile or card of this holder that a widget dropped at the given spot lands
  // on, which is the one it is meant to join. A pile counts across its whole box:
  // a card dropped anywhere on a fanned pile belongs to that pile, and hitting
  // the corner of it - all a pile outside a holder takes - would be guesswork
  // where the holder decides how far apart the piles sit. What aims the drop is
  // the spot the player is holding the dropped widget by: a pile that spreads
  // its own cards keeps its fan while it is carried, and the middle of that fan
  // can be several cards away from what the player is aiming with. Where nothing
  // is holding it - a routine putting a widget down - the middle of its box aims
  // it, the same point the surface hit tests to decide which holder a drag ended
  // in.
  arrangedChildAt(child, x, y) {
    const anchor = child.dropAnchor;
    const pointX = x + (anchor ? anchor.x : child.get('width' )/2);
    const pointY = y + (anchor ? anchor.y : child.get('height')/2);
    return this.arrangedChildrenOwned().filter(c=>c != child && !c.get('dropShadowOwner')
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

  // isLeaving is set by checkParent, which only calls this once the card really
  // has left the holder (dropped elsewhere or dragged off it).
  async dispenseCard(card, isLeaving=false) {
    // in a holder that arranges piles a card often just moves between groups
    // (a drag between fans, a SORT with groupBy, a merge) - its new parent is
    // still this holder or a pile inside it. It is not leaving the holder, so
    // onLeave and leaveRoutine must not fire (they would e.g. flip the card
    // face down in a typical hand).
    let stillInside = false;
    if(this.get('allowPiles') && !isLeaving) {
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
        // the tilt of the random layout belongs to the tray: a piece taken out
        // straightens up again (an onLeave below can still rotate it itself)
        if(this.get('layout') == 'random')
          await w.set('rotation', w.getDefaultValue('rotation'));
        if(!w.get('ignoreOnLeave')) {
          for(const property in this.get('onLeave')) {
            if(tracingEnabled)
              sendTraceEvent('onLeave', { w: w.get('id'), child: card.get('id'), property, value: this.get('onLeave')[property], toProcess: toProcess.map(w=>w.get('id')) });
            await w.set(property, this.get('onLeave')[property]);
          }
        }
      }
    }
    if(this.get('layout') == 'grid')
      await this.updateAfterShuffle();
    else if(this.get('alignChildren') && this.spreadsChildren())
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
        // a pile dropped into a grid breaks up into individual cards (the grid
        // derives preventPiles, so they won't re-merge). MOVE appends them; an
        // interactive drop inserts them at the cell under the cursor.
        if(child.movedByButton) {
          await this.breakUpPile(child);
          return await this.updateAfterShuffle();
        }
        return await this.snapPileToGrid(child, oldParentID);
      }
      if(child.movedByButton)
        // MOVE fills the grid sequentially
        return await this.updateAfterShuffle();
      // an interactive drop is inserted at the grid cell under the cursor and
      // the other cards reflow around it
      return await this.snapToGridCell(child, oldParentID);
    }

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
          // the random layout scatters from where the pile was dropped, so the
          // cards keep that spot instead of gathering on the drop offset
          if(this.get('alignChildren') && !this.get('stackOffsetX') && !this.get('stackOffsetY') && this.get('layout') != 'random') {
            await w.set('x', this.get('dropOffsetX'));
            await w.set('y', this.get('dropOffsetY'));
          }
          await w.bringToFront();
        }
      }
      delete this.preventRearrangeDuringPileDrop;
      if(!this.get('preventPiles') || this.get('layout') == 'random')
        await this.receiveCard();
      return true;
    }

    if(!spreads)
      await super.onChildAddAlign(child, oldParentID);
    else if(child.movedByButton) {
      const [ axis, direction ] = this.spreadDirection();
      // the auto layout wraps into rows, so "the end" is the end on both axes
      const auto = this.usesAutoLayout();
      await this.receiveCard(child, [ axis == 'X' || auto ? direction*999999 : 0, axis == 'Y' || auto ? direction*999999 : 0 ]);
    } else {
      const x = child.get('x') - this.absoluteCoord('x');
      const y = child.get('y') - this.absoluteCoord('y');
      // Where the widget lands decides whether it piles up with what is already
      // there, so that has to be settled before the holder pulls it into its
      // slot: from there on it sits a whole slot away from its neighbours and
      // could never combine with any of them.
      const target = this.get('allowPiles') ? this.arrangedChildAt(child, x, y) : null;
      if(child.get('dropShadowOwner'))
        // while the preview moves the shadow between the holder and a pile, its
        // coordinates are mid-conversion - the preview that started the move
        // places it
        return child.previewReparenting ? undefined : await this.previewShadowDrop(child, target, x, y);
      if(target) {
        // where along the fan of the target the drop points decides where the
        // dropped widget is inserted, not just that it joins
        const fanIndex = this.spreadFanIndexOf(target, child, x, y);
        const movedCards = child.get('type') == 'pile' ? [ ...child.children() ] : [ child ];
        await child.setPosition(target.get('x'), target.get('y'), child.get('z'));
        await child.updatePiles();
        if(fanIndex !== null) {
          const pileID = movedCards[0].get('parent');
          const pile = widgets.has(pileID) ? widgets.get(pileID) : null;
          if(pile && pile.get('type') == 'pile' && pile.get('parent') == this.get('id'))
            await pile.insertChildrenAt(movedCards, fanIndex);
        }
      }
      await this.receiveCard(child, [ x, y ]);
    }
  }

  // The slot of the target pile's fan a drop points at, so the dropped widget
  // is inserted where the player aimed rather than always on top. null where
  // there is no fan to point into - a compact pile takes it on top as before.
  spreadFanIndexOf(target, child, x, y) {
    if(target.get('type') != 'pile' || !target.spreadsCards() || target.children().length < 2)
      return null;
    // everything measures along the axis the fan runs on: the point the player
    // is holding the drop by, the visible band of each card of the fan, and
    // half a card past its end for a drop meant to go on top
    const vertical = Math.abs(target.get('stackOffsetY')) > Math.abs(target.get('stackOffsetX'));
    const axisIndex = vertical ? 1 : 0;
    const anchor = child.dropAnchor;
    const point = (vertical ? y : x)
      + (anchor ? (vertical ? anchor.y : anchor.x) : child.get(vertical ? 'height' : 'width')/2)
      - target.get(vertical ? 'y' : 'x');
    const slots = target.spreadOffsets().map(offset=>offset[axisIndex]);
    // while a drop shadow keeps a slot of this fan open, that slot goes back
    // into the list so pointing into the gap keeps meaning the gap - the index
    // is mapped back to the fan without it below
    let gapIndex = null;
    if(target.previewGapOffset) {
      gapIndex = Math.max(0, Math.min(slots.length, target.previewGap));
      slots.splice(gapIndex, 0, target.previewGapOffset[axisIndex]);
    }
    // measured between the last two slots so squish and spreadMin are in it
    const step = slots[slots.length-1] - slots[slots.length-2];
    slots.push(slots[slots.length-1] + step);
    const cardSize = target.children()[0].get(vertical ? 'height' : 'width');
    // in a fan running in the negative direction each card is covered from the
    // corner side, so its visible band sits at the far end of its box - a card
    // size past the slot itself
    const bandShift = step < 0 ? cardSize : 0;
    let index = 0;
    let bestDistance = Infinity;
    for(let i=0; i<slots.length; ++i) {
      const center = i < slots.length - 1 ? (slots[i] + slots[i+1]) / 2 + bandShift : slots[i] + cardSize/2;
      const distance = Math.abs(point - center);
      if(distance < bestDistance) {
        bestDistance = distance;
        index = i;
      }
    }
    return gapIndex !== null && index > gapIndex ? index - 1 : index;
  }

  // What the drop shadow shows while it hovers over this holder. Pointed into
  // a fan, the drop inserts at the slot under the pointer - so the preview
  // opens a gap at exactly that slot (previewGap on the pile) and the shadow
  // sits in it, instead of pretending the drop would append a new group.
  // Everywhere else the shadow lines up as the new group the drop would form.
  async previewShadowDrop(shadow, target, x, y) {
    const fanIndex = target ? this.spreadFanIndexOf(target, shadow, x, y) : null;
    const previous = shadow.fanPreviewPile;
    if(previous && (previous != target || fanIndex === null)) {
      delete shadow.fanPreviewPile;
      delete previous.previewGap;
      if(widgets.has(previous.get('id')))
        await previous.arrangeChildren();
    }
    if(fanIndex === null) {
      // an earlier fan preview may have parented the shadow into the pile -
      // lining up as its own group happens as a child of the holder again
      if(shadow.get('parent') != this.get('id'))
        await this.reparentShadow(shadow, this.get('id'));
      return await this.receiveCard(shadow, [ x, y ]);
    }

    shadow.fanPreviewPile = target;
    if(target.previewGap !== fanIndex) {
      target.previewGap = fanIndex;
      // laying the fan out around the gap also shifts the following groups
      await target.arrangeChildren();
    }
    const slot = target.previewGapOffset || [ 0, 0 ];
    // every widget is its own stacking context, so as a sibling of the pile the
    // shadow could only cover the whole fan or hide behind it. Slotting in above
    // the cards below its slot and below the ones above it - the way the
    // inserted card will - means joining the pile itself: the cards' z values
    // open up around the slot so it gets a z of its own
    if(shadow.get('parent') != target.get('id'))
      await this.reparentShadow(shadow, target.get('id'));
    let z = 1;
    for(const card of [ ...target.children() ].sort((a, b)=>a.get('z') - b.get('z'))) {
      if(z == fanIndex + 1)
        ++z;
      await card.set('z', z++);
    }
    await shadow.setPosition(target.get('dropOffsetX') + slot[0], target.get('dropOffsetY') + slot[1], fanIndex + 1);
  }

  // Moves the drop shadow between this holder and one of its piles. The shadow
  // is only a preview, so the moves a real card would make on the way - being
  // previewed into, aligned or piled up - must not happen for it.
  async reparentShadow(shadow, parentID) {
    shadow.previewReparenting = true;
    shadow.currentParent = widgets.get(parentID);
    await shadow.set('parent', parentID);
    delete shadow.previewReparenting;
  }

  // Empties a pile of this holder out onto the row, one card per slot, the way a
  // pile dropped into a spreading holder is emptied out above. The cards keep the
  // order they had in the pile: they are put down where it stood, a hundredth of
  // a unit apart, and the holder then lines them up along that.
  async emptyPileIntoSlots(pile) {
    const x = pile.get('x');
    const y = pile.get('y');
    let i = 1;
    this.preventRearrangeDuringPileDrop = true;
    for(const card of [ ...pile.children() ].reverse()) {
      await card.set('x', x + i/100);
      await card.set('y', y + i/100);
      // in a shared hand the cards keep their lane instead of being handed to
      // whoever triggered the emptying
      if(card.get('owner') !== null)
        card.targetPlayer = card.get('owner');
      await card.set('parent', this.get('id'));
      delete card.targetPlayer;
      ++i;
    }
    delete this.preventRearrangeDuringPileDrop;
    await this.receiveCard();
  }

  // The mirror image of emptyPileIntoSlots: without the room to line cards up
  // the auto layout allows piles again, so the entries gather back into one -
  // per owner and onPileCreation, the same groups dropping them one by one
  // would have formed. A resize that takes the room away then leaves one pile
  // instead of a heap of loose cards that only looks like one. The pile layout
  // gathers everything a lane holds into a single pile instead, the way
  // dropping the cards onto the stack one by one would have merged them.
  async gatherIntoPiles(perPileCreation=true) {
    const entries = this.childrenFilter(super.children(), true)
      .filter(w=>[ 'card', 'pile' ].indexOf(w.get('type')) != -1 && !w.get('dropShadowOwner') && !w.get('dragging') && !w.isBeingRemoved)
      .sort((a, b)=>a.get('z') - b.get('z'));

    const groups = new Map();
    for(const entry of entries) {
      const key = JSON.stringify([ entry.get('owner'), perPileCreation ? entry.get('onPileCreation') : null ]);
      if(!groups.has(key))
        groups.set(key, []);
      groups.get(key).push(entry);
    }

    this.preventRearrangeDuringPileDrop = true;
    for(const group of groups.values())
      if(group.length > 1)
        await this.makeGroup(group.flatMap(entry=>entry.get('type') == 'pile' ? [ ...entry.children() ].reverse() : [ entry ]));
    delete this.preventRearrangeDuringPileDrop;
  }

  async onPropertyChange(property, oldValue, newValue) {
    await super.onPropertyChange(property, oldValue, newValue);
    // The piles took their layout from this holder and lose it here, so they
    // have to place their cards themselves again - arrangedChildren() no longer
    // sees them. A holder that spreads its children holds no pile at all: every
    // pile dropped into one is emptied out, one card per slot, which is exactly
    // what allowPiles makes optional. So the piles it was arranging are emptied
    // out the same way rather than left behind in a state nothing else in here
    // expects, where children() would go on reporting them instead of the cards
    // they hold and COUNT, dropLimit and MOVE would silently count piles.
    // A switch away from arranging piles is not the only one that leaves piles
    // behind: the pile layout stacks dropped cards into one, so its piles have
    // to be dissolved as well when the new layout cannot host piles at all - a
    // grid, or a spread without allowPiles.
    const stoppedArrangingPiles =
      property == 'allowPiles' && oldValue && !this.get('allowPiles') ||
      property == 'layout' && !this.get('allowPiles') && (!this.supportsPiles() || this.derivedAllowPiles(this.effectiveLayout(oldValue === undefined ? this.getDefaultValue('layout') : oldValue)));
    if(stoppedArrangingPiles) {
      const piles = this.childrenFilter(super.children(), true).filter(c=>c.get('type') == 'pile');
      for(const pile of piles)
        if(this.get('layout') == 'grid')
          await this.breakUpPile(pile);
        else if(this.get('alignChildren') && this.spreadsChildren())
          await this.emptyPileIntoSlots(pile);
        else
          await pile.arrangeChildren(false, true);
    }
    // the tilt of the random layout belongs to it: a switch away straightens
    // the pieces before the new layout lines them up
    if(property == 'layout' && oldValue == 'random' && this.get('layout') != 'random')
      for(const entry of this.childrenFilter(super.children(), true))
        for(const w of entry.get('type') == 'pile' ? entry.children() : [ entry ])
          await w.set('rotation', w.getDefaultValue('rotation'));
    if([ 'dropOffsetX', 'dropOffsetY', 'stackOffsetX', 'stackOffsetY', 'layout', 'allowPiles', 'pilesOffsetX', 'pilesOffsetY', 'pilesGapX', 'pilesGapY', 'spreadMin', 'gridColumns', 'gridRows' ].indexOf(property) != -1)
      await this.updateAfterShuffle();
    // the layouts that decide the arrangement from the holder's size react to it changing
    if((property == 'width' || property == 'height') && (this.usesAutoLayout() || [ 'grid', 'random' ].indexOf(this.get('layout')) != -1))
      await this.updateAfterShuffle();
  }

  async receiveCard(card, pos) {
    if(this.usesAutoLayout())
      return await this.receiveCardAuto(card, pos);
    if(this.get('layout') == 'random')
      return await this.receiveCardRandom(card, pos);

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

  // In the auto layout the children wrap into rows, so where a dropped widget
  // lands is not decided along a single axis: it goes to the nearest row first
  // and to its place within that row then.
  async receiveCardAuto(card, pos) {
    const children = this.arrangedChildrenOwned();
    const rowsY = [ ...new Set(children.filter(c=>c != card).map(c=>c.get('y'))) ];
    const sortCoords = c=>{
      if(c != card || !pos)
        return [ c.get('y'), c.get('x') ];
      let [ x, y ] = pos;
      if(rowsY.length)
        y = rowsY.reduce((nearest, rowY)=>Math.abs(rowY - y) < Math.abs(nearest - y) ? rowY : nearest);
      return [ y, x ];
    };
    const sorted = children.sort((a, b)=>{
      const [ aY, aX ] = sortCoords(a);
      const [ bY, bX ] = sortCoords(b);
      return (aY - bY) || (aX - bX);
    });
    await this.rearrangeChildren(sorted, card);
  }

  // The random layout: the pieces lie scattered across the holder the way dice
  // thrown into a tray come to rest. A dropped piece keeps the spot it was
  // aimed at while that spot is free - nudged inside the margin - and lands on
  // a random free one otherwise; either way it settles with a fresh small
  // tilt. Everything already lying in the holder stays where it is.
  async receiveCardRandom(card, pos) {
    // the drop shadow only previews where a piece put down right here would
    // land: it is pinned under the pointer, without consuming the shared
    // randomness the game state depends on
    if(card && card.get('dropShadowOwner')) {
      const metrics = this.randomPieceMetrics(card, card.get('rotation'));
      const aimed = pos || [ card.get('x'), card.get('y') ];
      const at = this.randomClampPiece({ x: aimed[0], y: aimed[1] }, metrics);
      return await card.setPosition(at.x, at.y, this.arrangedChildrenOwned().length + 1);
    }
    const children = this.arrangedChildrenOwned().sort((a, b)=>a.get('z') - b.get('z'));
    // the piece being placed goes last: it never pushes the others off their
    // spots, and it ends up on top
    if(card && children.indexOf(card) != -1)
      children.push(children.splice(children.indexOf(card), 1)[0]);
    await this.rearrangeChildrenRandom(children, card, card && card.movedByButton ? null : pos);
  }

  async rearrangeChildren(children, card) {
    if(this.preventRearrangeDuringPileDrop)
      return;

    if(this.usesAutoLayout())
      return await this.rearrangeChildrenAuto(children);
    if(this.get('layout') == 'grid')
      return await this.rearrangeChildrenGrid(children);
    if(this.get('layout') == 'random')
      return await this.rearrangeChildrenRandom(children);

    // a drop shadow previewing an insertion into one of the fans sits inside
    // that fan, so the row is laid out as if it were not there
    children = children.filter(c=>!c.fanPreviewPile);

    const owner = children.map(c=>c.get('owner')).find(o=>o) || null;
    const squish = this.fanSquish(owner);
    // the fans follow the squish factor, so when it changes the piles have to
    // lay their cards out again before the row is measured against them
    this.appliedFanSquish = this.appliedFanSquish || {};
    if(this.appliedFanSquish[String(owner)] !== squish.fans) {
      this.appliedFanSquish[String(owner)] = squish.fans;
      for(const child of children)
        if(child.get('type') == 'pile')
          await child.arrangeChildren(false);
    }

    let xOffset = 0;
    let yOffset = 0;
    let z = 1;

    for(const child of children) {
      const newX = this.get('dropOffsetX') + xOffset;
      const newY = this.get('dropOffsetY') + yOffset;
      const newZ = z++;

      await child.setPosition(newX, newY, newZ);

      xOffset += this.childSpacing(child, 'X', squish);
      yOffset += this.childSpacing(child, 'Y', squish);
    }
  }

  // The card size the auto layout measures against: the biggest card among the
  // children, looking into piles for the cards they hold - never the box of a
  // pile itself, whose size follows from the layout and would feed back into
  // the decision. Everything reads from super.children() because get(
  // 'allowPiles') derives from this measurement, so going through children()
  // would recurse.
  autoCardSize() {
    const cards = this.childrenFilter(super.children(), true)
      .flatMap(c=>c.get('type') == 'pile' ? this.childrenFilter(c.children(), false) : [ c ]);
    if(!cards.length)
      return null;
    return {
      width:  Math.max(...cards.map(c=>c.get('width'))),
      height: Math.max(...cards.map(c=>c.get('height')))
    };
  }

  // Whether the auto layout has room to line its children up instead of letting
  // them gather in the center: one and a half cards along either axis.
  autoSpreads() {
    const size = this.autoCardSize();
    return size !== null && (size.width * 1.5 < this.get('width') || size.height * 1.5 < this.get('height'));
  }

  autoCenteredDropOffset(axis) {
    const size = this.autoCardSize();
    if(size === null)
      return autoLayoutPadding;
    return Math.max(0, (this.get(axis == 'X' ? 'width' : 'height') - (axis == 'X' ? size.width : size.height)) / 2);
  }

  // The auto layout: the children are centered and lined up in as many rows as
  // give each of them the most visible area, the objective from #2708. The
  // spacing degrades continuously when the holder gets tight, so what does not
  // fit side by side overlaps instead of spilling out of the holder. Piles
  // only exist while the holder has no room to line cards up: updateAfterShuffle
  // empties them out when a resize creates that room and gathers the loose
  // cards back into one when it goes away again.
  async rearrangeChildrenAuto(children) {
    if(this.preventRearrangeDuringPileDrop || !children.length)
      return;

    const pad = autoLayoutPadding;
    const holderWidth = this.get('width');
    const holderHeight = this.get('height');
    const size = this.autoCardSize() || { width: children[0].get('width'), height: children[0].get('height') };
    const wide = size.width * 1.5 < holderWidth;
    const tall = size.height * 1.5 < holderHeight;
    let z = 1;

    // too small to arrange anything: everything gathers in the middle, where
    // the derived drop offset puts new drops as well
    if(!wide && !tall) {
      for(const child of children)
        await child.setPosition(Math.max(0, (holderWidth - child.spreadExtent('X')) / 2), Math.max(0, (holderHeight - child.spreadExtent('Y')) / 2), z++);
      return;
    }

    const count = children.length;

    // How far the natural extent-plus-pad spacing has to shrink so that every
    // entry ends inside the given room: 1 keeps it, 0 stacks everything on the
    // first entry. Measured against the extents, so a pile fanning its own
    // cards gets the room of its whole spread - and overlaps its neighbors
    // instead of spilling out of the holder once that room runs out.
    const squishScale = (extents, room)=>{
      let scale = 1;
      let before = 0;
      for(let i = 1; i < extents.length; ++i) {
        before += extents[i - 1] + pad;
        scale = Math.min(scale, Math.max(0, (room - 2*pad - extents[i]) / before));
      }
      return scale;
    };
    // The content box of a squished row or column: the widest entry is not
    // necessarily the last one, so measure every entry's far edge - squishScale
    // already keeps each of them inside the room, so centering this box is safe.
    const boundingExtent = (extents, steps)=>{
      let extent = 0;
      let offset = 0;
      for(let i = 0; i < extents.length; ++i) {
        extent = Math.max(extent, offset + extents[i]);
        offset += steps[i];
      }
      return extent;
    };
    const rowGeometry = rows=>{
      const perRow = Math.ceil(count / rows);
      const rowsChildren = [];
      for(let row = 0; row * perRow < count; ++row)
        rowsChildren.push(children.slice(row * perRow, (row + 1) * perRow));
      const rowHeights = rowsChildren.map(row=>Math.max(...row.map(c=>c.spreadExtent('Y'))));
      const rowScalesX = rowsChildren.map(row=>squishScale(row.map(c=>c.spreadExtent('X')), holderWidth));
      const scaleY = squishScale(rowHeights, holderHeight);
      return { rowsChildren, rowHeights, rowScalesX, scaleY };
    };

    let rows = 1;
    if(!wide && tall) {
      rows = count;
    } else if(wide && tall) {
      // try every row count: the one that leaves each card the most visible
      // area wins
      let bestArea = 0;
      for(let r = 1; r <= count; ++r) {
        const { rowScalesX, scaleY } = rowGeometry(r);
        const stepX = (size.width  + pad) * Math.min(...rowScalesX);
        const stepY = (size.height + pad) * scaleY;
        const area = Math.max(0, Math.min(size.width, stepX)) * Math.max(0, Math.min(size.height, stepY));
        if(area > bestArea) {
          bestArea = area;
          rows = r;
        }
      }
    }

    const { rowsChildren, rowHeights, rowScalesX, scaleY } = rowGeometry(rows);
    const stepsY = rowHeights.map((h, row)=>row == rowHeights.length - 1 ? 0 : (h + pad) * scaleY);
    const contentHeight = boundingExtent(rowHeights, stepsY);
    let y = Math.max(pad, (holderHeight - contentHeight) / 2);

    for(let row = 0; row < rowsChildren.length; ++row) {
      const rowChildren = rowsChildren[row];
      // per-child spacing so a fanned pile gets the room of its whole spread
      const steps = rowChildren.map((c, i)=>i == rowChildren.length - 1 ? 0 : (c.spreadExtent('X') + pad) * rowScalesX[row]);
      const contentWidth = boundingExtent(rowChildren.map(c=>c.spreadExtent('X')), steps);
      let x = Math.max(pad, (holderWidth - contentWidth) / 2);
      for(let i = 0; i < rowChildren.length; ++i) {
        await rowChildren[i].setPosition(x, y, z++);
        x += steps[i];
      }
      y += stepsY[row];
    }
  }

  // The axis-aligned box a piece covers once it is tilted: its own box grown
  // by the rotation around its center. The random layout places these boxes,
  // so a tilted corner never pokes past the border or covers a neighbor.
  randomPieceMetrics(child, rotation) {
    const width = child.spreadExtent('X');
    const height = child.spreadExtent('Y');
    const radians = (rotation || 0) * Math.PI / 180;
    const cos = Math.abs(Math.cos(radians));
    const sin = Math.abs(Math.sin(radians));
    const w = width * cos + height * sin;
    const h = height * cos + width * sin;
    return { w, h, shiftX: (w - width) / 2, shiftY: (h - height) / 2 };
  }

  // Keeps a piece's covered box inside the holder, the drop offset away from
  // the borders; a piece bigger than that room is centered instead. Works on
  // the piece's own coordinates, so a spot that already lies inside comes back
  // unchanged, bit for bit.
  randomClampPiece(at, metrics) {
    const clampAxis = (low, high, value)=>high < low ? (low + high) / 2 : Math.min(high, Math.max(low, value));
    return {
      x: clampAxis(this.get('dropOffsetX') + metrics.shiftX, this.get('width')  - this.get('dropOffsetX') - metrics.w + metrics.shiftX, at.x),
      y: clampAxis(this.get('dropOffsetY') + metrics.shiftY, this.get('height') - this.get('dropOffsetY') - metrics.h + metrics.shiftY, at.y)
    };
  }

  // The scatter pass of the random layout. Every piece keeps its spot while it
  // lies inside the margins and clear of the pieces placed before it, so laying
  // the holder out again moves nothing that does not have to move - and
  // consumes no randomness. What cannot stay - the piece that was just dropped
  // onto an occupied spot, or one a shrunken holder no longer has room for -
  // is thrown onto a random spot with a fresh tilt instead. Of the spots
  // tried, the one covering the least of the other pieces wins, so a holder
  // too full for free spots overlaps its pieces instead of spilling them out.
  async rearrangeChildrenRandom(children, dropped=null, pos=null) {
    if(this.preventRearrangeDuringPileDrop)
      return;
    children = children.filter(c=>!c.get('dropShadowOwner'));
    if(!children.length)
      return;

    const placed = [];
    const boxAt = (at, metrics)=>({ x: at.x - metrics.shiftX, y: at.y - metrics.shiftY, w: metrics.w, h: metrics.h });
    const coveredArea = box=>placed.reduce((sum, p)=>sum +
      Math.max(0, Math.min(box.x + box.w, p.x + p.w) - Math.max(box.x, p.x)) *
      Math.max(0, Math.min(box.y + box.h, p.y + p.h) - Math.max(box.y, p.y)), 0);
    const freshTilt = child=>(+child.getDefaultValue('rotation') || 0) + Math.round((rand() * 2 - 1) * randomLayoutMaxTilt);

    let z = 1;
    for(const child of children) {
      let rotation = child.get('rotation');
      let metrics = this.randomPieceMetrics(child, rotation);
      let at = null;
      if(child == dropped) {
        // the piece being put down settles with a fresh tilt, decided before
        // the aimed spot is checked so the tilted box is what has to fit there
        rotation = freshTilt(child);
        metrics = this.randomPieceMetrics(child, rotation);
        if(pos)
          at = this.randomClampPiece({ x: pos[0], y: pos[1] }, metrics);
      } else {
        at = this.randomClampPiece({ x: child.get('x'), y: child.get('y') }, metrics);
      }

      if(!at || coveredArea(boxAt(at, metrics))) {
        if(child != dropped) {
          rotation = freshTilt(child);
          metrics = this.randomPieceMetrics(child, rotation);
        }
        const roomW = Math.max(0, this.get('width')  - 2 * this.get('dropOffsetX') - metrics.w);
        const roomH = Math.max(0, this.get('height') - 2 * this.get('dropOffsetY') - metrics.h);
        let best = null;
        for(let attempt = 0; attempt < 20 && (!best || best.covered); ++attempt) {
          const candidate = this.randomClampPiece({ x: this.get('dropOffsetX') + metrics.shiftX + rand() * roomW, y: this.get('dropOffsetY') + metrics.shiftY + rand() * roomH }, metrics);
          const covered = coveredArea(boxAt(candidate, metrics));
          if(!best || covered < best.covered)
            best = { at: candidate, covered };
        }
        at = best.at;
      }

      placed.push(boxAt(at, metrics));
      await child.setPosition(at.x, at.y, z++);
      await child.set('rotation', rotation);
    }
  }

  // Compute the grid geometry for n cards: the column count and per-cell step
  // that keep every card inside the holder with the least overlap. dropOffset
  // is the margin from the edges and stackOffset the desired gap between cells;
  // when the cards do not all fit at that spacing they overlap instead of
  // spilling outside. gridColumns/gridRows pin the column count so a one-pixel
  // resize cannot reflow the whole table. Note: the cell size is taken from the
  // first child, so the grid assumes all children share one size (as a card
  // deck does); mixed-size children may overlap or overflow.
  gridMetrics(n) {
    const marginX = this.get('dropOffsetX');
    const marginY = this.get('dropOffsetY');
    // the default cell gap matches the gap a multipleSpread leaves between its
    // groups, so cards read as separate cells out of the box
    const gapX = Math.abs(this.get('stackOffsetX')) || 8;
    const gapY = Math.abs(this.get('stackOffsetY')) || 8;
    const first = this.children()[0];
    const cardW = first ? first.get('width')  : this.get('width');
    const cardH = first ? first.get('height') : this.get('height');

    const availX = Math.max(0, this.get('width')  - 2 * marginX - cardW);
    const availY = Math.max(0, this.get('height') - 2 * marginY - cardH);
    const fullStepX = cardW + gapX;
    const fullStepY = cardH + gapY;

    const stepsFor = cols=>{
      const rows = Math.ceil(Math.max(1, n) / cols);
      return {
        cols,
        stepX: cols > 1 ? Math.min(fullStepX, availX / (cols - 1)) : fullStepX,
        stepY: rows > 1 ? Math.min(fullStepY, availY / (rows - 1)) : fullStepY
      };
    };

    let best = null;
    if(this.get('gridColumns') > 0) {
      best = stepsFor(Math.max(1, Math.floor(this.get('gridColumns'))));
    } else if(this.get('gridRows') > 0) {
      best = stepsFor(Math.ceil(Math.max(1, n) / Math.max(1, Math.floor(this.get('gridRows')))));
    } else {
      for(let cols=1; cols<=Math.max(1, n); ++cols) {
        const candidate = stepsFor(cols);
        const overlapX = cols > 1 ? Math.max(0, (cardW - candidate.stepX) / cardW) : 0;
        const overlapY = Math.ceil(n / cols) > 1 ? Math.max(0, (cardH - candidate.stepY) / cardH) : 0;
        candidate.score = Math.max(overlapX, overlapY) + (overlapX + overlapY) / 10;
        if(!best || candidate.score < best.score - 1e-9)
          best = candidate;
      }
    }
    return { cols: best.cols, stepX: best.stepX, stepY: best.stepY, marginX, marginY, cardW, cardH };
  }

  async rearrangeChildrenGrid(children) {
    if(this.preventRearrangeDuringPileDrop || !children.length)
      return;
    await this.layoutGridCells(children);
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

  // Move all of a dropped pile's cards into this holder as loose cards so the
  // pile dissolves (its handle disappears). The caller arranges them afterwards.
  async breakUpPile(pile) {
    this.preventRearrangeDuringPileDrop = true;
    for(const w of pile.children().reverse()) {
      await w.set('x', this.get('dropOffsetX'));
      await w.set('y', this.get('dropOffsetY'));
      // in a shared hand the cards keep their lane instead of being handed to
      // whoever triggered the break-up
      if(w.get('owner') !== null)
        w.targetPlayer = w.get('owner');
      await w.set('parent', this.get('id'));
      delete w.targetPlayer;
      await w.bringToFront();
    }
    delete this.preventRearrangeDuringPileDrop;
  }

  // The owner a dragged/dropped child ends up with in this holder, used to
  // arrange each player's cards independently. childrenPerOwner assigns the
  // dragging or target player; otherwise the child keeps its own owner.
  childOwner(child) {
    if(child.get('dropShadowOwner'))
      return this.get('childrenPerOwner') ? child.get('dropShadowOwner') : (child.get('owner') || null);
    if(this.get('childrenPerOwner'))
      return child.targetPlayer || child.get('owner') || playerName;
    return child.get('owner') || null;
  }

  // How far the next child is placed from this one along one axis. Cards follow
  // stackOffset; where piles are arranged, a pile is a block of its own: pilesGap
  // starts the next one behind its cards, pilesOffset at a fixed distance
  // regardless of how many cards it holds, and with neither of them given the
  // piles are placed flush, one right after the other. An overflowing
  // multipleSpread hands in its fanSquish, which shrinks the gaps and in the
  // last resort overlaps the groups themselves.
  childSpacing(child, axis, squish=null) {
    const stackOffset = this.get('stackOffset' + axis);

    if(this.get('allowPiles')) {
      const squished = squish && squish.axis == axis;
      const gap = squished ? squish.gap : this.get('pilesGap' + axis);
      if(gap !== null)
        return child.spreadExtent(axis) * (squished ? squish.groups : 1) + gap;
      const offset = this.get('pilesOffset' + axis);
      if(offset !== null)
        return offset;
      // A holder that spaces its piles out on the other axis lines them up
      // along that one alone: its stackOffset describes how the cards inside
      // the piles are spread, not where the next pile begins.
      if(this.pilesSpacingSet())
        return 0;
      // a card put down on its own is a pile one card deep, so it gets exactly
      // the room such a pile would get and the row stays flush either way
      return stackOffset ? child.spreadExtent(axis) : 0;
    }

    return !child.get('overlap') && stackOffset ? child.get(axis == 'X' ? 'width' : 'height') + 4 : stackOffset;
  }

  pilesSpacingSet() {
    return [ 'pilesOffsetX', 'pilesOffsetY', 'pilesGapX', 'pilesGapY' ].some(p=>this.get(p) !== null);
  }

  // How the groups of a multipleSpread stay inside the holder when they take
  // more room than it has: the gaps between them give way first, then the fans
  // inside the groups compress evenly, and only when even the bare cards do
  // not fit side by side do the groups start to overlap, the last one ending
  // at the far edge. Everything here is read from shared state, so every
  // client computes the same numbers no matter who triggered the layout.
  // Returns the axis the groups line up along, the gap to leave between them
  // (null where pilesOffset spaces them instead - that is the game taking
  // manual control, so it is honored as written), the factor for the fans
  // inside the groups and the factor for the extent-based steps between them.
  fanSquish(owner) {
    const axis = this.spreadDirection()[0];
    const result = { axis, gap: this.get('pilesGap' + axis), fans: 1, groups: 1 };
    if(this.effectiveLayout() != 'multipleSpread' || result.gap === null)
      return result;

    const size = axis == 'X' ? 'width' : 'height';
    const children = this.arrangedChildren().filter(c=>!c.get('dropShadowOwner') && !c.fanPreviewPile && (!c.get('owner') || c.get('owner') === owner));
    if(!children.length)
      return result;
    const bases = children.map(c=>c.get('type') == 'pile' && c.children().length ? c.children()[0].get(size) : c.get(size));
    const fans = children.map(c=>c.get('type') == 'pile' ? c.fanLength(axis) : 0);
    const baseSum = bases.reduce((a, b)=>a + b, 0);
    const fanSum = fans.reduce((a, b)=>a + b, 0);
    const gapCount = children.length - 1;
    const available = this.get(size) - 2 * this.get('dropOffset' + axis);

    if(baseSum + fanSum + gapCount * result.gap <= available)
      return result;
    if(baseSum + fanSum <= available)
      return Object.assign(result, { gap: gapCount ? (available - baseSum - fanSum) / gapCount : result.gap });
    if(baseSum <= available && fanSum)
      return Object.assign(result, { gap: 0, fans: Math.max(0, available - baseSum) / fanSum });
    const lastBase = bases[bases.length - 1];
    const stepSum = baseSum - lastBase;
    return Object.assign(result, { gap: 0, fans: 0, groups: stepSum > 0 ? Math.min(1, Math.max(0, (available - lastBase) / stepSum)) : 1 });
  }

  // Whether this holder lines its children up instead of dropping them all on
  // the same spot. stackOffset does that for every child; a holder that
  // arranges piles can space them out through pilesOffset/pilesGap alone, and
  // the auto layout decides it from its size.
  spreadsChildren() {
    if(this.usesAutoLayout())
      return this.autoSpreads();
    if(this.get('layout') == 'random')
      return true;
    return !!(this.get('stackOffsetX') || this.get('stackOffsetY') || this.get('allowPiles') && this.pilesSpacingSet());
  }

  // The axis the children are lined up along and the direction along it, which
  // is what decides the order they are arranged in. Where piles are spaced out,
  // that spacing names the axis - the stackOffset then belongs to the cards
  // inside the piles.
  spreadDirection() {
    if(this.usesAutoLayout()) {
      const size = this.autoCardSize();
      return [ size !== null && !(size.width * 1.5 < this.get('width')) && size.height * 1.5 < this.get('height') ? 'Y' : 'X', 1 ];
    }
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

  // Whether this holder keeps piles as the groups it lines up - what a dropped
  // pile survives as, what MOVE's position parameter and SORT's groupBy work
  // on. The auto layout never does: it only tolerates piles where it has no
  // room to arrange anything anyway.
  arrangesPiles() {
    return !!(this.get('allowPiles') && !this.usesAutoLayout() && this.get('alignChildren') && this.spreadsChildren() && this.supportsPiles());
  }

  // Cards a routine moves in arrive one by one. In a holder that arranges piles
  // they are meant to land as one pile of their own rather than being fed into
  // whichever pile the holder already ends with.
  async groupDroppedCards(cards) {
    if(!this.arrangesPiles())
      return;

    const dropped = cards.filter(c=>c.get('parent') == this.get('id') && c.get('type') == 'card');
    if(dropped.length < 2)
      return;

    await this.makeGroup(dropped);
    await this.receiveCard(null);
  }

  // Turn the given cards (children of this holder, in the order the bottom of
  // the new pile comes first) into one pile.
  async makeGroup(cards) {
    const bottom = cards[0];
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
    for(const card of cards) {
      // z before parent: the pile lays its cards out by z, so it has to be the
      // final one - the order the routine moved the cards in - by then
      await card.bringToFront();
      await card.set('parent', pileID);
    }
    return widgets.get(pileID);
  }

  // Merge the given cards into an existing group of this holder. If the group
  // is still a loose card, a pile is created around it first. index says where
  // in the group's fan the cards go, counted from the bottom; null puts them on
  // top.
  async mergeIntoGroup(cards, group, index=null) {
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
      if(group.get('owner') !== null)
        pileDef.owner = group.get('owner');
      pile = widgets.get(await addWidgetLocal(pileDef));
      await group.set('parent', pile.get('id'));
    }
    for(const card of cards) {
      await card.bringToFront();
      await card.set('parent', pile.get('id'));
    }
    // renumbering the fan explicitly keeps the order deterministic - null
    // means on top, the way MOVE has always stacked what it brings
    await pile.insertChildrenAt(cards, index === null ? pile.children().length : index);
    return pile;
  }

  // Where a MOVE with a position parameter puts the widgets it brought in. On a
  // holder that arranges piles the four values name the groups: the batch joins
  // the first or the last group (pileBottom/pileTop) or becomes a new group
  // before or after the existing ones (groupStart/groupEnd). Everywhere else
  // the same words order the stack - pileBottom/groupStart put the batch below
  // what is already there (the start of a spread), pileTop/groupEnd on top - so
  // a routine written for one holder does something sensible on every other.
  async applyMovePosition(cards, position) {
    if(!cards.length)
      return;

    if(this.arrangesPiles()) {
      const owner = cards[0].get('owner') || null;

      // A move within one holder can select cards that already sit inside the
      // holder's groups. They take part like freshly dropped ones: pulled out
      // of their group first - which lets a drained one dissolve - so the
      // batch is placed in one piece below. currentParent marks them as moving
      // within the holder, which keeps onEnter out of it the same way
      // stillInside keeps onLeave out, and the flags keep the holder from
      // rearranging them or piling them back up halfway through.
      this.preventRearrangeDuringPileDrop = true;
      for(const c of cards) {
        const group = c.get('type') == 'card' && widgets.has(c.get('parent')) ? widgets.get(c.get('parent')) : null;
        if(group && group.get('type') == 'pile' && group.get('parent') == this.get('id')) {
          c.currentParent = this;
          c.movedByButton = true;
          if(c.get('owner') !== null)
            c.targetPlayer = c.get('owner');
          await c.set('x', c.get('x') + group.get('x'));
          await c.set('y', c.get('y') + group.get('y'));
          await c.set('parent', this.get('id'));
          delete c.targetPlayer;
          delete c.movedByButton;
          delete c.currentParent;
        }
      }
      delete this.preventRearrangeDuringPileDrop;

      const groups = this.arrangedChildren().filter(w=>cards.indexOf(w) == -1 && !w.get('dropShadowOwner') && (!w.get('owner') || w.get('owner') === owner)).sort((a, b)=>a.get('z') - b.get('z'));
      const dropped = cards.filter(c=>c.get('parent') == this.get('id') && c.get('type') == 'card');
      if((position == 'pileBottom' || position == 'pileTop') && groups.length && dropped.length) {
        const target = position == 'pileBottom' ? groups[0] : groups[groups.length - 1];
        await this.mergeIntoGroup(dropped, target, position == 'pileBottom' ? 0 : null);
      } else if(dropped.length) {
        const group = dropped.length > 1 ? await this.makeGroup(dropped) : dropped[0];
        // one renumbering pass puts the new group before or after the others -
        // after needs it as much as before, since the pile makeGroup just made
        // starts out at z 0 and would sort in front of everything
        const before = position == 'pileBottom' || position == 'groupStart';
        let z = 1;
        if(before)
          await group.set('z', z++);
        for(const w of groups)
          await w.set('z', z++);
        if(!before)
          await group.set('z', z++);
      }
    } else if(position == 'pileBottom' || position == 'groupStart') {
      // put the batch below all siblings, renumbering the whole holder to a
      // compact 1..n range once so repeated moves don't drift z negative
      const others = this.children().filter(w=>cards.indexOf(w) == -1).sort((a, b)=>a.get('z') - b.get('z'));
      let z = 1;
      for(const c of cards)
        await c.set('z', z++);
      for(const w of others)
        await w.set('z', z++);
    }
    // pileTop/groupEnd on a plain holder is where MOVE puts things anyway

    await this.updateAfterShuffle();
  }

  // SORT with groupBy: sort all of a lane's cards by `key` and re-partition
  // them into one group per distinct value of the groupBy property - one group
  // per suit, for example - per owner lane. Single cards stay loose.
  async regroupBy(property, key, reverse, locales, options) {
    const all = this.childrenFilter(super.children(), true).filter(w=>!w.get('dropShadowOwner'));
    const owners = new Set(all.map(c=>c.get('owner') || null));
    this.preventRearrangeDuringPileDrop = true;
    for(const owner of owners) {
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
      // instead of one per suit. The groups follow the order in which the
      // sorted cards first mention their value, the cards within a group the
      // sort.
      const runs = [];
      const runByValue = new Map();
      for(const c of cards) {
        const value = c.get(property);
        const valueKey = JSON.stringify(value === undefined ? null : value);
        if(!runByValue.has(valueKey)) {
          runByValue.set(valueKey, []);
          runs.push(runByValue.get(valueKey));
        }
        runByValue.get(valueKey).push(c);
      }

      let z = 1;
      for(const run of runs) {
        if(run.length == 1) {
          const c = run[0];
          // it moves within the holder like applyMovePosition's cards do: it
          // keeps its lane in a shared hand and onEnter stays out of it
          c.currentParent = this;
          c.movedByButton = true;
          if(c.get('owner') !== null)
            c.targetPlayer = c.get('owner');
          await c.set('parent', this.get('id'));
          delete c.targetPlayer;
          delete c.movedByButton;
          delete c.currentParent;
          await c.setPosition(this.get('dropOffsetX'), this.get('dropOffsetY'), z++);
        } else {
          const pile = await this.makeGroup(run);
          await pile.set('z', z++);
        }
      }
    }
    delete this.preventRearrangeDuringPileDrop;
    await this.updateAfterShuffle();
  }

  supportsPiles() {
    return !this.get('preventPiles') && (this.get('allowPiles') || !this.get('alignChildren') || !this.spreadsChildren());
  }

  async updateAfterShuffle() {
    if(this.get('layout') == 'grid') {
      const entries = this.childrenFilter(super.children(), true).filter(w=>!w.get('dropShadowOwner'));
      for(const owner of new Set(entries.map(c=>c.get('owner') || null)))
        await this.rearrangeChildrenGrid(entries.filter(c=>!c.get('owner') || c.get('owner') === owner).sort((a, b)=>a.get('z') - b.get('z')));
      return;
    }

    if(!this.spreadsChildren()) {
      // an auto holder without the room to spread allows piles again - so what
      // spread out while there was room gathers back into one pile per lane,
      // centered where the derived drop offset points
      if(this.usesAutoLayout()) {
        if(this.get('allowPiles') && !this.preventRearrangeDuringPileDrop)
          await this.gatherIntoPiles();
        if(this.arrangedChildren().length)
          await this.rearrangeChildrenAuto(this.arrangedChildren().sort((a, b)=>a.get('z') - b.get('z')));
      } else if(this.effectiveLayout() == 'pile' && !this.preventRearrangeDuringPileDrop) {
        // the pile layout stacks everything on the drop offset, so a switch to
        // it collects what the previous layout had spread out - per lane, the
        // way every other layout arranges - and each lane's entries then merge
        // into the one pile dropping them onto the stack one by one would form
        const entries = this.arrangedChildren().filter(w=>!w.get('dropShadowOwner'));
        for(const owner of new Set(entries.map(c=>c.get('owner') || null)))
          await this.rearrangeChildren(entries.filter(c=>!c.get('owner') || c.get('owner') === owner).sort((a, b)=>a.get('z') - b.get('z')));
        await this.gatherIntoPiles(false);
      }
      return;
    }

    // an auto layout with the room to line cards up allows no piles - so when
    // a resize (or a layout switch) gives it that room, the piles it kept
    // while it was smaller are emptied out one card per slot, exactly like a
    // pile dropped into it now would be
    if(this.usesAutoLayout() && !this.get('allowPiles') && !this.preventRearrangeDuringPileDrop)
      for(const pile of this.childrenFilter(super.children(), true).filter(c=>c.get('type') == 'pile' && !c.get('dropShadowOwner')))
        await this.emptyPileIntoSlots(pile);

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
