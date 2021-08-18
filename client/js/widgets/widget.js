import { $, removeFromDOM } from '../domhelpers.js';
import { StateManaged } from '../statemanaged.js';
import { playerName, playerColor, activePlayers } from '../overlays/players.js';
import { batchStart, batchEnd, widgetFilter, widgets } from '../serverstate.js';
import { showOverlay } from '../main.js';
import { tracingEnabled } from '../tracing.js';

export class Widget extends StateManaged {
  constructor(id) {
    const div = document.createElement('div');
    div.id = id;
    super();
    this.id = id;
    this.domElement = div;
    this.childArray = [];

    if(StateManaged.inheritFromMapping[id] === undefined)
      StateManaged.inheritFromMapping[id] = [];

    this.addDefaults({
      x: 0,
      y: 0,
      z: 0,
      width: 100,
      height: 100,
      layer: 0,
      rotation: 0,
      scale: 1,

      typeClasses: 'widget',
      classes: '',
      css: '',
      movable: true,
      movableInEdit: true,
      clickable: false,

      grid: [],
      enlarge: false,
      overlap: true,
      ignoreOnLeave: false,

      parent: null,
      fixedParent: false,
      inheritFrom: null,
      owner: null,
      dropOffsetX: 0,
      dropOffsetY: 0,
      inheritChildZ: false,

      clickRoutine: null,
      changeRoutine: null,
      enterRoutine: null,
      leaveRoutine: null,
      globalUpdateRoutine: null
    });
    this.domElement.timer = false
    
    this.domElement.addEventListener('contextmenu', e => this.showEnlarged(e), false);
    this.domElement.addEventListener('mouseenter',  e => this.showEnlarged(e), false);
    this.domElement.addEventListener('mouseleave',  e => this.hideEnlarged(e), false);
    this.domElement.addEventListener("touchstart", e => this.touchstart());
    this.domElement.addEventListener("touchend", e => this.touchend(), false);
    
    this.touchstart = function() {
      if (!this.timer) {
        this.timer = setTimeout(this.onlongtouch.bind(this), 500, false);
      }
    }
    
    this.touchend = function() {
      clearTimeout(this.timer);
      this.timer = null;
      this.hideEnlarged();
    }
    
    this.onlongtouch = function() {
      this.showEnlarged();
      clearTimeout(this.timer);
      this.timer = null;
      this.domElement.classList.add('longtouch');
    }
  }

  absoluteCoord(coord) {
    return this.get(coord) + (this.get('parent') ? widgets.get(this.get('parent')).absoluteCoord(coord) : 0);
  }

  applyChildAdd(child) {
    this.childArray = this.childArray.filter(c=>c!=child);
    this.childArray.push(child);
    this.applyZ();
  }

  applyChildRemove(child) {
    this.childArray = this.childArray.filter(c=>c!=child);
    this.applyZ();
  }

  applyCSS(delta) {
    for(const property of this.classesProperties()) {
      if(delta[property] !== undefined) {
        this.domElement.className = this.classes();
        break;
      }
    }

    for(const property of this.cssProperties()) {
      if(delta[property] !== undefined) {
        this.domElement.style.cssText = this.css();
        return;
      }
    }

    for(const property of this.cssTransformProperties()) {
      if(delta[property] !== undefined) {
        this.domElement.style.transform = this.cssTransform();
        return;
      }
    }
  }

  applyDeltaToDOM(delta) {
    this.applyCSS(delta);
    if(delta.z !== undefined)
      this.applyZ(true);

    if(delta.movable !== undefined)
      this.isDraggable = delta.movable;

    if(delta.parent !== undefined) {
      if(this.parent)
        this.parent.applyChildRemove(this);

      if(delta.parent === null)
        $('#topSurface').appendChild(this.domElement);
      else
        widgets.get(delta.parent).domElement.appendChild(this.domElement);

      if(delta.parent !== null) {
        this.parent = widgets.get(delta.parent);
        this.parent.applyChildAdd(this);
      } else {
        delete this.parent;
      }
    }

    for(const key in delta) {
      const isGlobalUpdateRoutine = key.match(/^(?:(.*)G|g)lobalUpdateRoutine$/);
      if(isGlobalUpdateRoutine) {
        const property = isGlobalUpdateRoutine[1] || '*';
        if(StateManaged.globalUpdateListeners[property] === undefined)
          StateManaged.globalUpdateListeners[property] = [];
        if(Array.isArray(delta[key]))
          StateManaged.globalUpdateListeners[property].push([ this, key ]);
        else
          StateManaged.globalUpdateListeners[property] = StateManaged.globalUpdateListeners[property].filter(x=>x[0]!=this);
      }
    }

    if(delta.inheritFrom !== undefined) {
      this.inheritFromUnregister();

      if(delta.inheritFrom)
        this.applyInheritedValuesToDOM(this.inheritFrom(), true);

      this.isDraggable = delta.movable;
    }

    for(const inheriting of StateManaged.inheritFromMapping[this.id]) {
      const inheritedDelta = {};
      this.applyInheritedValuesToObject(inheriting.inheritFrom()[this.id] || [], delta, inheritedDelta, inheriting);
      inheriting.applyDeltaToDOM(inheritedDelta);
    }

    if($('#enlarged').dataset.id == this.id && !$('#enlarged').className.match(/hidden/))
      this.showEnlarged();
  }

  applyInheritedValuesToObject(inheritDefinition, sourceDelta, targetDelta, targetWidget) {
    for(const key in sourceDelta)
      if(this.inheritFromIsValid(inheritDefinition, key) && targetWidget.state[key] === undefined)
          targetDelta[key] = sourceDelta[key];
  }

  applyInheritedValuesToDOM(inheritFrom, pushToArray) {
    const delta = {};
    for(const [ id, properties ] of Object.entries(inheritFrom).reverse()) {
      if(widgets.has(id)) {
        const w = widgets.get(id);
        if(w.state.inheritFrom)
          this.applyInheritedValuesToDOM(w.inheritFrom());
        this.applyInheritedValuesToObject(properties, w.state, delta, this);
      }

      if(pushToArray) {
        if(StateManaged.inheritFromMapping[id] === undefined)
          StateManaged.inheritFromMapping[id] = [];
        StateManaged.inheritFromMapping[id].push(this);
      }
    }
    this.applyDeltaToDOM(delta);
  }

  applyRemove() {
    if(this.parent)
      this.parent.applyChildRemove(this);
    if(this.get('deck') && widgets.has(this.get('deck')))
      widgets.get(this.get('deck')).removeCard(this);
    removeFromDOM(this.domElement);
    this.inheritFromUnregister();
  }

  applyZ(force) {
    if(this.get('inheritChildZ') || force) {
      this.domElement.style.zIndex = this.calculateZ();
      if(this.get('parent') && this.get('inheritChildZ'))
        widgets.get(this.get('parent')).applyZ();
    }
  }

  async bringToFront() {
    await this.set('z', getMaxZ(this.get('layer')) + 1);
  }

  calculateZ() {
    let z = ((this.get('layer') + 10) * 100000) + this.get('z');
    if(this.get('inheritChildZ'))
      for(const child of this.childrenOwned())
        z = Math.max(z, child.calculateZ());
    return z;
  }

  children() {
    return this.childArray.sort((a,b)=>b.get('z')-a.get('z'));
  }

  childrenOwned() {
    return this.children().filter(c=>!c.get('owner') || c.get('owner')==playerName);
  }

