import { $, removeFromDOM, asArray, escapeID, mapAssetURLs } from '../domhelpers.js';
import { StateManaged } from '../statemanaged.js';
import { playerName, playerColor, activePlayers } from '../overlays/players.js';
import { batchStart, batchEnd, widgetFilter, widgets } from '../serverstate.js';
import { showOverlay, shuffleWidgets, sortWidgets } from '../main.js';
import { tracingEnabled } from '../tracing.js';
import { center, distance, overlap, getOffset, getElementTransform, getScreenTransform, getPointOnPlane, dehomogenize } from '../geometry.js';

const readOnlyProperties = new Set([
  '_absoluteRotation',
  '_absoluteScale',
  '_absoluteX',
  '_absoluteY',
  '_ancestor',
  '_centerAbsoluteX',
  '_centerAbsoluteY',
  '_localOriginAbsoluteX',
  '_localOriginAbsoluteY'
]);

export class Widget extends StateManaged {
  constructor(id) {
    const div = document.createElement('div');
    div.id = 'w_' + escapeID(id);
    super();
    this.id = id;
    this.domElement = div;
    this.childArray = [];
    this.propertiesUsedInCSS = [];

    if(StateManaged.inheritFromMapping[id] === undefined)
      StateManaged.inheritFromMapping[id] = [];

    this.addDefaults({
      x: 0,
      y: 0,
      z: 0,
      width: 100,
      height: 100,
      layer: 0,
      borderRadius: null,
      rotation: 0,
      scale: 1,

      typeClasses: 'widget',
      classes: '',
      css: '',
      movable: true,
      movableInEdit: true,
      clickable: true,
      clickSound: null,

      grid: [],
      enlarge: false,
      overlap: true,
      ignoreOnLeave: false,

      parent: null,
      fixedParent: false,
      inheritFrom: null,
      owner: null,
      dragging: null,
      dropOffsetX: 0,
      dropOffsetY: 0,
      inheritChildZ: false,
      hoverTarget: null,

      linkedToSeat: null,
      onlyVisibleForSeat: null,
      hoverInheritVisibleForSeat: true,

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
    this.domElement.addEventListener('mousedown',  e => this.selected(), false);
    this.domElement.addEventListener('mouseup',  e => this.notSelected(), false);
    this.domElement.addEventListener("touchstart", e => this.touchstart(), false);
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
    return this.coordGlobalFromCoordParent({x:this.get('x'),y:this.get('y')})[coord]
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

  applyChildZ(child, previousZ) {
    if(this.get('inheritChildZ') && (this.z == previousZ || child.z > this.z))
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
        this.domElement.style.cssText = mapAssetURLs(this.css());
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
    if(delta.audio !== null)
      this.addAudio(this);

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
        StateManaged.globalUpdateListeners[property] = StateManaged.globalUpdateListeners[property].filter(x=>x[0]!=this);
        if(Array.isArray(delta[key]))
          StateManaged.globalUpdateListeners[property].push([ this, key ]);
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

  applyInheritedValuesToDOM(inheritFrom, pushasArray) {
    const delta = {};
    for(const [ id, properties ] of Object.entries(inheritFrom).reverse()) {
      if(widgets.has(id)) {
        const w = widgets.get(id);
        if(w.state.inheritFrom)
          this.applyInheritedValuesToDOM(w.inheritFrom());
        this.applyInheritedValuesToObject(properties, w.state, delta, this);
      }

      if(pushasArray) {
        if(StateManaged.inheritFromMapping[id] === undefined)
          StateManaged.inheritFromMapping[id] = [];
        StateManaged.inheritFromMapping[id].push(this);
      }
    }
    this.applyDeltaToDOM(delta);
  }

  applyRemove() {
    if(this.get('parent') && widgets.has(this.get('parent')))
      widgets.get(this.get('parent')).applyChildRemove(this);
    if(this.get('deck') && widgets.has(this.get('deck')))
      widgets.get(this.get('deck')).removeCard(this);
    if($(`#STYLES_${escapeID(this.id)}`))
      removeFromDOM($(`#STYLES_${escapeID(this.id)}`));
    removeFromDOM(this.domElement);
    this.inheritFromUnregister();
    this.globalUpdateListenersUnregister();
  }

  applyRemoveRecursive() {
    for(const child of Widget.prototype.children.call(this)) // use Widget.children even for holders so it doesn't filter
      child.applyRemoveRecursive();
    this.applyRemove();
  }

  applyZ(force) {
    if(force || this.get('inheritChildZ')) {
      this.domElement.style.zIndex = this.calculateZ();
    }
  }

  async bringToFront() {
    await this.set('z', getMaxZ(this.get('layer')) + 1);
  }

  calculateZ() {
    const pZ = this.z;
    this.z = ((this.get('layer') + 10) * 100000) + this.get('z');
    if(this.get('inheritChildZ'))
      for(const child of this.childrenOwned())
        this.z = Math.max(this.z, child.z);
    if (this.z != pZ) {
      if(this.get('parent') && widgets.has(this.get('parent')))
        widgets.get(this.get('parent')).applyChildZ(this, pZ);
    }
    return this.z;
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
      if(this.currentParent.get('childrenPerOwner'))
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

    let onlyVisibleForSeat = this.get('onlyVisibleForSeat');

    // If the element is currently being dragged we may inherit restricted seat visibility.
    const hoverTarget = this.get('hoverTarget') ? widgets.get(this.get('hoverTarget')) : null;
    if (hoverTarget)
      onlyVisibleForSeat = hoverTarget.inheritSeatVisibility(onlyVisibleForSeat);

    let invisible = onlyVisibleForSeat !== null;
    for(const seatID of asArray(onlyVisibleForSeat) || []) {
      if(widgets.has(seatID) && widgets.get(seatID).get('player') == playerName) {
        invisible = false;
        break;
      }
    }
    if(invisible)
      className += ' foreign';

    const linkedToSeat = this.get('linkedToSeat');
    if(linkedToSeat && widgetFilter(w=>w.get('type') == 'seat' && w.get('player') == playerName).length)
      if(!widgetFilter(w=>asArray(linkedToSeat).indexOf(w.get('id')) != -1 && w.get('player')).length)
        className += ' foreign';

    if(typeof this.get('dragging') == 'string')
      className += ' dragging';
    if(this.get('dragging') == playerName)
      className += ' draggingSelf';

    if(this.isHighlighted)
      className += ' selectedInEdit';

    return className;
  }

  classesProperties() {
    return [ 'classes', 'dragging', 'hoverTarget', 'linkedToSeat', 'onlyVisibleForSeat', 'owner', 'typeClasses' ];
  }

  async click(mode='respect') {
    if(tracingEnabled)
      sendTraceEvent('click', { id: this.get('id'), mode });

    if(!this.get('clickable') && !(mode == 'ignoreClickable' || mode =='ignoreAll'))
      return true;

    if(this.get('clickSound'))
      this.set('audio','source: ' + this.get('clickSound') + ', type: audio/mpeg , maxVolume: 1.0, length: null, player: null');

    if(Array.isArray(this.get('clickRoutine')) && !(mode == 'ignoreClickRoutine' || mode =='ignoreAll')) {
      await this.evaluateRoutine('clickRoutine', {}, {});
      return true;
    } else {
      return false;
    }
  }

  coordGlobalFromCoordLocal(coord) {
    return this.coordGlobalFromCoordParent(this.coordParentFromCoordLocal(coord));
  }
  coordGlobalFromCoordParent(coord) {
    const p = this.get('parent');
    return (widgets.has(p)) ? widgets.get(p).coordGlobalFromCoordLocal(coord) : coord;
  }
  coordGlobalInside(coord) {
    const coordLocal = this.coordLocalFromCoordGlobal(coord);
    return coordLocal.x >= 0 && coordLocal.y >= 0 && coordLocal.x <= this.get('width') && coordLocal.y <= this.get('height');
  }
  coordLocalFromCoordClient(coord) {
    const result = getPointOnPlane(getScreenTransform(this.domElement), coord.x, coord.y);
    return result || new DOMPoint();
  }
  coordLocalFromCoordGlobal(coord) {
    return this.coordLocalFromCoordParent(this.coordParentFromCoordGlobal(coord));
  }
  coordLocalFromCoordParent(coord) {
    const result = getPointOnPlane(getElementTransform(this.domElement), coord.x, coord.y);
    return result || new DOMPoint();
  }
  coordParentFromCoordGlobal(coord) {
    const p = this.get('parent');
    return (widgets.has(p)) ? widgets.get(p).coordLocalFromCoordGlobal(coord) : coord;
  }
  coordParentFromCoordLocal(coord) {
    const transform = getElementTransform(this.domElement);
    return dehomogenize(transform.transformPoint(new DOMPoint(coord.x, coord.y)));
  }

  css() {
    this.propertiesUsedInCSS = [];
    if($(`#STYLES_${escapeID(this.id)}`))
      removeFromDOM($(`#STYLES_${escapeID(this.id)}`));
    let css = this.cssReplaceProperties(this.cssAsText(this.get('css')));

    css = this.cssBorderRadius() + css;
    css += '; width:'  + this.get('width')  + 'px';
    css += '; height:' + this.get('height') + 'px';
    css += '; z-index:' + this.calculateZ();
    css += '; transform:' + this.cssTransform();

    return css;
  }

  cssAsText(css, nested = false) {
    if(typeof css == 'object') {
      let cssText = '';
      for(const key in css) {
        if(typeof css[key] == 'object')
          return this.cssToStylesheet(css, nested);
        cssText += `; ${key}: ${css[key]}`;
      }
      return cssText;
    } else {
      return css;
    }
  }

  cssBorderRadius() {
    let br = this.get('borderRadius');
    switch(typeof(br)) {
      case 'number':
        if(br >= 0)
          return `border-radius:${br}px;`;
        else
          return '';
      case 'string':
        br = br.trim().replace(/\s+/g, ' ');
        const value = '(?:0|\\+?(?:\\d+(?:\\.\\d+)?|\\.\\d+)(?:[eE][+-]?\\d+)?(?:px|%))';
        const valueList = `(?:${value}(?: ${value}){0,3})`;
        const re = new RegExp(`^${valueList}(?: ?\\/ ?${valueList})?` + '\x24');
        if(br.match(re))
          return `border-radius:${br};`;
        else
          return '';
      default:
        return ''
    }
  }

  cssProperties() {
    return [ 'borderRadius', 'css', 'height', 'inheritChildZ', 'layer', 'width' ].concat(this.propertiesUsedInCSS);
  }

  cssReplaceProperties(css) {
    for(const match of String(css).matchAll(/\$\{PROPERTY ([A-Za-z0-9_-]+)\}/g)) {
      css = css.replace(match[0], this.get(match[1]));
      this.propertiesUsedInCSS.push(match[1]);
    }
    return css;
  }

  cssToStylesheet(css, nested = false) {
    let styleString = '';
    for(const key in css) {
      let selector = key;
      if(!nested) {
        if(key == 'inline')
          continue;
        if(key == 'default')
          selector = '';
        if(selector.charAt(0) != '@')
          selector = `#w_${escapeID(this.id)}${selector}`;
      }
      styleString += `${selector} { ${mapAssetURLs(this.cssReplaceProperties(this.cssAsText(css[key], true)))} }\n`;
    }

    if(nested)
      return styleString;

    const style = document.createElement('style');
    style.id = `STYLES_${escapeID(this.id)}`;
    style.appendChild(document.createTextNode(styleString));
    $('head').appendChild(style);

    return this.cssAsText(css.inline || '');
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
    if(go) {
      for(const field of o.fields) {
        if(field.type == 'checkbox') {
          result[field.variable] = document.getElementById('INPUT_' + escapeID(this.get('id')) + ';' + field.variable).checked;
        } else if(field.type == 'switch') {
          let thisresult = document.getElementById('INPUT_' + escapeID(this.get('id')) + ';' + field.variable).checked;
          if(thisresult){
            result[field.variable] = 'on';
          } else {
            result[field.variable] = 'off';
          }
        } else if(field.type == 'number') {
          let thisvalue = document.getElementById('INPUT_' + escapeID(this.get('id')) + ';' + field.variable).value;
          if(thisvalue > field.max)
            thisvalue = field.max;
          if(thisvalue < field.min)
            thisvalue = field.min;
          result[field.variable] = thisvalue
        } else if(field.type != 'text' && field.type != 'subtitle' && field.type != 'title') {
          result[field.variable] = document.getElementById('INPUT_' + escapeID(this.get('id')) + ';' + field.variable).value;
        }
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
        if(varContent === null && indexName !== undefined)
          problems.push(`Cannot index a variable that evaluates to 'null'.`);
        return varContent !== null && indexName !== undefined ? varContent[indexName] : varContent;
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

    function getCollection(collection) {
      let newCollection=null;
      if(Array.isArray(collections[collection]))
        newCollection = collection
      else if (Array.isArray(collection)) {
        newCollection = '$collection_' + batchDepth;
        collections[newCollection] = widgetFilter(w=>collection.indexOf(w.id)!=-1);
      } else
        problems.push(`Collection ${collection} does not exist or is not an array.`);
      return newCollection;
    }

    async function w(ids, callback) {
      for(const a of widgetFilter(w=>asArray(ids).indexOf(w.get('id')) != -1))
        await callback(a);
    }

    if(!depth && (this.isBeingRemoved || this.inRemovalQueue))
      return;

    batchStart();

    let abortRoutine = false; // Set for CALL with 'return=false' or when INPUT is cancelled.

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
      var problems = [];
      let a = JSON.parse(JSON.stringify(original));
      if(typeof a == 'object')
        a = evaluateVariablesRecursively(a)
      else
        a = original.trim();

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

        const regex      = `^${left} += +(?:${parameter}|(?:${parameter} +)?(🧮)?(${operation})(?: +${parameter})?(?: +${parameter})?(?: +${parameter})?)(?: *|(?: +//.*))?`;

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
          if(index !== undefined && (typeof variables[variable] != 'object' || variables[variable] === null))
            problems.push(`The variable ${variable} is not an object, so indexing it doesn't work.`)
          else if(index !== undefined)
            variables[variable][index] = getValue(variables[variable][index]);
          else
            variables[variable] = getValue(variables[variable]);
          if(jeRoutineLogging) jeLoggingRoutineOperationSummary(a.substr(4), JSON.stringify(variables[variable]));
        } else {
          const comment = a.match(new RegExp('^(?://(.*))?\x24'));
          if (comment) {
            // ignore (but log) blank and comment only lines
            if(jeRoutineLogging) jeLoggingRoutineOperationSummary(comment[1]||'');
          } else {
            problems.push(`String '${a}' could not be interpreted as a valid expression. Please check your syntax and note that many characters have to be escaped.`);
          }
        }
      }

      if(a.func == 'AUDIO') {
        setDefaults(a, { source: '', type: 'audio/mpeg', maxVolume: 1.0, length: null, player: null });
        if(a.source !== undefined) {
          this.set('audio', 'source: ' + a.source + ', type: ' + a.type + ', maxVolume: ' + a.maxVolume + ', length: ' + a.length + ', player: ' + a.player);
        }
      }

      if(a.func == 'CALL') {
        setDefaults(a, { widget: this.get('id'), routine: 'clickRoutine', 'return': true, arguments: {}, variable: 'result', collection: 'result' });
        if(Array.isArray(a.routine)) {
          if(a.routine.length > 1)
            problems.push('Routine parameter must refer to only one routine, first routine executed.');
          a.routine = a.routine[0]
        }
        if(!a.routine.match(/Routine$/)) {
          problems.push('Routine parameters have to end with "Routine".');
        } else if(this.isValidID(a.widget, problems)) {
          if(Array.isArray(a.widget))
            a.widget = a.widget[0];
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
              const theWidget = a.widget != this.get('id') ? `in ${a.widget}` : '';
              if (a.return) {
                let returnCollection = result.collection.map(w=>w.get('id')).join(',');
                if(!result.collection.length || result.collection.length >= 5)
                  returnCollection = `(${result.collection.length} widgets)`;
                jeLoggingRoutineOperationSummary(
                  `${a.routine} ${theWidget} and return variable '${a.variable}' and collection '${a.collection}'`,
                  `${JSON.stringify(variables[a.variable])}; ${returnCollection}`)
              } else {
                jeLoggingRoutineOperationSummary( `${a.routine} ${theWidget} and abort caller processing`)
              }
            }
          }
        }
        if (!a.return)
          abortRoutine = true;
      }

      if(a.func == 'CANVAS') {
        setDefaults(a, { mode: 'reset', x: 0, y: 0, value: 1, color: "#1F5CA6" });

        if([ 'set', 'inc', 'dec', 'change', 'reset', 'setPixel' ].indexOf(a.mode) == -1) {
          problems.push(`Warning: Mode ${a.mode} will be interpreted as inc.`);
          a.mode = 'inc'
        }

        const execute = async function(widget) {
          if(widget.get('type') == 'canvas') {
            if(a.mode == 'setPixel') {
              const res = widget.getResolution();
              if(a.x >= 0 && a.y >= 0 && a.x < res && a.y < res) {
                await widget.setPixel(a.x, a.y, a.value);
              } else {
                problems.push(`Pixel coordinate: (${a.x}, ${a.y}) out of range for resolution: ${res}.`);
              }
            } else if(a.mode == 'set')
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
          } else
            problems.push(`Widget ${widget.get('id')} is not a canvas.`);
        };

        let phrase;

        if(a.canvas !== undefined) {
          a.collection = asArray(a.canvas);
          delete a.canvas
        }
        this.isValidID(a.collection, problems); // Validate widget IDs in collection
        const collection = getCollection(a.collection);
        if(collections[collection] && collections[collection].length) {
          for(const c of collections[collection].slice(0, a.count || 999999))
              await execute(c);
          phrase = `canvas widgets in ${a.collection}`;
        } else {
          problems.push(`Collection ${a.collection} is empty.`);
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
        const collection = getCollection(a.collection);

        if (['respect', 'ignoreClickable', 'ignoreClickRoutine', 'ignoreAll'].indexOf(a.mode) == -1) {
          problems.push(`Mode ${a.mode} is unsupported. Using 'respect' mode.`);
          a.mode = 'respect'
        };
        if(collection) {
          for(let i=0; i<a.count; ++i)
            for(const w of collections[collection])
              await w.click(a.mode);
          if(jeRoutineLogging) {
            const theCount = a.count ? `${a.count} times` : '';
            jeLoggingRoutineOperationSummary( `'${a.collection}' ${theCount}`)
          }
        }
      }

      if(a.func == 'CLONE') {
        setDefaults(a, { source: 'DEFAULT', count: 1, xOffset: 0, yOffset: 0, properties: {}, collection: 'DEFAULT' });
        const source = getCollection(a.source);
        if(source) {
          var c=[];
          for(const w of collections[source]) {
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
              const cWidget = widgets.get(await addWidgetLocal(clone));

              if(parent) {
                // use moveToHolder so that CLONE triggers onEnter and similar features
                cWidget.movedByButton = true;
                await cWidget.moveToHolder(widgets.get(parent));
                delete cWidget.movedByButton;
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
        let collection;
        let theItem;
        if(a.holder !== undefined) {
          variables[a.variable] = 0;
          theItem = `${a.holder}`;
          for (const h of asArray(a.holder))
            variables[a.variable] += this.isValidID(h, problems) ? widgets.get(h).children().length : 0;
        } else if(collection = getCollection(a.collection)) {
          variables[a.variable] = collections[collection].length;
          theItem = `${a.collection}`
        }
        if(jeRoutineLogging)
            jeLoggingRoutineOperationSummary( `'${theItem}'`, `${JSON.stringify(variables[a.variable])}`)

      }

      if(a.func == 'DELETE') {
        setDefaults(a, { collection: 'DEFAULT' });
        const collection = getCollection(a.collection);
        if(collection) {
          for(const w of collections[collection]) {
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
        let collection;
        if(a.holder !== undefined) {
          if(this.isValidID(a.holder,problems)) {
            await w(a.holder, async holder=>{
              for(const c of holder.children().slice(0, a.count || 999999))
                c.flip && await c.flip(a.face,a.faceCycle);
            });
          }
          if(jeRoutineLogging)
              jeLoggingRoutineOperationSummary(`holder '${a.holder}'`);
        } else if(collection = getCollection(a.collection)) {
          if(collections[collection].length) {
            for(const c of collections[collection].slice(0, a.count || 999999))
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
        let collection;
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
            jeLoggingRoutineOperationEnd([], variables, collections, false);
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
            jeLoggingRoutineOperationSummary( `elements in '${JSON.stringify(a.in)}'`);
        } else if(a.range) {
          let range = [...asArray(a.range)];

          if(range.length == 0) {
            problems.push(`Empty range given, [1] used.`);
            range = [1]
          }
          if(range.length == 1)
            range.unshift(1);
          let start = parseFloat(range[0]);
          if(isNaN(start)) {
            problems.push(`Invalid start of range ${JSON.stringify(range[0])}, 1 used`);
            start = 1;
          }

          let end = parseFloat(range[1]);
          if(isNaN(end)) {
            problems.push(`Invalid end of range ${JSON.stringify(range[1])}, 1 used`);
            end = 1;
          }

          if(range.length == 2)
            range.push(end > start ? 1 : -1);
          let step = parseFloat(range[2]);
          if(isNaN(step) || step == 0) {
            step = end > start ? 1 : -1;
            problems.push(`Invalid step value ${JSON.stringify(range[2])}, ${step} used`);
          }

          if(start>end && step>0 || start<end && step<0) {
            step = -step;
            problems.push(`Step ${-step} changed to ${step}`)
          }

          for (let index=start; (step > 0) ? index <= end : index >= end; index += step)
            await callWithAdditionalValues({ value: index });
          if(jeRoutineLogging)
            jeLoggingRoutineOperationSummary( `values in range '${JSON.stringify(a.range)}'`);
        } else if(collection = getCollection(a.collection)) {
          for(const widget of collections[collection])
            await callWithAdditionalValues({ widgetID: widget.get('id') }, { DEFAULT: [ widget ] });
          if(jeRoutineLogging)
            jeLoggingRoutineOperationSummary( `widgets in '${a.collection}'`);
        }
      }

      if(a.func == 'GET') {
        setDefaults(a, { variable: a.property || 'id', collection: 'DEFAULT', property: 'id', aggregation: 'first', skipMissing: false });
        const collection = getCollection(a.collection);
        if(collection) {
          let c = collections[collection];
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
            jeLoggingRoutineOperationSummary(`${a.aggregation} of '${a.property}' in '${a.collection}'`, `var ${a.variable} = ${JSON.stringify(variables[a.variable])}`);
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
              jeLoggingRoutineOperationSummary(`'${original.operand1}' ${a.relation} '${original.operand2}'`, `${JSON.stringify(condition)}`)
            else
              jeLoggingRoutineOperationSummary(`'${original.condition}'`, `${JSON.stringify(condition)}`)
          }
        } else
          problems.push(`IF operation is missing the 'condition' or 'operand1' parameter.`);
      }

      if(a.func == 'INPUT') {
        try {
          Object.assign(variables, await this.showInputOverlay(a, widgets, variables, problems));
          if(jeRoutineLogging) {
            let varList = [];
            let valueList = [];
            a.fields.forEach(f=>{
              if(f.variable) {
                varList.push(f.variable);
                valueList.push(variables[f.variable]);
              }
            });
            jeLoggingRoutineOperationSummary(`${varList.join(', ')}`,`${valueList.join(', ')}`);
          }
        } catch(e) {
          abortRoutine = true;
          if(jeRoutineLogging)
            jeLoggingRoutineOperationSummary("INPUT cancelled");
        }
      }

      if(a.func == 'LABEL') {
        setDefaults(a, { value: 0, mode: 'set', collection: 'DEFAULT' });
        let collection;
        if([ 'set', 'dec', 'inc', 'append' ].indexOf(a.mode) == -1)
          problems.push(`Warning: Mode ${a.mode} will be interpreted as set.`);
        if(a.label !== undefined) {
          if (this.isValidID(a.label, problems)) {
            await w(a.label, async widget=>{
              await widget.setText(a.value, a.mode, problems)
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
        } else if(collection = getCollection(a.collection)) {
          if(collections[collection].length) {
            for(const c of collections[collection])
              await c.setText(a.value, a.mode, problems);
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
              const applyFlip = async function() {
                if(a.face !== null && c.flip)
                  await c.flip(a.face);
              };
              if(source == target) {
                await applyFlip();
                await c.bringToFront();
              } else {
                c.movedByButton = true;
                if(target.get('type') == 'seat') {
                  if(target.get('hand') && target.get('player')) {
                    if(widgets.has(target.get('hand'))) {
                      const targetHand = widgets.get(target.get('hand'));
                      await applyFlip();
                      c.targetPlayer = target.get('player')
                      await c.moveToHolder(targetHand);
                      delete c.targetPlayer
                      c.bringToFront()
                      if(targetHand.get('type') == 'holder')
                        targetHand.updateAfterShuffle(); // this arranges the cards in the new owner's hand
                    } else {
                      problems.push(`Seat ${target.id} declares 'hand: ${target.get('hand')}' which does not exist.`);
                    }
                  } else {
                    problems.push(`Seat ${target.id} is empty or does not define a hand.`);
                  }
                } else {
                  await applyFlip();
                  await c.moveToHolder(target);
                }
                delete c.movedByButton;
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
        setDefaults(a, { count: 1, face: null, x: 0, y: 0, snapToGrid: true });
        if(this.isValidID(a.from, problems)) {
          await w(a.from, async source=>{
            for(const c of source.children().slice(0, a.count || 999999).reverse()) {
              if(a.face !== null && c.flip)
                c.flip(a.face);
              await c.bringToFront();
              await c.setPosition(a.x, a.y, a.z || c.get('z'));
              if(a.snapToGrid)
                await c.snapToGrid();
              await c.set('parent', null);
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
          for(const holder of asArray(a.holder)) {
            const decks = widgetFilter(w=>w.get('type')=='deck'&&w.get('parent')==holder);
            if(decks.length) {
              for(const deck of decks) {
                let cards = widgetFilter(w=>w.get('deck')==deck.get('id'));
                if(!a.owned)
                  cards = cards.filter(c=>!c.get('owner'));
                for(const c of cards)
                  await c.moveToHolder(widgets.get(holder));
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
        let collection;
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
        } else if(collection = getCollection(a.collection)) {
          if(collections[collection].length) {
            for(const c of collections[collection].slice(0, a.count || 999999))
              await c.rotate(a.angle, a.mode);
            if(jeRoutineLogging)
              jeLoggingRoutineOperationSummary(`${a.count == 0 ? '' : a.count} ${a.count==1 ? 'widget' : 'widgets'} in '${a.collection}' ${mode} ${a.angle}`);
          } else {
            problems.push(`Collection ${a.collection} is empty.`);
          }
        }
      }

      if(a.func == 'SELECT') {
        setDefaults(a, { type: 'all', property: 'parent', relation: '==', value: null, max: 999999, collection: 'DEFAULT', mode: 'set', source: 'all' });
        let source;
        if(a.source == 'all' || (source = getCollection(a.source))) {
          if([ 'add', 'set', 'remove', 'intersect' ].indexOf(a.mode) == -1)
            problems.push(`Warning: Mode ${a.mode} interpreted as set.`);
          let c = (a.source == 'all' ? Array.from(widgets.values()) : collections[source]).filter(function(w) {
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
          });

          // resolve piles
          if(a.type != 'pile') {
            c.filter(w=>w.get('type')=='pile').forEach(w=>c.push(...w.children()));
            c = c.filter(w=>w.get('type')!='pile');
          }

          c = c.slice(0, a.max); // a.mode == 'set'
          if(a.mode == 'intersect')
            c = collections[a.collection] ? collections[a.collection].filter(value => c.includes(value)) : [];
          else if(a.mode == 'remove')
            c = collections[a.collection] ? collections[a.collection].filter(value => !c.includes(value)) : [];
          else if(a.mode == 'add')
            c = c.concat(collections[a.collection] || []);

          collections[a.collection] = [...new Set(c)];

          if(a.sortBy)
            await sortWidgets(collections[a.collection], a.sortBy);

          if(jeRoutineLogging) {
            let selectedWidgets = collections[a.collection].map(w=>w.get('id')).join(',');
            if(!collections[a.collection].length || collections[a.collection].length >= 5)
              selectedWidgets = `(${collections[a.collection].length} widgets)`;
            jeLoggingRoutineOperationSummary(`${a.type == 'all' ? '' : a.type} widgets with '${a.property}' ${a.relation} ${JSON.stringify(a.value)} from '${a.source}'`, `${a.mode} ${JSON.stringify(a.collection)} = ${selectedWidgets}`);
          }
        }
      }

      if(a.func == 'SET') {
        setDefaults(a, { collection: 'DEFAULT', property: 'parent', relation: '=', value: null });
        let collection;
        if(a.relation == '==') {
          problems.push(`Warning: Relation == interpreted as =`);
          a.relation = '=';
        }
        if((a.property == 'parent' || a.property == 'deck') && a.value !== null && !widgets.has(a.value)) {
          problems.push(`Tried setting ${a.property} to ${a.value} which doesn't exist.`);
        } else if (readOnlyProperties.has(a.property)) {
          problems.push(`Tried setting read-only property ${a.property}.`);
        } else if (collection = getCollection(a.collection)) {
          if (a.property == 'id') {
            for(const oldWidget of collections[collection]) {
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
              } else {
                problems.push(`id ${newState.id} already in use, ignored.`);
              }
            }
          } else {
            for(const w of collections[collection]) {
              if(a.relation == '+' && w.get(String(a.property)) == null)
                a.relation = '=';
              if(a.relation == '+' && a.value == null)
                problems.push(`null value being appended, SET ignored`);
              else
                await w.set(String(a.property), compute(a.relation, null, w.get(String(a.property)), a.value));
            }
          }
        }
        if(jeRoutineLogging)
          jeLoggingRoutineOperationSummary(`'${a.property}' ${a.relation} '${a.value}' for widgets in '${a.collection}'`);
      }

      if(a.func == 'SHUFFLE') {
        setDefaults(a, { collection: 'DEFAULT' });
        let collection;
        if(a.holder !== undefined) {
          if(this.isValidID(a.holder, problems)) {
            await w(a.holder, async holder=>{
              await shuffleWidgets(holder.children());
              if(holder.get('type') == 'holder')
                await holder.updateAfterShuffle();
            });
            if(jeRoutineLogging)
              jeLoggingRoutineOperationSummary(`holder ${a.holder}`);
          }
        } else if(collection = getCollection(a.collection)) {
          if(collections[collection].length) {
            await shuffleWidgets(collections[collection]);
          } else {
            problems.push(`Collection ${a.collection} is empty.`);
          }
          if(jeRoutineLogging)
              jeLoggingRoutineOperationSummary(`collection '${a.collection}'`);
        }
      }

      if(a.func == 'SORT') {
        setDefaults(a, { key: 'value', reverse: false, collection: 'DEFAULT', rearrange: true });
        let collection;
        let reverse = (a.reverse && !Array.isArray(a.reverse)) ? ' in reverse' : '';
        let key = asArray(a.key).map((k)=>{
          if(k !== null && typeof k.key == 'string')
            return `'${k.key}'${k.reverse ? ' desc' : ''}`;
          return typeof k == 'string' ? `'${k}'` : k;
        }).join(', ');
        if(a.holder !== undefined) {
          if(this.isValidID(a.holder, problems)) {
            await w(a.holder, async holder=>{
              await sortWidgets(holder.children(), a.key, a.reverse, a.locales, a.options, true);
              if(holder.get('type') == 'holder')
                await holder.updateAfterShuffle();
            });
          }
          if(jeRoutineLogging)
            jeLoggingRoutineOperationSummary(`widgets in '${a.holder}' by ${key}${reverse}`);
        } else if(collection = getCollection(a.collection)) {
          if(collections[collection].length) {
            await sortWidgets(collections[collection], a.key, a.reverse, a.locales, a.options, a.rearrange);
            await w(collections[collection].map(i=>i.get('parent')), async holder=>{
              if(holder.get('type') == 'holder')
                await holder.updateAfterShuffle();
            });
          } else {
            problems.push(`Collection ${a.collection} is empty.`);
          }
          if(jeRoutineLogging)
            jeLoggingRoutineOperationSummary(`widgets in '${a.collection}' by ${key}${reverse}`);
        }
      }

      if(a.func == 'TIMER') {
        setDefaults(a, { value: 0, seconds: 0, mode: 'toggle', collection: 'DEFAULT' });
        let collection;
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
          } else if(collection = getCollection(a.collection)) {
            if(collections[collection].length) {
              for(const c of collections[collection])
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
          } else if(collection) {
            if(collections[collection].length) {
              for(const c of collections[collection])
                if(c.setMilliseconds)
                  await c.setMilliseconds(a.seconds*1000 || a.value, a.mode);
            } else {
              problems.push(`Collection ${a.collection} is empty.`);
            }
          }
        };
        if(jeRoutineLogging &&
           (a.timer != undefined || (collection && collections[collection].length))) {
          const phrase = (a.timer == undefined) ? `timers in '${a.collection}'` : `'${a.timer}'`;
          if(a.mode == 'set')
            jeLoggingRoutineOperationSummary(`${phrase} to ${a.value}`);
          else if(a.mode == 'inc' || a.mode == 'dec')
            jeLoggingRoutineOperationSummary(`${phrase} by ${a.value}`);
          else
            jeLoggingRoutineOperationSummary(`${a.mode} ${phrase}`);
        }
      }

      if(a.func == 'TURN') {
        setDefaults(a, { turn: 1, turnCycle: 'forward', source: 'all', collection: 'TURN' });
        if([ 'forward', 'backward', 'random', 'position' ].indexOf(a.turnCycle) == -1) {
          problems.push(`Warning: turnCycle ${a.turnCycle} interpreted as forward.`);
          a.turnCycle = 'forward'
        }
        //copied from select
        let c = (a.source == 'all' ? Array.from(widgets.values()) : collections[a.source]).filter(w=>w.get('type')=='seat');

        //this get the list of valid index
        const indexList = [];
        let previousTurn = 1;
        for(const w of c) {
          if(indexList.indexOf(w.get('index')) == -1 && w.get('player'))
            indexList.push(w.get('index'));
          if(w.get('turn'))
            previousTurn = w.get('index');
        }

        if(indexList.length) {
          indexList.sort((a,b)=>a-b);
          let nextTurnIndex = 0;

          if(a.turnCycle == 'position') {
            if(a.turn == 'first') {
              nextTurnIndex = 0;
            } else if(a.turn == 'last') {
              nextTurnIndex = indexList.length - 1;
            } else if(a.turn > 0) {
              nextTurnIndex = a.turn - 1;
            } else {
              nextTurnIndex = a.turn;
            }
          } else if(a.turnCycle == 'random') {
            nextTurnIndex = Math.floor(Math.random() * indexList.length);
          } else {
            const turnIndexOffset = a.turnCycle == 'forward' ? a.turn : -a.turn;
            nextTurnIndex = indexList.indexOf(previousTurn) + turnIndexOffset;
          }

          //makes sure nextTurnIndex is a valid index of indexList
          nextTurnIndex = Math.floor(nextTurnIndex);
          if(typeof nextTurnIndex != 'number' || !isFinite(nextTurnIndex))
            nextTurnIndex = 0;
          const turn = indexList[mod(nextTurnIndex, indexList.length)];

          collections[a.collection] = [];
          //saves turn into all seats and creates output collection with turn seats
          for(const w of c) {
            await w.set('turn', w.get('index') == turn);
            if(w.get('turn') && w.get('player'))
              collections[a.collection].push(w);
          }

          jeLoggingRoutineOperationSummary(`changed turn of seats from ${previousTurn} to ${turn} - active seats: ${JSON.stringify(indexList)}`);
        } else {
          jeLoggingRoutineOperationSummary(`no active seats found`);
        }
      }

      if(jeRoutineLogging) jeLoggingRoutineOperationEnd(problems, variables, collections, false);

      if(!jeRoutineLogging && problems.length)
        console.log(problems);

      if(abortRoutine)
        break

    } // End iterate over functions in routine

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

    return { variable: variables.result === undefined ? null : variables.result, collection: collections.result || [] };
  }

  get(property) {
    if(!readOnlyProperties.has(property)) {
      return super.get(property);
    } else {
      const p = this.get('parent');
      switch(property) {
        case '_absoluteRotation':
          return this.get('rotation') + (widgets.has(p)? widgets.get(p).get('_absoluteRotation') : 0);
        case '_absoluteScale':
          return this.get('scale') * (widgets.has(p)? widgets.get(p).get('_absoluteScale') : 1);
        case '_absoluteX':
          return this.coordGlobalFromCoordParent({x:this.get('x'),y:this.get('y')})['x'];
        case '_absoluteY':
          return this.coordGlobalFromCoordParent({x:this.get('x'),y:this.get('y')})['y'];
        case '_ancestor':
          return (widgets.has(p) && widgets.get(p).get('type')=='pile') ? widgets.get(p).get('_ancestor') : p;
        case '_centerAbsoluteX':
          return this.coordGlobalFromCoordParent({x:this.get('x')+this.get('width')/2,y:this.get('y')+this.get('height')/2})['x'];
        case '_centerAbsoluteY':
          return this.coordGlobalFromCoordParent({x:this.get('x')+this.get('width')/2,y:this.get('y')+this.get('height')/2})['y'];
        case '_localOriginAbsoluteX':
          return this.coordGlobalFromCoordLocal({x:0,y:0})['x'];
        case '_localOriginAbsoluteY':
          return this.coordGlobalFromCoordLocal({x:0,y:0})['y'];
        default:
          return super.get(property);
      }
    }
  }

  hideEnlarged() {
    if (!this.domElement.className.match(/selected/)) {
      $('#enlarged').classList.add('hidden');
      if($('#enlargeStyle'))
        removeFromDOM($('#enlargeStyle'));
    }
  }

  async addAudio(widget){
    if(widget.get('audio')) {
      const audioString = widget.get('audio');
      const audioArray = audioString.split(/:\s|,\s/);
      const source = audioArray[1];
      const type = audioArray[3];
      const maxVolume = audioArray[5];
      const length = audioArray[7];
      const pName = audioArray[9];

      if(pName == "null" || pName == playerName) {
        var audioElement = document.createElement('audio');
        audioElement.setAttribute('class', 'audio');
        audioElement.setAttribute('src', mapAssetURLs(source));
        audioElement.setAttribute('type', type);
        audioElement.setAttribute('maxVolume', maxVolume);
        audioElement.volume = Math.min(maxVolume * (((10 ** (document.getElementById('volume').value / 96.025)) / 10) - 0.1), 1); // converts slider to log scale with zero = no volume
        document.body.appendChild(audioElement);
        audioElement.play();

        if(length != "null") {
          setInterval(function(){
            if(audioElement.currentTime>=0){
              audioElement.pause();
              clearInterval();
              if(audioElement.parentNode)
                audioElement.parentNode.removeChild(audioElement);
            }}, length);
        } else {
          audioElement.onended = function() {
            audioElement.pause();
            clearInterval();
            if(audioElement.parentNode)
              audioElement.parentNode.removeChild(audioElement);
          };
          audioElement.onerror = function() {
            if(audioElement.parentNode)
              audioElement.parentNode.removeChild(audioElement);
          }
        }
      }
      setInterval(function(){
        widget.set('audio', null);}, 100);
    }
  }

  inheritSeatVisibility(seatVisibility) {
    if (this.get('hoverInheritVisibleForSeat')) {
      const widgetSeatVisibility = this.get('onlyVisibleForSeat');
      if (widgetSeatVisibility) {
        // Filter seatVisibility by current widgets seats.
        if (!seatVisibility) {
          seatVisibility = widgetSeatVisibility;
        } else {
          let filterTo = new Set(asArray(widgetSeatVisibility));
          seatVisibility = asArray(seatVisibility).filter((seatId) => { return filterTo.has(seatId); });
        }
      }
    }
    const thisParent = this.get('parent');
    if (thisParent && widgets.has(thisParent))
      seatVisibility = widgets.get(thisParent).inheritSeatVisibility(seatVisibility);
    return seatVisibility;
  }

  isValidID(id, problems) {
    if(Array.isArray(id))
      return !id.map(i=>this.isValidID(i, problems)).filter(r=>r!==true).length;
    if(widgets.has(id))
      return true;
    problems.push(`Widget ID ${id} does not exist.`);
    return false;
  }

  async moveToHolder(holder) {
    if(this.inRemovalQueue)
      return;

    await this.bringToFront();
    if(this.get('parent') && !this.currentParent)
      this.currentParent = widgets.get(this.get('parent'));
    if(this.currentParent != holder)
      await this.checkParent(true);

    await this.set('owner',  null);
    await this.set('parent', holder.get('id'));
  }

  async moveStart() {
    if(tracingEnabled)
      sendTraceEvent('moveStart', { id: this.get('id') });

    await this.bringToFront();
    await this.set('dragging', playerName);

    if(!this.get('fixedParent')) {
      this.dropTargets = this.validDropTargets();
      this.currentParent = widgets.get(this.get('parent'));
      this.hoverTarget = null;

      this.disablePileUpdateAfterParentChange = true;
      await this.set('parent', null);
      delete this.disablePileUpdateAfterParentChange;

      for(const t of this.dropTargets)
        t.domElement.classList.add('droppable');
    }
  }

  async move(coordGlobal, localAnchor) {
    const coordParent = this.coordParentFromCoordGlobal(coordGlobal);
    const offset = getOffset(this.coordParentFromCoordLocal(localAnchor), {x: this.get('x'), y: this.get('y')})
    const newX = Math.round(coordParent.x + offset.x);
    const newY = Math.round(coordParent.y + offset.y);

    if(tracingEnabled)
      sendTraceEvent('move', { id: this.get('id'), coordGlobal, localAnchor, newX, newY });

    await this.setPosition(newX, newY, this.get('z'));
    await this.snapToGrid();

    if(!this.get('fixedParent')) {
      await this.checkParent();

      const lastHoverTarget = this.hoverTarget;
      const myCenter = center(this.domElement);
      const myMinDim = Math.min(this.get('width'), this.get('height')) * this.get('_absoluteScale');
      this.hoverTarget = null;
      let hitElements = document.elementsFromPoint(myCenter.x, myCenter.y);

      // First, check for elements under the midpoint in order in which they were hit.
      for (let i = 0; i < hitElements.length; i++) {
        let widget = widgets.get(unescapeID(hitElements[i].id.slice(2)));
        if (hitElements[i].classList.contains('droppable') && widget) {
          this.hoverTarget = widget;
          break;
        }
      }
      // Then, look for nearby elements if nothing found in the previous pass.
      if (!this.hoverTarget) {
        let targetDist = 99999;
        for(const t of this.dropTargets) {
          if(overlap(this.domElement, t.domElement)) {
            const tCursor = t.coordGlobalInside(coordGlobal);
            const tDist = distance(center(t.domElement), myCenter) / scale;
            const tMinDim = Math.min(t.get('width'),t.get('height')) * t.get('_absoluteScale');
            const validTarget = (tCursor || tDist <= (myMinDim + tMinDim) / 2);
            const bestTarget = tDist <= targetDist;

            if(validTarget && bestTarget) {
              targetDist = tDist;
              this.hoverTarget = t;
            }
          }
        }
      }
      if(lastHoverTarget)
        lastHoverTarget.domElement.classList.remove('droptarget');
      if(this.hoverTarget)
        this.hoverTarget.domElement.classList.add('droptarget');

      if (lastHoverTarget != this.hoverTarget) {
        await this.set('hoverTarget', this.hoverTarget ? this.hoverTarget.get('id') : null);
        if(this.hoverTarget != this.currentParent)
          await this.checkParent(true);
      }
    }
  }

  async moveEnd(coord, localAnchor) {
    if(tracingEnabled)
      sendTraceEvent('moveEnd', { id: this.get('id'), coord, localAnchor });

    await this.set('dragging', null);
    await this.set('hoverTarget', null);

    if(!this.get('fixedParent')) {
      for(const t of this.dropTargets)
        t.domElement.classList.remove('droppable');

      await this.checkParent();

      if(this.hoverTarget) {
        let coordNew = this.hoverTarget.coordLocalFromCoordClient({x: coord.clientX, y: coord.clientY});
        const offset = getOffset(this.coordParentFromCoordLocal(localAnchor), {x: this.get('x'), y: this.get('y')})
        coordNew = this.hoverTarget.coordGlobalFromCoordLocal({x: Math.round(coordNew.x + offset.x), y: Math.round(coordNew.y + offset.y)});
        this.setPosition(coordNew.x, coordNew.y, this.get('z'));
        await this.snapToGrid();
        await this.moveToHolder(this.hoverTarget);
        this.hoverTarget.domElement.classList.remove('droptarget');
      }
    }

    this.hideEnlarged();
    if(this.domElement.classList.contains('longtouch'))
      this.domElement.classList.remove('longtouch');

    await this.updatePiles();
  }

  async onChildAdd(child, oldParentID) {
    this.childArray = this.childArray.filter(c=>c!=child);
    this.childArray.push(child);
    await this.onChildAddAlign(child, oldParentID);
  }

  async onChildAddAlign(child, oldParentID) {
    let coordChild = {x: child.get('x'), y: child.get('y')};

    if(!oldParentID) {
      coordChild = this.coordLocalFromCoordGlobal(coordChild);
    }

    if(this.get('alignChildren'))
      await child.setPosition(this.get('dropOffsetX'), this.get('dropOffsetY'), child.get('z'));
    else
      await child.setPosition(Math.round(coordChild.x*1024)/1024, Math.round(coordChild.y*1024)/1024, child.get('z'));
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
        if(this.get('type') != 'holder' && Array.isArray(oldParent.get('leaveRoutine')))
          await oldParent.evaluateRoutine('leaveRoutine', {}, { child: [ this ] });
      }
      if(newValue) {
        const newParent = widgets.get(newValue);
        await newParent.onChildAdd(this, oldValue);
        if(Array.isArray(newParent.get('enterRoutine')))
          await newParent.evaluateRoutine('enterRoutine', { oldParentID: oldValue === undefined ? null : oldValue }, { child: [ this ] });
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

  setHighlighted(isHighlighted) {
    if(this.isHighlighted != isHighlighted) {
      this.isHighlighted = isHighlighted;
      if(isHighlighted)
        this.domElement.classList.add('selectedInEdit');
      else
        this.domElement.classList.remove('selectedInEdit');
    }
  }

  async setText(text, mode, problems) {
    if (this.get('text') !== undefined) {
      if(mode == 'inc' || mode == 'dec') {
        let newText = (parseFloat(this.get('text')) || 0) + (mode == 'dec' ? -1 : 1) * text;
        const decimalPlacesOld = this.get('text').toString().match(/\..*$/);
        const decimalPlacesChange = (+text).toString().match(/\..*$/);
        const decimalPlaces = Math.max(decimalPlacesOld ? decimalPlacesOld[0].length-1 : 0, decimalPlacesChange ? decimalPlacesChange[0].length-1 : 0);
        const factor = 10**decimalPlaces;
        newText = Math.round(newText*factor)/factor;
        await this.set('text', newText);
      } else if(mode == 'append')
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

  selected() {
    this.domElement.classList.add('selected');
  }

  notSelected() {
    this.domElement.classList.remove('selected');
  }

  showEnlarged(event) {
    if(this.get('enlarge')) {
      const id = this.get('id');
      const e = $('#enlarged');
      const boundBox = this.domElement.getBoundingClientRect();
      let cssText = this.domElement.style.cssText;
      cssText += `;--originalLeft:${boundBox.left}px`;
      cssText += `;--originalTop:${boundBox.top}px`;
      cssText += `;--originalRight:${boundBox.right}px`;
      cssText += `;--originalBottom:${boundBox.bottom}px`;
      e.innerHTML = this.domElement.innerHTML;
      e.className = this.domElement.className;
      e.dataset.id = id;
      for(const clone of e.querySelectorAll('canvas')) {
        const original = this.domElement.querySelector(`canvas[data-id = '${clone.dataset.id}']`);
        const context = clone.getContext('2d');
        clone.width = original.width;
        clone.height = original.height;
        context.drawImage(original, 0, 0);
      }
      e.style.cssText = cssText;
      e.style.display = this.domElement.style.display;
      e.style.transform = `scale(calc(${this.get('enlarge')} * var(--scale)))`;
      const cursor = clientPointer.getBoundingClientRect();
      if(cursor.left < window.innerWidth/2)
        e.classList.add('right');
      if(cursor.top < window.innerHeight/2)
        e.classList.add('bottom');

      const wStyle = $(`#STYLES_${escapeID(id)}`);
      if(wStyle) {
        if($('#enlargeStyle'))
          removeFromDOM($('#enlargeStyle'));
        const eStyle = document.createElement('style');
        eStyle.id = "enlargeStyle";
        eStyle.appendChild(document.createTextNode(wStyle.textContent.replaceAll(`#w_${escapeID(id)}`,'#enlarged')));
        $('head').appendChild(eStyle);
      }
    }
    if(event)
      event.preventDefault();
  }

  async showInputOverlay(o, widgets, variables, problems) {
    return new Promise((resolve, reject) => {
      const maxRandomRotate = o.randomRotation || 0;
      const rotation = Math.floor(Math.random() * maxRandomRotate) - (maxRandomRotate / 2);
      var confirmButtonText, cancelButtonText = "";
      $('#buttonInputOverlay .modal').style = o.css || "";
      $('#buttonInputOverlay .modal').style.transform = "rotate("+rotation+"deg)";
      $('#buttonInputFields').innerHTML = '';
      if(o.header){
        const dom = document.createElement('div');
        dom.className = "inputtitle";
        const thisheader = {label: o.header}
        formField(thisheader, dom, null);
        $('#buttonInputFields').appendChild(dom);
      }
      if(!o.confirmButtonText && !o.confirmButtonIcon){
        confirmButtonText = "Go";
      }
      if(!o.cancelButtonText && !o.cancelButtonIcon){
        cancelButtonText = "Cancel";
      }

      $('#buttonInputGo label').textContent = o.confirmButtonText || confirmButtonText;
      $('#buttonInputCancel label').textContent = o.cancelButtonText || cancelButtonText;

      $('#buttonInputGo span').textContent = o.confirmButtonIcon || "";
      $('#buttonInputCancel span').textContent = o.cancelButtonIcon || "";

      for(const field of o.fields) {
        const dom = document.createElement('div');
        dom.style = field.css || "";
        dom.className = "input"+field.type;
        formField(field, dom, 'INPUT_' + escapeID(this.get('id')) + ';' + field.variable);
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

  async snapToGrid() {
    if(this.get('grid').length) {
      const x = this.get('x');
      const y = this.get('y');

      let closest = null;
      let closestDistance = 999999;

      for(const grid of this.get('grid')) {
        if(x < (grid.minX || -99999) || x > (grid.maxX || 99999))
          continue;
        if(y < (grid.minY || -99999) || y > (grid.maxY || 99999))
          continue;

        const snapX = x + grid.x/2 - mod(x - (grid.offsetX || 0), grid.x);
        const snapY = y + grid.y/2 - mod(y - (grid.offsetY || 0), grid.y);

        const distance = (snapX - x) ** 2 + (snapY - y) ** 2;
        if(distance < closestDistance) {
          closest = [ snapX, snapY, grid ];
          closestDistance = distance;
        }
      }

      if(closest) {
        this.setPosition(closest[0], closest[1], this.get('z'));
        for(const p in closest[2])
          if([ 'x', 'y', 'minX', 'minY', 'maxX', 'maxY', 'offsetX', 'offsetY' ].indexOf(p) == -1)
            await this.set(p, closest[2][p]);
      }
    }
  }

  supportsPiles() {
    return true;
  }

  updateOwner() {
    this.domElement.className = this.classes();
  }

  async updatePiles() {
    const thisType = this.get('type');
    if(thisType != 'card' && thisType != 'pile')
      return;

    const thisParent = this.get('parent');
    if(this.isBeingRemoved || thisParent && widgets.has(thisParent) && !widgets.get(thisParent).supportsPiles())
      return;

    const thisX = this.get('x');
    const thisY = this.get('y');
    const thisOwner = this.get('owner');
    const thisOnPileCreation = JSON.stringify(this.get('onPileCreation'));
    for(const [ widgetID, widget ] of widgets) {
      if(widget == this)
        continue;
      const widgetType = widget.get('type');
      if(widgetType != 'card' && widgetType != 'pile')
        continue;

      // check if this widget is closer than 10px from another widget in the same parent
      if(widget.get('parent') == thisParent && Math.abs(widget.get('x')-thisX) < 10 && Math.abs(widget.get('y')-thisY) < 10) {
        if(widget.isBeingRemoved || widget.get('owner') !== thisOwner || JSON.stringify(widget.get('onPileCreation')) !== thisOnPileCreation)
          continue;

        // if a card gets dropped onto a card, they create a new pile and are added to it
        if(thisType == 'card' && widgetType == 'card') {
          const pile = Object.assign({
            type: 'pile',
            parent: this.get('parent'),
            x: widget.get('x'),
            y: widget.get('y'),
            width: this.get('width'),
            height: this.get('height')
          }, this.get('onPileCreation'));
          if(thisOwner !== null)
            pile.owner = thisOwner;
          const pileId = await addWidgetLocal(pile);
          await widget.set('parent', pileId);
          await this.bringToFront();
          await this.set('parent', pileId);
          break;
        }

        // if a pile gets dropped onto a pile, all children of one pile are moved to the other (the empty one destroys itself)
        if(thisType == 'pile' && widgetType == 'pile') {
          for(const w of this.children().reverse()) {
            await w.set('parent', widget.get('id'));
            await w.bringToFront();
          }
          break;
        }

        // if a pile gets dropped onto a card, the card is added to the pile but the pile is moved to the original position of the card
        if(thisType == 'pile' && widgetType == 'card') {
          for(const w of this.children().reverse())
            await w.bringToFront();
          await this.set('x', widget.get('x'));
          await this.set('y', widget.get('y'));
          await widget.set('parent', this.get('id'));
          break;
        }

        // if a card gets dropped onto a pile, it simply gets added to the pile
        if(thisType == 'card' && widgetType == 'pile') {
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
