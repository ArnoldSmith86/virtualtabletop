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
    for(const e of [ [ 'x', 'right' ], [ 'y', 'bottom' ] ]) {
      if(this.handle && (delta[e[0]] !== undefined || delta.parent !== undefined)) {
        if(this.absoluteCoord(e[0]) < 20)
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

    showOverlay('pileOverlay');
  }

  onChildRemove(child) {
    super.onChildRemove(child);
    if(this.children().length == 1) {
      const c = this.children()[0];
      const p = this.p('parent');
      const x = this.p('x');
      const y = this.p('y');

      this.p('parent', null);
      removeWidgetLocal(this.p('id'));

      c.p('x', c.p('x') + x);
      c.p('y', c.p('y') + y);
      c.p('parent', p);
    }
  }

  validDropTargets() {
    return getValidDropTargets(this.children()[0]);
  }
}