  async checkParent(forceDetach) {
    if(this.currentParent && (forceDetach || !overlap(this.domElement, this.currentParent.domElement))) {
      await this.set('parent', null);
      await this.set('owner',  null);
      if(this.currentParent.dispenseCard)
        await this.currentParent.dispenseCard(this);
      delete this.currentParent;
    }
  }

  classes() {
    let className = this.get('typeClasses') + ' ' + this.get('classes');

    if(Array.isArray(this.get('owner')) && this.get('owner').indexOf(playerName) == -1)
      className += ' foreign';
    if(typeof this.get('owner') == 'string' && this.get('owner') != playerName)
      className += ' foreign';

    return className;
  }

  classesProperties() {
    return [ 'classes', 'owner', 'typeClasses' ];
  }

  async click(mode='respect') {
    if(tracingEnabled)
      sendTraceEvent('click', { id: this.get('id'), mode });

    if(!this.get('clickable') && !(mode == 'ignoreClickable' || mode =='ignoreAll'))
      return true;

    if(Array.isArray(this.get('clickRoutine')) && !(mode == 'ignoreClickRoutine' || mode =='ignoreAll')) {
      await this.evaluateRoutine('clickRoutine', {}, {});
      return true;
    } else {
      return false;
    }
  }

  css() {
    let css = this.get('css');

    css += '; width:'  + this.get('width')  + 'px';
    css += '; height:' + this.get('height') + 'px';
    css += '; z-index:' + this.calculateZ();
    css += '; transform:' + this.cssTransform();

    return css;
  }

  cssProperties() {
    return [ 'css', 'height', 'inheritChildZ', 'layer', 'width' ];
  }

  cssTransform() {
    let transform = `translate(${this.get('x')}px, ${this.get('y')}px)`;

    if(this.get('rotation'))
      transform += ` rotate(${this.get('rotation')}deg)`;
    if(this.get('scale') != 1)
      transform += ` scale(${this.get('scale')})`;

    return transform;
  }

  cssTransformProperties() {
    return [ 'rotation', 'scale', 'x', 'y' ];
  }

  evaluateInputOverlay(o, resolve, reject, go) {
    const result = {};
    for(const field of o.fields) {

      if(field.type == 'checkbox') {
        result[field.variable] = document.getElementById(this.get('id') + ';' + field.variable).checked;
      } else if(field.type != 'text') {
        result[field.variable] = document.getElementById(this.get('id') + ';' + field.variable).value;
      }

    }

    showOverlay(null);
    if(go)
      resolve(result);
    else
      reject(result);
  }

  async evaluateRoutine(property, initialVariables, initialCollections, depth, byReference) {
    function unescape(str) {
      if(typeof str != 'string')
        return str;
      return str.replace(/\\u([0-9a-fA-F]{4})/g, function(m, c) {
        return String.fromCharCode(parseInt(c, 16));
      });
    }

    function evaluateIdentifier(dollarMatch, stringMatch) {
      return unescape(dollarMatch ? variables[stringMatch] : stringMatch);
    }

    const evaluateVariables = string=>{
      const identifierWithSpace = '(?:[a-zA-Z0-9 _-]|\\\\u[0-9a-fA-F]{4})+';
      const identifier          = identifierWithSpace.replace(/ /, '');
      const variable            = `(\\$)?(${identifier})(?:\\.(\\$)?(${identifier}))?`;
      const property            = `PROPERTY (\\$)?(${identifierWithSpace}?)(?: OF (\\$)?(${identifierWithSpace}))?`;
      const match               = string.match(new RegExp(`^\\$\\{(?:${variable}|${property}|[^}]+)\\}` + '\x24'));

      // not a match across the whole string; replace any variables inside it
      if(!match) {
        return string.replace(/\$\{([^}]+)\}/g, function(v) {
          const e = evaluateVariables(v);
          return e === undefined ? '' : e;
        });
      }

      // variable
      if(match[2]) {
        const varContent = variables[evaluateIdentifier(match[1], match[2])];
        if(varContent === undefined)
          return match[9] ? false : undefined;

        let indexName = evaluateIdentifier(match[3], match[4]);
        return indexName !== undefined ? varContent[indexName] : varContent;
      }

      // property
      if(match[6]) {
        let widget = this;
        if(match[8]) {
          const id = evaluateIdentifier(match[7], match[8]);
          if(!this.isValidID(id, problems))
            return null;
          widget = widgets.get(id);
        }
        return JSON.parse(JSON.stringify(widget.get(evaluateIdentifier(match[5], match[6]))));
      }

      return null;
    };

    const evaluateVariablesRecursively = obj=>{
      const newObject = Array.isArray(obj) ? [] : {};
      for(const i in obj) {
        let newValue = obj[i];
        if(typeof obj[i] == 'string')
          newValue = evaluateVariables(obj[i]);
        else if(typeof obj[i] == 'object' && obj[i] !== null && !i.match(/Routine$/))
          newValue = evaluateVariablesRecursively(obj[i]);
        newObject[String(evaluateVariables(i))] = newValue;
      }
      return newObject;
    };

    function setDefaults(routine, defaults) {
      for(const key in defaults)
        if(routine[key] === undefined)
          routine[key] = defaults[key];
    }

    function isValidCollection(collection) {
      if(Array.isArray(collections[collection]))
        return true;
      problems.push(`Collection ${collection} does not exist.`);
    }

    function toA(ids) {
      return typeof ids == 'string' ? [ ids ] : ids;
    }

    async function w(ids, callback) {
      for(const a of widgetFilter(w=>toA(ids).indexOf(w.get('id')) != -1))
        await callback(a);
    }

    if(!depth && (this.isBeingRemoved || this.inRemovalQueue))
      return;

    batchStart();

    if(tracingEnabled && typeof property == 'string')
      sendTraceEvent('evaluateRoutine', { id: this.get('id'), property });
    if(jeRoutineLogging)
      jeLoggingRoutineStart(this, property, initialVariables, initialCollections, byReference);

    let variables = initialVariables;
    let collections = initialCollections;
    if(!byReference) {
      variables = Object.assign({}, initialVariables, {
        playerName,
        playerColor,
        activePlayers,
        thisID : this.get('id')
      });
      collections = Object.assign({}, initialCollections, {
        thisButton : [this]
      });
    }

    const routine = this.get(property) !== null ? this.get(property) : property;

