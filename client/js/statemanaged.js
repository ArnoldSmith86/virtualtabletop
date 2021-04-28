import { sendPropertyUpdate } from './serverstate.js';

export class StateManaged {
  constructor() {
    this.defaults = {};
    this.state = {};
  }

  addDefaults(defaults) {
    Object.assign(this.defaults, defaults);
    this.applyDeltaToDOM(defaults);
  }

  applyDelta(delta) {
    const deltaForDOM = {};
    for(const i in delta) {
      if(delta[i] === null) {
        delete this.state[i];
        deltaForDOM[i] = this.getDefaultValue(i);
      } else {
        deltaForDOM[i] = this.state[i] = delta[i];
      }
    }
    this.applyDeltaToDOM(deltaForDOM);

    if(delta.z)
      updateMaxZ(this.p('layer'), delta.z);
  }

  applyInitialDelta(delta) {
    this.applyDelta(delta);
  }

  getDefaultValue(key) {
    if(this.defaults.hasOwnProperty(key))
      return this.defaults[key]
    else
      return null;
  }

  p(property, value) {
    if(value === undefined)
      return this.propertyGet(property);
    else
      this.propertySet(property, value);
  }

  propertyGet(property) {
    if(this.state[property] !== undefined)
      return [ 'x', 'y', 'width', 'height', 'z', 'layer' ].indexOf(property) != -1 ? +this.state[property] : this.state[property];
    else
      return this.getDefaultValue(property);
  }

  propertySet(property, value) {
    if(value === this.defaults[property])
      value = null;
    if(this.state[property] === value || this.state[property] === undefined && value === null)
      return;

    if(property == 'z')
      updateMaxZ(this.p('layer'), value);

    const oldValue = this.state[property];
    if(value === null)
      delete this.state[property];
    else
      this.state[property] = value;
    sendPropertyUpdate(this.p('id'), property, value);
    this.onPropertyChange(property, oldValue, value);
  }

  setPosition(x, y, z) {
    this.p('x', x);
    this.p('y', y);
    this.p('z', z);
  }
}
