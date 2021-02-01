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
      inheritChildZ: true
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
    if(this.handle && (delta.width !== undefined || delta.height !== undefined)) {
      if(this.p('width') < 50 || this.p('height') < 50)
        this.handle.classList.add('small');
      else
        this.handle.classList.remove('small');
    }
    for(const e of [ [ 'x', 'right', 1600-this.p('width')-20 ], [ 'y', 'bottom', 20 ] ]) {
      if(this.handle && (delta[e[0]] !== undefined || delta.parent !== undefined)) {
        if(this.absoluteCoord(e[0]) < e[2])
          this.handle.classList.add(e[1]);
        else
          this.handle.classList.remove(e[1]);
      }
    }
  }

  click() {
    $('#pileOverlay').innerHTML = `<p>${this.handle.textContent} cards</p><p>Drag the handle with the number to drag the entire pile.</p>`;

    const flipButton = document.createElement('button');
    flipButton.textContent = 'Flip pile';
    let z=1;
    flipButton.addEventListener('click', e=>{
      batchStart();
      this.children().forEach(c=>{
        c.p('z', z++);
        if(c.flip)
          c.flip();
      });
      showOverlay();
      batchEnd();
    });
    $('#pileOverlay').appendChild(flipButton);

    const shuffleButton = document.createElement('button');
    shuffleButton.textContent = 'Shuffle pile';
    shuffleButton.addEventListener('click', e=>{
      batchStart();
      this.children().forEach(c=>c.p('z', Math.floor(Math.random()*10000)));
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
    splitButton.addEventListener('click', e=>{
      batchStart();
      this.children().reverse().slice(childCount-splitInput.value).forEach(c=>{
        c.p('parent', null);
        c.p('x', this.absoluteCoord('x'));
        const y = this.absoluteCoord('y');
        c.p('y', y < 100 ? y+60 : y-60);
        c.updatePiles();
        c.bringToFront();
      });
      showOverlay();
      batchEnd();
    });
    $('#pileOverlay').appendChild(splitButton);

    showOverlay('pileOverlay');
  }

  onChildRemove(child) {
    super.onChildRemove(child);
    if(this.children().length == 1) {
      const c = this.children()[0];
      const p = this.p('parent');
      const x = this.p('x');
      const y = this.p('y');

      this.removed = true;

      c.p('x', c.p('x') + x);
      c.p('y', c.p('y') + y);
      c.p('parent', p);

      removeWidgetLocal(this.p('id'));
    }

    if(this.parent && this.parent.p('type') == 'holder')
      this.parent.dispenseCard(child);
  }

  supportsPiles() {
    return false;
  }

  validDropTargets() {
    return getValidDropTargets(this.children()[0]);
  }
}
