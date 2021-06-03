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
      updateMaxZ(this.get('layer'), delta.z);
  }

  applyInitialDelta(delta) {
    this.applyDelta(delta);
  }

  getDefaultValue(key) {
    return this.defaults[key];
  }

  get(property) {
    if(this.state[property] !== undefined)
      return [ 'x', 'y', 'width', 'height', 'z', 'layer' ].indexOf(property) != -1 ? +this.state[property] : this.state[property];
    else
      return this.getDefaultValue(property) !== undefined ? this.getDefaultValue(property) : null;
  }

  async set(property, value) {
    const JSONvalue = JSON.stringify(value);
    if(JSONvalue === JSON.stringify(this.getDefaultValue(property)))
      value = null;
    if(JSON.stringify(this.state[property]) === JSONvalue || this.state[property] === undefined && value === null)
      return;

    if(property == 'z')
      updateMaxZ(this.get('layer'), value);

    const oldValue = this.state[property];
    if(value === null)
      delete this.state[property];
    else
      this.state[property] = JSON.parse(JSONvalue);
    sendPropertyUpdate(this.get('id'), property, value);
    await this.onPropertyChange(property, oldValue, value);
    if(Array.isArray(this.get(`${property}ChangeRoutine`)))
      await this.evaluateRoutine(`${property}ChangeRoutine`, { oldValue, value }, {});
    if(Array.isArray(this.get('changeRoutine')))
      await this.evaluateRoutine('changeRoutine', { property, oldValue, value }, {});
  }

  async setPosition(x, y, z) {
    await this.set('x', x);
    await this.set('y', y);
    await this.set('z', z);
  }
}
