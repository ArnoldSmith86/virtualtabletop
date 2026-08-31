// What each layout decides for the holder. Only the properties named here are
// overridden while the layout is in effect; every other property keeps its raw
// value and acts as a knob of the layout (the fan step of a multiSpread, the
// margins of a grid, ...).
const layoutDerivedProperties = {
  pile:           { alignChildren: true,  stackOffsetX: 0, stackOffsetY: 0 },
  singleSpread:   { alignChildren: true,  preventPiles: false },
  arc:            { alignChildren: true,  preventPiles: false },
  // dropShadow is a default rather than derived: multiSpread turns the
  // insertion preview on, but a game that writes dropShadow: false keeps it
  // off - see Holder.getDefaultValue
  multiSpread: { alignChildren: true,  preventPiles: false },
  // preventPiles is the one pile knob of a grid: writing preventPiles: false
  // turns the cells into stacks - it defaults to true there (see
  // Holder.getDefaultValue)
  grid:           { alignChildren: true },
  random:         { alignChildren: true,  preventPiles: true },
  freeform:       { alignChildren: false },
  auto:           { alignChildren: true,  preventPiles: false }
};

// The properties a get() on a holder may derive from its layout instead of
// answering from the state (see Holder.get below).
const layoutDerivableProperties = new Set([ 'alignChildren', 'preventPiles', 'stackOffsetX', 'stackOffsetY', 'dropOffsetX', 'dropOffsetY', 'pilesGapX' ]);

// The raw arrangement properties that switch an auto layout off: while any of
// them is written to a value that differs from its classic default, the holder
// behaves exactly as if its layout were 'custom'. That way JSON written
// against the classic properties - copied from an older game or from the wiki -
// keeps meaning exactly what it always did, while a written default (like
// stackOffsetX: 0) stays the classic no-op it always was and leaves the
// auto layout in charge.
const autoDeferProperties = [ 'alignChildren', 'preventPiles', 'stackOffsetX', 'stackOffsetY', 'dropOffsetX', 'dropOffsetY', 'pilesOffsetX', 'pilesOffsetY', 'pilesGapX', 'pilesGapY', 'spreadMin' ];

// The padding the auto layout keeps between its children and to the border.
const autoLayoutPadding = 4;

// What is left of the stack offset for the cards spreadMin does not cover in
// a holder's own row - the same compression a pile applies to its fan.
const compressedRowSpreadFactor = 0.1;

// How far the random layout tilts its pieces, in degrees to either side.
const randomLayoutMaxTilt = 15;

