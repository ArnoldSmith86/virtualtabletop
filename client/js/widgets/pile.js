const defaultPileSnapRange = 10;

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
      pileSnapRange: defaultPileSnapRange,

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
    ++this.childCount;
    this.updateText();
  }

  applyChildRemove(child) {
    super.applyChildRemove(child);
    --this.childCount;
    this.updateText();
  }

  applyDeltaToDOM(delta) {
    super.applyDeltaToDOM(delta);
    if(this.handle && delta.handleCSS !== undefined)
      this.handle.style = mapAssetURLs(this.cssAsText(this.get('handleCSS'),null,true));
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

  async click(mode='respect') {
    if(!await super.click(mode)) {

      const childCount = this.children().length;
      $('#pileOverlay > .modal').innerHTML = `<div class="inputtitle"><label>${childCount} cards</label></div><div class="inputtext"><label>TIP: Drag the handle with the number to drag the entire pile.</label></div>`;


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
      cancelButton.className = 'ui-button pilecancelbutton material-icons';
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

  validDropTargets() {
    return this.children().length ? getValidDropTargets(this.children()[0]) : [];
  }
}