    for(const original of routine) {
      let a = JSON.parse(JSON.stringify(original));
      if(typeof a == 'object')
        a = evaluateVariablesRecursively(a);

      var problems = [];
      if(jeRoutineLogging) jeLoggingRoutineOperationStart(original, a)

      if(a.skip) {
        if(jeRoutineLogging) jeLoggingRoutineOperationEnd(problems, variables, collections, true);
        continue;
      }

      if(typeof a == 'string') {
        const identifier = '(?:[a-zA-Z0-9_-]|\\\\u[0-9a-fA-F]{4})+';
        const string     = `'((?:[ !#-&(-[\\]-~]|\\\\u[0-9a-fA-F]{4})*)'`;
        const number     = '(-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?)';
        const variable   = `(\\$\\{[^}]+\\})`;
        const parameter  = `(null|true|false|\\[\\]|\\{\\}|${number}|${variable}|${string})`;

        const left       = `var (\\$)?(${identifier})(?:\\.(\\$)?(${identifier}))?`;
        const operation  = `${identifier}|[=+*/%<!>&|-]{1,3}`;

        const regex      = `^${left} += +(?:${parameter}|(?:${parameter} +)?(🧮)?(${operation})(?: +${parameter})?(?: +${parameter})?(?: +${parameter})?)(?: +//.*)?`;

        const match = a.match(new RegExp(regex + '\x24')); // the minifier doesn't like a "$" here

        if(match) {
          const getParam = (offset, defaultValue)=>{
            if(typeof match[offset+3] == 'string') {
              return unescape(match[offset+3]);
            } else if(typeof match[offset+1] == 'string') {
              return +match[offset+1];
            } else if(match[offset] == '[]') {
              return [];
            } else if(match[offset] == '{}') {
              return {};
            } else if(match[offset] == 'null') {
              return null;
            } else if(match[offset] == 'true') {
              return true;
            } else if(match[offset] == 'false') {
              return false;
            } else if(match[offset] == 'false') {
              return false;
            } else if(typeof match[offset+2] == 'string') {
              const result = evaluateVariables(match[offset+2]);
              return result !== undefined ? result : defaultValue;
            } else {
              return 1;
            }
          };
          const getValue = function(input) {
            const toNum = s=>typeof s == 'string' && s.match(/^[-+]?[0-9]+(\.[0-9]+)?$/) ? +s : s;
            if(match[14] && match[9] !== undefined)
              return compute(match[13] ? variables[match[14]] : match[14], input, toNum(getParam(9, 1)), toNum(getParam(15, 1)), toNum(getParam(19, 1)));
            else if(match[14])
              return compute(match[13] ? variables[match[14]] : match[14], input, toNum(getParam(15, 1)), toNum(getParam(19, 1)), toNum(getParam(23, 1)));
            else
              return getParam(5, null);
          };

          const variable = match[1] !== undefined ? variables[unescape(match[2])] : unescape(match[2]);
          const index = match[3] !== undefined ? variables[unescape(match[4])] : unescape(match[4]);
          if(index !== undefined && typeof variables[variable] != 'object')
            problems.push(`The variable ${variable} is not an object, so indexing it doesn't work.`)
          else if(index !== undefined)
            variables[variable][index] = getValue(variables[variable][index]);
          else
            variables[variable] = getValue(variables[variable]);
          if(jeRoutineLogging) jeLoggingRoutineOperationSummary(a.substr(4), JSON.stringify(variables[variable]));
        } else {
          problems.push('String could not be interpreted as expression. Please check your syntax and note that many characters have to be escaped.');
        }
      }

      if(a.func == 'CALL') {
        setDefaults(a, { widget: this.get('id'), routine: 'clickRoutine', 'return': true, arguments: {}, variable: 'result', collection: 'result' });
        if(!a.routine.match(/Routine$/)) {
          problems.push('Routine parameters have to end with "Routine".');
        } else if(this.isValidID(a.widget)) {
          if(!Array.isArray(widgets.get(a.widget).get(a.routine))) {
            problems.push(`Widget ${a.widget} does not contain ${a.routine} (or it is no array).`);
          } else {
            // make sure everything is passed in a way that the variables and collections of this routine won't be changed
            const inheritVariables = Object.assign(JSON.parse(JSON.stringify(variables)), a.arguments);
            const inheritCollections = {};
            for(const c in collections)
              inheritCollections[c] = [ ...collections[c] ];
            inheritCollections['caller'] = [ this ];
            const result = await widgets.get(a.widget).evaluateRoutine(a.routine, inheritVariables, inheritCollections, (depth || 0) + 1);
            variables[a.variable] = result.variable;
            collections[a.collection] = result.collection;
            if(jeRoutineLogging) {
              const theWidget = this.isValidID(a.widget) && a.widget != this.get('id') ? `in ${a.widget}` : '';
              jeLoggingRoutineOperationSummary( `${a.routine} ${theWidget} and return ${a.variable}`, `${JSON.stringify(variables[a.variable])}`)
        }
          }
        }
        if(!a.return)
          break;
      }

      if(a.func == 'CANVAS') {
        setDefaults(a, { mode: 'reset', x: 0, y: 0, value: 1, color: "#1F5CA6" });

        if([ 'set', 'inc', 'dec', 'change', 'reset', 'setPixel' ].indexOf(a.mode) == -1) {
          problems.push(`Warning: Mode ${a.mode} will be interpreted as inc.`);
          a.mode = 'inc'
        }

        const execute = async function(widget) {
          if(widget.get('type') == 'canvas') {
            if(a.mode == 'setPixel')
              await widget.setPixel(a.x, a.y, a.value);
            else if(a.mode == 'set')
              await widget.set('activeColor', a.value % widget.get('colorMap').length);
            else if(a.mode == 'reset')
              await widget.reset();
            else if(a.mode == 'dec')
              await widget.set('activeColor', (widget.get('activeColor')+widget.get('colorMap').length - (a.value % widget.get('colorMap').length)) % widget.get('colorMap').length);
            else if(a.mode == 'change') {
              var CM = widget.get('colorMap');
              var index = ((a.value || 1) % CM.length) || 0;
              CM[index] = a.color || '#1f5ca6' ;
              await widget.set('colorMap', CM);
            }
            else
              await widget.set('activeColor', (widget.get('activeColor')+ a.value) % widget.get('colorMap').length);
          }
        };

        let phrase;
        
        if(a.canvas !== undefined) {
          if(this.isValidID(a.canvas, problems)) {
            await w(a.canvas, execute);
            phrase = `canvas ${a.canvas}`;
          }
        } else if(isValidCollection(a.collection)) {
          if(collections[a.collection].length) {
            for(const c of collections[a.collection].slice(0, a.count || 999999))
              await execute(c);
            phrase = `canvas widgets in ${a.collection}`;
          } else {
            problems.push(`Collection ${a.collection} is empty.`);
          }
        }

        if(jeRoutineLogging) {
          if(a.mode == 'set')
            jeLoggingRoutineOperationSummary(`color index of ${phrase}`, `${JSON.stringify(a.value)}`)
          else if(a.mode == 'change')
            jeLoggingRoutineOperationSummary(`index ${JSON.stringify(a.value)} of ${phrase}`, `${JSON.stringify(a.color)}`)
          else if(a.mode == 'reset')
            jeLoggingRoutineOperationSummary(`color index of ${phrase}`, `0`)
          else if(a.mode == 'setPixel')
            jeLoggingRoutineOperationSummary(`(${a.x}, ${a.y}) of ${phrase} to index ${JSON.stringify(a.value)}`, `${JSON.stringify(a.color)}`)
        }
      }

      if(a.func == 'CLICK') {
        setDefaults(a, { collection: 'DEFAULT', count: 1 , mode: 'respect' });
        if (['respect', 'ignoreClickable', 'ignoreClickRoutine', 'ignoreAll'].indexOf(a.mode) == -1) {
          problems.push(`Mode ${a.mode} is unsupported. Using 'respect' mode.`);
          a.mode = 'respect'
        };
        if(isValidCollection(a.collection)) {
          for(let i=0; i<a.count; ++i)
            for(const w of collections[a.collection])
              await w.click(a.mode);
          if(jeRoutineLogging) {
            const theCount = a.count ? `${a.count} times` : '';
            jeLoggingRoutineOperationSummary( `'${a.collection}' ${theCount}`)
          }
        }
      }

      if(a.func == 'CLONE') {
        setDefaults(a, { source: 'DEFAULT', count: 1, xOffset: 0, yOffset: 0, properties: {}, collection: 'DEFAULT' });
        if(isValidCollection(a.source)) {
          var c=[];
          for(const w of collections[a.source]) {
            for(let i=1; i<=a.count; ++i) {
              const clone = Object.assign(JSON.parse(JSON.stringify(w.state)), a.properties);
              const parent = clone.parent;
              clone.clonedFrom = w.get('id');

              if(widgets.has(clone.id)) {
                delete clone.id;
                if(a.properties.id !== undefined)
                  problems.push(`There is already a widget with id:${a.properties.id}, generating new ID.`);
              }
              delete clone.parent;
              addWidgetLocal(clone);
              const cWidget = widgets.get(clone.id);

              if(parent) {
				cWidget.oldParent = await this.parentIDIfPile(cWidget);
                await cWidget.moveToHolder(widgets.get(parent));
              }

              // moveToHolder causes the position to be wrong if the target holder does not have alignChildren
              if(!parent || !widgets.get(parent).get('alignChildren')) {
                await cWidget.set('x', (a.properties.x !== undefined ? a.properties.x : w.get('x')) + a.xOffset * i);
                await cWidget.set('y', (a.properties.y !== undefined ? a.properties.y : w.get('y')) + a.yOffset * i);
                await cWidget.updatePiles();
              }

              c.push(cWidget);
            }
          }
          collections[a.collection]=c;
          if(jeRoutineLogging)
            jeLoggingRoutineOperationSummary( `'${a.source}'`, `'${JSON.stringify(a.collection)}'`)
        }
      }

      function compute(o, v, x, y, z) {
        try {
          if (compute_ops.find(op => op.name == o) !== undefined) {
            v = compute_ops.find(op => op.name == o).call(v, x, y, z);
          }else {
            problems.push(`Operation ${o} is unsupported.`);
            return v = null;
          }
        } catch(e) {
          v = 0;
          problems.push(`Exception: ${e.toString()}`);
        }
        if(o !== '=' && (v === null || typeof v === 'number' && !isFinite(v))) {
          v = 0;
          problems.push(`The operation evaluated to null, Infinity or NaN. Setting the variable to 0.`);
        }
        return v;
      }

      if(a.func == 'COUNT') {
        setDefaults(a, { collection: 'DEFAULT', variable: 'COUNT' });
        let theItem;
        if(a.holder !== undefined) {
          if(this.isValidID(a.holder,problems)) {
            variables[a.variable] = widgets.get(a.holder).children().length;
            theItem = `${a.holder}`;
          }
        } else if(isValidCollection(a.collection)) {
          variables[a.variable] = collections[a.collection].length;
          theItem = `${a.collection}`
        }
        if(jeRoutineLogging)
            jeLoggingRoutineOperationSummary( `'${theItem}'`, `${JSON.stringify(variables[a.variable])}`)

      }

      if(a.func == 'DELETE') {
        setDefaults(a, { collection: 'DEFAULT' });
        if(isValidCollection(a.collection)) {
          for(const w of collections[a.collection]) {
            await removeWidgetLocal(w.get('id'));
            for(const c in collections)
              collections[c] = collections[c].filter(x=>x!=w);
          }
          if(jeRoutineLogging)
            jeLoggingRoutineOperationSummary( `'${a.collection}'`)
        }
      }

      if(a.func == 'FLIP') {
        setDefaults(a, { count: 0, face: null, faceCyle: null, collection: 'DEFAULT' });
        if(a.holder !== undefined) {
          if(this.isValidID(a.holder,problems)) {
            await w(a.holder, async holder=>{
              for(const c of holder.children().slice(0, a.count || 999999))
                c.flip && await c.flip(a.face,a.faceCycle);
            });
          }
          if(jeRoutineLogging)
              jeLoggingRoutineOperationSummary(`holder '${a.holder}'`);
        } else if(isValidCollection(a.collection)) {
          if(collections[a.collection].length) {
            for(const c of collections[a.collection].slice(0, a.count || 999999))
              c.flip && await c.flip(a.face,a.faceCycle);
          } else {
            problems.push(`Collection ${a.collection} is empty.`);
          }
          if(jeRoutineLogging)
              jeLoggingRoutineOperationSummary(`collection '${a.collection}'`);
        }
      }

      if(a.func == 'FOREACH') {
        setDefaults(a, { loopRoutine: [], collection: 'DEFAULT' });
        const callWithAdditionalValues = async (addVariables, addCollections)=>{
          const variableBackups = {};
          const collectionBackups = {};
          for(const add in addVariables) {
            variableBackups[add] = variables[add];
            variables[add] = addVariables[add];
          }
          for(const add in addCollections) {
            collectionBackups[add] = collections[add];
            collections[add] = addCollections[add];
          }
          if(jeRoutineLogging)
            jeLoggingRoutineOperationStart( "loopRoutine", "loopRoutine" );
          await this.evaluateRoutine(a.loopRoutine, variables, collections, (depth || 0) + 1, true);
          if(jeRoutineLogging)
            jeLoggingRoutineOperationEnd(problems, variables, collections, false);
          for(const add in addVariables) {
            if(variableBackups[add] !== undefined)
              variables[add] = variableBackups[add];
            else
              delete variables[add];
          }
          for(const add in addCollections) {
            if(collectionBackups[add] !== undefined)
              collections[add] = collectionBackups[add];
            else
              delete collections[add];
          }
        }
        if(a.in) {
          for(const key in a.in)
            await callWithAdditionalValues({ key, value: a.in[key] }, {});
          if(jeRoutineLogging)
            jeLoggingRoutineOperationSummary( `element in '${JSON.stringify(a.in)}'`);
        } else if(isValidCollection(a.collection)) {
          for(const widget of collections[a.collection])
            await callWithAdditionalValues({ widgetID: widget.get('id') }, { DEFAULT: [ widget ] });
          if(jeRoutineLogging)
            jeLoggingRoutineOperationSummary( `widget in '${a.collection}'`);
        }
      }

      if(a.func == 'GET') {
        setDefaults(a, { variable: a.property || 'id', collection: 'DEFAULT', property: 'id', aggregation: 'first', skipMissing: false });
        if(isValidCollection(a.collection)) {
          let c = collections[a.collection];
          if (a.skipMissing)
            c = c.filter(w=>w.get(String(a.property)) !== null && w.get(String(a.property)) !== undefined);
          c = JSON.parse(JSON.stringify(c.map(w=>w.get(String(a.property)))));
          if(c.length) {
            switch(a.aggregation) {
            case 'first':
            case 'last':
              const index = (a.aggregation == 'last') ? c.length -1 : 0;
              variables[a.variable] = (c[index] !== undefined) ? c[index] : null;
              break;
            case 'array':
              variables[a.variable] = c;
              break;
            case 'average':
              variables[a.variable] = c.map(w=>+w).reduce((a, b) => a + b) / c.length;
              break;
            case 'median':
              const mid = Math.floor(c.length / 2);
              const nums = [...c].map(w=>+w).sort((a, b) => a - b);
              variables[a.variable] = c.length % 2 !== 0 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
              break;
            case 'min':
            case 'max':
              variables[a.variable] = Math[a.aggregation](...c);
              break;
            case 'sum':
              variables[a.variable] = c.map(w=>+w).reduce((a, b) => a + b);
              break;
            default:
              problems.push(`Aggregation ${a.aggregation} is unsupported.`);
            }
          } else if(a.aggregation == 'sum') {
            variables[a.variable] = 0;
          } else if(a.aggregation == 'array') {
            variables[a.variable] = [];
          } else {
            problems.push(`Collection ${a.collection} is empty.`);
          }
          if(jeRoutineLogging)
            jeLoggingRoutineOperationSummary(`${a.aggregation} of '${a.property}' in '${a.collection}'`, `'${JSON.stringify(a.variable)}'`);
        }
      }

      if(a.func == 'IF') {
        setDefaults(a, { relation: '==' });
        if (['==', '!=', '<', '<=', '>=', '>'].indexOf(a.relation) < 0) {
          problems.push(`Relation ${a.relation} is unsupported. Using '==' relation.`);
          a.relation = '==';
        }
        if(a.condition !== undefined || a.operand1 !== undefined) {
          let condition = a.condition;
          if (condition === undefined)
            condition = compute(a.relation, null, a.operand1, a.operand2);
          const branch = condition ? 'thenRoutine' : 'elseRoutine';
          if(Array.isArray(a[branch]))
            await this.evaluateRoutine(a[branch], variables, collections, (depth || 0) + 1, true);
          if(jeRoutineLogging) {
            if (a.condition === undefined)
              jeLoggingRoutineOperationSummary(`'${original.operand1}' ${original.relation} '${original.operand2}'`, `${JSON.stringify(condition)}`)
            else
              jeLoggingRoutineOperationSummary(`'${original.condition}'`, `${JSON.stringify(condition)}`)
          }
        } else
          problems.push(`IF operation is missing the 'condition' or 'operand1' parameter.`);
      }

      if(a.func == 'INPUT') {
        try {
          Object.assign(variables, await this.showInputOverlay(a, widgets, variables, problems));
          if(jeRoutineLogging)
            jeLoggingRoutineOperationSummary(`"${a.header}"`,`${JSON.stringify(a.variable)}`);

        } catch(e) {
          problems.push(`Exception: ${e.toString()}`);
          batchEnd();
          return;
        }
      }

      if(a.func == 'LABEL') {
        setDefaults(a, { value: 0, mode: 'set', collection: 'DEFAULT' });
        if([ 'set', 'dec', 'inc', 'append' ].indexOf(a.mode) == -1)
          problems.push(`Warning: Mode ${a.mode} will be interpreted as set.`);
        if(a.label !== undefined) {
          if (this.isValidID(a.label, problems)) {
            await w(a.label, async widget=>{
              await widget.setText(a.value, a.mode, this.get('debug'), problems)
            });
            if(jeRoutineLogging) {
              if(a.mode == 'inc' || a.mode == 'dec')
                jeLoggingRoutineOperationSummary(`${a.mode} '${a.label}' by ${a.value}`)
              else if(a.mode == 'append')
                jeLoggingRoutineOperationSummary(`append '${a.value}' to '${a.label}'`)
              else
                jeLoggingRoutineOperationSummary(`set '${a.label}' to '${a.value}'`)
            }
          }
        } else if(isValidCollection(a.collection)) {
          if(collections[a.collection].length) {
            for(const c of collections[a.collection])
              await c.setText(a.value, a.mode, this.get('debug'), problems);
            if(jeRoutineLogging) {
              if(a.mode == 'inc' || a.mode == 'dec')
                jeLoggingRoutineOperationSummary(`${a.mode} widgets in '${a.collection}' by ${a.value}`)
              else if(a.mode == 'append')
                jeLoggingRoutineOperationSummary(`append '${a.value}' to widgets in '${a.collection}'`)
              else
                jeLoggingRoutineOperationSummary(`set widgets in '${a.collection}' to '${a.value}'`)
            }
          } else {
            problems.push(`Collection ${a.collection} is empty.`);
          }
        }
      }

      if(a.func == 'MOVE') {
        setDefaults(a, { count: 1, face: null });
        const count = a.count || 999999;

        if(this.isValidID(a.from, problems) && this.isValidID(a.to, problems)) {
          await w(a.from, async source=>await w(a.to, async target=>{
            for(const c of source.children().slice(0, count).reverse()) {
              if(a.face !== null && c.flip)
                c.flip(a.face);
              if(source == target) {
                await c.bringToFront();
              } else {
				c.oldParent = await this.parentIDIfPile(c);
                await c.moveToHolder(target);
              }
            }
          }));
          if(jeRoutineLogging) {
            const count = a.count==1 ? '1 widget' : `${a.count} widgets`;
            jeLoggingRoutineOperationSummary(`${count} from '${a.from}' to '${a.to}'`)
          }
        }
      }

      if(a.func == 'MOVEXY') {
        setDefaults(a, { count: 1, face: null, x: 0, y: 0 });
        if(this.isValidID(a.from, problems)) {
          await w(a.from, async source=>{
            for(const c of source.children().slice(0, a.count || 999999).reverse()) {
              if(a.face !== null && c.flip)
                c.flip(a.face);
              await c.set('parent', null);
              await c.bringToFront();
              await c.setPosition(a.x, a.y, a.z || c.get('z'));
              await c.updatePiles();
            }
          });
          if(jeRoutineLogging) {
            const count = a.count==1 ? '1 widget' : `${a.count} widgets`;
            jeLoggingRoutineOperationSummary(`${count} from '${a.from}' to (${a.x}, ${a.y})`)
          }
        }
      }

      if(a.func == 'RECALL') {
        setDefaults(a, { owned: true });
        if(this.isValidID(a.holder, problems)) {
          for(const holder of toA(a.holder)) {
            const decks = widgetFilter(w=>w.get('type')=='deck'&&w.get('parent')==holder);
            if(decks.length) {
              for(const deck of decks) {
                let cards = widgetFilter(w=>w.get('deck')==deck.get('id'));
                if(!a.owned)
                  cards = cards.filter(c=>!c.get('owner'));
                for(const c of cards) {
					c.oldParent = await this.parentIDIfPile(c);
					await c.moveToHolder(widgets.get(holder));
				}
              }
            } else {
              problems.push(`Holder ${holder} does not have a deck.`);
            }
          };
          if(jeRoutineLogging) {
            jeLoggingRoutineOperationSummary(`'${a.holder}' ${a.owned ? ' (including hands)' : ''}`)
          }
        }
      }

      if(a.func == 'ROTATE') {
        setDefaults(a, { count: 1, angle: 90, mode: 'add', collection: 'DEFAULT' });
        const mode = a.mode == 'set' ? 'to' : 'by';
        if(a.holder !== undefined) {
          if(this.isValidID(a.holder, problems)) {
            await w(a.holder, async holder=>{
              for(const c of holder.children().slice(0, a.count || 999999))
                await c.rotate(a.angle, a.mode);
            });
            if(jeRoutineLogging) {
              jeLoggingRoutineOperationSummary(`${a.count == 0 ? '' : a.count} ${a.count==1 ? 'widget' : 'widgets'} in '${a.holder}' ${mode} ${a.angle}`);
            }
          }
        } else if(isValidCollection(a.collection)) {
          if(collections[a.collection].length) {
            for(const c of collections[a.collection].slice(0, a.count || 999999))
              await c.rotate(a.angle, a.mode);
            if(jeRoutineLogging) {
              jeLoggingRoutineOperationSummary(`${a.count == 0 ? '' : a.count} ${a.count==1 ? 'widget' : 'widgets'} in '${a.collection}' ${mode} ${angle}`);
            }
          } else {
            problems.push(`Collection ${a.collection} is empty.`);
          }
        }
      }

      if(a.func == 'SELECT') {
        setDefaults(a, { type: 'all', property: 'parent', relation: '==', value: null, max: 999999, collection: 'DEFAULT', mode: 'set', source: 'all' });
        if(a.source == 'all' || isValidCollection(a.source)) {
          if([ 'add', 'set' ].indexOf(a.mode) == -1)
            problems.push(`Warning: Mode ${a.mode} interpreted as set.`);
          let c = (a.source == 'all' ? Array.from(widgets.values()) : collections[a.source]).filter(function(w) {
            if(w.isBeingRemoved)
              return false;
            if(a.type != 'all' && (w.get('type') != a.type && (a.type != 'card' || w.get('type') != 'pile')))
              return false;
            if(a.relation === '<')
              return w.get(a.property) < a.value;
            else if(a.relation === '<=')
              return w.get(a.property) <= a.value;
            else if(a.relation === '!=')
              return w.get(a.property) != a.value;
            else if(a.relation === '>=')
              return w.get(a.property) >= a.value;
            else if(a.relation === '>')
              return w.get(a.property) > a.value;
            else if(a.relation === 'in' && Array.isArray(a.value))
              return a.value.indexOf(w.get(a.property)) != -1;
            if(a.relation != '==')
              problems.push(`Warning: Relation ${a.relation} interpreted as ==.`);
            return w.get(a.property) === a.value;
          }).slice(0, a.max).concat(a.mode == 'add' ? collections[a.collection] || [] : []);

          // resolve piles
          if(a.type != 'pile') {
            c.filter(w=>w.get('type')=='pile').forEach(w=>c.push(...w.children()));
            c = c.filter(w=>w.get('type')!='pile');
          }
          collections[a.collection] = [...new Set(c)];

          if(a.sortBy)
            await this.sortWidgets(collections[a.collection], a.sortBy.key, a.sortBy.reverse, a.sortBy.locales, a.sortBy.options);

          if(jeRoutineLogging) {
            let selectedWidgets = collections[a.collection].map(w=>w.get('id')).join(',');
            if(!collections[a.collection].length || collections[a.collection].length >= 5)
              selectedWidgets = `(${collections[a.collection].length} widgets)`;
            jeLoggingRoutineOperationSummary(`widgets ${a.type == 'all' ? '' : 'a.type'} with '${a.property}' ${a.relation} ${JSON.stringify(a.value)} from '${a.source}'`, `${a.mode} ${JSON.stringify(a.collection)} = ${selectedWidgets}`);
          }
        }
      }

      if(a.func == 'SET') {
        setDefaults(a, { collection: 'DEFAULT', property: 'parent', relation: '=', value: null });
        if(a.relation == '==') {
          problems.push(`Warning: Relation == interpreted as =`);
          a.relation = '=';
        }
        if((a.property == 'parent' || a.property == 'deck') && a.value !== null && !widgets.has(a.value)) {
          problems.push(`Tried setting ${a.property} to ${a.value} which doesn't exist.`);
        } else if (a.property == 'id' && isValidCollection(a.collection)) {
          for(const oldWidget of collections[a.collection]) {
            const oldState = JSON.stringify(oldWidget.state);
            const oldID = oldWidget.get('id');
            var newState = JSON.parse(oldState);

            newState.id = compute(a.relation, null, oldWidget.get(a.property), a.value);
            if(!widgets.has(newState.id)) {
              $('#editWidgetJSON').dataset.previousState = oldState;
              $('#editWidgetJSON').value = JSON.stringify(newState);
              await onClickUpdateWidget(false);
              for(const c in collections)
                collections[c] = collections[c].map(w=>w.id==oldID ? widgets.get(newState.id) : w);
              sendDelta(true);
            } else {
              problems.push(`id ${newState.id} already in use, ignored.`);
            }
          }
        } else if(isValidCollection(a.collection)) {
          for(const w of collections[a.collection]) {
							if(a.property == 'parent') 
								w.oldParent = await this.parentIDIfPile(w);
            await w.set(String(a.property), compute(a.relation, null, w.get(String(a.property)), a.value));
          }
        }
        if(jeRoutineLogging)
          jeLoggingRoutineOperationSummary(`'${a.property}' ${a.relation} '${a.value}' for widgets in '${a.collection}'`);
      }

      if(a.func == 'SHUFFLE') {
        setDefaults(a, { collection: 'DEFAULT' });
        if(a.holder !== undefined) {
          if(this.isValidID(a.holder, problems)) {
            await w(a.holder, async holder=>{
              for(const c of holder.children())
                await c.set('z', Math.floor(Math.random()*10000));
              await holder.updateAfterShuffle();
            });
            if(jeRoutineLogging)
              jeLoggingRoutineOperationSummary(`holder ${a.holder}`);
          }
        } else if(isValidCollection(a.collection)) {
          if(collections[a.collection].length) {
            for(const c of collections[a.collection])
              await c.set('z', Math.floor(Math.random()*10000));
          } else {
            problems.push(`Collection ${a.collection} is empty.`);
          }
          if(jeRoutineLogging)
              jeLoggingRoutineOperationSummary(`collection '${a.collection}'`);
        }
      }

      if(a.func == 'SORT') {
        setDefaults(a, { key: 'value', reverse: false, collection: 'DEFAULT' });
        let reverse = a.reverse ? 'in reverse' : '';
        if(a.holder !== undefined) {
          if(this.isValidID(a.holder, problems)) {
            await w(a.holder, async holder=>{
              await this.sortWidgets(holder.children(), a.key, a.reverse, a.locales, a.options, true);
              await holder.updateAfterShuffle();
            });
          }
          if(jeRoutineLogging)
            jeLoggingRoutineOperationSummary(`widgets in '${a.holder}' by '${a.key}' ${reverse}`);
        } else if(isValidCollection(a.collection)) {
          if(collections[a.collection].length) {
            await this.sortWidgets(collections[a.collection], a.key, a.reverse, a.locales, a.options, true);
            await w(collections[a.collection].map(i=>i.get('parent')), async holder=>{
              if(holder.get('type') == 'holder')
                await holder.updateAfterShuffle();
            });
          } else {
            problems.push(`Collection ${a.collection} is empty.`);
          }
          if(jeRoutineLogging)
            jeLoggingRoutineOperationSummary(`widgets in '${a.collection}' by '${a.key}' ${reverse}`);
        }
      }

      if(a.func == 'TIMER') {
        setDefaults(a, { value: 0, seconds: 0, mode: 'toggle', collection: 'DEFAULT' });
        if([ 'set', 'dec', 'inc', 'reset','pause', 'start', 'toggle' ].indexOf(a.mode) == -1) {
          problems.push(`Warning: Mode ${a.mode} interpreted as toggle.`);
          a.mode = 'toggle'
        }
        if([ 'set', 'dec', 'inc'].indexOf(a.mode) == -1){
          if(a.timer !== undefined) {
            if (this.isValidID(a.timer, problems)) {
              await w(a.timer, async widget=>{
                if(widget.setPaused)
                  await widget.setPaused(a.mode);
              });
            }
          } else if(isValidCollection(a.collection)) {
            if(collections[a.collection].length) {
              for(const c of collections[a.collection])
                if(c.setPaused)
                  await c.setPaused(a.mode);
            } else {
              problems.push(`Collection ${a.collection} is empty.`);
            }
          }
        };
        if(['set', 'dec', 'inc', 'reset' ].indexOf(a.mode) != -1){
          if(a.timer !== undefined) {
            if (this.isValidID(a.timer, problems)) {
              await w(a.timer, async widget=>{
                if(widget.setMilliseconds)
                  await widget.setMilliseconds(a.seconds*1000 || a.value, a.mode);
              });
            }
          } else if(isValidCollection(a.collection)) {
            if(collections[a.collection].length) {
              for(const c of collections[a.collection])
                if(c.setMilliseconds)
                  await c.setMilliseconds(a.seconds*1000 || a.value, a.mode);
            } else {
              problems.push(`Collection ${a.collection} is empty.`);
            }
          }
        };
        if(jeRoutineLogging &&
           (a.timer != undefined || (isValidCollection(a.collection) && collections[a.collection].length))) {
          const phrase = (a.timer == undefined) ? `timers in '${a.collection}'` : `'${a.timer}'`;
          if(a.mode == 'set')
            jeLoggingRoutineOperationSummary(`${phrase} to ${a.value}`)
          else if(a.mode == 'inc' || a.mode == 'dec')
            jeLoggingRoutineOperationSummary(`${phrase} by ${a.value}`)
          else
            jeLoggingRoutineOperationSummary(`${a.mode} ${phrase}`)
        }
      }

      if(jeRoutineLogging) jeLoggingRoutineOperationEnd(problems, variables, collections, false);

      if(!jeRoutineLogging && problems.length)
        console.log(problems);
    }

