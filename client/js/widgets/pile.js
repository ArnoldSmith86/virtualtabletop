class Pile {
  constructor(id, options) {
    this.id = id;
    this.options = options;
    this.offset = [ -15, -15 ];

    console.log('creating pile', this.id);
    this.widgets = new Map();

    this.handle = document.createElement('div');
    this.handle.className = 'pile handle';
    this.handle.id = id;

    $('#topSurface').appendChild(this.handle);
  }

  addWidget(child) {
    this.widgets.set(child.p('id'), child);
    this.applyRenderLocationChanged;
    this.updateHandleText();
  }

  applyRenderLocationChanged() {
    const rectangle = this.children()[0].domElement.getBoundingClientRect();

    this.setPosition((rectangle.left-roomRectangle.left)/scale, (rectangle.top-roomRectangle.top)/scale, rectangle.width/scale, rectangle.height/scale);
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
    console.log('destroying pile', this.id);
    piles.delete(this.id);
    removeFromDOM(this.handle);
  }

  moveStart() {
    this.movingOffset = [ ...this.offset ];
    this.movingWidgets = this.children().sort((v,w)=>v.p('z')-w.p('z'));
    for(const widget of this.movingWidgets)
      if(widget.p('movable'))
        widget.moveStart(true);
  }

  move(x, y) {
    for(const widget of this.movingWidgets)
      if(widget.p('movable'))
        widget.move(x - this.o('width')/2 - this.movingOffset[0] + widget.p('width')/2, y - this.o('height')/2 - this.movingOffset[1] + widget.p('height')/2);
  }

  moveEnd() {
    for(const widget of this.movingWidgets)
      if(widget.p('movable'))
        widget.moveEnd();
    delete this.movingWidgets;
    this.updateHandleText();
  }

  o(option) {
    const defaults = {
      css: '',
      rightCSS: '',
      bottomCSS: '',
      width: 40,
      height: 40,
      inset: 15
    };
    return this.options[option] === undefined ? defaults[option] : this.options[option];
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

  setPosition(x, y, width, height) {
    const w = this.o('width');
    const h = this.o('height');
    const i = this.o('inset');

    if(x < 1600-width-w) {
      this.handle.style = this.o('css') + ';' + this.o('rightCSS');
      this.offset[0] = width - w + i;
    } else {
      this.offset[0] = -i;
    }
    if(y < h) {
      this.handle.style = this.o('css') + ';' + this.o('bottomCSS');
      this.offset[1] = height - h + i;
    } else {
      this.offset[1] = -i;
    }

    this.handle.style.width = `${w}px`;
    this.handle.style.height = `${h}px`;

    this.handle.style.transform = `translate(${x+this.offset[0]}px, ${y+this.offset[1]}px)`;

    if(!Object.keys(this.options).length && (width < 50 || height < 50))
      this.handle.classList.add('small');
    else
      this.handle.classList.remove('small');
  }

  updateHandleText() {
    this.handle.textContent = this.widgets.size;
  }
}
