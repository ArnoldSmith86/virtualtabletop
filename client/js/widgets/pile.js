import { viewportConfig } from '../calculateLayout.js';

const defaultPileSnapRange = 10;

// A pile that sits in a holder arranging piles is laid out like the holder lays
// out its own cards, unless the pile says otherwise.
const pileInheritedProperties = [ 'stackOffsetX', 'stackOffsetY', 'spreadMin' ];

// What is left of the stack offset for the cards spreadMin does not cover.
const compressedSpreadFactor = 0.1;

export class Pile extends Widget {
  constructor(id) {
    super(id);
    this.handle = document.createElement('div');
    this.handle.className = 'handle';

    this.addDefaults({
      typeClasses: 'widget pile',
      x: 4,
      y: 4,
      width: 1,
      height: 1,
      alignChildren: true,
      inheritChildZ: true,

      text: null,
      showLimit: false,
      pileSnapRange: defaultPileSnapRange,
      stackOffsetX: 0,
      stackOffsetY: 0,
      spreadMin: null,

      handleCSS: '',
      handleSize: 'auto',
      handleOffset: 15,
      handlePosition: 'top right'
    });

    this.domElement.appendChild(this.handle);
    this.childCount = 0;
    this.updateText();
  }

  applyChildAdd(child) {
    super.applyChildAdd(child);
    if(child.get('dropShadowOwner'))
      return;
    ++this.childCount;
    this.updateText();
  }

  applyChildRemove(child) {
    super.applyChildRemove(child);
    if(child.get('dropShadowOwner'))
      return;
    --this.childCount;
    this.updateText();
  }

  // A drop shadow previewing an insertion joins the pile so it can slot into
  // its stacking order, but it is not one of the cards.
  children() {
    return super.children().filter(c=>!c.get('dropShadowOwner'));
  }

  applyDeltaToDOM(delta) {
    super.applyDeltaToDOM(delta);
    if(this.handle && delta.handleCSS !== undefined)
      this.handle.style = mapAssetURLs(this.cssAsText(this.get('handleCSS'),null,true));
    if(this.handle && (delta.text !== undefined || delta.showLimit !== undefined || delta.dropLimit !== undefined))
      this.updateText();
    if(this.handle && (delta.width !== undefined || delta.height !== undefined || delta.handleSize !== undefined)) {
      if(this.get('handleSize') == 'auto' && (this.get('width') < 50 || this.get('height') < 50))
        this.handle.classList.add('small');
      else
        this.handle.classList.remove('small');
    }

    if(this.handle && [ 'x', 'y', 'width', 'height', 'parent', 'handlePosition', 'handleOffset' ].some(p=>delta[p] !== undefined))
      this.updateHandlePlacement();
  }

  // The handle sticks out of the pile, so it is flipped inwards when the pile
  // sits close to a board edge. That depends on the board size, which can change
  // while people are playing - so this also has to run outside of a delta.
  updateHandlePlacement() {
    if(!this.handle)
      return;

    const threshold = this.get('handleOffset')+5;
    const handlePosition = String(this.get('handlePosition'));
    for(const e of [ [ 'x', 'right', viewportConfig.targetWidth-this.get('width'), 'center' ], [ 'y', 'bottom', viewportConfig.targetHeight-this.get('height'), 'middle' ] ]) {
      if(handlePosition == 'static') {
        this.handle.classList.remove(e[1]);
        this.handle.classList.remove(e[3]);
      } else if(handlePosition.match(e[3])) {
        this.handle.classList.remove(e[1]);
        this.handle.classList.add(e[3]);
      } else {
        this.handle.classList.remove(e[3]);
        const isRightOrBottom = handlePosition.match(e[1]);
        if(isRightOrBottom && this.absoluteCoord(e[0]) < e[2]-threshold || !isRightOrBottom && this.absoluteCoord(e[0]) < threshold)
          this.handle.classList.add(e[1]);
        else
          this.handle.classList.remove(e[1]);
      }
    }
  }

