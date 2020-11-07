class Spinner extends Widget {
  constructor(object, surface) {
    super(object, surface);
    const div = document.createElement('div');
  }

  click() {
    this.sourceObject.value = this.sourceObject.options[this.sourceObject.options.length * Math.random() | 0];
    this.sendUpdate();
  }

  receiveUpdate(object) {
    super.receiveUpdate(object);
    this.domElement.classList.add('spinner');
    this.domElement.textContent = typeof object.value == 'undefined' && '🎲' || object.value;
  }
}
