class Button extends Widget {
  constructor(object, surface) {
    super(object, surface);
  }

  click() {
    for(const a of this.sourceObject.clickRoutine) {

      if(a[0] == 'MOVE') {
        this.w(a[1], source=>this.w(a[3], target=>source.children().slice(0, a[2]).reverse().forEach(c=> {
          if(a[4] == 'faceUp')
            c.sourceObject.activeFace = 1;
          if(a[4] == 'faceDown')
            c.sourceObject.activeFace = 0;
          c.moveToPile(target);
        })));
      }

      if(a[0] == 'RECALL') {
        this.toA(a[1]).forEach(pile=>{
          const deck = this.wFilter(w=>w.sourceObject.type=='deck'&&w.sourceObject.parent==pile)[0];
          if(deck) {
            this.wFilter(w=>w.sourceObject.deck==deck.sourceObject.id).forEach(c=>{
              c.sourceObject.activeFace = 0;
              c.moveToPile(widgets.get(pile));
            });
          }
        });
      }

      if(a[0] == 'SHUFFLE')
        this.w(a[1], pile=>pile.children().forEach(c=>c.setZ(Math.floor(Math.random()*10000))));

    }
  }

  receiveUpdate(object) {
    super.receiveUpdate(object);
    this.isDraggable = false;
    this.domElement.classList.add('button');
    this.domElement.textContent = this.sourceObject.label;
  }

  toA(ids) {
    return typeof ids == 'string' ? [ ids ] : ids;
  }

  w(ids, callback) {
    return this.wFilter(w=>this.toA(ids).indexOf(w.sourceObject.id) != -1).forEach(callback);
  }

  wFilter(callback) {
    return Array.from(widgets.values()).filter(callback);
  }
}