// The largest tilt the arc layout gives its outermost cards, in degrees to
// either side, and how much of that a hand of few cards uses: the sweep grows
// by this many degrees per card until it reaches the cap.
const arcLayoutMaxHalfSweep = 30;
const arcLayoutSweepPerCard = 6;

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

  getDefaultValue(property) {
    const value = super.getDefaultValue(property);
    // What a layout merely turns on by default - not derives - is expressed as
    // the property's default: set() normalizes a written value that equals the
    // default away, so only this way can an explicit false survive in the
    // state and turn the feature off again.
    if(value === false && !(this.inheritedProperties && this.inheritedProperties[property])) {
      // the insertion preview is what makes dropping into a fan legible
      if(property == 'dropShadow' && this.effectiveLayout() == 'multiSpread')
        return true;
      // a grid keeps every card in a cell of its own by default: writing
      // preventPiles: false is what turns the cells into stacks
      if(property == 'preventPiles' && this.effectiveLayout() == 'grid')
        return true;
    }
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
    // the derived properties go through this on every get(), so the answer is
    // cached until any state the derivation could depend on changes
    const cacheable = layoutValue === undefined && typeof arrangementStateVersion == 'function';
    if(cacheable && this.cachedLayoutVersion === arrangementStateVersion())
      return this.cachedLayout;
    let layout = layoutValue !== undefined ? layoutValue : super.get('layout');
    if(layout === null || layout === undefined)
      layout = 'custom';
    if(layout == 'auto' && autoDeferProperties.some(p=>(this.state[p] !== undefined ? this.state[p] : super.getDefaultValue(p)) !== this.defaults[p]))
      layout = 'custom';
    if(cacheable) {
      this.cachedLayoutVersion = arrangementStateVersion();
      this.cachedLayout = layout;
    }
    return layout;
  }

  usesAutoLayout() {
    return this.effectiveLayout() == 'auto';
  }

  // Whether the game provides a value for the property itself - written in
  // its state or served through inheritFrom - rather than leaving the class
  // default in charge.
  providesValue(property) {
    return this.state[property] !== undefined || !!(this.inheritedProperties && this.inheritedProperties[property]);
  }

  // Whether a grid holder keeps its cells as stacks: the grid normally keeps
  // every card in a cell of its own, and writing preventPiles: false is the
  // one knob that turns the cells into piles instead.
  gridAllowsPiles() {
    return this.providesValue('preventPiles') && (this.state.preventPiles !== undefined ? this.state.preventPiles : super.getDefaultValue('preventPiles')) === false;
  }

  // Whether this holder keeps the piles it holds as units of its arrangement -
  // the groups of a multiSpread, the stacks in a grid's cells, the one pile of
  // an auto holder too small to line cards up. Decided entirely by the layout
  // and its preventPiles knob; everywhere else a dropped pile is emptied out,
  // one card per slot. onPropertyChange also asks this about the layout a
  // change just left behind.
  keepsPiles(layout) {
    if(layout === undefined)
      layout = this.effectiveLayout();
    if(layout == 'multiSpread')
      return true;
    if(layout == 'grid')
      return this.gridAllowsPiles();
    // the auto layout only tolerates piles where it has no room to line the
    // cards up anyway - the classic holder that fits just one card
    if(layout == 'auto')
      return !this.autoSpreads();
    return false;
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
      // stack offset gets the classic hand fan as its starting point - and the
      // arc takes the same step as the base spacing it bends
      if((layout == 'singleSpread' || layout == 'arc') && (property == 'stackOffsetX' || property == 'stackOffsetY') && !super.get('stackOffsetX') && !super.get('stackOffsetY'))
        return property == 'stackOffsetX' ? 40 : 0;
      // the groups of a multiSpread sit a small default gap apart until the
      // game spaces them out itself (an explicit pilesGapX of 0 packs them
      // flush). With the groups wrapped into rows the Y pair spaces the rows,
      // so only the X pair can take the default gap away.
      if(layout == 'multiSpread' && property == 'pilesGapX') {
        const veto = this.multiSpreadWraps() ? [ 'pilesOffsetX', 'pilesGapX' ] : [ 'pilesOffsetX', 'pilesOffsetY', 'pilesGapX', 'pilesGapY' ];
        if(veto.every(p=>super.get(p) === null))
          return 8;
      }
      // an auto holder too small to arrange its cards centers them: the classic
      // paths put children at the drop offset, so that is where centering lives
      if(layout == 'auto' && (property == 'dropOffsetX' || property == 'dropOffsetY') && !this.autoSpreads())
        return this.autoCenteredDropOffset(property == 'dropOffsetX' ? 'X' : 'Y');
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
    else if(this.keepsPiles())
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
    if(this.keepsPiles() && !isLeaving) {
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
        // the tilt of the random and arc layouts belongs to the holder: a
        // piece taken out straightens up again (an onLeave below can still
        // rotate it itself)
        if(this.get('layout') == 'random' || this.get('layout') == 'arc')
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
    if(this.get('layout') == 'grid') {
      // a drag that leaves takes its insertion preview with it - unless the
      // drop is what ends it, which lands in the cell the preview holds open
      if(card.get('dropShadowOwner') && this.gridInsertPreview && !this.preventRearrangeDuringPileDrop)
        await this.closeGridInsertPreview();
      // a card taken out of the grid leaves its cell empty - the settled cells
      // stay where they are; the pass only tidies up what no longer fits
      if(!this.preventGridReflowDuringMerge)
        await this.updateAfterShuffle(null, { sticky: true });
    // a piece taken out of the random tray leaves no hole to close - the
    // others just stay lying where they are
    } else if(this.get('alignChildren') && this.spreadsChildren() && this.get('layout') != 'random')
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
      if(child.get('type') == 'pile' && !this.gridAllowsPiles()) {
        // a pile dropped into a grid breaks up into individual cards (the grid
        // derives preventPiles, so they won't re-merge). MOVE fills them into
        // the free cells; an interactive drop puts them down at the cell under
        // the cursor.
        if(child.movedByButton) {
          const cards = [ ...child.children() ].sort((a, b)=>a.get('z') - b.get('z'));
          await this.breakUpPile(child);
          return await this.gridArriveLane(cards);
        }
        return await this.snapPileToGrid(child, oldParentID);
      }
      if(child.movedByButton)
        // MOVE fills the first free cell. Only the arriving card's lane is
        // laid out: the card has no owner yet - that is assigned after this
        // alignment - so a pass over the other lanes would count it into every
        // one of them.
        return await this.gridArriveLane([ child ]);
      // with the cells turned into stacks, a drop aimed at one of them joins
      // it: the widget is put exactly onto what it landed on, which is what
      // updatePiles takes as the decision to merge. The drop shadow points at
      // the same stack, so the preview and the drop agree.
      if(this.gridAllowsPiles()) {
        let coord = { x: child.get('x'), y: child.get('y') };
        if(!oldParentID)
          coord = this.coordLocalFromCoordGlobal(coord);
        const target = this.arrangedChildAt(child, coord.x, coord.y);
        if(target) {
          if(child.get('dropShadowOwner'))
            return await child.setPosition(target.get('x'), target.get('y'), target.get('z') + 1);
          if(await this.mergeGridDrop(child, target))
            return true;
          // updatePiles refused the merge (a dropLimit, mismatched
          // onPileCreation), so the drop gets a cell of its own like any other
          return await this.gridArriveLane([ child ]);
        }
      }
      // an interactive drop lands in the cell under the cursor - or, aimed at
      // an occupied one, the nearest cell that takes it
      return await this.snapToGridCell(child, oldParentID);
    }

    const spreads = this.get('alignChildren') && this.spreadsChildren();

    // a holder that keeps piles takes a dropped pile as it is - everywhere
    // else the pile is emptied into the holder, one card per slot
    if((this.get('preventPiles') || spreads && !this.keepsPiles()) && child.get('type') == 'pile') {
      let i=1;
      const arrived = [];
      this.preventRearrangeDuringPileDrop = true;
      for(const w of child.children().reverse()) {
        await w.set('x', child.get('x') - this.absoluteCoord('x') + i/100);
        await w.set('y', child.get('y') - this.absoluteCoord('y') + i/100);
        await w.set('parent', this.get('id'));
        arrived.push(w);
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
      if(this.get('layout') == 'random')
        // only the dropped pile's cards scatter from the heap it left them in
        // - everything already lying in the tray stays put
        await this.rearrangeChildrenRandom(this.arrangedChildrenOwned().sort((a, b)=>a.get('z') - b.get('z')), new Set(arrived));
      else if(!this.get('preventPiles'))
        await this.receiveCard();
      return true;
    }

    if(!spreads)
      await super.onChildAddAlign(child, oldParentID);
    else if(child.movedByButton) {
      const [ axis, direction ] = this.spreadDirection();
      // a layout that wraps into rows ends on both axes, so "the end" is the
      // far corner there
      const wraps = this.usesAutoLayout() || this.multiSpreadWraps();
      await this.receiveCard(child, [ axis == 'X' || wraps ? direction*999999 : 0, axis == 'Y' || wraps ? direction*999999 : 0 ]);
    } else {
      const x = child.get('x') - this.absoluteCoord('x');
      const y = child.get('y') - this.absoluteCoord('y');
      // What the drop shadow last previewed here is what the drop delivers -
      // the shadow and the actual drop area stay aligned even where laying
      // the preview out shifted the row under the pointer. The recorded
      // target has to still be one of this holder's groups; without a valid
      // preview the drop is aimed the way the preview would have decided it.
      const preview = child.dropPreview && child.dropPreview.holder == this.get('id') ? child.dropPreview : null;
      let target = null;
      let fanIndex = null;
      let pos = [ x, y ];
      if(preview) {
        target = preview.target !== undefined && widgets.has(preview.target) ? widgets.get(preview.target) : null;
        if(target && target.get('parent') != this.get('id'))
          target = null;
        fanIndex = target && preview.index !== undefined ? preview.index : null;
        if(!target && preview.x !== undefined)
          pos = [ preview.x, preview.y ];
      } else {
        // Where the widget lands decides whether it piles up with what is
        // already there, so that has to be settled before the holder pulls it
        // into its slot: from there on it sits a whole slot away from its
        // neighbours and could never combine with any of them.
        target = this.keepsPiles() ? this.arrangedChildAt(child, x, y) : null;
        if(child.get('dropShadowOwner'))
          // while the preview moves the shadow between the holder and a pile,
          // its coordinates are mid-conversion - the preview that started the
          // move places it
          return child.previewReparenting ? undefined : await this.previewShadowDrop(child, target, x, y);
        // where along the fan of the target the drop points decides where the
        // dropped widget is inserted, not just that it joins
        fanIndex = target ? this.spreadFanIndexOf(target, child, x, y) : null;
      }
      if(target) {
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
      await this.receiveCard(child, pos);
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

  // What the drop shadow shows while it hovers over this holder. Laying the
  // preview out can shift the row - a slot opening or closing, the squish
  // changing - which can put a different group under the pointer than the one
  // the pass decided on. The drop delivers what the preview shows, so the
  // decision is re-checked against the freshly laid-out row until it stands
  // still (bounded, in case two layouts keep trading places). Only a holder
  // that arranges piles aims drops at the group under the pointer - anywhere
  // else the drop slots into the row no matter what it covers, so the shadow
  // keeps previewing that slot instead of a join that would never happen.
  async previewShadowDrop(shadow, target, x, y) {
    for(let i=0; ; ++i) {
      await this.applyShadowPreview(shadow, target, x, y);
      const settled = this.keepsPiles() ? this.arrangedChildAt(shadow, x, y) : null;
      if(settled == target || i >= 2)
        return;
      target = settled;
    }
  }

  // One pass of the preview. Pointed into a fan, the drop inserts at the slot
  // under the pointer - so the preview opens a gap at exactly that slot
  // (previewGap on the pile) and the shadow sits in it, instead of pretending
  // the drop would append a new group. Pointed at a group the drop would
  // simply join - a loose card or a compact pile, where there is no slot to
  // point into - the shadow disappears, so the group itself reads as what the
  // drop lands on. Everywhere else the shadow lines up as the new group the
  // drop would form. What was decided is remembered on the shadow, so the
  // drop right after can deliver exactly what the preview showed.
  async applyShadowPreview(shadow, target, x, y) {
    const fanIndex = target ? this.spreadFanIndexOf(target, shadow, x, y) : null;
    const joins = target && fanIndex === null && !this.previewJoinBlocked(shadow, target);
    delete shadow.joinPreviewTarget;
    const previous = shadow.fanPreviewPile;
    if(previous && (previous != target || fanIndex === null)) {
      delete shadow.fanPreviewPile;
      delete previous.previewGap;
      if(widgets.has(previous.get('id')))
        await previous.arrangeChildren();
    }
    if(joins) {
      shadow.joinPreviewTarget = target;
      if(shadow.get('parent') != this.get('id'))
        await this.reparentShadow(shadow, this.get('id'));
      if(shadow.get('display')) {
        await shadow.set('display', false);
        // the row closes the gap the shadow held open as its own group
        await this.receiveCard(null);
      }
      // parked on the group it would join, so the drop right after aims there
      return await shadow.setPosition(target.get('x'), target.get('y'), shadow.get('z'));
    }
    if(!shadow.get('display'))
      await shadow.set('display', true);
    if(fanIndex === null) {
      // an earlier fan preview may have parented the shadow into the pile -
      // lining up as its own group happens as a child of the holder again
      if(shadow.get('parent') != this.get('id'))
        await this.reparentShadow(shadow, this.get('id'));
      return await this.receiveCard(shadow, [ x, y ]);
    }

    // while neither the slot nor the shadow's place in the pile changes, the
    // fan already looks exactly like this preview - a drag re-previews on
    // every pointer move, so laying it out again has to be skipped. The
    // shadow's own position is still restored below: the drag writes its
    // global pointer coordinates into it before every preview, and left in
    // place they would put a child of the pile far outside the fan.
    if(shadow.fanPreviewPile != target || target.previewGap !== fanIndex || shadow.get('parent') != target.get('id')) {
      shadow.fanPreviewPile = target;
      if(target.previewGap !== fanIndex) {
        target.previewGap = fanIndex;
        // laying the fan out around the gap also shifts the following groups
        await target.arrangeChildren();
      }
      // every widget is its own stacking context, so as a sibling of the pile
      // the shadow could only cover the whole fan or hide behind it. Slotting
      // in above the cards below its slot and below the ones above it - the
      // way the inserted card will - means joining the pile itself: the cards'
      // z values open up around the slot so it gets a z of its own
      if(shadow.get('parent') != target.get('id'))
        await this.reparentShadow(shadow, target.get('id'));
      let z = 1;
      for(const card of [ ...target.children() ].sort((a, b)=>a.get('z') - b.get('z'))) {
        if(z == fanIndex + 1)
          ++z;
        await card.set('z', z++);
      }
    }
    const slot = target.previewGapOffset || [ 0, 0 ];
    await shadow.setPosition(target.get('dropOffsetX') + slot[0], target.get('dropOffsetY') + slot[1], fanIndex + 1);
  }

  // Whether the drop the preview would show as joining the target group would
  // actually be refused - the same checks updatePiles applies when the real
  // drop lands. A blocked drop puts the widget down as its own group, so the
  // shadow keeps previewing that instead of disappearing.
  previewJoinBlocked(shadow, target) {
    if(JSON.stringify(shadow.get('onPileCreation')) !== JSON.stringify(target.get('onPileCreation')))
      return true;
    if(target.get('type') == 'pile')
      return exceedsDropLimit(target, 1);
    const dropLimit = shadow.get('onPileCreation') && shadow.get('onPileCreation').dropLimit;
    return dropLimit > -1 && dropLimit < 2;
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
    // pile dropped into one is emptied out, one card per slot. So the piles it
    // was arranging are emptied out the same way rather than left behind in a
    // state nothing else in here expects, where children() would go on
    // reporting them instead of the cards they hold and COUNT, dropLimit and
    // MOVE would silently count piles.
    // A switch away from keeping piles is not the only one that leaves piles
    // behind: the pile layout stacks dropped cards into one, so its piles have
    // to be dissolved as well when the new layout cannot host piles at all - a
    // grid, or a spread.
    const stoppedArrangingPiles =
      // under a grid the preventPiles knob is what turns the stacks off again
      property == 'preventPiles' && oldValue === false && this.get('layout') == 'grid' && !this.keepsPiles() ||
      property == 'layout' && !this.keepsPiles() && (!this.supportsPiles() || this.keepsPiles(this.effectiveLayout(oldValue === undefined ? this.getDefaultValue('layout') : oldValue)));
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
    // the tilt of the random and arc layouts belongs to them: a switch away
    // straightens the pieces before the new layout lines them up
    if(property == 'layout' && [ 'random', 'arc' ].indexOf(oldValue) != -1 && this.get('layout') != oldValue)
      for(const entry of this.childrenFilter(super.children(), true))
        for(const w of entry.get('type') == 'pile' ? entry.children() : [ entry ])
          await w.set('rotation', w.getDefaultValue('rotation'));
    // a geometry knob moves a grid's cells as little as it can (sticky); a
    // layout switch or a pile switch changes what the cells mean, so those
    // hand the cells out again from scratch
    if([ 'dropOffsetX', 'dropOffsetY', 'stackOffsetX', 'stackOffsetY', 'layout', 'preventPiles', 'pilesOffsetX', 'pilesOffsetY', 'pilesGapX', 'pilesGapY', 'spreadMin', 'gridColumns', 'gridRows' ].indexOf(property) != -1)
      await this.updateAfterShuffle(null, { sticky: [ 'layout', 'preventPiles' ].indexOf(property) == -1 });
    // the layouts that decide the arrangement from the holder's size react to it changing
    if((property == 'width' || property == 'height') && (this.usesAutoLayout() || [ 'grid', 'random', 'multiSpread', 'arc' ].indexOf(this.get('layout')) != -1))
      await this.updateAfterShuffle(null, { sticky: true });
  }

  async receiveCard(card, pos) {
    if(this.usesAutoLayout())
      return await this.receiveCardAuto(card, pos);
    // a stack in a grid cell that changes notifies its holder like any other
    // arrangement change - the grid pass is what lays the cells out. While a
    // drop is merging into one of the cells the stack grows in place, and the
    // grid around it stays put.
    if(this.get('layout') == 'grid') {
      if(!this.preventGridReflowDuringMerge)
        await this.updateAfterShuffle(null, { sticky: true });
      return;
    }
    if(this.get('layout') == 'random')
      return await this.receiveCardRandom(card, pos);
    // rows of groups are arranged like the auto layout's rows: the dropped
    // widget goes to the nearest row first and to its place within it then
    if(this.multiSpreadWraps())
      return await this.receiveCardAuto(card, pos);

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
    await this.rearrangeChildrenRandom(children, card, card && card.movedByButton ? null : pos);
  }

  async rearrangeChildren(children, card) {
    if(this.preventRearrangeDuringPileDrop)
      return;

    // a drop shadow previewing an insertion into one of the fans sits inside
    // that fan, and one previewing a join sits hidden on the group it would
    // join - every layout arranges as if neither were there
    children = children.filter(c=>!c.fanPreviewPile && (c.get('display') || !c.get('dropShadowOwner')));

    if(this.usesAutoLayout())
      return await this.rearrangeChildrenAuto(children);
    if(this.get('layout') == 'grid')
      return await this.rearrangeChildrenGrid(children);
    if(this.get('layout') == 'random')
      return await this.rearrangeChildrenRandom(children);
    if(this.get('layout') == 'arc')
      return await this.rearrangeChildrenArc(children);

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

    // with a grid pin the groups wrap into rows of perRow instead of running
    // on as one endless row; the rows advance like the groups of a vertical
    // multiSpread do - pilesGapY behind the tallest group of the row,
    // pilesOffsetY as a fixed pitch, and the default gap with neither
    const perRow = this.multiSpreadPerRow(children.length);
    if(perRow !== null) {
      const gapY = this.get('pilesGapY');
      const offsetY = this.get('pilesOffsetY');
      let y = this.get('dropOffsetY');
      let z = 1;
      for(let start = 0; start < children.length; start += perRow) {
        const row = children.slice(start, start + perRow);
        let xOffset = 0;
        let rowExtent = 0;
        for(const child of row) {
          const newZ = z;
          await child.setPosition(this.get('dropOffsetX') + xOffset, y, newZ);
          const childZ = child.get('type') == 'pile' ? child.children().map(c=>c.get('z')) : [];
          z = Math.max(newZ, ...childZ) + 1;
          xOffset += this.childSpacing(child, 'X', squish);
          rowExtent = Math.max(rowExtent, child.spreadExtent('Y', squish));
        }
        y += gapY === null && offsetY !== null ? offsetY : rowExtent + (gapY !== null ? gapY : 8);
      }
      return;
    }

    let xOffset = 0;
    let yOffset = 0;
    let z = 1;

    for(let i = 0; i < children.length; ++i) {
      const child = children[i];
      const newX = this.get('dropOffsetX') + xOffset;
      const newY = this.get('dropOffsetY') + yOffset;
      const newZ = z;

      await child.setPosition(newX, newY, newZ);

      // a pile renders at the highest z among its own value and its cards'
      // pile-local ones, so the next entry starts above all of them - with a
      // plain z++ two neighboring fans could tie and stack in DOM order,
      // hiding their count handles behind each other at random. This keeps
      // every group above the one before it, the way a fan of cards reads.
      const childZ = child.get('type') == 'pile' ? child.children().map(c=>c.get('z')) : [];
      z = Math.max(newZ, ...childZ) + 1;

      xOffset += this.childSpacing(child, 'X', squish, i, children.length);
      yOffset += this.childSpacing(child, 'Y', squish, i, children.length);
    }
  }

  // The card size the auto layout measures against: the biggest card among the
  // children, looking into piles for the cards they hold - never the box of a
  // pile itself, whose size follows from the layout and would feed back into
  // the decision. Everything reads from super.children() because keepsPiles()
  // derives from this measurement, so going through children() would recurse.
  autoCardSize() {
    // measured through every get() of a derived property, so the scan over
    // the children is cached until any state it could depend on changes
    const cacheable = typeof arrangementStateVersion == 'function';
    if(cacheable && this.cachedCardSizeVersion === arrangementStateVersion())
      return this.cachedCardSize;
    const cards = this.childrenFilter(super.children(), true)
      .flatMap(c=>c.get('type') == 'pile' ? this.childrenFilter(c.children(), false) : [ c ]);
    const size = !cards.length ? null : {
      width:  Math.max(...cards.map(c=>c.get('width'))),
      height: Math.max(...cards.map(c=>c.get('height')))
    };
    if(cacheable) {
      this.cachedCardSizeVersion = arrangementStateVersion();
      this.cachedCardSize = size;
    }
    return size;
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
    // How far the steps can grow before the binding entry ends the given
    // margin from the far edge - Infinity while nothing constrains them (a
    // lone entry has no step to grow).
    const stretchScale = (extents, steps, room, margin)=>{
      let scale = Infinity;
      let offset = 0;
      for(let i = 1; i < extents.length; ++i) {
        offset += steps[i - 1];
        if(offset > 0)
          scale = Math.min(scale, (room - 2*margin - extents[i]) / offset);
      }
      return scale;
    };
    const clampStretch = scale=>isFinite(scale) ? Math.max(1, scale) : 1;
    const rowGeometry = perRow=>{
      const rowsChildren = [];
      for(let row = 0; row * perRow < count; ++row)
        rowsChildren.push(children.slice(row * perRow, (row + 1) * perRow));
      const rowHeights = rowsChildren.map(row=>Math.max(...row.map(c=>c.spreadExtent('Y'))));
      const rowScalesX = rowsChildren.map(row=>squishScale(row.map(c=>c.spreadExtent('X')), holderWidth));
      const scaleY = squishScale(rowHeights, holderHeight);
      return { rowsChildren, rowHeights, rowScalesX, scaleY };
    };

    // a grid pin decides the wrap outright: gridColumns children per row, or
    // as many as it takes to come out at gridRows rows. Without one the
    // holder's shape picks the row count as always.
    let perRow = null;
    if(this.get('gridColumns') > 0)
      perRow = Math.max(1, Math.floor(this.get('gridColumns')));
    else if(this.get('gridRows') > 0)
      perRow = Math.ceil(count / Math.max(1, Math.floor(this.get('gridRows'))));

    if(perRow === null) {
      perRow = count;
      if(!wide && tall) {
        perRow = 1;
      } else if(wide && tall) {
        // try every row count: the one that leaves each card the most visible
        // area wins
        let bestArea = 0;
        for(let r = 1; r <= count; ++r) {
          const { rowScalesX, scaleY } = rowGeometry(Math.ceil(count / r));
          const stepX = (size.width  + pad) * Math.min(...rowScalesX);
          const stepY = (size.height + pad) * scaleY;
          const area = Math.max(0, Math.min(size.width, stepX)) * Math.max(0, Math.min(size.height, stepY));
          if(area > bestArea) {
            bestArea = area;
            perRow = Math.ceil(count / r);
          }
        }
      }
    }

    const { rowsChildren, rowHeights, rowScalesX, scaleY } = rowGeometry(perRow);
    const stepsY = rowHeights.map((h, row)=>row == rowHeights.length - 1 ? 0 : (h + pad) * scaleY);
    // per-child spacing so a fanned pile gets the room of its whole spread
    const rowExtents = rowsChildren.map(rowChildren=>rowChildren.map(c=>c.spreadExtent('X')));
    const rowSteps = rowsChildren.map((rowChildren, row)=>rowChildren.map((c, i)=>i == rowChildren.length - 1 ? 0 : (rowExtents[row][i] + pad) * rowScalesX[row]));

    // The margins come out as even as the room allows: the tighter axis names
    // the target margin and the other one spreads its steps until its content
    // ends that margin from the edges as well. The widest row binds the shared
    // factor, so the rows keep lining up; what cannot spread - a lone card in
    // its row, a full row - keeps its centered slack.
    const contentHeight = boundingExtent(rowHeights, stepsY);
    const contentWidth = Math.max(...rowsChildren.map((_, row)=>boundingExtent(rowExtents[row], rowSteps[row])));
    const margin = Math.min(Math.max(pad, (holderWidth - contentWidth) / 2), Math.max(pad, (holderHeight - contentHeight) / 2));
    const stretchX = clampStretch(Math.min(...rowsChildren.map((_, row)=>stretchScale(rowExtents[row], rowSteps[row], holderWidth, margin))));
    const stretchY = clampStretch(stretchScale(rowHeights, stepsY, holderHeight, margin));

    const stretchedStepsY = stepsY.map(step=>step * stretchY);
    let y = Math.max(pad, (holderHeight - boundingExtent(rowHeights, stretchedStepsY)) / 2);

    for(let row = 0; row < rowsChildren.length; ++row) {
      const rowChildren = rowsChildren[row];
      const steps = rowSteps[row].map(step=>step * stretchX);
      let x = Math.max(pad, (holderWidth - boundingExtent(rowExtents[row], steps)) / 2);
      for(let i = 0; i < rowChildren.length; ++i) {
        // stretching multiplies fractions into the offsets - written to the
        // state they are rounded the way a plain drop is
        await rowChildren[i].setPosition(Math.round(x*1024)/1024, Math.round(y*1024)/1024, z++);
        x += steps[i];
      }
      y += stretchedStepsY[row];
    }
  }

  // The arc layout: a singleSpread bent into the fan a hand of cards makes on
  // a table - the cards sit on a circle, tilted tangent to it, the middle of
  // the hand at the top and the ends dropping away. Everything is derived:
  // the step along the row is the stack offset (the singleSpread default of
  // 40 without one), the sweep grows with the hand up to ±30 degrees, and the
  // curvature follows from span and sweep - a holder without the height for
  // that dip gets a flatter arc, down to a straight row.
  async rearrangeChildrenArc(children) {
    if(this.preventRearrangeDuringPileDrop || !children.length)
      return;
    const cardW = Math.max(...children.map(c=>c.get('width')));
    const cardH = Math.max(...children.map(c=>c.get('height')));
    const count = children.length;
    const step = Math.abs(this.get('stackOffsetX')) || 40;
    const availW = Math.max(0, this.get('width') - 2*this.get('dropOffsetX') - cardW);
    // the span between the first and the last card's center: the natural step
    // while it fits, spread out to justified steps once it would overflow
    const chord = Math.min(step * (count - 1), availW);
    const centerX = this.get('width') / 2;

    let halfSweep = Math.min(arcLayoutMaxHalfSweep, arcLayoutSweepPerCard * (count - 1) / 2) * Math.PI / 180;
    let radius = null;
    let sagitta = 0;
    if(halfSweep > 0.001 && chord > 0) {
      radius = chord / (2 * Math.sin(halfSweep));
      sagitta = radius * (1 - Math.cos(halfSweep));
      const room = Math.max(0, this.get('height') - 2*this.get('dropOffsetY') - cardH);
      if(sagitta > room) {
        // without the height for the dip, the circle through the same span
        // with the sagitta the holder has room for - possibly a straight row
        if(room < 1) {
          radius = null;
          sagitta = 0;
        } else {
          radius = (chord * chord / 4 + room * room) / (2 * room);
          halfSweep = Math.asin(Math.min(1, chord / (2 * radius)));
          sagitta = room;
        }
      }
    }
    if(radius === null)
      halfSweep = 0;

    // the whole fan stands centered in the holder: from the top of the middle
    // card down to the lowest corner of the tilted end cards
    const endHalf = (cardH * Math.cos(halfSweep) + cardW * Math.sin(halfSweep)) / 2;
    const top = Math.max(this.get('dropOffsetY'), (this.get('height') - sagitta - cardH/2 - endHalf) / 2);

    let z = 1;
    for(let i = 0; i < count; ++i) {
      const angle = count < 2 ? 0 : -halfSweep + i * 2 * halfSweep / (count - 1);
      const along = count < 2 ? 0 : -chord/2 + i * chord / (count - 1);
      const x = centerX + (radius === null ? along : radius * Math.sin(angle)) - cardW/2;
      const y = top + (radius === null ? 0 : radius * (1 - Math.cos(angle)));
      await children[i].setPosition(Math.round(x*1024)/1024, Math.round(y*1024)/1024, z++);
      // tangent to the circle, on top of whatever the card's own default is
      const base = +children[i].getDefaultValue('rotation') || 0;
      const tilt = radius === null ? 0 : Math.round(angle * 1800 / Math.PI) / 10;
      await children[i].set('rotation', tilt ? base + tilt : children[i].getDefaultValue('rotation'));
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

  // The scatter pass of the random layout. A full pass (a resize, a changed
  // margin, a layout switch) lets every piece keep its spot while it lies
  // inside the margins and clear of the pieces placed before it, so laying
  // the holder out again moves nothing that does not have to move - and
  // consumes no randomness. A drop pass (dropped names one piece or a Set of
  // them) places only what is being put down: everything already lying in the
  // tray stays exactly where it is and merely counts as the obstacles the
  // landing spot is measured against. What cannot stay where it aimed is
  // thrown onto a random spot with a fresh tilt instead. Of the spots
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

    const droppedSet = !dropped ? null : dropped instanceof Set ? dropped : new Set([ dropped ]);
    if(droppedSet)
      for(const child of children)
        if(!droppedSet.has(child))
          placed.push(boxAt({ x: child.get('x'), y: child.get('y') }, this.randomPieceMetrics(child, child.get('rotation'))));

    // a drop leaves the z of what already lies in the tray alone and just
    // settles on top of it; a full pass renumbers the whole tray
    let z = droppedSet ? children.reduce((max, c)=>droppedSet.has(c) ? max : Math.max(max, c.get('z')), 0) + 1 : 1;
    for(const child of children) {
      if(droppedSet && !droppedSet.has(child))
        continue;
      let rotation = child.get('rotation');
      let metrics = this.randomPieceMetrics(child, rotation);
      let at = null;
      if(droppedSet) {
        // the piece being put down settles with a fresh tilt, decided before
        // the aimed spot is checked so the tilted box is what has to fit
        // there. A single drop is aimed by where it was released, the cards
        // of a dropped pile by the heap the pile left them in.
        rotation = freshTilt(child);
        metrics = this.randomPieceMetrics(child, rotation);
        const aim = dropped instanceof Set ? [ child.get('x'), child.get('y') ] : pos;
        if(aim)
          at = this.randomClampPiece({ x: aim[0], y: aim[1] }, metrics);
      } else {
        at = this.randomClampPiece({ x: child.get('x'), y: child.get('y') }, metrics);
      }

      if(!at || coveredArea(boxAt(at, metrics))) {
        if(!droppedSet) {
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

  // Compute the grid geometry: the cell lattice the cards snap to. The cell
  // size is taken from the first child - the grid assumes all children share
  // one size, as a card deck does - dropOffset is the margin from the edges
  // and stackOffset the gap between cells. pilesOffset pins the pitch of the
  // cells to a fixed distance the way it spaces the groups of a multiSpread:
  // a pitch of the card size packs the cells flush, and lining the grid up
  // with a background image stays lined up at any card count.
  //
  // The lattice spans the holder: every cell it has room for exists whether a
  // card sits in it or not, so a drop can aim at any of them. gridColumns and
  // gridRows pin the column and row count instead. Where the cells are stacks
  // (preventPiles: false), the pins and the holder's edge cap the grid
  // outright - what does not fit stacks up rather than adding rows. Only a
  // grid whose cells cannot stack makes room: extra rows where the columns
  // are pinned, compressed cells where nothing is.
  gridMetrics(n) {
    const marginX = this.get('dropOffsetX');
    const marginY = this.get('dropOffsetY');
    // the default cell gap matches the gap a multiSpread leaves between its
    // groups, so cards read as separate cells out of the box
    const gapX = Math.abs(this.get('stackOffsetX')) || 8;
    const gapY = Math.abs(this.get('stackOffsetY')) || 8;
    const first = this.children()[0];
    const cardW = first ? first.get('width')  : this.get('width');
    const cardH = first ? first.get('height') : this.get('height');

    const availX = Math.max(0, this.get('width')  - 2 * marginX - cardW);
    const availY = Math.max(0, this.get('height') - 2 * marginY - cardH);
    const pitchX = this.get('pilesOffsetX') === null ? null : Math.abs(this.get('pilesOffsetX'));
    const pitchY = this.get('pilesOffsetY') === null ? null : Math.abs(this.get('pilesOffsetY'));
    const fullStepX = pitchX !== null ? pitchX : cardW + gapX;
    const fullStepY = pitchY !== null ? pitchY : cardH + gapY;

    const colsFit = Math.max(1, fullStepX > 0 ? Math.floor(availX / fullStepX) + 1 : 1);
    const rowsFit = Math.max(1, fullStepY > 0 ? Math.floor(availY / fullStepY) + 1 : 1);
    const pinnedColumns = this.get('gridColumns') > 0 ? Math.max(1, Math.floor(this.get('gridColumns'))) : null;
    const pinnedRows    = this.get('gridRows')    > 0 ? Math.max(1, Math.floor(this.get('gridRows')))    : null;
    const stacks = this.gridAllowsPiles();
    const demand = Math.max(1, n);

    let cols;
    if(pinnedColumns !== null) {
      cols = pinnedColumns;
    } else if(pinnedRows !== null) {
      // as many columns as the cards need; where the cells are stacks the
      // holder's edge caps them, since the stacks absorb what does not fit
      cols = Math.max(1, Math.ceil(demand / pinnedRows));
      if(stacks)
        cols = Math.min(cols, colsFit);
    } else if(stacks || demand <= colsFit * rowsFit) {
      cols = colsFit;
    } else {
      // more cards than the holder has cells and nothing to absorb them: find
      // the column count that keeps every card inside with the least overlap
      let best = null;
      for(let candidate=1; candidate<=demand; ++candidate) {
        const rows = Math.ceil(demand / candidate);
        const stepX = pitchX !== null ? pitchX : candidate > 1 ? Math.min(fullStepX, availX / (candidate - 1)) : fullStepX;
        const stepY = pitchY !== null ? pitchY : rows > 1 ? Math.min(fullStepY, availY / (rows - 1)) : fullStepY;
        const overlapX = candidate > 1 ? Math.max(0, (cardW - stepX) / cardW) : 0;
        const overlapY = rows > 1 ? Math.max(0, (cardH - stepY) / cardH) : 0;
        const score = Math.max(overlapX, overlapY) + (overlapX + overlapY) / 10;
        if(!best || score < best.score - 1e-9)
          best = { cols: candidate, score };
      }
      cols = best.cols;
    }

    let stepRows = pinnedRows !== null ? pinnedRows : Math.max(1, Math.ceil(demand / cols));
    if(pinnedRows === null && stacks)
      stepRows = Math.min(stepRows, rowsFit);

    const stepX = pitchX !== null ? pitchX : cols     > 1 ? Math.min(fullStepX, availX / (cols     - 1)) : fullStepX;
    const stepY = pitchY !== null ? pitchY : stepRows > 1 ? Math.min(fullStepY, availY / (stepRows - 1)) : fullStepY;

    return {
      cols, stepX, stepY, marginX, marginY, cardW, cardH,
      // the rows a drop can aim at
      aimRows: pinnedRows !== null ? pinnedRows : Math.max(stepRows, rowsFit),
      // all the cells the grid will ever place while its cells are stacks -
      // everything past them stacks up. Unlimited where they cannot.
      capacity: stacks ? cols * (pinnedRows !== null ? pinnedRows : rowsFit) : Infinity,
      // a grid pinned to a row count fills its rows evenly, one column after
      // the next, the way a column-pinned grid fills row after row
      fillByColumn: pinnedRows !== null && pinnedColumns === null
    };
  }

  // The fill order of the lattice, and the mapping between a cell index, its
  // column and row, and its position. Indices past the lattice continue it -
  // extra rows (or, filling by column, extra columns) - which is where a grid
  // whose cells cannot stack overflows to.
  gridCellIndex(m, col, row) {
    return m.fillByColumn ? col * m.aimRows + row : row * m.cols + col;
  }

  gridCellAt(m, index) {
    return m.fillByColumn
      ? { col: Math.floor(index / m.aimRows), row: index % m.aimRows }
      : { col: index % m.cols, row: Math.floor(index / m.cols) };
  }

  gridCellPosition(m, index) {
    const { col, row } = this.gridCellAt(m, index);
    return { x: m.marginX + col * m.stepX, y: m.marginY + row * m.stepY };
  }

  gridCellRange(m) {
    return Math.min(m.capacity, m.cols * m.aimRows);
  }

  // The cell index a coordinate inside the holder aims at.
  gridCellFromCoord(m, x, y) {
    const col = Math.max(0, Math.min(m.cols - 1, Math.round((x - m.marginX) / (m.stepX || 1))));
    const row = Math.max(0, Math.min(m.aimRows - 1, Math.round((y - m.marginY) / (m.stepY || 1))));
    return this.gridCellIndex(m, col, row);
  }

  // The cell a settled entry sits on, or null when it does not sit exactly on
  // a lattice point - which means the lattice itself moved under it (a resize
  // that compressed the steps, an arrangement from another layout) and the
  // pass has to hand the cells out again.
  gridClaimedCell(m, entry) {
    const col = Math.round((entry.get('x') - m.marginX) / (m.stepX || 1));
    const row = Math.round((entry.get('y') - m.marginY) / (m.stepY || 1));
    if(!isFinite(col) || !isFinite(row) || col < 0 || row < 0)
      return null;
    if(Math.abs(entry.get('x') - (m.marginX + col * m.stepX)) >= 0.5)
      return null;
    if(Math.abs(entry.get('y') - (m.marginY + row * m.stepY)) >= 0.5)
      return null;
    return this.gridCellIndex(m, col, row);
  }

  // One arrangement pass over a grid lane. Settled entries keep the cell their
  // position names - holes and all - so a membership or size change moves
  // nothing that still fits: a card taken out leaves its cell empty, a dealt
  // card fills the first free cell, a dropped one the cell it was aimed at.
  // Entries that lost their cell (out of range, two claims on one cell) go to
  // the nearest free one. Once every cell is taken and the cells are stacks,
  // the leftovers stack onto the least loaded compatible cell - never past the
  // lattice; anywhere else they overflow onto the cells the fill order
  // continues with. An ordered pass (SHUFFLE, SORT, MOVE's position) hands the
  // occupied cells out again in z order instead - the holes stay holes - and
  // when the entries do not sit on the lattice at all, everything is packed
  // from the first cell.
  async gridArrange(entries, { ordered=false, arrivals=null, aimIndex=null }={}) {
    if(this.preventRearrangeDuringPileDrop || !entries.length)
      return;
    const m = this.gridMetrics(entries.length);
    const range = this.gridCellRange(m);

    const assigned = new Map();  // cell index -> entry
    const pending = [];          // { entry, near } - entries that need a cell

    // read the cell each settled entry claims; any entry off the lattice means
    // the lattice moved and every cell is handed out again from scratch
    let claims = new Map();
    const settled = arrivals ? entries.filter(e=>!arrivals.has(e)) : entries;
    for(const entry of settled) {
      const index = this.gridClaimedCell(m, entry);
      if(index === null) {
        claims = null;
        break;
      }
      claims.set(entry, index);
    }

    if(claims && ordered) {
      // an explicit reorder permutes the entries across the cells they occupy:
      // shuffling a partly cleared grid moves the cards between their cells
      // instead of packing them back together
      const cells = [ ...new Set(claims.values()) ].filter(index=>index < range).sort((a, b)=>a - b);
      if(cells.length == entries.length) {
        for(let i=0; i<entries.length; ++i)
          assigned.set(cells[i], entries[i]);
      } else {
        claims = null;
      }
    } else if(claims) {
      for(const [ entry, index ] of claims) {
        // where the cells cannot stack the fill order continues past the
        // lattice, so a settled entry on an overflow cell keeps it - only a
        // grid of stacks caps its cells and pulls strays back inside
        if((index < range || !isFinite(m.capacity)) && !assigned.has(index))
          assigned.set(index, entry);
        else
          pending.push({ entry, near: Math.min(index, range - 1) });
      }
      for(const entry of entries)
        if(arrivals && arrivals.has(entry))
          pending.push({ entry, near: aimIndex });
    }

    if(!claims) {
      let index = 0;
      for(const entry of entries) {
        if(index < range || !isFinite(m.capacity))
          assigned.set(index, entry);
        else
          pending.push({ entry, near: index % range });
        ++index;
      }
    }

    // hand out the free cells: the aimed (or lost) cell while it is free, the
    // nearest free one otherwise, the first free one for an aimless arrival
    const leftovers = [];
    for(const { entry, near } of pending) {
      let found = null;
      for(let i=0; i<range; ++i) {
        if(assigned.has(i))
          continue;
        if(near === null) {
          found = i;
          break;
        }
        const cell = this.gridCellAt(m, i);
        const aim = this.gridCellAt(m, near);
        const distance = Math.pow((cell.col - aim.col) * m.stepX, 2) + Math.pow((cell.row - aim.row) * m.stepY, 2);
        if(!found || distance < found.distance - 1e-9)
          found = { index: i, distance };
      }
      if(found !== null) {
        assigned.set(typeof found == 'number' ? found : found.index, entry);
      } else if(!isFinite(m.capacity)) {
        let i = range;
        while(assigned.has(i))
          ++i;
        assigned.set(i, entry);
      } else {
        leftovers.push({ entry, near });
      }
    }

    // every cell is taken: the leftovers stack onto the least loaded cell that
    // takes them - same onPileCreation, room under the stack's dropLimit, the
    // rules a drop merging into the cell follows. Dealing past the capacity
    // this way layers the stacks evenly. A leftover nothing can host gets an
    // overflow cell after all - better visible than gone.
    const merges = [];
    if(leftovers.length) {
      const plannedSize = new Map();
      const sizeOf = entry => entry.get('type') == 'pile' ? entry.children().length : 1;
      for(const { entry, near } of leftovers) {
        let best = null;
        for(const [ index, host ] of assigned) {
          if(!this.gridCanStackOnto(host, entry, (plannedSize.get(host) || sizeOf(host)) + sizeOf(entry)))
            continue;
          const size = plannedSize.get(host) || sizeOf(host);
          const cell = this.gridCellAt(m, index);
          const aim = this.gridCellAt(m, near === null ? 0 : near);
          const distance = Math.pow((cell.col - aim.col) * m.stepX, 2) + Math.pow((cell.row - aim.row) * m.stepY, 2);
          if(!best || size < best.size || size == best.size && distance < best.distance - 1e-9)
            best = { index, host, size, distance };
        }
        if(best) {
          plannedSize.set(best.host, (plannedSize.get(best.host) || sizeOf(best.host)) + sizeOf(entry));
          merges.push({ entry, index: best.index });
        } else {
          let i = range;
          while(assigned.has(i))
            ++i;
          assigned.set(i, entry);
        }
      }
    }

    // write the positions; z runs in fill order over the occupied cells, so
    // "the top card" keeps meaning the last cell like it always has
    let z = 1;
    for(const index of [ ...assigned.keys() ].sort((a, b)=>a - b)) {
      const { x, y } = this.gridCellPosition(m, index);
      await assigned.get(index).setPosition(x, y, z++);
    }

    for(const { entry, index } of merges) {
      const host = assigned.get(index);
      const cards = entry.get('type') == 'pile' ? [ ...entry.children() ].sort((a, b)=>a.get('z') - b.get('z')) : [ entry ];
      const reflowFlag = this.preventGridReflowDuringMerge;
      this.preventGridReflowDuringMerge = true;
      if(host.get('type') == 'pile')
        await this.mergeIntoGroup(cards, host);
      else
        assigned.set(index, await this.makeGroup([ host, ...cards ]));
      if(!reflowFlag)
        delete this.preventGridReflowDuringMerge;
    }
  }

  // Whether an entry can stack onto the entry of an occupied cell: the same
  // rules previewJoinBlocked applies to a drop joining a stack, against the
  // size the stack is about to have.
  gridCanStackOnto(host, entry, size) {
    const creationOf = w => JSON.stringify((w.get('type') == 'pile' ? w.children()[0] : w)?.get('onPileCreation') ?? null);
    if(creationOf(host) != creationOf(entry))
      return false;
    if(host.get('type') == 'pile')
      return !exceedsDropLimit(host, 0, size);
    const dropLimit = host.get('onPileCreation') && host.get('onPileCreation').dropLimit;
    return !(dropLimit > -1 && dropLimit < size);
  }

  async rearrangeChildrenGrid(children) {
    if(this.preventRearrangeDuringPileDrop || !children.length)
      return;
    await this.gridArrange(children, { ordered: true });
  }

  // Which cell (or which stack) a drop aimed at the given cell goes to: the
  // aimed cell while it is free, an insertion where it is taken and the cells
  // cannot stack - the occupied cells from there on step one forward, up to
  // the first hole, the way a spread opens a slot for a drop - the nearest
  // free cell where insertion is not what a drop means (the cells are stacks
  // but the drop missed every card), and the nearest stack that takes it once
  // there is none. The drop and its shadow resolve through the same call, so
  // the preview shows exactly what the drop will do.
  resolveGridDrop(m, others, child, aimIndex) {
    const occupied = new Map();
    for(const entry of others) {
      const index = this.gridClaimedCell(m, entry);
      if(index !== null && !occupied.has(index))
        occupied.set(index, entry);
    }
    const range = this.gridCellRange(m);
    if(aimIndex < range && !occupied.has(aimIndex))
      return { index: aimIndex };

    if(!this.gridAllowsPiles() && occupied.has(aimIndex))
      return { index: aimIndex, insert: true };

    let best = null;
    for(let i=0; i<range; ++i) {
      if(occupied.has(i))
        continue;
      const cell = this.gridCellAt(m, i);
      const aim = this.gridCellAt(m, aimIndex);
      const distance = Math.pow((cell.col - aim.col) * m.stepX, 2) + Math.pow((cell.row - aim.row) * m.stepY, 2);
      if(!best || distance < best.distance - 1e-9)
        best = { index: i, distance };
    }
    if(best)
      return { index: best.index };

    if(isFinite(m.capacity)) {
      const sizeOf = entry => entry.get('type') == 'pile' ? entry.children().length : 1;
      let host = null;
      for(const [ index, entry ] of occupied) {
        if(!this.gridCanStackOnto(entry, child, sizeOf(entry) + sizeOf(child)))
          continue;
        const size = sizeOf(entry);
        const cell = this.gridCellAt(m, index);
        const aim = this.gridCellAt(m, aimIndex);
        const distance = Math.pow((cell.col - aim.col) * m.stepX, 2) + Math.pow((cell.row - aim.row) * m.stepY, 2);
        if(!host || size < host.size || size == host.size && distance < host.distance - 1e-9)
          host = { entry, size, distance };
      }
      if(host)
        return { host: host.entry };
    }

    let i = range;
    while(occupied.has(i))
      ++i;
    return { index: i };
  }

  // An interactive drop lands in the cell it was aimed at - a free cell takes
  // it as it is, holes and all, and the settled cards stay where they are. An
  // occupied cell of a grid whose cells cannot stack takes it as an insertion:
  // the cards from that cell on step one cell forward to make room.
  async snapToGridCell(child, oldParentID) {
    let coord = { x: child.get('x'), y: child.get('y') };
    if(!oldParentID)
      coord = this.coordLocalFromCoordGlobal(coord);

    const owner = this.childOwner(child);
    // a pile in a cell counts as the one entry it is: the cards inside it
    // never claim cells of their own
    const others = this.childrenFilter(super.children(), true).filter(w=>w != child && !w.get('dropShadowOwner') && (!w.get('owner') || w.get('owner') === owner)).sort((a, b)=>a.get('z') - b.get('z'));
    const m = this.gridMetrics(others.length + 1);
    const aimIndex = this.gridCellFromCoord(m, coord.x, coord.y);

    if(child.get('dropShadowOwner')) {
      // an insertion preview holds while the pointer stays on its cell; aimed
      // anywhere else it is taken back before the aim is resolved again
      if(this.gridInsertPreview && this.gridInsertPreview.index !== aimIndex)
        await this.closeGridInsertPreview();
      const resolved = this.resolveGridDrop(m, others, child, aimIndex);
      // the preview: only the shadow is placed, parked on the stack it would
      // join or on the cell the drop will take
      if(resolved.host)
        return await child.setPosition(resolved.host.get('x'), resolved.host.get('y'), resolved.host.get('z') + 1);
      if(resolved.insert)
        this.gridInsertPreview = { index: aimIndex, count: others.length + 1, moved: await this.gridOpenCell(m, others, aimIndex) };
      const { x, y } = this.gridCellPosition(m, resolved.index);
      return await child.setPosition(x, y, others.length + 1);
    }

    // the drop consumes the cell its preview holds open; aimed anywhere else,
    // the preview is taken back before the drop is resolved
    const preview = this.gridInsertPreview;
    if(preview) {
      delete this.gridInsertPreview;
      if(preview.index !== aimIndex)
        await this.closeGridInsertPreview(preview);
    }
    const resolved = this.resolveGridDrop(m, others, child, aimIndex);
    if(resolved.host && await this.mergeGridDrop(child, resolved.host))
      return true;
    if(resolved.insert)
      await this.gridOpenCell(m, others, aimIndex);
    return await this.gridArrange([ ...others, child ].sort((a, b)=>a.get('z') - b.get('z')), { arrivals: new Set([ child ]), aimIndex: resolved.host ? null : resolved.index });
  }

  // Step the chain of occupied cells that starts at the given cell one cell
  // forward - it ends at the first hole, so the cards between it and the
  // insertion point move by one and everything past the hole stays put.
  // Answers with what moved, so an insertion preview can be taken back.
  async gridOpenCell(m, entries, index) {
    const occupied = new Map();
    for(const entry of entries) {
      const i = this.gridClaimedCell(m, entry);
      if(i !== null && !occupied.has(i))
        occupied.set(i, entry);
    }
    let free = index;
    while(occupied.has(free))
      ++free;
    const moved = [];
    for(let i = free - 1; i >= index; --i) {
      const entry = occupied.get(i);
      const { x, y } = this.gridCellPosition(m, i + 1);
      await entry.setPosition(x, y, entry.get('z'));
      moved.push({ entry, index: i });
    }
    return moved;
  }

  // Take an insertion preview back: the cards the open cell pushed forward
  // step back onto the cells they came from.
  async closeGridInsertPreview(preview = this.gridInsertPreview) {
    delete this.gridInsertPreview;
    if(!preview)
      return;
    const m = this.gridMetrics(preview.count);
    for(const { entry, index } of preview.moved)
      if(widgets.has(entry.get('id'))) {
        const { x, y } = this.gridCellPosition(m, index);
        await entry.setPosition(x, y, entry.get('z'));
      }
  }

  // Break a pile dropped interactively into a grid and put its cards down at
  // the cell under the cursor and the free cells around it - the settled
  // cards stay where they are.
  async snapPileToGrid(pile, oldParentID) {
    let coord = { x: pile.get('x'), y: pile.get('y') };
    if(!oldParentID)
      coord = this.coordLocalFromCoordGlobal(coord);

    const owner = this.childOwner(pile);
    const incoming = [ ...pile.children() ].sort((a, b)=>a.get('z') - b.get('z'));
    await this.breakUpPile(pile);

    const entries = this.childrenFilter(super.children(), true).filter(w=>!w.get('dropShadowOwner') && (!w.get('owner') || w.get('owner') === owner)).sort((a, b)=>a.get('z') - b.get('z'));
    const m = this.gridMetrics(entries.length);
    await this.gridArrange(entries, { arrivals: new Set(incoming), aimIndex: this.gridCellFromCoord(m, coord.x, coord.y) });
  }

  // Cards a routine moves into the grid arrive without an aim: each fills the
  // first free cell of its lane, and everything settled stays where it is.
  async gridArriveLane(cards) {
    for(const owner of new Set(cards.map(c=>this.childOwner(c)))) {
      const lane = cards.filter(c=>this.childOwner(c) === owner);
      const entries = this.childrenFilter(super.children(), true).filter(w=>!w.get('dropShadowOwner') && (!w.get('owner') || w.get('owner') === owner)).sort((a, b)=>a.get('z') - b.get('z'));
      await this.gridArrange(entries, { arrivals: new Set(lane) });
    }
    return true;
  }

  // Merge an interactively dropped widget into the entry of the cell it landed
  // on. The stack grows right where it stands: the merge turns two entries
  // into one, and a grid pass over that would shift every other cell - so the
  // passes the merge triggers are suppressed, and the merged stack takes over
  // the cell (and the slot in the by-z order) of what it landed on. False when
  // updatePiles refused the merge (a dropLimit, mismatched onPileCreation).
  async mergeGridDrop(child, target) {
    const targetZ = target.get('z');
    await child.setPosition(target.get('x'), target.get('y'), child.get('z'));
    this.preventGridReflowDuringMerge = true;
    await child.updatePiles();
    delete this.preventGridReflowDuringMerge;
    if(child.isBeingRemoved || child.get('parent') != this.get('id') || target.get('parent') != this.get('id')) {
      let stack = child.isBeingRemoved ? target : child;
      if(stack.get('parent') != this.get('id') && widgets.has(stack.get('parent')))
        stack = widgets.get(stack.get('parent'));
      if(stack.get('parent') == this.get('id'))
        await stack.set('z', targetZ);
      return true;
    }
    return false;
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
  // multiSpread hands in its fanSquish, which shrinks the gaps and in the
  // last resort overlaps the groups themselves. index and count locate the
  // child in its row so spreadMin can compress the step below the topmost
  // cards, the way a pile compresses its fan.
  childSpacing(child, axis, squish=null, index=null, count=null) {
    const stackOffset = this.get('stackOffset' + axis);

    if(this.keepsPiles()) {
      const squished = squish && squish.axis == axis;
      const gap = squished ? squish.gap : this.get('pilesGap' + axis);
      if(gap !== null)
        return child.spreadExtent(axis, squish) * (squished ? squish.groups : 1) + gap;
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
      return stackOffset ? child.spreadExtent(axis, squish) : 0;
    }

    if(!child.get('overlap') && stackOffset)
      return child.get(axis == 'X' ? 'width' : 'height') + 4;
    return stackOffset * this.rowSpreadFactor(index, count);
  }

  // The share of the stack offset used for the step after the row's card at
  // the given index: the topmost spreadMin cards keep the offset, everything
  // below them is compressed - so a long fanned row stays readable without
  // running past the holder, exactly like the fan of a pile.
  rowSpreadFactor(index, count) {
    const spreadMin = this.get('spreadMin');
    if(spreadMin === null || index === null || count === null || count - index <= spreadMin)
      return 1;
    return compressedRowSpreadFactor;
  }

  // Whether the groups of this multiSpread wrap into rows: a grid pin turns
  // the one endless row into as many as it takes, gridColumns groups each.
  multiSpreadWraps() {
    return this.effectiveLayout() == 'multiSpread' && (this.get('gridColumns') > 0 || this.get('gridRows') > 0);
  }

  // How many groups go into one row of a wrapping multiSpread, for a lane of
  // the given size - null while the groups stay on one endless row.
  // gridColumns pins the count outright, gridRows derives it from the lane.
  multiSpreadPerRow(count) {
    if(this.effectiveLayout() != 'multiSpread')
      return null;
    const columns = this.get('gridColumns');
    if(columns > 0)
      return Math.max(1, Math.floor(columns));
    const rows = this.get('gridRows');
    if(rows > 0)
      return Math.ceil(Math.max(1, count) / Math.max(1, Math.floor(rows)));
    return null;
  }

  pilesSpacingSet() {
    return [ 'pilesOffsetX', 'pilesOffsetY', 'pilesGapX', 'pilesGapY' ].some(p=>this.get(p) !== null);
  }

  // How the groups of a multiSpread stay inside the holder when they take
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
    if(this.effectiveLayout() != 'multiSpread' || result.gap === null)
      return result;

    const size = axis == 'X' ? 'width' : 'height';
    // a drop shadow lined up as its own group takes a slot of the row, so it
    // counts like the group the drop is about to form - the row the preview
    // shows is then the row the drop leaves behind. A hidden shadow (join
    // preview) and one slotted into a fan take no slot of their own.
    const children = this.arrangedChildren().filter(c=>!c.fanPreviewPile && (c.get('display') || !c.get('dropShadowOwner')) && (!c.get('owner') || c.get('owner') === owner));
    if(!children.length)
      return result;
    const available = this.get(size) - 2 * this.get('dropOffset' + axis);

    const squishRow = row=>{
      const bases = row.map(c=>c.get('type') == 'pile' && c.children().length ? c.children()[0].get(size) : c.get(size));
      const fans = row.map(c=>c.get('type') == 'pile' ? c.fanLength(axis) : 0);
      const baseSum = bases.reduce((a, b)=>a + b, 0);
      const fanSum = fans.reduce((a, b)=>a + b, 0);
      const gapCount = row.length - 1;

      if(baseSum + fanSum + gapCount * result.gap <= available)
        return { ...result };
      if(baseSum + fanSum <= available)
        return { ...result, gap: gapCount ? (available - baseSum - fanSum) / gapCount : result.gap };
      if(baseSum <= available && fanSum)
        return { ...result, gap: 0, fans: Math.max(0, available - baseSum) / fanSum };
      const lastBase = bases[bases.length - 1];
      const stepSum = baseSum - lastBase;
      return { ...result, gap: 0, fans: 0, groups: stepSum > 0 ? Math.min(1, Math.max(0, (available - lastBase) / stepSum)) : 1 };
    };

    // with the groups wrapped into rows, each row is measured on its own and
    // the tightest one decides - every fan of the holder follows one factor,
    // and the fuller rows are what has to stay inside
    const perRow = this.multiSpreadPerRow(children.length);
    const rows = [];
    if(perRow === null) {
      rows.push(children);
    } else {
      const sorted = [ ...children ].sort((a, b)=>a.get('z') - b.get('z'));
      for(let start = 0; start < sorted.length; start += perRow)
        rows.push(sorted.slice(start, start + perRow));
    }
    let squished = null;
    for(const row of rows) {
      const candidate = squishRow(row);
      if(!squished || candidate.groups < squished.groups || candidate.groups == squished.groups && (candidate.fans < squished.fans || candidate.fans == squished.fans && candidate.gap < squished.gap))
        squished = candidate;
    }
    return squished;
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
    return !!(this.get('stackOffsetX') || this.get('stackOffsetY') || this.keepsPiles() && this.pilesSpacingSet());
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
    // wrapped groups always run in rows: the Y pair spaces the rows, so it
    // must not turn the main axis vertical
    if(this.multiSpreadWraps())
      return [ 'X', 1 ];
    if(this.keepsPiles()) {
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
  // room to arrange anything anyway. A grid keeps stacks in its cells, but
  // the cells are their own arrangement rather than a row of groups, so the
  // group operations - and the pile layout the groups inherit - stay out.
  arrangesPiles() {
    return !!(this.keepsPiles() && !this.usesAutoLayout() && this.get('layout') != 'grid' && this.get('alignChildren') && this.spreadsChildren() && this.supportsPiles());
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
    // every card entering the pile would lay the whole row out again - the row
    // holds still until the group is complete and gets one pass at the end
    const hadFlag = this.preventRearrangeDuringPileDrop;
    this.preventRearrangeDuringPileDrop = true;
    for(const card of cards) {
      // z before parent: the pile lays its cards out by z, so it has to be the
      // final one - the order the routine moved the cards in - by then
      await card.bringToFront();
      await card.set('parent', pileID);
    }
    if(!hadFlag) {
      delete this.preventRearrangeDuringPileDrop;
      await widgets.get(pileID).arrangeChildren();
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
    // the row is laid out once by insertChildrenAt below instead of once per
    // card entering the pile
    const hadFlag = this.preventRearrangeDuringPileDrop;
    this.preventRearrangeDuringPileDrop = true;
    for(const card of cards) {
      await card.bringToFront();
      await card.set('parent', pile.get('id'));
    }
    if(!hadFlag)
      delete this.preventRearrangeDuringPileDrop;
    // renumbering the fan explicitly keeps the order deterministic - null
    // means on top, the way MOVE has always stacked what it brings
    await pile.insertChildrenAt(cards, index === null ? pile.children().length : index);
    return pile;
  }

  // Split the given cards - the top of one of this holder's groups, bottom of
  // the new group first - off into a group of their own. Both halves stay
  // inside the holder: the cards are put down right past the pile they came
  // from, a hundredth of a unit apart, and the row then lines the new group
  // up next to it. Clear of the pile's box, so the card a dissolving pile
  // promotes is not aimed at them and keeps its own slot.
  async splitGroup(pile, cards) {
    const [ axis ] = this.spreadDirection();
    const awayX = pile.get('x') + (axis == 'X' ? pile.spreadExtent('X') : 0);
    const awayY = pile.get('y') + (axis == 'Y' ? pile.spreadExtent('Y') : 0);
    this.preventRearrangeDuringPileDrop = true;
    let i = 1;
    for(const c of cards) {
      // it moves within the holder like applyMovePosition's cards do: it
      // keeps its lane in a shared hand and onEnter/onLeave stay out of it
      c.currentParent = this;
      c.movedByButton = true;
      if(c.get('owner') !== null)
        c.targetPlayer = c.get('owner');
      await c.set('x', awayX + i/100);
      await c.set('y', awayY + i/100);
      await c.set('parent', this.get('id'));
      delete c.targetPlayer;
      delete c.movedByButton;
      delete c.currentParent;
      ++i;
    }
    delete this.preventRearrangeDuringPileDrop;
    if(cards.length > 1)
      return await this.makeGroup(cards);
    await this.receiveCard(null);
    return cards[0];
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
  // per suit, for example - per owner lane. Single cards stay loose. Handed a
  // subset of the cards (SORT on a collection), only those are pulled out of
  // their groups and regrouped; the rest of the lane keeps its groups and
  // stays ahead of the new ones.
  async regroupBy(property, key, reverse, locales, options, only=null) {
    const all = this.childrenFilter(super.children(), true).filter(w=>!w.get('dropShadowOwner'));
    const owners = new Set(all.map(c=>c.get('owner') || null));
    const touched = new Set();
    this.preventRearrangeDuringPileDrop = true;
    for(const owner of owners) {
      const lane = all.filter(c=>!c.get('owner') || c.get('owner') === owner);
      let cards = [];
      for(const g of lane)
        cards.push(...(g.get('type') == 'pile' ? g.children() : [ g ]));
      if(only)
        cards = cards.filter(c=>only.indexOf(c) != -1);
      if(!cards.length)
        continue;
      touched.add(owner);

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

      const regrouped = [];
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
          await c.setPosition(this.get('dropOffsetX'), this.get('dropOffsetY'), c.get('z'));
          regrouped.push(c);
        } else {
          regrouped.push(await this.makeGroup(run));
        }
      }
      // taking cards out may have dissolved groups or promoted their last
      // card, so what the lane still holds is re-read: the untouched entries
      // keep their order and the new groups follow them
      const kept = this.childrenFilter(super.children(), true)
        .filter(w=>!w.get('dropShadowOwner') && (!w.get('owner') || w.get('owner') === owner) && regrouped.indexOf(w) == -1)
        .sort((a, b)=>a.get('z') - b.get('z'));
      let z = 1;
      for(const g of kept.concat(regrouped))
        await g.set('z', z++);
    }
    delete this.preventRearrangeDuringPileDrop;
    await this.updateAfterShuffle(touched);
  }

  supportsPiles() {
    return !this.get('preventPiles') && (this.keepsPiles() || !this.get('alignChildren') || !this.spreadsChildren());
  }

  // owners limits the pass to the lanes that actually changed - a deal into a
  // shared hand touches one lane per batch, not all of them. null arranges
  // every lane. sticky asks a grid to keep every settled cell where it is
  // (membership and size changes); without it the cells are handed out again
  // in z order (SHUFFLE, SORT, a layout switch).
  async updateAfterShuffle(owners=null, { sticky=false }={}) {
    if(this.get('layout') == 'grid') {
      const entries = this.childrenFilter(super.children(), true).filter(w=>!w.get('dropShadowOwner'));
      // a stack in a cell shows its cards the way its own layout says - by
      // default collected into one compact pile - before the cells around it
      // are measured
      for(const entry of entries)
        if(entry.get('type') == 'pile' && (!owners || owners.has(entry.get('owner') || null)))
          await entry.arrangeChildren(false);
      for(const owner of new Set(entries.map(c=>c.get('owner') || null)))
        if(!owners || owners.has(owner))
          await this.gridArrange(entries.filter(c=>!c.get('owner') || c.get('owner') === owner).sort((a, b)=>a.get('z') - b.get('z')), { ordered: !sticky });
      return;
    }

    if(!this.spreadsChildren()) {
      // an auto holder without the room to spread allows piles again - so what
      // spread out while there was room gathers back into one pile per lane,
      // centered where the derived drop offset points
      if(this.usesAutoLayout()) {
        if(this.keepsPiles() && !this.preventRearrangeDuringPileDrop)
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

    // an auto layout with the room to line cards up keeps no piles - so when
    // a resize (or a layout switch) gives it that room, the piles it kept
    // while it was smaller are emptied out one card per slot, exactly like a
    // pile dropped into it now would be
    if(this.usesAutoLayout() && !this.keepsPiles() && !this.preventRearrangeDuringPileDrop)
      for(const pile of this.childrenFilter(super.children(), true).filter(c=>c.get('type') == 'pile' && !c.get('dropShadowOwner')))
        await this.emptyPileIntoSlots(pile);

    const children = this.arrangedChildren();
    // the piles take their own layout from this holder and lay their cards out
    // by z, so both a shuffle and a changed offset reach them first - how much
    // room they end up taking is what the arrangement below is measured against
    for(const child of children)
      if(child.get('type') == 'pile' && (!owners || owners.has(child.get('owner') || null)))
        await child.arrangeChildren(false);
    for(const owner of new Set(children.map(c=>c.get('owner')))) {
      if(owners && !owners.has(owner || null))
        continue;
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