    if(jeRoutineLogging) jeLoggingRoutineEnd(variables, collections);

    batchEnd();

    if(variables.playerColor != playerColor && typeof variables.playerColor == 'string' && variables.playerColor.match(/^#[0-9a-fA-F]{6}$/)) {
      toServer('playerColor', { player: playerName, color: variables.playerColor });
      playerColor = variables.playerColor;
    }
    if(variables.playerName != playerName && typeof variables.playerName == 'string') {
      toServer('rename', { oldName: playerName, newName: variables.playerName });
      playerName = variables.playerName;
    }

    return { variable: variables.result, collection: collections.result || [] };
  }

  hideEnlarged() {
    $('#enlarged').classList.add('hidden');
  }

  isValidID(id, problems) {
    if(Array.isArray(id))
      return !id.map(i=>this.isValidID(i, problems)).filter(r=>r!==true).length;
    if(widgets.has(id))
      return true;
    problems.push(`Widget ID ${id} does not exist.`);
  }

  async moveToHolder(holder) {
    await this.bringToFront();
    if(this.get('parent') && !this.currentParent)
      this.currentParent = widgets.get(this.get('parent'));
    if(this.currentParent != holder)
      await this.checkParent(true);

    await this.set('owner',  null);
	
	var dropLimit = holder.get('dropLimit')
	var childArray = holder.childArray.filter(w=>w.get('type')!='deck')
	var notPiles = childArray.filter(w=>w.get('type')!='pile')
	var piles = childArray.filter(w=>w.get('type')=='pile')
	var pileChildren=[];
	var thirteen = piles.forEach(w=>pileChildren.push(...w.children()))
	var holderChildren = pileChildren.length + notPiles.length
	if(dropLimit == -1 || dropLimit >= (holderChildren + Math.max(this.childArray.length, 1)) || (this.get('parent') == this.get('oldParent') && (this.get('parent') != null)))
		await this.set('parent', holder.get('id'));
  }
  