  async click(mode='respect') {
    if(!await super.click(mode)) {

      const childCount = this.children().length;
      const dropLimit = this.get('dropLimit');
      const cardCount = this.get('showLimit') && dropLimit > -1 ? `${childCount} of ${dropLimit}` : childCount;
      $('#pileOverlay > .modal').innerHTML = `<div class="inputtitle"><label>${cardCount} cards</label></div><div class="inputtext"><label>TIP: Drag the handle with the number to drag the entire pile.</label></div>`;


      const buttonBar1 = document.createElement('div');
      buttonBar1.className = 'button-bar';
      $('#pileOverlay > .modal').appendChild(buttonBar1);

      const flipButton = document.createElement('button');
      flipButton.textContent = 'Flip everything over';
      flipButton.className = 'ui-button';
      let z=1;
      flipButton.addEventListener('click', async e=>{
        batchStart();
        for(const c of this.children()) {
          await c.set('z', z++);
          if(c.flip)
            await c.flip();
        };
        showOverlay();
        batchEnd();
      });
      buttonBar1.appendChild(flipButton);


      const buttonBar2 = document.createElement('div');
      buttonBar2.className = 'button-bar';
      $('#pileOverlay > .modal').appendChild(buttonBar2);

      const shuffleButton = document.createElement('button');
      shuffleButton.textContent = 'Shuffle the pile';
      shuffleButton.className = 'ui-button';
      shuffleButton.addEventListener('click', async e=>{
        batchStart();
        shuffleWidgets(this.children())
        showOverlay();
        batchEnd();
      });
      buttonBar2.appendChild(shuffleButton);



      const countDiv = document.createElement('div');
      countDiv.className = 'countInput';

      $('#pileOverlay > .modal').appendChild(countDiv);

      const splitInput = document.createElement('input');
      splitInput.type = 'number';
      splitInput.value = Math.floor(childCount/2);
      splitInput.min = 1;
      splitInput.max = childCount - 1;
      splitInput.addEventListener('input', async e=>{
        if(splitInput.value > (childCount - 1)){
          splitInput.value = childCount - 1;
        }
        if(splitInput.value < 1){
          splitInput.value = 1;
        }
        denominatorInput.value = childCount - splitInput.value;
        splitInputSlider.value = childCount - denominatorInput.value;
      });
      countDiv.appendChild(splitInput);

      const splitInputSlider = document.createElement('input');
      splitInputSlider.type = 'range';
      splitInputSlider.min = 1;
      splitInputSlider.max = childCount - 1;
      splitInputSlider.value = Math.floor(childCount/2);
      splitInputSlider.addEventListener('input', async e=>{
        splitInput.value = splitInputSlider.value;
        denominatorInput.value = childCount - splitInput.value;
      });
      countDiv.appendChild(splitInputSlider);

      const denominatorInput = document.createElement('input');
      denominatorInput.value = childCount - splitInput.value;
      denominatorInput.type = 'number';
      denominatorInput.min = 1;
      denominatorInput.max = childCount - 1;
      denominatorInput.addEventListener('input', async e=>{
        if(denominatorInput.value > (childCount - 1)){
          denominatorInput.value = childCount - 1;
        }
        if(denominatorInput.value < 1){
          denominatorInput.value = 1;
        }
        splitInput.value = childCount - denominatorInput.value;
        splitInputSlider.value = childCount - denominatorInput.value;
      });
      countDiv.appendChild(denominatorInput);

      const buttonBar3 = document.createElement('div');
      buttonBar3.className = 'button-bar';
      $('#pileOverlay > .modal').appendChild(buttonBar3);

      const splitButton = document.createElement('button');
      splitButton.textContent = 'Split the pile';
      splitButton.addEventListener('click', async e=>{
        batchStart();
        const cards = this.children().reverse().slice(childCount-splitInput.value);
        const holder = this.holderArrangingPiles();
        if(holder && holder.arrangesPiles()) {
          // in a holder that lines its groups up, both halves keep their place
          // in the row instead of the split half landing outside on the table
          await holder.splitGroup(this, cards);
        } else {
          for(const c of cards) {
            await c.set('parent', null);
            await c.set('x', this.absoluteCoord('x'));
            const y = this.absoluteCoord('y');
            await c.set('y', y < 100 ? y+60 : y-60);
            await c.updatePiles();
            await c.bringToFront();
          };
        }
        showOverlay();
        batchEnd();
      });
      splitButton.className = 'ui-button';
      buttonBar3.appendChild(splitButton);


      const buttonBar4 = document.createElement('div');
      buttonBar4.className = 'button-bar';
      $('#pileOverlay > .modal').appendChild(buttonBar4);

      const cancelButton = document.createElement('button');
      cancelButton.textContent = 'close';
      cancelButton.addEventListener('click', async e=>{
        showOverlay('pileOverlay');
      });
      cancelButton.className = 'ui-button pilecancelbutton material-symbols';
      buttonBar4.appendChild(cancelButton);


      showOverlay('pileOverlay');
    }
  }

