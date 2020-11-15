class Button extends Widget {
  constructor(object, surface) {
    super(object, surface);

    Object.assign(this.defaults, {
      width: 80,
      height: 80,

      layer: -1,
      clickRoutine: []
    });
    this.receiveUpdate(object);
  }

  click() {
    for(const a of this.p('clickRoutine')) {

      if(a[0] == 'LABEL')
        this.w(a[1], label=>label.setText(a[3], a[2]));

      if(a[0] == 'FLIP') {
        this.w(a[2], holder=>{
          let cards = holder.children();
          if(a[1] == 'card')
            cards = [ cards[0] ];
          if(a[3])
            cards.forEach(c=>c.flip(a[3] == 'faceDown' ? 0 : 1));
          else
            cards.forEach(c=>c.flip());
        });
      }

      if(a[0] == 'MOVE') {
        this.w(a[1], source=>this.w(a[3], target=>source.children().slice(0, a[2]).reverse().forEach(c=> {
          if(a[4] == 'faceUp')
            c.flip(1);
          if(a[4] == 'faceDown')
            c.flip(0);
          c.moveToHolder(target);
        })));
      }

      if(a[0] == 'RECALL') {
        this.toA(a[1]).forEach(holder=>{
          const deck = this.wFilter(w=>w.p('type')=='deck'&&w.p('parent')==holder)[0];
          if(deck)
            this.wFilter(w=>w.p('deck')==deck.p('id')).forEach(c=>c.moveToHolder(widgets.get(holder)));
        });
      }

      if(a[0] == 'ROTATE') {
        this.w(a[2], holder=>{
          let cards = holder.children();
          if(a[1] == 'card')
            cards = [ cards[0] ];
          cards.forEach(c=>c.rotate(a[3]));
        });
      }

      if(a[0] == 'SHUFFLE') {
        this.w(a[1], holder=>{
          holder.children().forEach(c=>c.p('z', Math.floor(Math.random()*10000)));
          holder.updateAfterShuffle();
        });
      }

    }
  }

  receiveUpdate(object) {
    super.receiveUpdate(object);
    this.isDraggable = false;
    this.domElement.classList.add('button');
    this.domElement.textContent = this.p('label');
  }

  toA(ids) {
    return typeof ids == 'string' ? [ ids ] : ids;
  }

  w(ids, callback) {
    return this.wFilter(w=>this.toA(ids).indexOf(w.p('id')) != -1).forEach(callback);
  }

  wFilter(callback) {
    return Array.from(widgets.values()).filter(callback);
  }
}
