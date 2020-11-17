class Spinner extends Widget {
  constructor(id) {
    super(id);

    this.addDefaults({
      width: 110,
      height: 110,
      classes: 'widget spinner',

      options: [ 1, 2, 3, 4, 5, 6 ],
      value: '🎲'
    });
  }

  applyDeltaToDOM(delta) {
    super.applyDeltaToDOM(delta);
    if(delta.value !== undefined)
      this.domElement.textContent = delta.value;
  }

  click() {
    this.p('value', this.p('options')[this.p('options').length * Math.random() | 0]);
  }
}
