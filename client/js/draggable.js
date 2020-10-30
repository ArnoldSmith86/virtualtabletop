class Draggable {
  constructor(domElement, containerDomElement) {
    this.domElement = domElement;
    this.containerDomElement = containerDomElement || domElement.parentElement;

    this.containerDomElement.addEventListener("touchstart", e => this.dragStart(e), false);
    this.containerDomElement.addEventListener("touchend",   e => this.dragEnd(e),   false);
    this.containerDomElement.addEventListener("touchmove",  e => this.drag(e),      false);

    this.containerDomElement.addEventListener("mousedown",  e => this.dragStart(e), false);
    this.containerDomElement.addEventListener("mouseup",    e => this.dragEnd(e),   false);
    this.containerDomElement.addEventListener("mousemove",  e => this.drag(e),      false);
  }

  dragStart(e) {
    if(e.target !== this.domElement)
      return;

    const rect  = this.domElement.getBoundingClientRect();
    const event = e.type === "touchstart" ? e.touches[0] : e;

    this.offsetMouseToObject = { x: rect.left - event.clientX, y: rect.top  - event.clientY };
    this.scale = getComputedStyle(document.documentElement).getPropertyValue('--scale');
    this.containerRect = this.containerDomElement.getBoundingClientRect();

    this.active = true;
  }

  drag(e) {
    if(this.active) {
      e.preventDefault();

      const { clientX, clientY } = e.type === "touchstart" ? e.touches[0] : e;

      const x = Math.floor((clientX + this.offsetMouseToObject.x - this.containerRect.left) / this.scale);
      const y = Math.floor((clientY + this.offsetMouseToObject.y - this.containerRect.top ) / this.scale);

      this.setTranslate(x, y, this.domElement);
      toServer("translate", { id: this.domElement.id, pos: [ x, y ]});
    }
  }

  dragEnd(e) {
    this.active = false;
  }

  setTranslate(x, y, el) {
    el.style.transform = `translate(${x}px, ${y}px)`;
  }

  setPositionFromServer(x, y) {
    if(!this.active)
      this.setTranslate(x, y, this.domElement);
  }
}
