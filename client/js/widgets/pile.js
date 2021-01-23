class Pile {
  constructor(id, options) {
    this.id = id;
    this.options = options;

    console.log('creating pile', this.id);
    this.widgets = new Map();

    this.handle = document.createElement('div');
    this.handle.className = 'pile handle';
    this.handle.style = options.css || '';
    this.handle.id = id;

    $('#topSurface').appendChild(this.handle);
  }

  addWidget(child) {
    this.rectangle = child.domElement.getBoundingClientRect();

    this.widgets.set(child.p('id'), child);
    this.setPosition(child.absoluteCoord('x'), child.absoluteCoord('y'));
    this.updateHandleText();
  }

  children() {
    return Array.from(this.widgets.values());
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

  destroy() {
    if(this.movingWidgets) {
      this.destroyAfterMove = true;
    } else {
      console.log('destroying pile', this.id);
      piles.delete(this.id);
      removeFromDOM(this.handle);
    }
  }

  moveStart() {
    this.movingWidgets = this.children().sort((v,w)=>v.p('z')-w.p('z'));
    for(const widget of this.movingWidgets)
      widget.moveStart(true);
  }

  move(x, y) {
    // FIXME: pile shows "0" while being dragged
    // FIXME: pile with "0" stays if dropped into a hand (at least that happened once :( )
    // FIXME: a new pile handle shows up when dragging out of a holder
    this.setPosition(x - 20 + 15, y - 20 + 15);
    for(const widget of this.movingWidgets)
      widget.move(x - 5 + widget.p('width')/2, y - 5 + widget.p('height')/2);
  }

  moveEnd() {
    for(const widget of this.movingWidgets)
      widget.moveEnd();
    delete this.movingWidgets;
    this.updateHandleText();
    if(this.destroyAfterMove)
      this.destroy();
  }

  p(property) {
    return true;
  }

  removeWidget(child) {
    this.widgets.delete(child.p('id'));
    this.updateHandleText();
    if(this.widgets.size == 1)
      this.destroy();
  }

  setPosition(x, y) {
    this.handle.style.transform = `translate(${x}px, ${y}px)`;

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

  updateHandleText() {
    this.handle.textContent = this.movingWidgets ? this.movingWidgets.length : this.widgets.size;
  }
}
