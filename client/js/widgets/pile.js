class Pile extends Widget {
  constructor(id) {
    super(id);
    this.handle = document.createElement('div');
    this.handle.className = 'handle';

    this.addDefaults({
      classes: 'widget pile',
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

  click() {
    this.children().forEach(w=>w.click&&w.click());
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