  async parentIDIfPile(widget){
	  if(widget) {
		  if(widget.parent !== undefined) {
			  if (widget.parent.get('type') == 'pile')
				  return widget.parent.get('parent');
			  else
				  return widget.get('parent')
			  }
			  else return null
			  }
	  else if (this.parent != undefined) {
		  if (this.parent.get('type') == 'pile')
			  return this.parent.get('parent');
		  else
			  return this.get('parent')
		  }
		  else return null
		  }	

  async moveStart() {
    if(tracingEnabled)
      sendTraceEvent('moveStart', { id: this.get('id') });
  
  this.oldParent = await this.parentIDIfPile();

    await this.bringToFront();

    if(!this.get('fixedParent')) {
      this.dropTargets = this.validDropTargets();
      this.currentParent = widgets.get(this.get('parent'));
      this.hoverTargetDistance = 99999;
      this.hoverTarget = null;

      this.disablePileUpdateAfterParentChange = true;
      await this.set('parent', null);
      delete this.disablePileUpdateAfterParentChange;

      for(const t of this.dropTargets)
        t.domElement.classList.add('droppable');
    }
  }

  async move(x, y) {
    let newX = (jeZoomOut ? x : Math.max(0-this.get('width' )*0.25, Math.min(1600+this.get('width' )*0.25, x))) - this.get('width' )/2;
    let newY = (jeZoomOut ? y : Math.max(0-this.get('height')*0.25, Math.min(1000+this.get('height')*0.25, y))) - this.get('height')/2;

    if(this.get('fixedParent') && widgets.has(this.get('parent'))) {
      newX -= widgets.get(this.get('parent')).absoluteCoord('x');
      newY -= widgets.get(this.get('parent')).absoluteCoord('y');
    }

    if(tracingEnabled)
      sendTraceEvent('move', { id: this.get('id'), x, y, newX, newY });

    await this.setPosition(newX, newY, this.get('z'));

    if(!this.get('fixedParent')) {
      const myCenter = center(this.domElement);
      await this.checkParent();

      this.hoverTargetChanged = false;
      if(this.hoverTarget) {
        if(overlap(this.domElement, this.hoverTarget.domElement)) {
          this.hoverTargetDistance = distance(myCenter, this.hoverTargetCenter);
        } else {
          this.hoverTargetDistance = 99999;
          this.hoverTarget = null;
          this.hoverTargetChanged = true;
        }
      }

      for(const t of this.dropTargets) {
        const tCenter = center(t.domElement);
        const d = distance(myCenter, tCenter);
        if(d < this.hoverTargetDistance) {
          if(overlap(this.domElement, t.domElement)) {
            this.hoverTargetChanged = this.hoverTarget != t;
            this.hoverTarget = t;
            this.hoverTargetCenter = tCenter;
            this.hoverTargetDistance = d;
          }
        }
      }

      if(this.hoverTargetChanged) {
        if(this.lastHoverTarget)
          this.lastHoverTarget.domElement.classList.remove('droptarget');
        if(this.hoverTarget)
          this.hoverTarget.domElement.classList.add('droptarget');
        this.lastHoverTarget = this.hoverTarget;
      }
    }
  }

