import { dropTargets } from './main.js';
import { sendPropertyUpdate } from './serverstate.js';
import { tracingEnabled } from './tracing.js';
import { languageOverrides, isLanguageSuffixedKey } from './i18n.js';

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
    let overridesChanged = false;
    for(const i in delta) {
      if(isLanguageSuffixedKey(i))
        overridesChanged = true;
      if(delta[i] === null) {
        delete this.unalteredState[i];
        delete this.state[i];
        deltaForDOM[i] = this.get(i);
      } else {
        deltaForDOM[i] = this.unalteredState[i] = this.state[i] = delta[i];
      }
    }

    // language-suffixed properties (e.g. `x:de`) override their base property
    // for the selected UI language; resolve them locally so the base property
    // in the DOM reflects the override for every property that gained, lost or
    // still has one (see i18n.js)
    const previousOverrides = this.languageOverrides;
    if(overridesChanged)
      this.languageOverrides = languageOverrides(this.state);
    if(previousOverrides || this.languageOverrides)
      for(const base in Object.assign({}, previousOverrides, this.languageOverrides))
        deltaForDOM[base] = this.get(base);

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

  getDefaultValue(key, raw) {
    // `raw` resolves inherited properties through getRaw() so the value stays
    // language-neutral for routine reads (see get()/getRaw())
    const read = w => raw ? w.getRaw(key) : w.get(key);
    if(this.inheritedProperties)
      for(const [ id, properties ] of Object.entries(this.inheritFrom()))
        if(this.inheritedProperties[key] && this.inheritFromIsValid(properties, key) && widgets.has(id) && read(widgets.get(id)) !== undefined)
          return read(widgets.get(id));
    return this.defaults[key];
  }

  // get() resolves language-suffixed overrides and is used for display/UI.
  // getRaw() returns the unsuffixed shared-state value and is used by the
  // routine interpreter, so game logic stays identical for every player
  // regardless of the language they selected (see i18n.js).
  get(property) {
    const value = this.languageOverrides && this.languageOverrides[property] !== undefined
      ? this.languageOverrides[property]
      : this.state[property];
    return this.coerceValue(property, value, false);
  }

  getRaw(property) {
    return this.coerceValue(property, this.state[property], true);
  }

  coerceValue(property, value, raw) {
    if(value !== undefined) {
      if(property == 'x' || property == 'y' || property == 'z' || property == 'layer' || property == 'width' || property == 'height')
        return +value;
      else
        return value;
    } else {
      const defaultValue = this.getDefaultValue(property, raw);
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
    for(const wID in StateManaged.inheritFromMapping)
      StateManaged.inheritFromMapping[wID] = StateManaged.inheritFromMapping[wID].filter(i=>i!=this);
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
      updateMaxZ(this.get('layer'), value);
      if(value > 90000)
        return await resetMaxZ(this.get('layer'));
    }

    const oldValue = this.state[property];
    if(value === null)
      delete this.state[property];
    else
      this.state[property] = JSON.parse(JSONvalue);
    // the delta batcher defers applyDelta() (which normally recomputes the
    // override cache) until the batch ends, so refresh it here too — otherwise a
    // routine that sets a suffixed property and reads its base later in the same
    // batch would see the previous override
    if(isLanguageSuffixedKey(property))
      this.languageOverrides = languageOverrides(this.state);
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
