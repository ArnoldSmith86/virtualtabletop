// Compare the relative z order of two widgets with the same parent.
function compareChildStackOrder(a, b) {
  if (a == b)
    return 0;
  const aZ = a.z || 0;
  const bZ = b.z || 0;
  if (aZ != bZ)
    return bZ - aZ;
  let domOrder = a.domElement.compareDocumentPosition(b.domElement);
  if (domOrder == 2) // Node.DOCUMENT_POSITION_PRECEDING (b preceeds a)
    return -1;
  else // Node.DOCUMENT_POSITION_FOLLOWING (4) (b follows a)
    return 1;
}

class Pile extends Widget {
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

      handleCSS: '',
      handleSize: 'auto',
      handleOffset: 15,
      handlePosition: 'top right'
    });

    this.domElement.appendChild(this.handle);
    this.childCount = 0;
    this.visibleChildren = new Set();
    this.lowestVisibleChild = null;
    this.visibleChildLimit = 5;
    this.updateText();
  }

  applyChildAdd(child) {
    super.applyChildAdd(child);
    ++this.childCount;
    this.updateText();
    if(this.visibleChildren) {
      if (!this.canOptimizeVisibility(child))
        this.updateAllChildrenVisible();
      else if(this.visibleChildren.size < this.visibleChildLimit || compareChildStackOrder(this.lowestVisibleChild, child) >= 0)
        this.updateVisibleChildren();
    }
  }

  applyChildZ(child, previousZ) {
    super.applyChildZ(child, previousZ);
    if (this.visibleChildren && this.visibleChildren.has(child))
      this.updateVisibleChildren();
  }

  applyChildRemove(child) {
    super.applyChildRemove(child);
    --this.childCount;
    this.updateText();
    if (this.visibleChildren && this.visibleChildren.has(child))
      this.updateVisibleChildren();
    else if (this.childCount == 0)
      this.visibleChildren = new Set();
  }

  applyDeltaToDOM(delta) {
    super.applyDeltaToDOM(delta);
    if(this.handle && delta.handleCSS !== undefined)
      this.handle.style = mapAssetURLs(this.cssAsText(this.get('handleCSS'),true));
    if(this.handle && delta.text !== undefined)
      this.updateText();
    if(this.handle && (delta.width !== undefined || delta.height !== undefined || delta.handleSize !== undefined)) {
      if(this.get('handleSize') == 'auto' && (this.get('width') < 50 || this.get('height') < 50))
        this.handle.classList.add('small');
      else
        this.handle.classList.remove('small');
    }

    const threshold = this.get('handleOffset')+5;
    for(const e of [ [ 'x', 'right', 1600-this.get('width'), 'center' ], [ 'y', 'bottom', 1000-this.get('height'), 'middle' ] ]) {
      if(this.handle && (delta[e[0]] !== undefined || delta.parent !== undefined || delta.handlePosition !== undefined || delta.handleOffset !== undefined)) {
        if(this.get('handlePosition') == 'static') {
          this.handle.classList.remove(e[1]);
          this.handle.classList.remove(e[3]);
        } else if(this.get('handlePosition').match(e[3])) {
          this.handle.classList.remove(e[1]);
          this.handle.classList.add(e[3]);
        } else {
          this.handle.classList.remove(e[3]);
          const isRightOrBottom = this.get('handlePosition').match(e[1]);
          if(isRightOrBottom && this.absoluteCoord(e[0]) < e[2]-threshold || !isRightOrBottom && this.absoluteCoord(e[0]) < threshold)
            this.handle.classList.add(e[1]);
          else
            this.handle.classList.remove(e[1]);
        }
      }
    }
  }

  canOptimizeVisibility(child) {
    // If a new child doesn't match all of the other children in the pile,
    // we will stop hiding deeper children.
    return this.lowestVisibleChild == null || (
        child.get('x') == this.lowestVisibleChild.get('x') &&
        child.get('y') == this.lowestVisibleChild.get('y') &&
        child.get('width') == this.lowestVisibleChild.get('width') &&
        child.get('height') == this.lowestVisibleChild.get('height') &&
        child.get('rotation') == this.lowestVisibleChild.get('rotation'));
  }

  childClasses(child) {
    let classes = super.childClasses(child);
    if (this.visibleChildren && this.visibleChildren.has(child))
      classes += ' visible-in-pile';
    return classes;
  }

  classes() {
    let classes = super.classes();
    if (this.visibleChildren)
      classes += ' optimize-visibility';
    return classes;
  }

  async click(mode='respect') {
    if(!await super.click(mode)) {
      const childCount = this.children().length;
      $('#pileOverlay').innerHTML = `<p>${childCount} cards</p><p>Drag the handle with the number to drag the entire pile.</p>`;

      const flipButton = document.createElement('button');
      flipButton.textContent = 'Flip pile';
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
      $('#pileOverlay').appendChild(flipButton);

      const shuffleButton = document.createElement('button');
      shuffleButton.textContent = 'Shuffle pile';
      shuffleButton.addEventListener('click', async e=>{
        batchStart();
        shuffleWidgets(this.children())
        showOverlay();
        batchEnd();
      });
      $('#pileOverlay').appendChild(shuffleButton);

      const countDiv = document.createElement('div');
      countDiv.textContent = `/ ${childCount}`;
      $('#pileOverlay').appendChild(countDiv);
      const splitInput = document.createElement('input');
      splitInput.type = 'number';
      splitInput.value = Math.floor(childCount/2);
      splitInput.min = 0;
      splitInput.max = childCount;
      countDiv.prepend(splitInput);
      const splitLabel = document.createElement('label');
      splitLabel.textContent = 'Split: ';
      countDiv.prepend(splitLabel);
      const splitButton = document.createElement('button');
      splitButton.textContent = 'Split pile';
      splitButton.addEventListener('click', async e=>{
        batchStart();
        for(const c of this.children().reverse().slice(childCount-splitInput.value)) {
          await c.set('parent', null);
          await c.set('x', this.absoluteCoord('x'));
          const y = this.absoluteCoord('y');
          await c.set('y', y < 100 ? y+60 : y-60);
          await c.updatePiles();
          await c.bringToFront();
        };
        showOverlay();
        batchEnd();
      });
      $('#pileOverlay').appendChild(splitButton);

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
    return super.getDefaultValue(property);
  }

  async onChildRemove(child) {
    await super.onChildRemove(child);
    if(this.children().length == 1) {
      const c = this.children()[0];
      const p = this.get('parent');
      const x = this.get('x');
      const y = this.get('y');

      // this is added in removeWidgetLocal aswell but needed before the set parent so that the child isn't added to the same pile again during updatePiles
      this.isBeingRemoved = true;

      await c.set('x', c.get('x') + x);
      await c.set('y', c.get('y') + y);
      await c.set('parent', p);

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
  }

  supportsPiles() {
    return false;
  }

  updateText() {
    const text = this.get('text');
    this.handle.textContent = text === null ? this.childCount : text;
  }

  updateAllChildrenVisible() {
    let modified = this.visibleChildren;
    this.visibleChildren = null;
    this.lowestVisibleChild = null;
    this.updateClasses();
    for (const child of modified) {
      child.updateClasses();
    }
  }

  updateVisibleChildren() {
    let modified = this.visibleChildren;
    this.visibleChildren = new Set();
    this.lowestVisibleChild = null;
    for(const child of this.childArray.sort(compareChildStackOrder).slice(0, this.visibleChildLimit)) {
      this.visibleChildren.add(child);
      this.lowestVisibleChild = child;
      // If the child was previously visible, its state has not been modified.
      if (modified.has(child))
        modified.delete(child);
      else
        modified.add(child);
    }
    for (const child of modified) {
      child.updateClasses();
    }
  }

  validDropTargets() {
    return this.children().length ? getValidDropTargets(this.children()[0]) : [];
  }
}
