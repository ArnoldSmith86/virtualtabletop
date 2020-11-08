class Button extends Widget {
  constructor(object, surface) {
    super(object, surface);
    this.isDraggable = false;
  }

  click() {
    for(const a of this.sourceObject.clickRoutine) {

      if(a[0] == 'MOVE') {
        this.w(a[1], source=>this.w(a[3], target=>source.children().slice(0, a[2]).reverse().forEach(c=> {
          if(a[4] == 'faceUp')
            c.sourceObject.activeFace = 1;
          if(a[4] == 'faceDown')
            c.sourceObject.activeFace = 0;
          c.moveToPile(target)
        })));
      }

      if(a[0] == 'SHUFFLE')
        this.w(a[1], pile=>pile.children().forEach(c=>c.setZ(Math.floor(Math.random()*10000))));

    }
    this.sendUpdate();
  }

  receiveUpdate(object) {
    super.receiveUpdate(object);
    this.domElement.classList.add('button');
    this.domElement.textContent = this.sourceObject.label;
  }

  w(ids, callback) {
    return Array.from(widgets.values()).filter(w=>(typeof ids == 'string' ? [ ids ] : ids).indexOf(w.sourceObject.id) != -1).forEach(callback);
  }
}
