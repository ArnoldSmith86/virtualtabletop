class Draggable {
  constructor(domElement, containerDomElement) {
    this.domElement = domElement;
    this.containerDomElement = containerDomElement || domElement.parentElement;

    this.extraTransform = '';

    this.containerDomElement.addEventListener("touchstart", e => this.dragStart(e), false);
    this.containerDomElement.addEventListener("touchend",   e => this.dragEnd(e),   false);
    this.containerDomElement.addEventListener("touchmove",  e => this.drag(e),      false);

    this.containerDomElement.addEventListener("mousedown",  e => this.dragStart(e), false);
    this.containerDomElement.addEventListener("mouseup",    e => this.dragEnd(e),   false);
    this.containerDomElement.addEventListener("mousemove",  e => this.drag(e),      false);
  }

  dragStart(e) {
    e.preventDefault();
    if(e.target !== this.domElement && e.target.parentNode.parentNode !== this.domElement)
      return;

    const rect  = this.domElement.getBoundingClientRect();
    const event = e.type === "touchstart" ? e.touches[0] : e;

    this.dragStartEvent = event;
    this.offsetMouseToObject = { x: rect.left - event.clientX, y: rect.top - event.clientY };
    this.containerRect = this.containerDomElement.getBoundingClientRect();

    this.active = true;
    this.onDragStart();
  }

  drag(e) {
    e.preventDefault();
    if(this.active && (this.isDraggable !== false || edit)) {
      const { clientX, clientY } = e.type === "touchmove" ? e.touches[0] : e;

      const x = Math.floor((clientX + this.offsetMouseToObject.x - this.containerRect.left) / scale);
      const y = Math.floor((clientY + this.offsetMouseToObject.y - this.containerRect.top ) / scale);

      this.setTranslate(x, y, this.domElement);
      this.onDrag(x, y);
    }
  }

  dragEnd(e) {
    e.preventDefault();
    if(this.active) {
      this.active = false;
      this.onDragEnd();

      const { clientX, clientY } = e.type === "touchend" ? e.changedTouches[0] : e;
      if(this.click && clientX == this.dragStartEvent.clientX && clientY == this.dragStartEvent.clientY && !edit)
        this.click();
    }
  }

  setTranslate(x, y, el) {
    el.style.transform = `translate(${x}px, ${y}px) ${this.extraTransform}`;
  }
}
