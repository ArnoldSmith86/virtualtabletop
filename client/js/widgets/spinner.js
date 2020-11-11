class Spinner extends Widget {
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
