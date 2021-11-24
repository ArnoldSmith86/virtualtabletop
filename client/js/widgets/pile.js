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
      clickable: true,
      handleCSS: ''
    });

    this.domElement.appendChild(this.handle);
    this.handle.textContent = 0;
  }

  applyChildAdd(child) {
    super.applyChildAdd(child);
    ++this.handle.textContent;
  }

  applyChildRemove(child) {
    super.applyChildRemove(child);
    --this.handle.textContent;
  }

  applyDeltaToDOM(delta) {
    super.applyDeltaToDOM(delta);
    if(this.handle && delta.handleCSS)
      this.handle.style = this.get('handleCSS');
    if(this.handle && (delta.width !== undefined || delta.height !== undefined)) {
      if(this.get('width') < 50 || this.get('height') < 50)
        this.handle.classList.add('small');
      else
        this.handle.classList.remove('small');
    }
    for(const e of [ [ 'x', 'right', 1600-this.get('width')-20 ], [ 'y', 'bottom', 20 ] ]) {
      if(this.handle && (delta[e[0]] !== undefined || delta.parent !== undefined)) {
        if(this.absoluteCoord(e[0]) < e[2])
          this.handle.classList.add(e[1]);
        else
          this.handle.classList.remove(e[1]);
      }
    }
  }

  async click(mode='respect') {
    if(!await super.click(mode)) {
      $('#pileOverlay').innerHTML = `<p>${this.handle.textContent} cards</p><p>Drag the handle with the number to drag the entire pile.</p>`;

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
        for(const c of this.children())
          await c.set('z', Math.floor(Math.random()*10000));
        showOverlay();
        batchEnd();
      });
      $('#pileOverlay').appendChild(shuffleButton);

      const childCount = this.children().length;
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

  getDefaultValue(property) {
    if(property == 'onPileCreation')
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

  validDropTargets() {
    return getValidDropTargets(this.children()[0]);
  }
}
