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

  findInheritance(inheritFrom, inheritedProperty) {
    if ([ 'id', 'type', 'deck', 'cardType' ].indexOf(inheritedProperty) != -1) {
      return []
    }
    const results = [];
    for (const sourceId in inheritFrom) {
      const source = widgets.get(sourceId);
      if (source === undefined) {
        continue
      }
      const valueOriginal = inheritFrom[sourceId];
      let value = valueOriginal;

      if (typeof valueOriginal === "object" && !Array.isArray(valueOriginal)) {
        // If the value is an object but not an array, it may represent a direct property mapping.
        // Wrap it in an array to standardize processing in the loop below.
        value = [valueOriginal];
      } else if (typeof valueOriginal === "string" && valueOriginal.startsWith("!")) {
        // Handle negated strings first so stick it in an array to make it easy to verify
        value = [valueOriginal];
      }

      if (Array.isArray(value)) {
        const negatedStrings = this.validateNegativeInherits(value, sourceId)
        if (negatedStrings.length > 0) {
          const negatedMatches = negatedStrings.map(item => item.substring(1)); // Remove the "!" prefix
          if (!negatedMatches.includes(inheritedProperty) && source.state[inheritedProperty] !== undefined ) {
            results.push({
              sourceId: sourceId,
              sourceProperty: inheritedProperty,
              notify: false
            });
            continue; // Skip further checks for this source.  Do not pass Go.
          }
        }
      }
  
      // Process strings
      if (typeof value === "string") {
        if ((value === "*" || value === inheritedProperty) && source.state[inheritedProperty] !== undefined) {
          results.push({
            sourceId: sourceId,
            sourceProperty: inheritedProperty,
            notify: false
          });
        }
        continue; // Skip further checks for this source.  Do not collect $200.
      } 

      // Process arrays
      if (Array.isArray(value)) {
        let notify = this.checkNotify(value);
        for (const item of value) {
          if (typeof item === "string") {
            if (item === inheritedProperty && source.state[inheritedProperty] !== undefined) {
              results.push({
                sourceId: sourceId,
                sourceProperty: inheritedProperty,
                notify: notify || false
              });
            }
          } else if (typeof item === "object") {
            for (const sourceProp in item) {
              if (sourceProp !== 'notify' && item[sourceProp] === inheritedProperty && source.state[sourceProp.split('.')[0]] !== undefined) {
                results.push({
                  sourceId: sourceId,
                  sourceProperty: sourceProp,
                  notify: notify || false
                });
              }
            }
          }
        }
      }
    }
    return results;
  }

  checkNotify(valueArray) {
    return valueArray.some(item => typeof item === "object" && item.notify === true);
  }

  validateNegativeInherits(value, sourceId){
    const negatedStrings = value.filter(item => typeof item === "string" && item.startsWith("!"));
    const nonNegatedStrings = value.filter(item => typeof item === "string" && !item.startsWith("!"));
    const nonStringItems = value.filter(item => typeof item !== "string");
    if (negatedStrings.length > 0 && (nonNegatedStrings.length > 0 || nonStringItems.length > 0)) {
      // Oops!  Go straight to Jail, you can't mix the !prop with the other types
      throw new Error(`Invalid configuration for inheritFrom at ${sourceId}. Cannot mix negated and non-negated entries: ${JSON.stringify(value)}`);
    }
    return negatedStrings
  }

  getDefaultValue(key) {
    if (this.inheritedProperties) {
      const matches = this.findInheritance(this.inheritFrom(), key)
      if (matches.length){
        if (matches.length > 1){
          console.log("Hmm, more than 1 match... debug me")
          console.log(matches)
        }
        let sourceId = matches[0]['sourceId']
        let sourceProperty = matches[0]['sourceProperty']
        if (widgets.has(sourceId)) {
          const widget = widgets.get(sourceId);
          if (widget.state[sourceProperty] !== undefined) {
            return widget.state[sourceProperty];
          }
          if (sourceProperty.includes('.')) {
            const [firstPart] = sourceProperty.split('.');
            if (widget.state.hasOwnProperty(firstPart)) {
              const nested = this.getNestedValue(widget.state, sourceProperty);
              if (nested !== undefined) {
                return nested;
              }
            }
          }
        }
      }
    }
 
    if (this.defaults.hasOwnProperty(key)) {
        return this.defaults[key];
    }

    // if (key.includes('.')) {
    //     const [firstPart] = key.split('.');
    //     if (this.defaults.hasOwnProperty(firstPart)) {
    //         return this.getNestedValue(this.defaults, key);
    //     }
    // }

    return undefined;
  }

  getNestedValue(obj, path) {
    if (!obj || typeof path !== 'string' || !path.includes('.')) return undefined;
    const pathParts = path.split('.');
    const [firstPart, ...restParts] = pathParts;
    // Check if the first part exists on the object
    if (obj.hasOwnProperty(firstPart)) {
      return pathParts.reduce((current, key) => {
        if (Array.isArray(current) && !isNaN(key)) {
          return current[+key];
        }
        return current && current[key] !== undefined ? current[key] : undefined;
      }, obj);
    } else if (restParts.length > 0) {
      // Attempt to resolve assuming obj was actually handed to us as the top level itself
      return restParts.reduce((current, key) => {
        if (Array.isArray(current) && !isNaN(key)) {
          return current[+key];
        }
        return current && current[key] !== undefined ? current[key] : undefined;
      }, obj);
    }
    return undefined;
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
    if([ 'id', 'type', 'deck', 'cardType' ].indexOf(key) != -1)
      return false;
    if(properties == '*')
      return true;

    properties = asArray(properties);

    // Handle "everything but" (negation) case with strings
    if (properties.length && typeof properties[0] === 'string' && properties[0][0] === '!') {
      return !properties.includes('!' + key);
    }

    // Handle both strings and object mappings
    return properties.some(prop => {
      if (typeof prop === 'string') {
        return prop === key; // Direct match for simple properties
      } else if (typeof prop === 'object' && prop !== null) {
        // Handle nested objects, e.g., {x: 'startx'}
        return Object.entries(prop).some(([nestedKey, nestedValue]) => {
          if (key === nestedKey) {
            return true;
          }
          const keyParts = key.split('.');
          return keyParts.length > 1 && keyParts[0] === nestedKey;
        });
      }
      return false;
    });
  }

  notifyInheritance(sourceId, sourceProperty, inheritorList) {
    let heirs = [];    
    inheritorList.forEach(obj => {
      const inheritFrom = obj.state.inheritFrom;  
      if (inheritFrom) {
        let inheritances = inheritFrom[sourceId];
          if (!Array.isArray(inheritances)) {
            inheritances = [inheritances];
          }
          if (obj.state.inheritFromNotifyAll || this.checkNotify(inheritances)) {
            let negatedStrings = this.validateNegativeInherits(inheritances, sourceId);
            if (negatedStrings.length > 0) {
              const negatedMatches = negatedStrings.map(item => item.substring(1)); // Remove the "!" prefix
              if (!negatedMatches.includes(sourceProperty)) {
                heirs.push({
                    source: sourceId,
                    destination: obj.id,
                    sourceProperty: sourceProperty,
                    targetProperty: sourceProperty
                });
              }
            } else {
              inheritances.forEach(item => {
                if (typeof item === 'string' && (item === "*" || item === sourceProperty)) {
                  heirs.push({
                      source: sourceId,
                      destination: obj.id,
                      sourceProperty: sourceProperty,
                      targetProperty: sourceProperty
                  });
                } else {
                  // Process objects with property mappings
                  for (let prop in item) {
                  if (item.hasOwnProperty(prop) && prop.startsWith(sourceProperty)) {
                    heirs.push({
                        source: sourceId,
                        destination: obj.id,
                        sourceProperty: prop,
                        targetProperty: item[prop]
                    });
                  }
                }
              }
            });
          }
        }
      }
    });
    return heirs;
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
    sendPropertyUpdate(this.get('id'), property, value);
    await this.onPropertyChange(property, oldValue, value);
    // do we have any mapped inherits pointing to this id?
    const inheritorList = StateManaged.inheritFromMapping[this.get("id")]
    if (inheritorList.length) {
      const heirs = this.notifyInheritance(this.get("id"), property, inheritorList)
      if (heirs.length) {
        for (let obj of heirs) {
          let heir = widgets.get(obj.destination);
          if (property == obj.sourceProperty){
            // non complex property (simple match)
            await heir.onPropertyChange(obj.targetProperty, oldValue, value);
          } else {
            // we need to dig into the property...
            let oldnestedvalue = this.getNestedValue(oldValue, obj.sourceProperty)
            let nestedvalue = this.getNestedValue(value, obj.sourceProperty)
            // unsure if this next line is correct
            sendPropertyUpdate(obj.destination, obj.targetProperty, nestedvalue);
            // but we do need this...
            await heir.onPropertyChange(obj.targetProperty, oldnestedvalue, nestedvalue)
          }
        }
      }
    }

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
