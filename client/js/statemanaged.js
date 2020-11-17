class StateManaged extends Draggable {
  applyDelta(delta) {
    this.receiveUpdate(Object.assign(this.sourceObject, delta));
  }

  p(property, value) {
    if(value === undefined)
      return this.propertyGet(property);
    else
      this.propertySet(property, value);
  }

  propertyGet(property) {
    if(this.sourceObject[property] !== undefined)
      return this.sourceObject[property];
    else
      return this.defaults[property];
  }

  propertySet(property, value) {
    if(value === this.defaults[property])
      value = null;
    if(this.sourceObject[property] === value || this.sourceObject[property] === undefined && value === null)
      return;

    if(value === null)
      delete this.sourceObject[property];
    else
      this.sourceObject[property] = value;
    sendPropertyUpdate(this.p('id'), property, value);
    this.receiveUpdate(this.sourceObject);
  }

  setPosition(x, y, z) {
    this.p('x', x);
    this.p('y', y);
    this.p('z', z);
  }
}