  async moveEnd() {
    if(tracingEnabled)
      sendTraceEvent('moveEnd', { id: this.get('id') });

    if(!this.get('fixedParent')) {
      for(const t of this.dropTargets)
        t.domElement.classList.remove('droppable');

      await this.checkParent();  

      if(this.hoverTarget) {
        await this.moveToHolder(this.hoverTarget);
        this.hoverTarget.domElement.classList.remove('droptarget');
      }
	  var one = this.get('parent');
	  var two = this.oldParent;
	  
	  if(this.get('parent') != this.oldParent && this.oldParent != null) {
		  const oldParent = widgets.get(this.oldParent);
		  if(oldParent.get('type') == 'holder') {
			  //let children = await this.childrenIfPile();
			  await oldParent.evaluateRoutine('leaveRoutine', {}, { child: [ this ] });
		  }
	  }	
    }
    await this.updatePiles();
  }

  async onChildAdd(child, oldParentID) {
    this.childArray = this.childArray.filter(c=>c!=child);
    this.childArray.push(child);
    await this.onChildAddAlign(child, oldParentID);
  }

  async onChildAddAlign(child, oldParentID) {
    let childX = child.get('x');
    let childY = child.get('y');

    if(!oldParentID) {
      childX -= this.absoluteCoord('x');
      childY -= this.absoluteCoord('y');
    }

    if(this.get('alignChildren'))
      await child.setPosition(this.get('dropOffsetX'), this.get('dropOffsetY'), child.get('z'));
    else
      await child.setPosition(childX, childY, child.get('z'));
  }

