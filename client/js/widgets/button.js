class Button extends Widget {
  constructor(id) {
    super(id);

    this.addDefaults({
      width: 80,
      height: 80,

      classes: 'widget button',
      layer: -1,
      movable: false,

      text: '',
      clickRoutine: []
    });
  }

  applyDeltaToDOM(delta) {
    super.applyDeltaToDOM(delta);
    if(delta.text !== undefined)
      this.domElement.textContent = delta.text;
  }

  click() {
    for(const a of this.p('clickRoutine')) {

      if(a.func == 'FLIP') {
        this.w(a.holder, holder=>holder.children().slice(0, a.count || 999999).forEach(c=>c.flip(a.face)));
      }

      if(a.func == 'LABEL') {
        this.w(a.label, label=>label.setText(a.value !== undefined ? a.value : 0, a.mode || 'set'));
      }

      if(a.func == 'MOVE') {
        const count = (a.count !== undefined ? a.count : 1) || 999999;

        if(typeof a.from == 'string' && typeof a.to == 'string' && !widgets.get(a.to).children().length && widgets.get(a.from).children().length <= count) {
          // this is a hacky shortcut to avoid removing and creating card piles when moving all children to an empty holder
          Widget.prototype.children.call(widgets.get(a.from)).forEach(c=>c.p('parent', a.to));
        } else {
          this.w(a.from, source=>this.w(a.to, target=>source.children().slice(0, count).reverse().forEach(c=> {
            if(a.face !== undefined && a.face !== null && c.flip)
              c.flip(a.face);
            c.moveToHolder(target);
          })));
        }
      }

      if(a.func == 'MOVEXY') {
        this.w(a.from, source=>source.children().slice(0, (a.count !== undefined ? a.count : 1) || 999999).reverse().forEach(c=> {
          if(a.face !== undefined && a.face !== null)
            c.flip(a.face);
          c.p('parent', null);
          c.setPosition(a.x || 0, a.y || 0, a.z || c.p('z'));
        }));
      }

      if(a.func == 'RECALL') {
        this.toA(a.holder).forEach(holder=>{
          const deck = this.wFilter(w=>w.p('type')=='deck'&&w.p('parent')==holder)[0];
          if(deck)
            this.wFilter(w=>w.p('deck')==deck.p('id')).forEach(c=>c.moveToHolder(widgets.get(holder)));
        });
      }

      if(a.func == 'ROTATE') {
        this.w(a.holder, holder=>holder.children().slice(0, (a.count !== undefined ? a.count : 1) || 999999).forEach(c=>{
          c.rotate(a.angle !== undefined ? a.angle : 90);
        }));
      }

      if(a.func == 'SHUFFLE') {
        this.w(a.holder, holder=>{
          holder.children().forEach(c=>c.p('z', Math.floor(Math.random()*10000)));
          holder.updateAfterShuffle();
        });
      }

    }
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