  css() {
    let css = super.css();

    if(this.get('handleSize') == 'auto')
      css += '; --phSize:40px';
    else
      css += '; --phSize:' + this.get('handleSize') + 'px';
    css += '; --phPosition:-' + this.get('handleOffset') + 'px';

    return css;
  }

  cssProperties() {
    const p = super.cssProperties();
    p.push('handleSize', 'handleOffset');
    return p;
  }

  getDefaultValue(property) {
    if(property == 'onPileCreation' && this.children().length)
      return this.children()[0].get('onPileCreation');
    if(pileInheritedProperties.indexOf(property) != -1) {
      const holder = this.holderArrangingPiles();
      if(holder)
        return holder.get(property);
    }
    return super.getDefaultValue(property);
  }

  // Lays the cards out and sizes the pile to what that comes to, so that its box
  // is the room its cards take up rather than the size of a single one: the
  // handle sits at the end of the spread, the holder gives the pile that much
  // room and a card dropped anywhere on it lands on the pile. layOut says to do
  // it once more for a pile that just stopped placing its cards itself, which
  // collects them back onto the same spot.
  async arrangeChildren(notifyHolder=true, layOut=false) {
    if(layOut || this.laysOutCards()) {
      // the squish is the same for every offset below, so it is computed once
      // for the whole pass instead of once per lookup - recomputing it walks
      // every group of the holder's row
      const squish = this.holderSquish();
      // a copy: children() hands out the array it sorts, and everything below
      // reads it again
      const children = [ ...this.children() ].reverse();
      const offsets = this.spreadOffsets(squish);

      for(let i=0; i<children.length; ++i)
        await children[i].setPosition(this.get('dropOffsetX') + offsets[i][0], this.get('dropOffsetY') + offsets[i][1], children[i].get('z'));

      const oldWidth = this.get('width');
      const oldHeight = this.get('height');
      await this.set('width', this.spreadExtent('X', squish));
      await this.set('height', this.spreadExtent('Y', squish));
      // this can happen mid-drag - a pile picked out of the holder that spread it collects its
      // cards on the way - so whoever is carrying it keeps hold of the same place in its box
      if(this.get('width') != oldWidth || this.get('height') != oldHeight)
        rescaleDragAnchor(this, oldWidth, oldHeight);
    }

    // how much room the pile takes up decides where the next pile in the holder
    // begins, so the holder lays its children out again
    const holder = notifyHolder ? this.holderArrangingPiles() : null;
    if(holder)
      await holder.receiveCard(null);
  }

  spreadsCards() {
    return !!(this.get('alignChildren') && (this.get('stackOffsetX') || this.get('stackOffsetY')));
  }

  // Put the given cards - already children of this pile - at the given position
  // of its fan, counted from the bottom, and lay the fan out again. This is how
  // a drop pointed at a spot between two cards is inserted right there instead
  // of on top.
  async insertChildrenAt(cards, index) {
    const existing = this.children().filter(c=>cards.indexOf(c) == -1).sort((a, b)=>a.get('z') - b.get('z'));
    const incoming = cards.slice().sort((a, b)=>a.get('z') - b.get('z'));
    const at = Math.max(0, Math.min(existing.length, index));
    const ordered = existing.slice(0, at).concat(incoming, existing.slice(at));
    let z = 1;
    for(const c of ordered)
      await c.set('z', z++);
    await this.arrangeChildren();
  }

