import { sendPropertyUpdate } from './serverstate.js';
import { tracingEnabled } from './tracing.js';

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
    for(const [ id, properties ] of Object.entries(this.inheritFrom()))
      if(this.inheritFromIsValid(properties, key) && widgets.has(id) && widgets.get(id).get(key) !== undefined)
        return widgets.get(id).get(key);
    return this.defaults[key];
  }

  get(property) {
    if(this.state[property] !== undefined)
      return [ 'x', 'y', 'width', 'height', 'z', 'layer' ].indexOf(property) != -1 ? +this.state[property] : this.state[property];
    else
      return this.getDefaultValue(property) !== undefined ? this.getDefaultValue(property) : null;
  }

  inheritFrom() {
    const iF = this.state.inheritFrom;
    if(!iF)
      return {};

    if(typeof iF == 'string') {
      const object = {};
      object[iF] = '*';
      return object;
    } else {
      return iF;
    }
  }

  inheritFromIsValid(properties, key) {
    return (properties == '*' || properties.indexOf(key) != -1) && [ 'id', 'type', 'deck', 'cardType' ].indexOf(key) == -1;
  }

  inheritFromUnregister() {
    for(const wID in StateManaged.inheritFromMapping)
      StateManaged.inheritFromMapping[wID] = StateManaged.inheritFromMapping[wID].filter(i=>i!=this);
  }

  async set(property, value) {
    if(tracingEnabled && property == 'activeFace')
      sendTraceEvent('set activeFace', { w: this.get('id'), property, value, stack: new Error().stack });

    const JSONvalue = JSON.stringify(value);
    if(JSONvalue === JSON.stringify(this.getDefaultValue(property)) && !this.state.inheritFrom)
      value = null;
    if(JSON.stringify(this.state[property]) === JSONvalue || this.state[property] === undefined && value === null)
      return;

    if(property == 'z') {
      updateMaxZ(this.get('layer'), value);
      if(value > 90000)
        return await resetMaxZ(this.get('layer'));
    }

    const oldValue = this.state[property];
    if(value === null)
      delete this.state[property];
    else
      this.state[property] = JSON.parse(JSONvalue);
    sendPropertyUpdate(this.get('id'), property, value);
    await this.onPropertyChange(property, oldValue, value);

    if(Array.isArray(this.get(`${property}ChangeRoutine`))) {
      if (property == 'text')
        window.dontFocus = true;
      await this.evaluateRoutine(`${property}ChangeRoutine`, { oldValue, value }, {});
    }
    if(Array.isArray(this.get('changeRoutine')))
      await this.evaluateRoutine('changeRoutine', { property, oldValue, value }, {});

    if(!StateManaged.isInGlobalUpdateRoutine) {
      StateManaged.isInGlobalUpdateRoutine = true;
      for(const [ widget, routine ] of StateManaged.globalUpdateListeners[property] || [])
        await widget.evaluateRoutine(routine, { widgetID: this.id, oldValue, value }, { widget: [ this ] });
      for(const [ widget, routine ] of StateManaged.globalUpdateListeners['*'] || [])
        await widget.evaluateRoutine(routine, { widgetID: this.id, property, oldValue, value }, { widget: [ this ] });
      StateManaged.isInGlobalUpdateRoutine = false;
    }
  }

  async setPosition(x, y, z) {
    await this.set('x', x);
    await this.set('y', y);
    await this.set('z', z);
  }
}

StateManaged.globalUpdateListeners = {};
StateManaged.inheritFromMapping = {};
