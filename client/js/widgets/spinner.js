class Spinner extends Widget {
  constructor(object, surface) {
    super(object, surface);

    Object.assign(this.defaults, {
      options: [ 1, 2, 3, 4, 5, 6 ],
      value: '🎲'
    });
  }

  click() {
    this.p('value', this.p('options')[this.p('options').length * Math.random() | 0]);
    this.sendUpdate();
  }

  receiveUpdate(object) {
    super.receiveUpdate(object);
    this.domElement.classList.add('spinner');
    this.domElement.textContent = this.p('value');
  }
}