  // Whether the pile places its cards itself. A pile that spreads them does, and
  // so does one in a holder that arranges piles - everywhere else the cards keep
  // whatever position they were given, which is what a scattered heap of them
  // relies on.
  laysOutCards() {
    return !!(this.get('alignChildren') && (this.spreadsCards() || this.holderArrangingPiles()));
  }

  // Whether it did so before the given property changed to what it is now: a
  // pile that stops has to collect its cards one last time.
  laidOutCardsBefore(property, oldValue) {
    if(!this.get('alignChildren'))
      return false;
    if(property == 'parent')
      return !!this.holderArrangingPilesOf(oldValue);
    return !!oldValue && (property == 'stackOffsetX' || property == 'stackOffsetY');
  }

  isPileSnapTarget(x, y, range) {
    if(!this.spreadsCards() || !this.children().length || this.holderArrangingPiles())
      return super.isPileSnapTarget(x, y, range);

    // the whole spread takes a card, not just the corner of it: the offsets
    // between the cards are usually wider than the snap range, so aiming at one
    // of them would mean hitting gaps more often than cards
    const card = this.children()[0];
    return x - this.get('x') > -range && x - this.get('x') < this.spreadExtent('X') - card.get('width' ) + range
        && y - this.get('y') > -range && y - this.get('y') < this.spreadExtent('Y') - card.get('height') + range;
  }

  // Where the cards of the pile sit relative to its corner, bottom card first.
  // Without a stack offset they all lie on the same spot, which is what a pile
  // normally looks like. spreadMin keeps the full offset for the topmost cards
  // only and squeezes everything below them together, so a long pile stays
  // readable without growing across the whole table. A holder whose groups do
  // not fit side by side squishes the fans through fanSquish, and a drop
  // shadow previewing an insertion keeps one slot (previewGap) open - its
  // offset is remembered in previewGapOffset for whoever places the shadow.
  spreadOffsets(squish) {
    if(squish == null)
      squish = this.holderSquish();
    const gap = this.previewGap === undefined ? null : Math.max(0, Math.min(this.children().length, this.previewGap));
    const count = this.children().length + (gap === null ? 0 : 1);
    const offsets = [];
    let x = 0;
    let y = 0;

    for(let i=0; i<count; ++i) {
      offsets.push([ x, y ]);
      x += this.get('stackOffsetX') * this.spreadFactor(i, count) * (squish && squish.axis == 'X' ? squish.fans : 1);
      y += this.get('stackOffsetY') * this.spreadFactor(i, count) * (squish && squish.axis == 'Y' ? squish.fans : 1);
    }

    // a negative offset spreads towards the corner of the pile, so the cards are
    // moved back into it - the box of a pile always starts where the pile is
    const minX = Math.min(...offsets.map(o=>o[0]), 0);
    const minY = Math.min(...offsets.map(o=>o[1]), 0);
    const normalized = offsets.map(o=>[ o[0]-minX, o[1]-minY ]);
    if(gap !== null)
      this.previewGapOffset = normalized.splice(gap, 1)[0];
    else
      delete this.previewGapOffset;
    return normalized;
  }

  // The squish of the holder whose row this pile's fan is part of, or null
  // outside of one. Recomputing it walks every group of the row, so callers
  // that lay a whole fan out fetch it once and pass it down.
  holderSquish() {
    const holder = this.holderArrangingPiles();
    return holder && holder.fanSquish ? holder.fanSquish(this.get('owner') || null) : null;
  }

  // The length of the fan alone along one axis - how far the last slot sits
  // from the first one - before any squish is applied. What fanSquish measures
  // the groups by without asking for the squished layout it is about to decide.
  // A slot a drop shadow keeps open counts: the fan is that long on screen,
  // and it is how long the fan will be once the previewed drop lands.
  fanLength(axis) {
    const count = this.children().length + (this.previewGap === undefined ? 0 : 1);
    if(count < 2 || !this.spreadsCards())
      return 0;
    let length = 0;
    for(let i=0; i<count-1; ++i)
      length += Math.abs(this.get('stackOffset' + axis)) * this.spreadFactor(i, count);
    return length;
  }

