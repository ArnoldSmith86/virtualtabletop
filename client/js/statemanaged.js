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
    if(this.state.inheritFrom && widgets.has(this.state.inheritFrom))
      return widgets.get(this.state.inheritFrom).get(key);
    return this.defaults[key];
  }

  get(property) {
    if(this.state[property] !== undefined)
      return [ 'x', 'y', 'width', 'height', 'z', 'layer' ].indexOf(property) != -1 ? +this.state[property] : this.state[property];
    else
      return this.getDefaultValue(property) !== undefined ? this.getDefaultValue(property) : null;
  }

  async set(property, value) {
    if(value === this.getDefaultValue(property) && !this.state.inheritFrom)
      value = null;
    if(this.state[property] === value || this.state[property] === undefined && value === null)
      return;

    if(property == 'z')
      updateMaxZ(this.get('layer'), value);

    const oldValue = this.state[property];
    if(value === null)
      delete this.state[property];
    else
      this.state[property] = value;
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