  async onChildRemove(child) {
    this.childArray = this.childArray.filter(c=>c!=child);
    this.applyZ();
  }

  async onPropertyChange(property, oldValue, newValue) {
    if(property == 'parent') {
      if(oldValue) {
        const oldParent = widgets.get(oldValue);
        await oldParent.onChildRemove(this);
      }
      if(newValue) {
        const newParent = widgets.get(newValue);
        await newParent.onChildAdd(this, oldValue);
        if(Array.isArray(newParent.get('enterRoutine'))) {
			if(newValue != this.oldParent) {
				if(this.get('type') == 'pile') { 
				let arr = this.childArray;
				for (let i = 0; i < arr.length; i++) {
					await newParent.evaluateRoutine('enterRoutine', { oldParentID: [  ] }, { child: [ arr[i] ] });
					}
				}						
				else
					await newParent.evaluateRoutine('enterRoutine', { oldParentID: [this.oldParent] }, { child: [ this ] });
			}
		}
      }
      if(!this.disablePileUpdateAfterParentChange)
        await this.updatePiles();
    }
  }

  async rotate(degrees, mode) {
    if(!mode || mode == 'add')
      await this.set('rotation', (this.get('rotation') + degrees) % 360);
    else
      await this.set('rotation', degrees);
  }

