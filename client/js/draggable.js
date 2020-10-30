class Draggable {
  constructor(domElement, containerDomElement) {
    this.domElement = domElement;
    this.containerDomElement = containerDomElement || domElement.parentElement;

    this.active = false;
    this.currentX;
    this.currentY;
    this.initialX;
    this.initialY;
    this.xOffset = 0;
    this.yOffset = 0;

    this.containerDomElement.addEventListener("touchstart", e => this.dragStart(e), false);
    this.containerDomElement.addEventListener("touchend",   e => this.dragEnd(e),   false);
    this.containerDomElement.addEventListener("touchmove",  e => this.drag(e),      false);

    this.containerDomElement.addEventListener("mousedown",  e => this.dragStart(e), false);
    this.containerDomElement.addEventListener("mouseup",    e => this.dragEnd(e),   false);
    this.containerDomElement.addEventListener("mousemove",  e => this.drag(e),      false);
  }

  dragStart(e) {
    this.getScale();

    if(e.type === "touchstart") {
      this.initialX = e.touches[0].clientX - this.xOffset;
      this.initialY = e.touches[0].clientY - this.yOffset;
    } else {
      this.initialX = e.clientX - this.xOffset;
      this.initialY = e.clientY - this.yOffset;
    }

    if(e.target === this.domElement) {
      this.active = true;
    }
  }

  dragEnd(e) {
    this.initialX = this.currentX;
    this.initialY = this.currentY;

    this.active = false;
  }

  drag(e) {
    if(this.active) {

      e.preventDefault();

      if(e.type === "touchmove") {
        this.currentX = e.touches[0].clientX - this.initialX;
        this.currentY = e.touches[0].clientY - this.initialY;
      } else {
        this.currentX = e.clientX - this.initialX;
        this.currentY = e.clientY - this.initialY;
      }

      this.xOffset = this.currentX;
      this.yOffset = this.currentY;

      this.setTranslate(this.xOffset, this.yOffset, this.domElement);
      toServer("translate", { id: this.domElement.id, pos: [ this.currentX, this.currentY ]});
    }
  }

  getScale() {
    this.scale = getComputedStyle(document.documentElement).getPropertyValue('--scale');
  }

  setTranslate(xPos, yPos, el) {
    el.style.transform = "translate(" + (xPos / this.scale) + "px, " + (yPos / this.scale) + "px)";
  }

  setPositionFromServer(x, y) {
    if(!this.active) {
      this.xOffset = x;
      this.yOffset = y;

      this.getScale();
      this.setTranslate(x, y, this.domElement);
    }
  }
}
