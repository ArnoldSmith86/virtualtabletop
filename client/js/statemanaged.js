import { dropTargets } from './main.js';
import { sendPropertyUpdate } from './serverstate.js';
import { tracingEnabled } from './tracing.js';

export class StateManaged {
  constructor() {
    this.defaults = {};
    this.state = {};
    this.unalteredState = {};
  }

  addDefaults(defaults) {
    Object.assign(this.defaults, defaults);
  }

  applyDelta(delta) {
    const deltaForDOM = {};
    for(const i in delta) {
      if(delta[i] === null) {
        delete this.unalteredState[i];
        delete this.state[i];
        deltaForDOM[i] = this.get(i);
      } else {
        deltaForDOM[i] = this.unalteredState[i] = this.state[i] = delta[i];
      }
    }

    this.applyDeltaToDOM(deltaForDOM);

    if(delta.z)
      updateMaxZ(this.get('layer'), delta.z);
  }

  applyDeltaToDOM(delta) {
    if(delta.dropTarget !== undefined) {
      if(this.get('dropTarget'))
        dropTargets.set(this.id, this);
      else
        dropTargets.delete(this.id);
    }
  }

  applyInitialDelta(delta) {
    this.applyDeltaToDOM(this.defaults);
    this.applyDelta(delta);
  }

  getDefaultValue(key) {
    // Widgets can inherit from each other in a circle, in which case the value is not defined
    // anywhere in the chain - fall back to the local default instead of recursing until the stack
    // overflows. (#684, #833)
    if(this.inheritedProperties && !StateManaged.inheritLookups.has(this)) {
      StateManaged.inheritLookups.add(this);
      try {
        for(const [ id, properties ] of Object.entries(this.inheritFrom()))
          if(this.inheritedProperties[key] && this.inheritFromIsValid(properties, key) && widgets.has(id) && widgets.get(id).get(key) !== undefined)
            return widgets.get(id).get(key);
      } finally {
        StateManaged.inheritLookups.delete(this);
      }
    }
    return this.defaults[key];
  }

  get(property) {
    const value = this.state[property];
    if(value !== undefined) {
      if(property == 'x' || property == 'y' || property == 'z' || property == 'layer' || property == 'width' || property == 'height')
        return +value;
      else
        return value;
    } else {
      const defaultValue = this.getDefaultValue(property);
      return defaultValue !== undefined ? defaultValue : null;
    }
  }

  globalUpdateListenersUnregister() {
    for(const property in StateManaged.globalUpdateListeners)
      StateManaged.globalUpdateListeners[property] = StateManaged.globalUpdateListeners[property].filter(i=>i[0]!=this);
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
    if([ 'id', 'type', 'deck', 'cardType', 'lineOriginalRotation' ].indexOf(key) != -1)
      return false;
    if(properties == '*')
      return true;

    properties = asArray(properties);

    if(properties.length && properties[0].length && properties[0][0] == '!')
      return properties.indexOf('!'+key) == -1;
    else
      return properties.indexOf(key) != -1;
  }

  inheritFromUnregister() {
    for(const wID in StateManaged.inheritFromMapping)
      StateManaged.inheritFromMapping[wID] = StateManaged.inheritFromMapping[wID].filter(i=>i!=this);
  }

  async set(property, value) {
    if(tracingEnabled && property == 'activeFace')
      sendTraceEvent('set activeFace', { w: this.get('id'), property, value, stack: new Error().stack });

    let JSONvalue;
    try {
      JSONvalue = JSON.stringify(value);
    } catch(e) {
      // A routine can build a value that contains itself (e.g. "var a = ${a} push ${a}"). Such a
      // value can neither be stored nor sent to the server, so refuse the write instead of letting
      // the exception tear down the client. Refusing returns the reason, so that a caller which can
      // show it to the user does not have to serialize the value a second time. (#1415)
      console.log(`Not setting ${property} of ${this.get('id')}: ${e.toString()}`);
      return `${property} of ${this.get('id')}: the value contains itself and can not be stored`;
    }
    if(!this.state.inheritFrom && JSONvalue === JSON.stringify(this.getDefaultValue(property)))
      value = null;
    if(this.state[property] === undefined && value === null || JSON.stringify(this.state[property]) === JSONvalue)
      return;

    if(property == 'z') {
      updateMaxZ(this.get('layer'), value);
      if(value > 90000) {
        await resetMaxZ(this.get('layer'));
        return;
      }
    }

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
StateManaged.inheritLookups = new Set();
StateManaged.inheritPropagations = new Set();