  async setPosition(x, y, z) {
    if(this.get('grid').length && !this.get('parent')) {
      let closest = null;
      let closestDistance = 999999;

      for(const grid of this.get('grid')) {
        if(x < (grid.minX || -99999) || x > (grid.maxX || 99999))
          continue;
        if(y < (grid.minY || -99999) || y > (grid.maxY || 99999))
          continue;
        const distance = ((x + grid.x/2 - (grid.offsetX || 0)) % grid.x) + ((y + grid.y/2 - (grid.offsetY || 0)) % grid.y);
        if(distance < closestDistance) {
          closest = grid;
          closestDistance = distance;
        }
      }

      if(closest) {
        x = x + closest.x/2 - (x - (closest.offsetX || 0)) % closest.x;
        y = y + closest.y/2 - (y - (closest.offsetY || 0)) % closest.y;
        for(const p in closest)
          if([ 'x', 'y', 'minX', 'minY', 'maxX', 'maxY', 'offsetX', 'offsetY' ].indexOf(p) == -1)
            await this.set(p, closest[p]);
      }

      this.snappingToGrid = false;
    }
    await super.setPosition(x, y, z);
  }

  async setText(text, mode, debug, problems) {
    if (this.get('text') !== undefined) {
      if(mode == 'inc' || mode == 'dec')
        await this.set('text', (parseInt(this.get('text')) || 0) + (mode == 'dec' ? -1 : 1) * text);
      else if(mode == 'append')
        await this.set('text', this.get('text') + text);
      else if(Array.isArray(text))
        await this.set('text', text.join(', '));
      else if(typeof text == 'string' && text.match(/^[-+]?[0-9]+(\.[0-9]+)?$/))
        await this.set('text', +text);
      else
        await this.set('text', text);
    } else
      problems.push(`Tried setting text property which doesn't exist for ${this.id}.`);
  }

  showEnlarged(event) {
    if(this.get('enlarge')) {
      const e = $('#enlarged');
      e.innerHTML = this.domElement.innerHTML;
      e.className = this.domElement.className;
      e.dataset.id = this.get('id');
      e.style.cssText = this.domElement.style.cssText;
      e.style.display = this.domElement.style.display;
      e.style.transform = `scale(calc(${this.get('enlarge')} * var(--scale)))`;
      if(this.domElement.getBoundingClientRect().left < window.innerWidth/2)
        e.classList.add('right');
    }
    if(event)
      event.preventDefault();
  }

  async showInputOverlay(o, widgets, variables, problems) {
    return new Promise((resolve, reject) => {

      $('#buttonInputOverlay h1').textContent = o.header || "Button Input";
      $('#buttonInputFields').innerHTML = '';

      for(const field of o.fields) {
        const dom = document.createElement('div');
        formField(field, dom, this.get('id') + ';' + field.variable);
        $('#buttonInputFields').appendChild(dom);
      }

      const goHandler = e=>{
        this.evaluateInputOverlay(o, resolve, reject, true)
        $('#buttonInputGo').removeEventListener('click', goHandler);
        $('#buttonInputCancel').removeEventListener('click', cancelHandler);
      };
      const cancelHandler = e=>{
        this.evaluateInputOverlay(o, resolve, reject, false)
        $('#buttonInputGo').removeEventListener('click', goHandler);
        $('#buttonInputCancel').removeEventListener('click', cancelHandler);
      };
      on('#buttonInputGo', 'click', goHandler);
      on('#buttonInputCancel', 'click', cancelHandler);
      showOverlay('buttonInputOverlay');
    });
  }

  async sortWidgets(w, key, reverse, locales, options, rearrange) {
    let z = 1;
    let children = w.reverse().sort((w1,w2)=>{
      if(typeof w1.get(key) == 'number')
        return w1.get(key) - w2.get(key);
      else
        return w1.get(key).localeCompare(w2.get(key), locales, options);
    });
    if(reverse)
      children = children.reverse();
    if(rearrange)
      for(const c of children)
        await c.set('z', ++z);
  }

  supportsPiles() {
    return true;
  }

  updateOwner() {
    this.domElement.className = this.classes();
  }

  async updatePiles() {
    if(this.isBeingRemoved || this.get('parent') && !widgets.get(this.get('parent')).supportsPiles())
      return;

    for(const [ widgetID, widget ] of widgets) {
      // check if this widget is closer than 10px from another widget in the same parent
      if(widget != this && widget.get('parent') == this.get('parent') && Math.abs(widget.get('x')-this.get('x')) < 10 && Math.abs(widget.get('y')-this.get('y')) < 10) {
        if(widget.get('owner') !== this.get('owner') || widget.isBeingRemoved)
          continue;

        // if a card gets dropped onto a card, they create a new pile and are added to it
        if(widget.get('type') == 'card' && this.get('type') == 'card') {
          const pile = {
            type: 'pile',
            parent: this.get('parent'),
            x: widget.get('x'),
            y: widget.get('y'),
            width: this.get('width'),
            height: this.get('height')
          };
          if(this.get('owner') !== null)
            pile.owner = this.get('owner');
          addWidgetLocal(pile);
          await this.set('parent', pile.id);
          await widget.set('parent', pile.id);
          break;
        }

        // if a pile gets dropped onto a pile, all children of one pile are moved to the other (the empty one destroys itself)
        if(widget.get('type') == 'pile' && this.get('type') == 'pile') {
          for(const w of this.children().reverse()) {
            await w.set('parent', widget.get('id'));
            await w.bringToFront();
          }
          break;
        }

        // if a pile gets dropped onto a card, the card is added to the pile but the pile is moved to the original position of the card
        if(widget.get('type') == 'card' && this.get('type') == 'pile') {
          for(const w of this.children().reverse())
            await w.bringToFront();
          await this.set('x', widget.get('x'));
          await this.set('y', widget.get('y'));
          await widget.set('parent', this.get('id'));
          break;
        }

        // if a card gets dropped onto a pile, it simply gets added to the pile
        if(widget.get('type') == 'pile' && this.get('type') == 'card') {
          await this.bringToFront();
          await this.set('parent', widget.get('id'));
          break;
        }
      }
    }
  }

  validDropTargets() {
    return getValidDropTargets(this);
  }
}
