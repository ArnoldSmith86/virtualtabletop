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
    this.movingWidgets = this.children().sort((v,w)=>v.p('z')-w.p('z'));
    for(const widget of this.movingWidgets)
      widget.moveStart(true);
  }

  move(x, y) {
    // FIXME: pile with "0" stays if dropped into a hand (at least that happened once :( )
    for(const widget of this.movingWidgets)
      widget.move(x - 5 + widget.p('width')/2, y - 5 + widget.p('height')/2);
  }

  moveEnd() {
    for(const widget of this.movingWidgets)
      widget.moveEnd();
    delete this.movingWidgets;
    this.updateHandleText();
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
    /*if(x < 1600-width-20)
      x += width-10;
    if(y < 20)
      y += height-10;*/

    this.handle.style.transform = `translate(${x}px, ${y}px)`;

    if(width < 50 || height < 50)
      this.handle.classList.add('small');
    else
      this.handle.classList.remove('small');
  }

  updateHandleText() {
    this.handle.textContent = this.movingWidgets ? this.movingWidgets.length : this.widgets.size;
  }
}