  // The share of the stack offset used for the step after card i, counting the
  // bottom card as 0: the topmost spreadMin cards keep the offset, the rest of
  // the pile is compressed.
  spreadFactor(i, count) {
    const spreadMin = this.get('spreadMin');
    return spreadMin === null || count - i <= spreadMin ? 1 : compressedSpreadFactor;
  }

  spreadExtent(axis, squish) {
    const children = this.children();
    if(!children.length || !this.get('alignChildren'))
      return super.spreadExtent(axis);

    const index = axis == 'X' ? 0 : 1;
    const offsets = this.spreadOffsets(squish);
    // an open preview gap is part of the box even when it is the last slot
    if(this.previewGapOffset)
      offsets.push(this.previewGapOffset);
    return Math.max(...offsets.map(o=>o[index])) + children[0].get(axis == 'X' ? 'width' : 'height');
  }

  async onChildAddAlign(child, oldParentID) {
    if(!this.laysOutCards())
      return await super.onChildAddAlign(child, oldParentID);
    await this.arrangeChildren();
  }

  async onChildRemove(child) {
    await super.onChildRemove(child);
    if(this.children().length > 1)
      await this.arrangeChildren();
    if(this.children().length == 1) {
      const c = this.children()[0];
      const p = this.get('parent');
      const x = this.get('x');
      const y = this.get('y');

      // this is added in removeWidgetLocal aswell but needed before the set parent so that the child isn't added to the same pile again during updatePiles
      this.isBeingRemoved = true;

      await c.set('x', c.get('x') + x);
      await c.set('y', c.get('y') + y);
      // a holder's row is sorted by z when it is laid out again, so the
      // promoted card takes over the pile's place in it
      if(this.holderArrangingPiles())
        await c.set('z', this.get('z'));
      // promoting the last card must not move it to another lane of a shared hand
      if(c.get('owner') !== null)
        c.targetPlayer = c.get('owner');
      await c.set('parent', p);
      delete c.targetPlayer;

      await removeWidgetLocal(this.get('id'));
    } else if(!this.children().length && !this.isBeingRemoved) {
      // the engine dissolves a pile before it gets this small, but a hand-written game
      // file can start one off with a single card - taking that card leaves nothing to
      // dissolve into, so the empty pile removes itself
      this.isBeingRemoved = true;
      await removeWidgetLocal(this.get('id'));
    }

    if(this.parent && this.parent.get('type') == 'holder')
      await this.parent.dispenseCard(child);
  }

  async onPropertyChange(property, oldValue, newValue) {
    if(this.children().length && property == 'owner') {
      for(const c of this.children())
        await c.set('owner', newValue);
    }
    await super.onPropertyChange(property, oldValue, newValue);
    // 'parent' is in here because the layout of a pile can come from the holder
    // it is arranged in, so leaving one or entering one changes it
    if([ 'stackOffsetX', 'stackOffsetY', 'spreadMin', 'alignChildren', 'parent' ].indexOf(property) != -1 && this.children().length)
      await this.arrangeChildren(true, this.laidOutCardsBefore(property, oldValue));
  }

  supportsPiles() {
    return false;
  }

  // The handle shows how many cards the pile holds. A pile with showLimit set
  // says how many it takes as well - "2/3" - so the limit is readable before a
  // drop is refused rather than only after.
  updateText() {
    const text = this.get('text');
    const limit = this.get('dropLimit');
    const withLimit = text === null && this.get('showLimit') && limit > -1;
    this.handle.classList.toggle('withLimit', withLimit);
    this.handle.textContent = text !== null ? text : withLimit ? `${this.childCount}/${limit}` : this.childCount;
  }

  validDropTargets() {
    return this.children().length ? getValidDropTargets(this.children()[0], this) : [];
  }
}
