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
      this.surface.updateMaxZ(this.get('layer'), delta.z);
  }

  applyDeltaToDOM(delta) {
    if(delta.dropTarget !== undefined) {
      if(this.get('dropTarget'))
        this.surface.dropTargets.set(this.id, this);
      else
        this.surface.dropTargets.delete(this.id);
    }
  }

  applyInitialDelta(delta) {
    this.applyDeltaToDOM(this.defaults);
    this.applyDelta(delta);
  }

  getDefaultValue(key) {
    if(this.inheritedProperties)
      for(const [ id, properties ] of Object.entries(this.inheritFrom()))
        if(this.inheritedProperties[key] && this.inheritFromIsValid(properties, key) && this.widgets.has(id) && this.widgets.get(id).get(key) !== undefined)
          return this.widgets.get(id).get(key);
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
    for(const property in this.surface.globalUpdateListeners)
      this.surface.globalUpdateListeners[property] = this.surface.globalUpdateListeners[property].filter(i=>i[0]!=this);
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
    if([ 'id', 'type', 'deck', 'cardType' ].indexOf(key) != -1)
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
    for(const wID in this.surface.inheritFromMapping)
      this.surface.inheritFromMapping[wID] = this.surface.inheritFromMapping[wID].filter(i=>i!=this);
  }

  async set(property, value) {
    if(tracingEnabled && property == 'activeFace')
      sendTraceEvent('set activeFace', { w: this.get('id'), property, value, stack: new Error().stack });

    const JSONvalue = JSON.stringify(value);
    if(!this.state.inheritFrom && JSONvalue === JSON.stringify(this.getDefaultValue(property)))
      value = null;
    if(this.state[property] === undefined && value === null || JSON.stringify(this.state[property]) === JSONvalue)
      return;

    if(property == 'z') {
      this.surface.updateMaxZ(this.get('layer'), value);
      if(value > 90000)
        return await this.surface.resetMaxZ(this.get('layer'));
    }

    const oldValue = this.state[property];
    if(value === null)
      delete this.state[property];
    else
      this.state[property] = JSON.parse(JSONvalue);
    this.surface.sendPropertyUpdate(this.get('id'), property, value);
    await this.onPropertyChange(property, oldValue, value);

    if(Array.isArray(this.get(`${property}ChangeRoutine`)))
      await this.evaluateRoutine(`${property}ChangeRoutine`, { oldValue, value }, {});
    if(Array.isArray(this.get('changeRoutine')))
      await this.evaluateRoutine('changeRoutine', { property, oldValue, value }, {});

    if(!this.surface.isInGlobalUpdateRoutine) {
      this.surface.isInGlobalUpdateRoutine = true;
      for(const [ widget, routine ] of this.surface.globalUpdateListeners[property] || [])
        await widget.evaluateRoutine(routine, { widgetID: this.id, oldValue, value }, { widget: [ this ] });
      for(const [ widget, routine ] of this.surface.globalUpdateListeners['*'] || [])
        await widget.evaluateRoutine(routine, { widgetID: this.id, property, oldValue, value }, { widget: [ this ] });
      this.surface.isInGlobalUpdateRoutine = false;
    }
  }

  async setPosition(x, y, z) {
    await this.set('x', x);
    await this.set('y', y);
    await this.set('z', z);
  }
}
