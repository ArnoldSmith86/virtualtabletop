class Spinner extends Widget {
  constructor(object, surface) {
    super(object, surface);

    Object.assign(this.defaults, {
      width: 110,
      height: 110,

      options: [ 1, 2, 3, 4, 5, 6 ],
      value: '🎲'
    });
    this.receiveUpdate(object);
  }

  click() {
    this.p('value', this.p('options')[this.p('options').length * Math.random() | 0]);
  }

  receiveUpdate(object) {
    super.receiveUpdate(object);
    this.domElement.classList.add('spinner');
    this.domElement.textContent = this.p('value');
  }
}
