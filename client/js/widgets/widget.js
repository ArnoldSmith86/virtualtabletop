import { $, removeFromDOM, asArray, escapeID, mapAssetURLs, mod, timeToMS } from '../domhelpers.js';
import { expressionCondition, expressionNames, expressionNumber } from '../expression.js';
import { StateManaged } from '../statemanaged.js';
import { playerName, playerColor, activePlayers, activeColors, mouseCoords } from '../overlays/players.js';
import { batchStart, batchEnd, widgetFilter, widgets, flushDelta, runInput } from '../serverstate.js';
import { showOverlay, shuffleWidgets, sortWidgets, exceedsDropLimit } from '../main.js';
import { tracingEnabled } from '../tracing.js';
import { toHex } from '../color.js';
import { center, distance, overlap, getOffset, getElementTransform, getScreenTransform, getPointOnPlane, dehomogenize, getElementTransformRelativeTo, getTransformOrigin } from '../geometry.js';

// A stop is listed in the line's stops property, so it can be any widget in the
// room - being a child of the line is the common shape, not a requirement. This
// reads the raw property instead of stopList() because it runs for every line
// in the room and only needs to know whether the id is listed.
function lineListsStop(line, widgetID) {
  const stops = line.get('stops');
  return Array.isArray(stops) && stops.some(entry=>entry && entry.widget == widgetID);
}

// Every line that carries the given widget as a stop.
function linesWithStop(widgetID) {
  return widgetFilter(w=>w.get('type') == 'line' && lineListsStop(w, widgetID));
}

// Only lines care about another widget's geometry: an endpoint connected to it
// has to follow, and a line carrying it as a stop has to re-space.
const lineRelevantProperties = new Set([ 'x', 'y', 'width', 'height', 'rotation', 'scale', 'parent' ]);
const stopLayoutProperties = new Set([ 'width', 'height', 'rotation', 'scale' ]);

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

function inputFieldValueForPlayer(value, player, playerIndex) {
  if(!value || typeof value != 'object' || Array.isArray(value))
    return value;
  for(const key of [ player, String(playerIndex), 'default', 'DEFAULT' ])
    if(Object.prototype.hasOwnProperty.call(value, key))
      return value[key];
  return null;
}

function cloneInputOverlayForPlayer(overlay, player, playerIndex) {
  const clone = JSON.parse(JSON.stringify(overlay));
  for(const field of clone.fields || []) {
    if(field.type != 'choose')
      continue;
    for(const property of [ 'source', 'holder', 'collection', 'value' ])
      field[property] = inputFieldValueForPlayer(field[property], player, playerIndex);
  }
  return clone;
}

function hasPlayerSpecificChooseField(overlay) {
  return (overlay.fields || []).some(field=>
    field.type == 'choose' &&
    [ 'source', 'holder', 'collection', 'value' ].some(property=>
      field[property] && typeof field[property] == 'object' && !Array.isArray(field[property])
    )
  );
}

let lastExecutedOperation = null;

// Counts the widgets that were created without an id so each of them still gets a css scope of its own - see
// the cssScope below.
let unnamedWidgetCount = 0;

// A widget without an id is a read-only preview the editor renders: it is simply dropped from the dom instead
// of going through applyRemove, so nobody removes the stylesheet its css property created. Every such
// stylesheet is registered here, keyed by scope and valued by the preview it styles, and the ones whose
// preview has left the document are collected after the render that replaced them - otherwise they would pile
// up in head as the editor re-renders its previews.
const unnamedWidgetStyles = new Map();
let unnamedWidgetStyleCollection = null;

function collectUnnamedWidgetStyles() {
  unnamedWidgetStyleCollection = null;
  for(const [ scope, element ] of unnamedWidgetStyles) {
    if(element.isConnected)
      continue;
    if($(`#STYLES_${scope}`))
      removeFromDOM($(`#STYLES_${scope}`));
    unnamedWidgetStyles.delete(scope);
  }
}

export class Widget extends StateManaged {
  constructor(id) {
    // Everything that identifies this widget in css - its dom id, the id of its stylesheet element and the
    // selectors in it - is built from this scope. A widget in a room has a unique id, but the read-only copies
    // the editor renders (deck editor, card type list, widget picker) are created without one: they would all
    // share the scope of an empty id, so the last copy rendered would restyle every other one with its own
    // card type's properties. Widgets that do have an id keep using it, so nothing changes for a room.
    const cssScope = id === undefined || id === null ? `unnamed_${++unnamedWidgetCount}` : escapeID(id);
    const div = document.createElement('div');
    div.id = 'w_' + cssScope;
    super();
    this.id = id;
    this.cssScope = cssScope;
    this.domElement = div;
    this.dropShadowWidget = null;
    this.targetTransform = '';
    this.childArray = [];
    this.propertiesUsedInProperty = {};

    if(StateManaged.inheritFromMapping[id] === undefined)
      StateManaged.inheritFromMapping[id] = [];

    this.addDefaults({
      display: true,
      x: 0,
      y: 0,
      z: 0,
      width: 100,
      height: 100,
      layer: 0,
      borderRadius: null,
      rotation: 0,
      scale: 1,
      ignoreZoom: false,
      dragLimit: {},

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
      dropShadowOwner: null,
      dropShadowWidget: null,
      dropTarget: null,
      dropLimit: -1,
      inheritChildZ: false,
      hoverTarget: null,
      hoverParent: null,
      hidePlayerCursors: false,

      linkedToSeat: null,
      onlyVisibleForSeat: null,
      hoverInheritVisibleForSeat: true,

      clickRoutine: null,
      doubleClickRoutine: null,
      changeRoutine: null,
      enterRoutine: null,
      leaveRoutine: null,
      globalUpdateRoutine: null,
      gameStartRoutine: null,
      hotkey: null,

      // durable snapshot used while a line is automatically rotating this stop
      lineOriginalRotation: null,

      animatePropertyChange: [],
      resetProperties: {},
    });
    this.domElement.timer = false

    this.domElement.addEventListener('contextmenu', e => this.showEnlarged(e), false);
    this.domElement.addEventListener('mouseenter',  e => this.showEnlarged(e), false);
    this.domElement.addEventListener('mouseleave',  e => this.hideEnlarged(e), false);
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

    this.animateTimeouts = {};
    this.animateClasses = new Set;
  }

  absoluteCoord(coord) {
    return this.coordGlobalFromCoordParent({x:this.get('x'),y:this.get('y')})[coord]
  }

  animateProperties() {
    return asArray(JSON.parse(JSON.stringify(this.get('animatePropertyChange'))));
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
        this.targetTransform = this.domElement.style.transform;
        return;
      }
    }

    for(const property of this.cssTransformProperties()) {
      if(delta[property] !== undefined) {
        this.targetTransform = this.domElement.style.transform = this.cssTransform();
        return;
      }
    }
  }

  applyDeltaToDOM(delta) {
    super.applyDeltaToDOM(delta);

    let fromTransform = null;
    let newParent = undefined;
    if(delta.parent !== undefined) {
      newParent = delta.parent && widgets.has(delta.parent) ? widgets.get(delta.parent).domElement : $('#topSurface');
      this.setLimbo(delta.parent && !widgets.has(delta.parent));
      // If the widget wasn't newly created, transition from its previous location.
      if (delta.id === undefined)
        fromTransform = getElementTransformRelativeTo(this.domElement, newParent);
    }

    this.applyCSS(delta);
    
    if(delta.z !== undefined)
      this.applyZ(true);

    if(delta.movable !== undefined)
      this.isDraggable = delta.movable;

    if(newParent !== undefined) {
      if(this.parent)
        this.parent.applyChildRemove(this);

      newParent.appendChild(this.domElement);
      if (fromTransform) {
        // If we changed parents, we apply a transform to the previous location
        // to allow for a smooth transition animation.
        this.domElement.style.transform = fromTransform;
        // Force style recalc to commit from transform and start a transition
        // on applying the destination transform.
        this.domElement.offsetTop;
        this.domElement.style.transform = this.targetTransform;
      }

      if(delta.parent !== null && widgets.has(delta.parent)) {
        this.parent = widgets.get(delta.parent);
        this.parent.applyChildAdd(this);
      } else {
        delete this.parent;
      }
    }

    if(this.activateAnimation) {
      this.animateProperties().forEach((prop)=>{
        if(prop != null) {
          const rule = (typeof prop == 'object')? prop : { property: prop };
          if(delta[rule.property] !== undefined) {
            if(rule.className == null)
              rule.className = `animate_${escapeID(rule.property)}`;
            rule.className = asArray(rule.className).join(' ').split(' ').filter(c=>c!='');
            if(typeof rule.duration != 'number')
              rule.duration = 1000;
            rule.className.forEach(c => {
              if(this.animateTimeouts[c])
                clearTimeout(this.animateTimeouts[c]);
              this.domElement.classList.add(c);
              this.animateClasses.add(c);
              this.animateTimeouts[c] = setTimeout(()=>{
                if(this.classes(false).split(' ').indexOf(c) == -1)
                  this.domElement.classList.remove(c);
                this.animateClasses.delete(c);
              },rule.duration);
            });
          }
        }
      });
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
      inheriting.applyInheritedDeltaToDOM(inheritedDelta);
    }

    // inherit properties again when overriding ones are removed
    if(this.state.inheritFrom !== undefined) {
      for(const key in delta)
        if(this.state[key] === undefined && (!this.inheritedProperties || this.inheritedProperties[key] === undefined))
          for(const [ id, properties ] of Object.entries(this.inheritFrom()))
            if(this.inheritFromIsValid(properties, key) && widgets.has(id) && widgets.get(id).get(key) !== undefined && widgets.get(id).get(key) !== delta[key])
              this.applyInheritedDeltaToDOM({[key]: widgets.get(id).get(key)});
    }

    if($('#enlarged').dataset.id == this.id && !$('#enlarged').className.match(/hidden/)) {
      this.showEnlarged(null, delta);
    }
  }

  applyInheritedDeltaToDOM(delta) {
    if(!this.inheritedProperties)
      this.inheritedProperties = {};
    for(const [ property, value ] of Object.entries(delta)) {
      if(value === null)
        delete this.inheritedProperties[property];
      else
        this.inheritedProperties[property] = true;
    }
    this.applyDeltaToDOM(delta);
  }

  applyInheritedValuesToObject(inheritDefinition, sourceDelta, targetDelta, targetWidget) {
    for(const key in sourceDelta)
      if(this.inheritFromIsValid(inheritDefinition, key) && targetWidget.state[key] === undefined)
        targetDelta[key] = JSON.stringify(sourceDelta[key]) === JSON.stringify(this.defaults[key]) ? null : sourceDelta[key];
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
    this.applyInheritedDeltaToDOM(delta);
  }

  applyInitialDelta(delta) {
    super.applyInitialDelta(delta);
    this.activateAnimation = true;
  }

  applyRemove() {
    if(this.get('parent') && widgets.has(this.get('parent')))
      widgets.get(this.get('parent')).applyChildRemove(this);
    if(this.get('deck') && widgets.has(this.get('deck')))
      widgets.get(this.get('deck')).removeCard(this);
    if($(`#STYLES_${this.cssScope}`))
      removeFromDOM($(`#STYLES_${this.cssScope}`));
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
      await this.set('hoverParent', null);
      if(this.currentParent.get('childrenPerOwner'))
        await this.set('owner',  null);
      if(this.currentParent.dispenseCard)
        await this.currentParent.dispenseCard(this);
      delete this.currentParent;
    }
  }

  classes(includeTemporary = true) {
    let className = this.get('typeClasses') + ' ' + this.get('classes');

    const owner = this.get('owner');
    if(Array.isArray(owner) && owner.indexOf(playerName) == -1)
      className += ' foreign';
    if(typeof owner == 'string' && owner != playerName)
      className += ' foreign';

    let onlyVisibleForSeat = this.get('onlyVisibleForSeat');

    // If the element is currently being dragged we may inherit restricted seat visibility.
    const hoverTarget = this.get('hoverTarget') && widgets.has(this.get('hoverTarget')) ? widgets.get(this.get('hoverTarget')) : null;
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

    if(this.isLimbo)
      className += ' limbo';
    if(this.get('hoverParent') && widgets.has(this.get('hoverParent')) && widgets.get(this.get('hoverParent')).domElement.classList.contains('showCardBack'))
      className += ' showCardBack';

    if(typeof this.get('dragging') == 'string')
      className += ' dragging';
    if(this.get('dragging') == playerName)
      className += ' draggingSelf';
    if (this.get('dropShadowOwner'))
      className += ' dragging-shadow';

    if(this.get('clickable'))
      className += ' clickable';

    if(this.get('movable') )
      className += ' movable';

    if(this.get('enlarge'))
      className += ' enlarge';

    if(!this.get('display') && this.get('type') != 'seat') // seats already have a display property that does something else
      className += ' hidden';

    if(this.isHighlighted)
      className += ' selectedInEdit';

    if(includeTemporary)
      className += ' ' + Array.from(this.animateClasses.values()).join(' ');

    return className;
  }

  classesProperties() {
    return [ 'classes', 'display', 'dragging', 'dropShadowOwner', 'hoverTarget', 'hoverParent', 'linkedToSeat', 'onlyVisibleForSeat', 'owner', 'typeClasses', 'movable', 'enlarge', 'clickable' ];
  }

  async click(mode='respect') {
    if(tracingEnabled)
      sendTraceEvent('click', { id: this.get('id'), mode });

    if(!this.get('clickable') && !(mode == 'ignoreClickable' || mode =='ignoreAll'))
      return true;

    if(this.get('clickSound')) {
      toServer('audio', {
        audioSource: this.get('clickSound'),
        maxVolume: 1.0,
        length: null,
        players: [],
        count: 1
      });
    }

    if(Array.isArray(this.get('clickRoutine')) && !(mode == 'ignoreClickRoutine' || mode =='ignoreAll')) {
      await this.evaluateRoutine('clickRoutine', {}, {});
      return true;
    } else {
      return false;
    }
  }

  async clone(overrideProperties, recursive = false, problems = null, xOffset = 0, yOffset = 0) {
    const clone = Object.assign(JSON.parse(JSON.stringify(this.state)), overrideProperties);
    const parent = clone.parent;
    const inheritFrom = clone.inheritFrom;
    if(parent !== undefined && parent !== null && !widgets.has(parent))
      return null;

    clone.clonedFrom = this.get('id');
    if(widgets.has(clone.id)) {
      delete clone.id;
      if(problems && overrideProperties.id !== undefined)
        problems.push(`There is already a widget with id:${overrideProperties.id}, generating new ID.`);
    }
    delete clone.parent;
    delete clone.inheritFrom;
    const newID = await addWidgetLocal(clone);
    if(widgets.has(newID)) { // cloning can fail for example with invalid cardType
      const cWidget = widgets.get(newID);

      // use moveToHolder so that CLONE triggers onEnter and similar features
      cWidget.movedByButton = problems != null;
      if(parent)
        await cWidget.moveToHolder(widgets.get(parent));
      if(inheritFrom)
        await cWidget.set('inheritFrom', inheritFrom);

      // moveToHolder causes the position to be wrong if the target holder does not have alignChildren
      if(!parent || !widgets.get(parent).get('alignChildren')) {
        await cWidget.set('x', (overrideProperties.x !== undefined ? overrideProperties.x : this.get('x')) + xOffset);
        await cWidget.set('y', (overrideProperties.y !== undefined ? overrideProperties.y : this.get('y')) + yOffset);
        await cWidget.updatePiles();
      }
      delete cWidget.movedByButton;

      if (recursive) {
        for (const w of this.childArray) {
          await w.clone({parent: cWidget.get('id')}, true, problems);
        }
      }
      return cWidget;
    } else {
      return null;
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

  async createShadowWidget() {
    if (this.get('dropShadowWidget'))
      return;

    // Use the top child if this is a pile widget.
    const shadowWidget = this.get('type') == 'pile' ? this.children()[0] : this;
    if (!shadowWidget)
      return null;
    await this.set('dropShadowWidget', (await shadowWidget.clone({
        'movable': false,
        'dropShadowOwner': playerName,
        'parent': null}, true)).get('id'));
  }

  css() {
    if($(`#STYLES_${this.cssScope}`))
      removeFromDOM($(`#STYLES_${this.cssScope}`));
    const usedProperties = new Set();
    let css = this.cssReplaceProperties(this.cssAsText(this.get('css'), usedProperties), usedProperties);
    this.propertiesUsedInProperty['css'] = Array.from(usedProperties);

    css = this.cssBorderRadius() + css;
    css += '; width:'  + this.get('width')  + 'px';
    css += '; height:' + this.get('height') + 'px';
    css += '; z-index:' + this.calculateZ();
    css += '; transform:' + this.cssTransform();

    return css;
  }

  cssAsText(css, usedProperties, nested = false) {
    if(typeof css == 'object') {
      let cssText = '';
      for(const key in css) {
        if(typeof css[key] == 'object')
          return this.cssToStylesheet(css, usedProperties, nested);
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
    return [ 'borderRadius', 'css', 'height', 'inheritChildZ', 'layer', 'width' ].concat(this.propertiesUsedInProperty['css']||[]);
  }

  cssReplaceProperties(css, usedProperties) {
    for(const match of String(css).matchAll(/\$\{PROPERTY ([A-Za-z0-9_-]+)\}/g)) {
      css = css.replace(match[0], this.get(match[1]));
      if (usedProperties)
        usedProperties.add(match[1]);
    }
    return css;
  }

  cssToStylesheet(css, usedProperties, nested = false) {
    let styleString = '';
    for(const key in css) {
      let usesVariables = false;
      let selector = key.replace(/\$\{THIS\}/g, m => {usesVariables = true; return `#w_${this.cssScope}`});
      if(!nested) {
        if(key == 'inline')
          continue;
        if(key == 'default')
          selector = '';
        if(!usesVariables && selector.charAt(0) != '@')
          selector = `#w_${this.cssScope}${selector}`;
      }
      styleString += `${selector} { ${mapAssetURLs(this.cssReplaceProperties(this.cssAsText(css[key], usedProperties, true), usedProperties))} }\n`;
    }

    if(nested)
      return styleString;

    const style = document.createElement('style');
    style.id = `STYLES_${this.cssScope}`;
    style.appendChild(document.createTextNode(styleString));
    $('head').appendChild(style);

    // see unnamedWidgetStyles - the collection is deferred so previews that are built into a container before
    // that container is put into the document are not collected while they are still being rendered
    if(this.id === undefined || this.id === null) {
      unnamedWidgetStyles.set(this.cssScope, this.domElement);
      if(!unnamedWidgetStyleCollection)
        unnamedWidgetStyleCollection = setTimeout(collectUnnamedWidgetStyles);
    }

    return this.cssAsText(css.inline || '', usedProperties);
  }

  cssTransform() {
    let x = this.get('x');
    let y = this.get('y');
    let scaleValue = this.get('scale');

    // The inverse-zoom compensation below is computed in the room's coordinate
    // frame, so it is only correct for a top-level widget sitting directly on the
    // surface. A widget nested inside another widget lives in its parent's frame
    // and simply inherits the parent's zoom behaviour, so its parent's ignoreZoom
    // effectively controls it: it stays put inside a compensating ancestor and
    // zooms along with a non-compensating one. Only compensate at the top level.
    if(this.get('ignoreZoom') && !this.isNestedInWidget()) {
      const computedStyle = getComputedStyle(document.documentElement);
      const zoom = parseFloat(computedStyle.getPropertyValue('--zoom')) || 1;

      if(zoom > 1) {
        const baseScale = parseFloat(computedStyle.getPropertyValue('--scale')) || 1;
        const panX = parseFloat(computedStyle.getPropertyValue('--roomPanX')) || 0;
        const panY = parseFloat(computedStyle.getPropertyValue('--roomPanY')) || 0;

        const transformOrigin = getTransformOrigin(this.domElement);
        const zoomCompensation = 1 - 1 / zoom;

        x = x / zoom - panX / (baseScale * zoom) - transformOrigin.x * zoomCompensation;
        y = y / zoom - panY / (baseScale * zoom) - transformOrigin.y * zoomCompensation;
        scaleValue = scaleValue / zoom;
      }
    }

    let transform = `translate(${x}px, ${y}px)`;

    if(this.get('rotation'))
      transform += ` rotate(${this.get('rotation')}deg)`;
    if(scaleValue != 1)
      transform += ` scale(${scaleValue})`;

    return transform;
  }

  cssTransformProperties() {
    // Only an ignoreZoom widget has a transform that depends on its parent: it
    // compensates for zoom when top-level but not when nested, so reparenting it
    // between those states must recompute the transform. Keeping 'parent' out of
    // the list otherwise avoids a redundant transform write on every card move.
    const properties = [ 'rotation', 'scale', 'x', 'y', 'ignoreZoom' ];
    if(this.get('ignoreZoom'))
      properties.push('parent');
    return properties;
  }

  isNestedInWidget() {
    const parentID = this.get('parent');
    return parentID != null && widgets.has(parentID);
  }

  dragCorner(coordGlobal, localAnchor, parent = null) {
    const coord = parent ?
        parent.coordLocalFromCoordGlobal(coordGlobal) :
        this.coordParentFromCoordGlobal(coordGlobal);
    const transformOrigin = getTransformOrigin(this.domElement);
    let positionCoord = this.coordParentFromCoordLocal(transformOrigin);
    const offset = getOffset(this.coordParentFromCoordLocal(localAnchor), positionCoord);
    let corner = {x: coord.x + offset.x - transformOrigin.x, y: coord.y + offset.y - transformOrigin.y, z: this.get('z')};
    if (parent)
      corner = parent.coordGlobalFromCoordLocal(corner);
    corner.x = Math.round(corner.x);
    corner.y = Math.round(corner.y);
    return corner;
  }

  // How a name in an expression about a position is answered - a dragLimit
  // side or condition, a snap grid's condition: x and y are the position being
  // tested rather than where the widget currently is, so they mean in an
  // expression what minX/maxX/minY/maxY mean next to it. A property is written
  // the way routines write one - ${PROPERTY name} for this widget's,
  // ${PROPERTY name OF id} for another widget's - and nothing else is a name,
  // so the two languages agree on what a bare word is.
  positionResolver(coord) {
    return (name, widgetID, explicit)=>{
      if(!explicit)
        return name == 'x' || name == 'y' ? coord[name] : undefined;
      if(widgetID === null)
        return this.get(name);
      return widgets.has(widgetID) ? widgets.get(widgetID).get(name) : undefined;
    };
  }

  // Which point of the widget the limit applies to, as an offset from its top
  // left corner: the corner itself unless alignX/alignY move it, the same
  // fractions of the widget box a snap grid aligns to (0.5/0.5 is its middle).
  // Everything below works on that point, so x, y and the four sides all mean
  // the same thing wherever it sits.
  dragLimitOffset() {
    const limit = this.get('dragLimit');
    if(!limit || typeof limit != 'object' || Array.isArray(limit))
      return { x: 0, y: 0 };
    return {
      x: (+limit.alignX || 0) * (+this.get('width') || 0),
      y: (+limit.alignY || 0) * (+this.get('height') || 0)
    };
  }

  // What the dragLimit says, read for one position - the point of the widget
  // the limit applies to (see dragLimitOffset), not necessarily its corner: the
  // two clamps of the rectangle (each side a number or an expression that
  // computes one) and the conditions to test there. null when there is no limit
  // to obey at all.
  // `varies` says whether these rules hold for one position only: a side that
  // reads x or y ("maxX": "y") is a different number at every point, so both
  // callers - the drag and the editor's drawing - have to read it again for
  // every position they judge instead of once for all of them.
  dragLimitRules(coord) {
    const limit = this.get('dragLimit');
    if(!limit || typeof limit != 'object' || Array.isArray(limit))
      return null;

    const resolve = this.positionResolver(coord);
    const bound = key=>limit[key] === undefined ? undefined : expressionNumber(limit[key], resolve);
    const minX = bound('minX'), maxX = bound('maxX'), minY = bound('minY'), maxY = bound('maxY');

    return {
      varies: [ 'minX', 'maxX', 'minY', 'maxY' ].some(key=>expressionNames(limit[key])
        .some(name=>!name.explicit && (name.name == 'x' || name.name == 'y'))),
      clampX: value=>{
        if(minX !== undefined && minX !== null) value = Math.max(minX, value);
        if(maxX !== undefined && maxX !== null) value = Math.min(maxX, value);
        return value;
      },
      clampY: value=>{
        if(minY !== undefined && minY !== null) value = Math.max(minY, value);
        if(maxY !== undefined && maxY !== null) value = Math.min(maxY, value);
        return value;
      },
      conditions: asArray(limit.condition === undefined || limit.condition === null ? [] : limit.condition).filter(c=>c !== null && c !== undefined)
    };
  }

  // Whether a position is inside the area at all, i.e. whether a drag that ends
  // there is left alone. This is the question the editor's preview asks of
  // every point it samples; dragLimitedCoord() below answers the other one -
  // where a drag that is not allowed ends up instead. The rules can be passed
  // in when the caller knows they are the same everywhere (thousands of points
  // of one drawing), which saves reading the four sides at every one of them.
  dragLimitAllows(coord, rules = this.dragLimitRules(coord)) {
    if(!rules)
      return true;
    return rules.clampX(coord.x) === coord.x && rules.clampY(coord.y) === coord.y
      && rules.conditions.every(c=>expressionCondition(c, this.positionResolver(coord)));
  }

  // Where a drag is allowed to put the widget's top left corner. minX/maxX/
  // minY/maxY bound it to a rectangle, and each of them can be an expression
  // instead of a fixed number ("${PROPERTY width OF board} - 100"). A condition
  // - one inequality or a list of them, "2x^2 + y > 4", "2y + 10 > 5x" - bounds
  // it to any area that can be written down, and both are checked on every
  // mouse move, so an area that depends on the state follows it. A side can
  // read x and y like a condition can ("maxX": "y"), and then the rectangle is
  // judged where the position it bounds is rather than where the pointer is.
  // All of that is about the point alignX/alignY picks out of the widget - its
  // top left corner unless they say otherwise - so only the two conversions at
  // the ends of this method deal in corners.
  //
  // A refused position does not stop the drag where the last accepted one was:
  // the widget goes where its area comes closest to the pointer, so it comes to
  // rest against the boundary itself rather than a whole mouse step before it,
  // and it keeps sliding along that boundary while the pointer moves - along a
  // straight edge at any angle and around a curve alike. It gets there the way
  // the mouse went: every position it is moved to is one it can reach from
  // where it is without leaving the area on the way, so a widget limited to a
  // ring or a track walks around it instead of appearing on the far side of the
  // hole when the pointer crosses it.
  // A widget that starts outside its area (a condition that changed under it,
  // a routine that put it there) is not held in place: it is free until it is
  // inside, so it can never get stuck - only a widget that is on the boundary
  // of its area rather than away from it is carried along that boundary.
  dragLimitedCoord(coord) {
    // the corner a drag reports, as the point the limit is written about
    const offset = this.dragLimitOffset();
    const point = { x: coord.x + offset.x, y: coord.y + offset.y };
    const rules = this.dragLimitRules(point);
    if(!rules)
      return coord;

    // A side that reads the position being judged describes a different
    // rectangle at every point, so it is read again for each of them - the same
    // way a condition is. Any other limit is read once for the whole drag.
    const rulesAt = rules.varies ? position=>this.dragLimitRules(position) : _=>rules;
    const clamped = position=>{
      const { clampX, clampY } = rulesAt(position);
      return { x: clampX(position.x), y: clampY(position.y) };
    };
    const target = clamped(point);
    // and back to the corner, which is what a drag writes
    const asCoord = position=>Object.assign({}, coord, { x: position.x - offset.x, y: position.y - offset.y });

    // a fixed rectangle and nothing else is what clamping already answered
    if(!rules.varies && !rules.conditions.length)
      return asCoord(target);

    // the rectangle is part of the question everywhere below, so a position
    // reached by sliding or by rounding can never leave it either
    const inside = position=>this.dragLimitAllows(position, rulesAt(position));

    // where the widget is, put through the rectangle as well: it is a hard
    // bound, so a widget sitting outside it (a routine moved it, a side moved
    // under it) must not be able to stay there through the fallbacks below
    // Read off x and y - except for the one move where they cannot be: taking a
    // widget out of a holder does not convert them out of the holder's
    // coordinates, so between moveStart() and the first position a drag writes
    // they are the holder's numbers read as the room's. dragLimitStartCoord is
    // where the widget was, in the room, taken while its parent still said what
    // x and y meant (see moveStart), and it stands in for exactly that move.
    const at = this.dragLimitStartCoord
      ? this.coordParentFromCoordGlobal(this.dragLimitStartCoord)
      : { x: +this.get('x') || 0, y: +this.get('y') || 0 };
    const current = clamped({ x: at.x + offset.x, y: at.y + offset.y });
    const away = position=>Math.hypot(target.x - position.x, target.y - position.y);
    // A widget that is not inside its area is let go - but a widget sitting
    // exactly on the edge of a strict inequality ("x < 200" at x == 200, put
    // there by a routine or by the initial state) is not inside it either, and
    // that is a different thing: it is on the boundary rather than away from
    // the area, and letting it go would make the limit stop applying at its own
    // edge. The two are told apart by asking the whole positions around the
    // widget, the ones a drag could have left it on: one of them being inside
    // means the area is right there, and the drag along that edge its author
    // meant to allow starts from the one nearest the pointer.
    const edgeStart = _=>{
      const around = [];
      for(const x of [ current.x - 1, current.x, current.x + 1 ])
        for(const y of [ current.y - 1, current.y, current.y + 1 ])
          if(x != current.x || y != current.y)
            around.push({ x, y });
      return around.sort((a, b)=>away(a) - away(b)).find(inside);
    };
    const start = inside(current) ? current : edgeStart();
    if(!start)
      return asCoord(target);

    // How far along the way from an allowed position to another one the widget
    // gets without leaving the area - the far end itself when the whole way is
    // inside it. Walked rather than halved: what is being answered is where the
    // mouse took the widget, so an area the way crosses out of and back into
    // (the hole of a ring, the middle of a track) has to stop it at the near
    // side rather than let it carry on beyond the gap. The samples are a few
    // pixels apart, and the last step between the one that was allowed and the
    // one that was not is halved until the boundary is a twentieth of a pixel
    // wide, so the widget rests against it rather than a sample short of it.
    const reach = (from, to)=>{
      const distance = Math.hypot(to.x - from.x, to.y - from.y);
      const at = part=>({ x: from.x + (to.x - from.x) * part, y: from.y + (to.y - from.y) * part });
      // bounded, so one long jump of a fast mouse costs no more than a slow one
      const samples = Math.min(128, Math.max(1, Math.ceil(distance / 4)));
      let reached = 0, refused = 1;
      for(let sample = 1; sample <= samples; ++sample) {
        if(!inside(at(sample / samples))) {
          refused = sample / samples;
          break;
        }
        reached = sample / samples;
      }
      if(reached == 1)
        return to;
      for(let steps = Math.min(20, Math.ceil(Math.log2(distance / samples * 20))); steps > 0; --steps) {
        const middle = (reached + refused) / 2;
        if(inside(at(middle)))
          reached = middle;
        else
          refused = middle;
      }
      return at(reached);
    };

    // straight at the pointer, as far as the area lets the widget go: getting
    // all the way there is the ordinary drag, and there is nothing to slide
    // along then
    const straight = reach(start, target);
    if(straight === target)
      return asCoord(target);

    // The widget ends up where its area comes closest to the pointer. Straight
    // at the pointer is one candidate; the others are that same movement turned
    // to one side and to the other, which is what sliding along an edge is.
    // Turning a movement also shortens it to the point of the turned line
    // nearest the pointer, so the smallest turn that lands in the area is the
    // one that ends up closest - it is looked for by halving the angle between
    // straight at the pointer (refused, or there would be nothing to do) and a
    // quarter turn (which is standing still, and therefore always allowed).
    // Repeating the whole thing follows an edge that curves away, where no
    // straight movement can stay against the boundary.
    let position = start;
    for(let round = 0; round < 3; ++round) {
      const dx = target.x - position.x, dy = target.y - position.y;
      const turnedBy = angle=>{
        const cos = Math.cos(angle), sin = Math.sin(angle);
        return { x: position.x + (dx*cos - dy*sin)*cos, y: position.y + (dx*sin + dy*cos)*cos };
      };
      let closest = round == 0 ? straight : reach(position, target);
      // as many halvings of the quarter turn as it takes for the last one to
      // move the widget by less than a twentieth of a pixel
      const halvings = Math.min(16, Math.max(1, Math.ceil(Math.log2(Math.hypot(dx, dy) * 32))));
      for(const side of [ -1, 1 ]) {
        let turn = side*Math.PI/2, straighter = 0;
        for(let step = 0; step < halvings; ++step) {
          const middle = (turn + straighter) / 2;
          if(inside(turnedBy(middle)))
            turn = middle;
          else
            straighter = middle;
        }
        // the turned movement is walked as well, so a turn that ends up in the
        // area but crosses out of it on the way is taken only as far as it goes
        const slid = reach(position, turnedBy(turn));
        if(away(slid) < away(closest))
          closest = slid;
      }
      // anything below the precision the two searches above work to is noise,
      // and taking it would let the widget wobble by a pixel for nothing
      if(away(closest) > away(position) - .05)
        break;
      position = closest;
    }

    // A widget is placed on whole pixels like every other position a drag
    // writes, and this one is on the edge of its area: rounded the usual way it
    // would be just outside it half the time. So the four whole positions
    // around it are tried, the one nearest the pointer first, and the widget
    // stays where it was only if the area is too thin to hold any of them. It
    // is the corner that is whole, so an alignX of 0.5 on an odd width does not
    // put the widget on half a pixel.
    const whole = [];
    for(const x of new Set([ Math.floor(position.x - offset.x), Math.ceil(position.x - offset.x) ]))
      for(const y of new Set([ Math.floor(position.y - offset.y), Math.ceil(position.y - offset.y) ]))
        whole.push({ x: x + offset.x, y: y + offset.y });
    whole.sort((a, b)=>away(a) - away(b));
    return asCoord(whole.find(inside) || start);
  }

  async doubleClick(mode='respect') {
    if(tracingEnabled)
      sendTraceEvent('doubleClick', { id: this.get('id'), mode });

    if(!this.get('clickable') && !(mode == 'ignoreClickable' || mode =='ignoreAll'))
      return true;

    if(Array.isArray(this.get('doubleClickRoutine')) && !(mode == 'ignoreDoubleClickRoutine' || mode =='ignoreAll')) {
      await this.evaluateRoutine('doubleClickRoutine', {}, {});
      return true;
    } else {
      return false;
    }
  }

  evaluateInputOverlay(o, resolve, reject, go) {
    const variables = {};
    const collections = {};
    if(go) {
      for(const field of o.fields || []) {
        const dom = $('#INPUT_' + escapeID(this.get('id')) + '\\;' + field.variable);
        const isSingleWidget = field.source && Array.isArray(field.source) && field.source.length == 1;
        if(field.type == 'checkbox') {
          variables[field.variable] = dom.checked;
        } else if(field.type == 'switch') {
          variables[field.variable] = dom.checked ? 'on' : 'off';
        } else if(field.type == 'palette') {
          variables[field.variable] = $(':checked', dom) ? $(':checked', dom).value : null;
        } else if(field.type == 'choose') {
          variables[field.variable] = [...$a('.selected .widget', dom)].map(w=>w.dataset.source);
          collections[field.collection || 'DEFAULT'] = variables[field.variable].map(w=>widgets.get(w));
          if(field.mode == 'faces')
            variables[field.variable] = [...$a('.selected .widget', dom)].map(w=>(isSingleWidget?w.dataset.face:{ widget: w.dataset.source, face: w.dataset.face }));
          if(variables[field.variable].length == 1 && (field.max || 1) === 1)
            variables[field.variable] = Object.values(variables[field.variable]).length ? Object.values(variables[field.variable])[0] : null;
        } else if(field.type == 'number') {
          variables[field.variable] = dom.value
        } else if(field.type == 'slider') {
          if (Array.isArray(field.values)) {
            variables[field.variable] = field.values[dom.value];
          } else {
            variables[field.variable] = Number(dom.value);
          }
        } else if(field.type != 'text' && field.type != 'subtitle' && field.type != 'title') {
          variables[field.variable] = dom.value;
        }
      }
    }

    if(!go || this.evaluateInputOverlayErrors(o, variables)) {
      this.showInputOverlayWorkingState(true);
      sleep(1).then(function() {
        showOverlay(null);
        if(go)
          resolve({ variables, collections });
        else
          reject({ variables, collections });
      })
      return true;
    }
  }

  evaluateInputOverlayErrors(o, variables) {
    removeFromDOM('#buttonInputOverlay .inputError');

    let isValid = true;

    const displayError = (field, error) => {
      const dom = $('#INPUT_' + escapeID(this.get('id')) + '\\;' + field.variable);
      // the message carries what the field defines (regexHint, min, max, regex),
      // so it goes into the DOM as text and not as HTML
      div(dom.parentElement, 'inputError').textContent = error;
    };

    for(const field of o.fields || []) {
      if(field.type == 'choose' && asArray(variables[field.variable]).length < field.min)
        isValid = displayError(field, `Please select at least ${field.min}.`);
      if(field.type == 'choose' && asArray(variables[field.variable]).length > (field.max || 1))
        isValid = displayError(field, `Please select at most ${field.max || 1}.`);
      if(field.type == 'number' && variables[field.variable] < field.min)
        isValid = displayError(field, `Please enter a number above ${field.min}.`);
      if(field.type == 'number' && variables[field.variable] > field.max)
        isValid = displayError(field, `Please enter a number below ${field.max}.`);
      try {
        if(field.type == 'string' && field.regex && !variables[field.variable].match(field.regex))
          isValid = displayError(field, field.regexHint || `Input does not match regular expression ${field.regex}.`);
      } catch(e) {
        isValid = displayError(field, `Regular expression ${field.regex} is invalid.`);
      }
    }

    return isValid;
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
          if(Array.isArray(id) || !this.isValidID(id, problems))
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

    // Capture the routine logging state once, at the start of the routine. Toggling the Debug
    // panel while the routine is suspended (e.g. waiting for an INPUT modal) would otherwise
    // mismatch the jeLogging start/end calls and crash the client. (#2672) A routine that was
    // already running when logging got enabled can not be logged retroactively - it adds a note
    // to the log instead (see jeLoggingRoutineNotLogged at the end of this function).
    const routineLogging = jeRoutineLogging;
    if(routineLogging)
      jeLoggingRoutineStart(this, property, initialVariables, initialCollections, byReference);

    let variables = initialVariables;
    let collections = initialCollections;
    if(!byReference) {
      const playerSeats = widgetFilter(w=>w.get('type')=='seat'&&w.get('player')==playerName);
      const activeSeats = widgetFilter(w=>w.get('type')=='seat'&&w.get('player')!='');
      variables = Object.assign({
        activeColors,
        mouseCoords,
        seatIndex: playerSeats.length ? playerSeats[0].get('index') : null,
        seatID: playerSeats.length ? playerSeats[0].get('id') : null,
        activeSeats: activeSeats.length ? activeSeats.map(seat=>seat.get('id')) : null
      }, initialVariables, {
        playerName,
        playerColor,
        activePlayers,
        thisID : this.get('id')
      });
      collections = Object.assign({
        playerSeats,
        activeSeats
      }, initialCollections, {
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

      lastExecutedOperation = {
        original: original,
        applied: a,
        variables,
        property: typeof property == 'string' ? property : 'literal'
      };

      if(routineLogging) jeLoggingRoutineOperationStart(original, a)

      if(a.skip) {
        if(routineLogging) jeLoggingRoutineOperationEnd(problems, variables, collections, true);
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
              return defaultValue;
            }
          };
          const getValue = async function(input) {
            const op = match[13] ? variables[match[14]] : match[14];
            const toNum = s=>typeof s == 'string' && (legacyMode('convertNumericVarParametersToNumbers') || op === '+') && s.match(/^[-+]?[0-9]+(\.[0-9]+)?$/) ? +s : s;
            const dv = legacyMode('useOneAsDefaultForVarParameters') ? 1 : undefined;
            if(match[14] && match[9] !== undefined)
              return await compute(op, input, toNum(getParam(9, dv)), toNum(getParam(15, dv)), toNum(getParam(19, dv)));
            else if(match[14])
              return await compute(op, input, toNum(getParam(15, dv)), toNum(getParam(19, dv)), toNum(getParam(23, dv)));
            else
              return getParam(5, null);
          };

          const variable = match[1] !== undefined ? variables[unescape(match[2])] : unescape(match[2]);
          const index = match[3] !== undefined ? variables[unescape(match[4])] : unescape(match[4]);
          if(index !== undefined && (typeof variables[variable] != 'object' || variables[variable] === null))
            problems.push(`The variable ${variable} is not an object, so indexing it doesn't work.`);
          else if(index !== undefined)
            variables[variable][index] = await getValue(variables[variable][index]);
          else
            variables[variable] = await getValue(variables[variable]);
          if(routineLogging) jeLoggingRoutineOperationSummary(a.substr(4), JSON.stringify(variables[variable]));
        } else {
          const comment = a.match(new RegExp('^(?://(.*))?\x24'));
          if (comment) {
            // ignore (but log) blank and comment only lines
            if(routineLogging) jeLoggingRoutineOperationSummary(comment[1]||'');
          } else {
            const withoutVars = evaluateVariables(a).replace(/false|null/g, 0).replace(/true/g, 1);
            const mathExpression = withoutVars.match(new RegExp(`^${left} += +([() 0-9.&|!*/+-]+)(?: +//.*)?`+'\x24'));
            if(mathExpression) {
              // What the regex above matched is arithmetic already: its character class has no
              // letters, quotes or brackets, so nothing in it can be named, called or
              // constructed. Rebuilding the string from that alphabet instead of filtering the
              // matched text makes that checkable rather than a claim - every character that
              // reaches the eval below is a literal from this line, so there is no path from the
              // routine into the evaluated code left for a reader (or a static analyzer) to rule
              // out. charAt(-1) is '', so a character the regex ever lets through by mistake is
              // dropped instead of evaluated.
              const arithmetic = '0123456789.() &|!*/+-';
              const expression = [ ...mathExpression[5] ].map(c => arithmetic.charAt(arithmetic.indexOf(c))).join('');
              let result = null;
              try {
                // the indirect form evaluates in global scope instead of in this function - a
                // direct eval() would additionally stop the minifier from renaming anything here,
                // because it could read every name around it. Indirect eval is sloppy mode while
                // this module is strict, so the directive keeps the strictness: without it "010"
                // would quietly be octal 8 instead of being reported as a problem
                result = +(0,eval)('"use strict";' + expression);
              } catch(e) {
                problems.push(`The expression "${expression}" threw an exception: ${e}.`);
                result = null;
              }
              const variable = mathExpression[1] !== undefined ? variables[unescape(mathExpression[2])] : unescape(mathExpression[2]);
              const index = mathExpression[3] !== undefined ? variables[unescape(mathExpression[4])] : unescape(mathExpression[4]);
              if(index !== undefined && (typeof variables[variable] != 'object' || variables[variable] === null))
                problems.push(`The variable ${variable} is not an object, so indexing it doesn't work.`);
              else if(index !== undefined)
                variables[variable][index] = result;
              else
                variables[variable] = result;
              if(routineLogging) jeLoggingRoutineOperationSummary(a.substr(4) + ' => ' + mathExpression[5], JSON.stringify(result));
            } else {
              problems.push(`String '${a}' could not be interpreted as a valid expression. Please check your syntax and note that many characters have to be escaped.`);
            }
          }
        }
      }

      if(a.func == 'AUDIO') {
        setDefaults(a, { source: '', maxVolume: 1.0, length: null, player: null, silence: false, count: 1 });
        const validPlayers = a.player ? asArray(a.player) : [];
        toServer('audio', {
          audioSource: a.source,
          maxVolume: a.maxVolume,
          length: a.length,
          players: validPlayers,
          silence: a.silence,
          count: a.count
        });
      }

      if(a.func == 'CALL') {
        setDefaults(a, { widget: this.get('id'), routine: 'clickRoutine', 'return': true, arguments: {}, variable: 'result', collection: 'result' });
        if(Array.isArray(a.routine)) {
          if(a.routine.length > 1)
            problems.push('Routine parameter must refer to only one routine, first routine executed.');
          a.routine = a.routine[0]
        }
        if (typeof a.routine != 'string') {
          problems.push('Routine parameter must be a string');
        } else if (!a.routine.match(/Routine$/)) {
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

            if(routineLogging) {
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
            const cm = widget.getColorMap();
            if(a.mode == 'setPixel') {
              const res = widget.getResolution();
              if(a.x >= 0 && a.y >= 0 && a.x < res && a.y < res) {
                await widget.setPixel(a.x, a.y, a.value);
              } else {
                problems.push(`Pixel coordinate: (${a.x}, ${a.y}) out of range for resolution: ${res}.`);
              }
            } else if(a.mode == 'set')
              await widget.set('activeColor', a.value % cm.length);
            else if(a.mode == 'reset')
              await widget.reset();
            else if(a.mode == 'dec')
              await widget.set('activeColor', (widget.get('activeColor')+cm.length - (a.value % cm.length)) % cm.length);
            else if(a.mode == 'change') {
              const newMap = Array.isArray(cm) ? cm.slice() : [];
              const index = ((a.value || 1) % newMap.length) || 0;
              newMap[index] = a.color || '#1f5ca6';
              await widget.set('colorMap', newMap);
            }
            else
              await widget.set('activeColor', (widget.get('activeColor')+ a.value) % cm.length);
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

        if(routineLogging) {
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
        setDefaults(a, { collection: 'DEFAULT', count: 1, mode: 'respect' });
        const collection = getCollection(a.collection);

        if (['respect', 'ignoreClickable', 'ignoreClickRoutine', 'ignoreAll'].indexOf(a.mode) == -1) {
          problems.push(`Mode ${a.mode} is unsupported. Using 'respect' mode.`);
          a.mode = 'respect'
        };
        if(collection) {
          for(let i=0; i<a.count; ++i)
            for(const w of collections[collection])
              await w.click(a.mode);
          if(routineLogging) {
            const theCount = a.count ? `${a.count} times` : '';
            jeLoggingRoutineOperationSummary( `'${a.collection}' ${theCount}`)
          }
        }
      }

      if(a.func == 'CLONE') {
        setDefaults(a, { source: 'DEFAULT', count: 1, xOffset: 0, yOffset: 0, properties: {}, recursive: false, collection: 'DEFAULT' });
        const source = getCollection(a.source);
        if(source) {
          var c=[];
          for(const w of collections[source]) {
            for(let i=1; i<=a.count; ++i) {
              const newWidget = await w.clone(a.properties, a.recursive, problems, a.xOffset * i, a.yOffset * i);
              if(newWidget)
                c.push(newWidget);
              else
                problems.push(`Creating a clone failed. Check that parent, deck and cardType are valid.`);
            }
          }
          collections[a.collection]=c;
          if(routineLogging)
            jeLoggingRoutineOperationSummary( `'${a.source}'`, `'${JSON.stringify(a.collection)}'`);
        }
      }

      async function compute(o, v, x, y, z) {
        try {
          if (compute_ops.find(op => op.name == o) !== undefined) {
            v = await compute_ops.find(op => op.name == o).call(v, x, y, z);
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
        setDefaults(a, { collection: 'DEFAULT', variable: 'COUNT', owner: null });
        let collection;
        let theItem;
        if(a.holder !== undefined) {
          theItem = `${a.holder}`;
          variables[a.variable] = 0;
          for (const h of asArray(a.holder)) {
            if(this.isValidID(h,problems)) {
              const children = widgets.get(h).children();
              if(a.owner === null) {
                variables[a.variable] += children.length;
              } else {
                variables[a.variable] += children.filter(widget => widget.get('owner') === a.owner).length;
              }
            }
          }
        } else if(collection = getCollection(a.collection)) {
          if(a.owner === null) {
            variables[a.variable] = collections[collection].length;
          } else {
            variables[a.variable] = collections[collection].filter(widget => widget.get('owner') === a.owner).length;
          }
          theItem = `${a.collection}`
        }
        if(routineLogging)
          jeLoggingRoutineOperationSummary( `'${theItem}'`, `${JSON.stringify(variables[a.variable])}`)

      }

      if(a.func == 'DELAY') {
        setDefaults(a, { milliseconds: 0 });
        flushDelta();
        await sleep(a.milliseconds);
        if(routineLogging)
          jeLoggingRoutineOperationSummary(` for ${a.milliseconds} milliseconds`);
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
          if(routineLogging)
            jeLoggingRoutineOperationSummary( `'${a.collection}'`)
        }
      }

      if(a.func == 'FLIP') {
        setDefaults(a, { count: 'all', face: null, faceCyle: null, collection: 'DEFAULT' });
        if(a.count === 'all')
          a.count = 999999;

        let collection;
        if(a.holder !== undefined) {
          if(this.isValidID(a.holder,problems)) {
            await w(a.holder, async holder=>{
              for(const c of holder.children().slice(0, a.count))
                c.flip && await c.flip(a.face,a.faceCycle);
            });
          }
          if(routineLogging)
            jeLoggingRoutineOperationSummary(`holder '${a.holder}'`);
        } else if(collection = getCollection(a.collection)) {
          if(collections[collection].length) {
            for(const c of collections[collection].slice(0, a.count))
              c.flip && await c.flip(a.face,a.faceCycle);
          } else {
            problems.push(`Collection ${a.collection} is empty.`);
          }
          if(routineLogging)
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
          if(routineLogging)
            jeLoggingRoutineOperationStart( "loopRoutine", "loopRoutine" );
          await this.evaluateRoutine(a.loopRoutine, variables, collections, (depth || 0) + 1, true);
          if(routineLogging)
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
          if(routineLogging)
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
          if(routineLogging)
            jeLoggingRoutineOperationSummary( `values in range '${JSON.stringify(a.range)}'`);
        } else if(collection = getCollection(a.collection)) {
          for(const widget of collections[collection])
            await callWithAdditionalValues({ widgetID: widget.get('id') }, { DEFAULT: [ widget ] });
          if(routineLogging)
            jeLoggingRoutineOperationSummary( `widgets in '${a.collection}'`);
        }
      }

      if(a.func == 'GET') {
        const propertyPath = asArray(a.property || 'id');
        const mainProperty = String(propertyPath.shift());

        setDefaults(a, { variable: mainProperty, collection: 'DEFAULT', property: 'id', aggregation: 'first', skipMissing: false });
        const collection = getCollection(a.collection);
        if(collection) {

          let c = JSON.parse(JSON.stringify(collections[collection].map(w=>w.get(mainProperty))));
          for(const subkey of propertyPath)
            c = c.map(v=>v && typeof v == 'object' && v[subkey] || null);

          if (a.skipMissing)
            c = c.filter(v=>v !== null && v !== undefined);

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
          if(routineLogging)
            jeLoggingRoutineOperationSummary(`${a.aggregation} of '${mainProperty}' in '${a.collection}'`, `var ${a.variable} = ${JSON.stringify(variables[a.variable])}`);
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
            condition = await compute(a.relation, null, a.operand1, a.operand2);
          const branch = condition ? 'thenRoutine' : 'elseRoutine';
          if(Array.isArray(a[branch]))
            await this.evaluateRoutine(a[branch], variables, collections, (depth || 0) + 1, true);
          if(routineLogging) {
            if (a.condition === undefined)
              jeLoggingRoutineOperationSummary(`'${original.operand1}' ${a.relation} '${original.operand2}'`, `${JSON.stringify(condition)}`)
            else
              jeLoggingRoutineOperationSummary(`'${original.condition}'`, `${JSON.stringify(condition)}`)
          }
        } else
          problems.push(`IF operation is missing the 'condition' or 'operand1' parameter.`);
      }

      if(a.func == 'INPUT') {
        setDefaults(a, { player: playerName, block: false });
        // `player` may be a single name or a list. A non-empty list makes the
        // overlay appear for every listed player at once and returns their
        // results keyed by player name (e.g. choosing cards to pass in Hearts).
        // A null/empty `player` falls back to the acting player, so an INPUT
        // created from the editor template (which sets `player: null`) still
        // shows locally instead of silently doing nothing.
        let players = [ ...new Set(asArray(a.player).filter(Boolean)) ];
        const isMulti = Array.isArray(a.player) && players.length > 0;
        if(!players.length)
          players = [ playerName ];
        // Warn about names that aren't active players so a typo is not silently
        // indistinguishable from that player cancelling the input.
        for(const p of players)
          if(p !== playerName && activePlayers.indexOf(p) == -1)
            problems.push(`INPUT: '${p}' is not an active player; the overlay cannot be shown to them.`);
        // Only the initiator can show its own overlay locally (it has the live
        // variables/collections); everyone else is asked over the network.
        const showLocal = players.indexOf(playerName) != -1 ? registerAbort=>{
          const handle = {};
          const promise = this.showInputOverlay(cloneInputOverlayForPlayer(a, playerName, players.indexOf(playerName)), widgets, variables, collections, getCollection, problems, handle);
          registerAbort(()=>{ if(handle.abort) handle.abort(); });
          return promise;
        } : null;
        try {
          const usePlayerSpecificOverlay = hasPlayerSpecificChooseField(a);
          const overlaysByPlayer = usePlayerSpecificOverlay ? Object.fromEntries(players.map((p, i)=>[ p, cloneInputOverlayForPlayer(a, p, i) ])) : null;
          const results = await runInput({ widgetID: this.get('id'), overlay: a, overlaysByPlayer, players, variables, collections, showLocal });
          if(isMulti) {
            // Return each field's value keyed by the player who entered it.
            for(const field of a.fields || []) {
              if(!field.variable)
                continue;
              const keyed = {};
              for(const p of players)
                if(results[p])
                  keyed[p] = results[p].variables[field.variable];
              variables[field.variable] = keyed;
            }
            // Collections (e.g. from 'choose' fields) are unioned across players.
            for(const p of players) {
              if(!results[p])
                continue;
              for(const c in results[p].collections)
                collections[c] = [ ...(collections[c] || []), ...results[p].collections[c] ];
            }
          } else {
            const result = results[players[0]] || { variables: {}, collections: {} };
            // Results collected from another player must not rename/recolor the
            // player who is actually running the routine.
            if(players[0] !== playerName) {
              delete result.variables.playerName;
              delete result.variables.playerColor;
            }
            Object.assign(variables, result.variables);
            Object.assign(collections, result.collections);
          }
          if(routineLogging) {
            let varList = [];
            let valueList = [];
            a.fields.forEach(f=>{
              if(f.variable) {
                varList.push(f.variable);
                valueList.push(JSON.stringify(variables[f.variable]));
              }
            });
            jeLoggingRoutineOperationSummary(`${varList.join(', ')}`,`${valueList.join(', ')}`);
          }
        } catch(e) {
          abortRoutine = true;
          if(routineLogging)
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
            if(routineLogging) {
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
            if(routineLogging) {
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
        setDefaults(a, { count: a.from ? 1 : 'all', face: null, fillTo: null, collection: 'DEFAULT' });
        let count = a.fillTo || a.count;
        if(count === 'all')
          count = 999999;

        async function applyMove(source, target, c) {
          let moved = 0;
          const applyFlip = async function() {
            if(a.face !== null && c.flip)
              await c.flip(a.face);
          };
          if(source == target) {
            await applyFlip();
            await c.bringToFront();
            ++moved;
          } else if(c == target) {
            problems.push(`Skipping move of ${c.id} to itself.`);
          } else if(target.isDescendantOf(c)) {
            problems.push(`Skipping move of ${c.id} to its descendant ${target.id}.`);
          } else if(!a.fillTo || target.children().length < a.fillTo) {
            c.movedByButton = true;
            if(target.get('type') == 'seat') {
              if(target.get('hand') && target.get('player')) {
                if(widgets.has(target.get('hand'))) {
                  const targetHand = widgets.get(target.get('hand'));
                  await applyFlip();
                  if (targetHand == source) {
                    // cards are already in hand: only an owner update is needed
                    await c.set('owner', target.get('player'));
                  } else {
                    c.targetPlayer = target.get('player');
                    await c.moveToHolder(targetHand);
                    delete c.targetPlayer;
                  }
                  await c.bringToFront();
                  if(targetHand.get('type') == 'holder')
                    await targetHand.updateAfterShuffle(); // this arranges the cards in the new owner's hand
                  ++moved;
                } else {
                  problems.push(`Seat ${target.id} declares 'hand: ${target.get('hand')}' which does not exist.`);
                }
              } else {
                problems.push(`Seat ${target.id} is empty or does not define a hand.`);
              }
            } else {
              await applyFlip();
              await c.moveToHolder(target);
              ++moved;
            }
            delete c.movedByButton;
          }
          return moved;
        }

        let collection;
        if((a.collection || a.from) && this.isValidID(a.to, problems)) {
          if(a.from) {
            if(this.isValidID(a.from, problems)) {
              await w(a.from, async source=>await w(a.to, async target=>{
                for(const c of source.children().slice(0, count).reverse()) {
                  await applyMove(source, target, c);
                }
              }));
            } else {
              problems.push(`Source ${a.from} is invalid.`);
            }
          } else if(collection = getCollection(a.collection)) {
            let offset = 0;
            await w(a.to, async target=>{
              for(const c of collections[collection].slice(offset, offset+count))
                offset += await applyMove(c.get('parent') && widgets.has(c.get('parent')) ? widgets.get(c.get('parent')) : null, target, c);
              if(target.get('type') == 'holder')
                await target.updateAfterShuffle();
            });
          }
          if(routineLogging) {
            const logCount = count==1 ? '1 widget' : `${count == 999999 ? 'all' : count} widgets`;
            jeLoggingRoutineOperationSummary(`${logCount} from '${a.from || a.collection}' to '${a.to}'`)
          }
        }
      }

      if(a.func == 'MOVEXY') {
        setDefaults(a, { count: 1, face: null, x: 0, y: 0, snapToGrid: true, resetOwner: true });
        if(a.count === 'all')
          a.count = 999999;

        if(this.isValidID(a.from, problems)) {
          await w(a.from, async source=>{
            for(const c of source.children().slice(0, a.count).reverse()) {
              if(a.face !== null && c.flip)
                c.flip(a.face);
              await c.bringToFront();
              await c.setPosition(a.x, a.y, a.z || c.get('z'));
              if(a.resetOwner)
                await c.set('owner', null);
              if(a.snapToGrid)
                await c.snapToGrid();
              await c.set('parent', null);
            }
          });
          if(routineLogging) {
            const count = a.count==1 ? '1 widget' : `${a.count} widgets`;
            jeLoggingRoutineOperationSummary(`${count} from '${a.from}' to (${a.x}, ${a.y})`)
          }
        }
      }

      if(a.func == 'RECALL') {
        setDefaults(a, { owned: true, inHolder: true, excludeCollection: null, byDistance: false });

        let excludeCollection = null;
        if(a.excludeCollection) {
          if(excludeCollection = getCollection(a.excludeCollection)) {
            excludeCollection = collections[excludeCollection].map(e => widgets.get(e.id));
          } else {
            problems.push(`The collection ${a.excludeCollection} you want to exclude does not exist.`);
          }
        }

        if(this.isValidID(a.holder, problems)) {
          for(const holder of asArray(a.holder)) {
            const decks = widgetFilter(w=>w.get('type')=='deck'&&w.get('parent')==holder);
            if(decks.length) {
              for(const deck of decks) {
                let cards = widgetFilter(w=>w.get('deck')==deck.get('id'));
                if(!a.owned)
                  cards = cards.filter(c=>!c.get('owner'));
                if(!a.inHolder)
                  cards = cards.filter(c=>!c.get('_ancestor'));
                if(a.excludeCollection && excludeCollection)
                  cards = cards.filter(c=>!excludeCollection.includes(c));
                
                if(a.byDistance === true){
                  cards.sort((c1, c2) => {
                    const dx1 = deck.get('_centerAbsoluteX') - c1.get('_centerAbsoluteX');
                    const dy1 = deck.get('_centerAbsoluteY') - c1.get('_centerAbsoluteY');
                    const d1 = dx1 * dx1 + dy1 * dy1;                    
                    const dx2 = deck.get('_centerAbsoluteX') - c2.get('_centerAbsoluteX');
                    const dy2 = deck.get('_centerAbsoluteY') - c2.get('_centerAbsoluteY');
                    const d2 = dx2 * dx2 + dy2 * dy2;
                    
                    if(d1 !== d2)
                      return d1 - d2;
                    return c1.get('z') - c2.get('z');
                  });
                }
                
                for(const c of cards) {
                  if(c.get('_ancestor') == holder && !c.get('owner'))
                    await c.bringToFront();
                  else
                    await c.moveToHolder(widgets.get(holder));
                }
              }
            } else {
              problems.push(`Holder ${holder} does not have a deck.`);
            }
          };
          if(routineLogging) {
            jeLoggingRoutineOperationSummary(`'${a.holder}' ${a.owned ? ' (including hands)' : ''}`);
          }
        }
      }

      if (a.func == 'RESET') {
        setDefaults(a, { property: 'resetProperties' });      
        for(const widget of widgets.values()) {
          for(const [ key, value ] of Object.entries(widget.get(a.property) || {})) {
            if((key == 'parent' || key == 'deck') && value !== null && !widgets.has(value)) {
              problems.push(`Tried setting ${key} on widget ${widget.id} to ${value} which doesn't exist.`);
            } else {
              await widget.set(key, value);
            }
          }
        }
        if (routineLogging) {
          jeLoggingRoutineOperationSummary(`Reset properties for widgets with property '${a.property}'`);
        }
      }

      if(a.func == 'ROTATE') {
        setDefaults(a, { count: 1, angle: 90, mode: 'add', collection: 'DEFAULT' });
        if(a.count === 'all')
          a.count = 999999;

        let collection;
        const mode = a.mode == 'set' ? 'to' : 'by';
        if(a.holder !== undefined) {
          if(this.isValidID(a.holder, problems)) {
            await w(a.holder, async holder=>{
              for(const c of holder.children().slice(0, a.count))
                await c.rotate(a.angle, a.mode);
            });
            if(routineLogging) {
              jeLoggingRoutineOperationSummary(`${a.count == 999999 ? '' : a.count} ${a.count==1 ? 'widget' : 'widgets'} in '${a.holder}' ${mode} ${a.angle}`);
            }
          }
        } else if(collection = getCollection(a.collection)) {
          if(collections[collection].length) {
            for(const c of collections[collection].slice(0, a.count))
              await c.rotate(a.angle, a.mode);
            if(routineLogging)
              jeLoggingRoutineOperationSummary(`${a.count == 999999 ? '' : a.count} ${a.count==1 ? 'widget' : 'widgets'} in '${a.collection}' ${mode} ${a.angle}`);
          } else {
            problems.push(`Collection ${a.collection} is empty.`);
          }
        }
      }

      if(a.func == 'SCORE') {
        setDefaults(a, { mode: 'set', property: 'score', seats: null, round: null, value: null});
        if([ 'set', 'inc', 'dec' ].indexOf(a.mode) == -1) {
          problems.push(`Warning: Mode ${a.mode} interpreted as set.`);
          a.mode = 'set'
        }

        if(a.value === null)
          a.value = a.mode=='set' ? 0 : 1;
        if(isNaN(parseFloat(a.value))) {
          problems.push(`value ${a.value} must be a number, assuming 0.`);
          a.value = 0;
        }
        a.value = parseFloat(a.value);

        let round = a.round ? parseInt(a.round) : null;
        if(round !== null && (isNaN(parseInt(round)) || round < 1)) {
          problems.push(`round ${a.round} must be null or a positive integer, assuming null.`);
          round = null;
        }

        const seats = widgetFilter(w => w.get('type')=='seat' && (a.seats===null || asArray(a.seats).includes(w.get('id'))));

        const relation = (a.mode == 'set') ? '=' : (a.mode == 'dec' ? '-' : '+');
        for(let i=0; i < seats.length; i++) {
          let newScore = [...asArray(seats[i].get(a.property) || 0)];
          const seatRound = a.round === null ? newScore.length + 1 : a.round;
          if(a.round > newScore.length)
            newScore = newScore.concat(Array(a.round - newScore.length).fill(0));
          newScore[seatRound-1] = await compute(relation, null, newScore[seatRound-1] || 0, a.value);
          await seats[i].set(String(a.property), newScore);
        }

        if(routineLogging) {
          const phrase = round===null ? 'new round' : `round ${a.round}`;
          const seatIds = seats.map(w => w.get('id'));
          if(a.mode == 'inc' || a.mode == 'dec')
            jeLoggingRoutineOperationSummary(`${a.mode} ${phrase} in seats ${JSON.stringify(seatIds)} by ${a.value}`)
          else
            jeLoggingRoutineOperationSummary(`set ${phrase} in seats ${JSON.stringify(seatIds)} to ${a.value}`)
        }
      }

      if(a.func == 'SELECT') {
        setDefaults(a, { type: 'all', property: 'parent', relation: '==', value: null, max: 999999, collection: 'DEFAULT', mode: 'set', source: 'all', random: false });
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

          if (a.random) 
            c = shuffleArray(c);

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

          if(routineLogging) {
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
        } else if (collection = getCollection(a.collection)) {
          if (a.property == 'id') {
            for(const oldWidget of collections[collection]) {
              const oldID = oldWidget.get('id');
              let newState = JSON.parse(JSON.stringify(oldWidget.state));
              newState.id = await compute(a.relation, null, oldWidget.get(a.property), a.value);

              if(widgets.has(newState.id)) {
                problems.push(`id ${newState.id} already in use, ignored.`);
              } else if(typeof newState.id != 'string' || newState.id.length == 0) {
                problems.push(`id ${newState.id} is not a string or empty, ignored.`);
              } else {
                await updateWidgetId(newState, oldID);
                for(const c in collections)
                  collections[c] = collections[c].map(w=>w.id==oldID ? widgets.get(newState.id) : w);
              }
            }
          } else {
            for(const w of collections[collection]) {
              if (w.readOnlyProperties().has(a.property)) {
                problems.push(`Tried setting read-only property ${a.property}.`);
                continue;
              }

              if(a.relation == '+' && w.get(String(a.property)) == null)
                a.relation = '=';
              if(a.relation == '+' && a.value == null)
                problems.push(`null value being appended, SET ignored`);
              else
                await w.set(String(a.property), await compute(a.relation, null, w.get(String(a.property)), a.value));
            }
          }
        }
        if(routineLogging)
          jeLoggingRoutineOperationSummary(`'${a.property}' ${a.relation} ${JSON.stringify(a.value)} for widgets in '${a.collection}'`);
      }

      if(a.func == 'SHUFFLE') {
        setDefaults(a, { collection: 'DEFAULT', mode: 'true random', modeValue: 1 });
        let collection;
        if(a.holder !== undefined) {
          if(this.isValidID(a.holder, problems)) {
            await w(a.holder, async holder=>{
              await shuffleWidgets(holder.children(), a.mode, a.modeValue, true);
              if(typeof holder.updateAfterShuffle == 'function')
                await holder.updateAfterShuffle();
            });
            if(routineLogging)
              jeLoggingRoutineOperationSummary(`holder ${a.holder}`);
          }
        } else if(collection = getCollection(a.collection)) {
          if(collections[collection].length) {
            await shuffleWidgets(collections[collection], a.mode, a.modeValue);
          } else {
            problems.push(`Collection ${a.collection} is empty.`);
          }
          if(routineLogging)
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
              if(typeof holder.updateAfterShuffle == 'function')
                await holder.updateAfterShuffle();
            });
          }
          if(routineLogging)
            jeLoggingRoutineOperationSummary(`widgets in '${a.holder}' by ${key}${reverse}`);
        } else if(collection = getCollection(a.collection)) {
          if(collections[collection].length) {
            await sortWidgets(collections[collection], a.key, a.reverse, a.locales, a.options, a.rearrange);
            await w(collections[collection].map(i=>i.get('parent')), async holder=>{
              if(typeof holder.updateAfterShuffle == 'function')
                await holder.updateAfterShuffle();
            });
          } else {
            problems.push(`Collection ${a.collection} is empty.`);
          }
          if(routineLogging)
            jeLoggingRoutineOperationSummary(`widgets in '${a.collection}' by ${key}${reverse}`);
        }
      }

      if(a.func == 'SWAPHANDS') {
        setDefaults(a, { interval: 1, direction: 'forward', source: 'all', keepOrder: false });
        if(['forward', 'backward', 'random'].indexOf(a.direction) == -1) {
          problems.push(`Warning: direction ${a.direction} interpreted as forward.`);
          a.direction = 'forward'
        }
        let allSeats = Array.from(widgets.values()).filter(w=>w.get('type')=='seat');
        let c = (a.source=='all' ? allSeats : collections[getCollection(a.source)].filter(w=>w.get('type')=='seat')).filter(w=>w.get('player'));
        if (c.length > 1) {
          if(a.direction == 'forward') {
            c.sort((a, b)=>a.get('index')-b.get('index'));
          } else if(a.direction == 'backward') {
            c.sort((a, b)=>b.get('index')-a.get('index'));
          } else if (a.direction == 'random') {
            for (let i = c.length - 1; i > 0; i--) {
              const rand = Math.floor(Math.random() * (i + 1));
              [c[i], c[rand]] = [c[rand], c[i]];
            }
          }
          // all hands are collected before anything is moved so that a hand does not
          // pick up the widgets an earlier seat just passed to it
          let moves = [];
          for (let i = 0; i < c.length; i++) {
            let source = c[i];
            let target = c[(i + a.interval) % c.length];
            let hand = source.get('hand');
            if (this.isValidID(hand, problems)) {
              let perOwner = widgets.get(hand).get('childrenPerOwner');
              let contents = widgets.get(hand).children().reduce(
                function (collect, w) {
                  if (!perOwner || w.get('owner') == source.get('player')) {
                    collect.unshift(w);
                  }
                  return collect
                },
                []
              );
              moves.push({ source, contents, to: target.get('id') });
            }
          }
          if(moves.length) {
            if(routineLogging)
              jeLoggingRoutineOperationStart("Moves", "Moves");
            for(const move of moves) {
              // the collection is named after the seat it comes from so that the
              // generated MOVE reads like "from 'hand of seat1' to 'seat2'" in the log.
              // a collection of the surrounding routine that happens to use the same
              // name is shadowed only while its MOVE runs and then put back
              const collection = `hand of ${move.source.get('id')}`;
              const shadowed = collections[collection];
              // the widgets are looked up right before their own MOVE so that one which
              // a routine of an earlier MOVE removed is left alone, exactly like when
              // the generated MOVE still received a list of IDs. keepOrder keeps the
              // order of the hand, the default is the creation order because that is
              // the order widgetFilter - and with it MOVE - used all along
              collections[collection] = a.keepOrder
                ? move.contents.filter(w=>!w.isBeingRemoved)
                : widgetFilter(w=>move.contents.indexOf(w) != -1);
              try {
                await this.evaluateRoutine([ { func: 'MOVE', collection, to: move.to } ], variables, collections, (depth || 0) + 1, true);
              } finally {
                if(shadowed === undefined)
                  delete collections[collection];
                else
                  collections[collection] = shadowed;
              }
            }
            if(routineLogging)
              jeLoggingRoutineOperationEnd([], variables, collections, false);
          }
          if(routineLogging) {
            const how = a.direction == 'random' ? `hands in a random seat order by ${a.interval}` : `hands ${a.direction} by ${a.interval}`;
            jeLoggingRoutineOperationSummary(moves.length ? `${how}${a.keepOrder ? ', keeping the card order' : ''}` : 'no seat with a player has a valid hand, nothing to swap');
          }
        } else if(routineLogging) {
          jeLoggingRoutineOperationSummary('less than two seats with a player, nothing to swap');
        }
      }

      if(a.func == 'TIMER') {
        setDefaults(a, { value: 0, seconds: 0, mode: 'toggle', collection: 'DEFAULT' });
        const collection = a.timer === undefined && getCollection(a.collection);
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
          } else if(collection) {
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
          // a "minutes:seconds" string in seconds is already milliseconds after conversion, so only plain numbers are multiplied by 1000
          const seconds = timeToMS(a.seconds);
          const milliseconds = seconds !== a.seconds ? seconds : a.seconds*1000 || a.value;
          if(a.timer !== undefined) {
            if (this.isValidID(a.timer, problems)) {
              await w(a.timer, async widget=>{
                if(widget.setMilliseconds)
                  await widget.setMilliseconds(milliseconds, a.mode);
              });
            }
          } else if(collection) {
            if(collections[collection].length) {
              for(const c of collections[collection])
                if(c.setMilliseconds)
                  await c.setMilliseconds(milliseconds, a.mode);
            } else {
              problems.push(`Collection ${a.collection} is empty.`);
            }
          }
        };
        if(routineLogging &&
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

      if(a.func == 'UPLOAD') {
        setDefaults(a, { variable: 'uploadedFileName', fileTypes: null });
        const uploadedAsset = await uploadAsset(null, a.fileTypes);
        if(!String(uploadedAsset).match(/^\/assets\/[0-9_-]+$/)) {
          variables[a.variable] = false;
          if(routineLogging)
            jeLoggingRoutineOperationSummary("UPLOAD cancelled");
        } else {
          variables[a.variable] = uploadedAsset;
          if(routineLogging)
            jeLoggingRoutineOperationSummary(`'${a.variable}'`, `${JSON.stringify(variables[a.variable])}`);
        }
      }

      if(a.func == 'TURN') {
        setDefaults(a, { turn: 1, turnCycle: 'forward', source: 'all', collection: 'TURN' });
        if([ 'forward', 'backward', 'random', 'position', 'seat' ].indexOf(a.turnCycle) == -1) {
          problems.push(`Warning: turnCycle ${a.turnCycle} interpreted as forward.`);
          a.turnCycle = 'forward'
        }
        
        let allSeats = Array.from(widgets.values()).filter(w=>w.get('type')=='seat');
        let c = (a.source=='all' ? allSeats : collections[getCollection(a.source)].filter(w=>w.get('type')=='seat')).filter(w=>w.get('player'));

        if (c.length == 0) {
          if(routineLogging)
            jeLoggingRoutineOperationSummary(`No active seats found in collection ${a.source}.`);
        } else {
          if (c.length > 1) {
            if (a.turnCycle == 'forward' || a.turnCycle == 'position') {
              c.sort((x, y) => x.get('index')-y.get('index'));
            } else if (a.turnCycle == 'backward') {
              c.sort((x, y) => y.get('index')-x.get('index'));
            } else if (a.turnCycle == 'random') {
              for (let i = c.length - 1; i > 0; i--) {
                const rand = Math.floor(Math.random() * (i + 1));
                [c[i], c[rand]] = [c[rand], c[i]];
              }
            }
          }

          if (a.turnCycle != 'position' && a.turnCycle != 'seat' && a.turnCycle != 'random') {
            // rotate the set of seats so the current turn is first
            for (let i = 0; i < c.length && !c[0].get('turn'); i++) {
              c.unshift(c.pop());
            }
          }

          // filter out seats with skipTurn set to true
          let unskipped = c.filter(w=>!w.get('skipTurn'));
          let target = unskipped[0];

          if (unskipped.length === 0) {
            problems.push(`All seats in collection '${a.source}' have 'skipTurn' set to true. No turn change.`);
          } else {
            // identify the correct target seat
            if (a.turnCycle == 'position') {
              if (a.turn == 'last') {
                target = unskipped[unskipped.length - 1];
              } else if (Number.isFinite(a.turn)) {
                target = unskipped[(a.turn - 1) % unskipped.length];
              }
            } else if (a.turnCycle == 'seat') {
              // Selecting a specific seat so in this case skipTurn will be ignored
              target = c.find(w => w.get('id') == a.turn);
              if (!target) {
                problems.push(`Seat ${a.turn} is not a valid seat id in collection ${a.source}.`);
                target = c[0];
              }
            } else {
              const turn = Number.isFinite(a.turn) ? a.turn : 1;
              const offset = (c[0] == unskipped[0] ? 0 : 1);
              target = unskipped[(turn - offset) % unskipped.length];
            }

            // execute the change in turn properties and collect turn seats into output collection
            collections[a.collection] = [];
            for (const w of allSeats) {
              await w.set('turn', w.get('index') == target.get('index'));
              if (w.get('turn') && w.get('player'))
                collections[a.collection].push(w);
            }
          }

          if(routineLogging) {
            if (target) {
              const indexList = c.map(w => w.get('index'));
              const turn = target.get('index');
              jeLoggingRoutineOperationSummary(`Changed turn of seats to ${turn} - active seats: ${JSON.stringify(indexList)}`);
            } else {
              jeLoggingRoutineOperationSummary(`All seats in collection '${a.source}' have 'skipTurn' set to true. No turn change.`);
            }
          }
        }
      }

      if(a.func == 'VAR') {
        setDefaults(a, { variables: {} });
        for(const [ key, value ] of Object.entries(a.variables||{}))
          variables[key] = value;

        if(routineLogging) {
          jeLoggingRoutineOperationSummary(`${Object.entries(a.variables||{}).map(e=>`${e[0]}=${JSON.stringify(e[1])}`).join(', ')}`);
        }
      }

      if(routineLogging) jeLoggingRoutineOperationEnd(problems, variables, collections, false);

      if(!routineLogging && problems.length)
        console.log(problems);

      if(abortRoutine)
        break

    } // End iterate over functions in routine

    if(routineLogging)
      jeLoggingRoutineEnd(variables, collections);
    else if(jeRoutineLogging)
      jeLoggingRoutineNotLogged(this, property); // logging was enabled while this routine was running

    batchEnd();

    if(variables.playerColor != playerColor && typeof variables.playerColor == 'string') {
      const hexColor = toHex(variables.playerColor);
      toServer('playerColor', { player: playerName, color: hexColor });
      playerColor = hexColor;
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

  getWithPropertyReplacements(property, valueOverride) {
    const properties = new Set();

    const processProperty = (prop) => {
      if (typeof prop === 'string') {
        // Apply cssReplaceProperties if the property is a string
        return this.cssReplaceProperties(prop, properties);
      } else if (typeof prop === 'object' && prop !== null) {
        // Recursively apply processProperty to each value if it's an object
        const result = Array.isArray(prop) ? [] : {};
        for (const key in prop) {
          if (prop.hasOwnProperty(key)) {
            result[key] = processProperty(prop[key]);
          }
        }
        return result;
      }
      // If the property is neither a string nor an object, return it as is
      return prop;
    };

    const result = processProperty(valueOverride !== undefined ? valueOverride : this.get(property));
    this.propertiesUsedInProperty[property] = Array.from(properties);
    return result;
  }

  getWithPropertyReplacements_checkDelta(property, delta) {
    for(const usedProperty of (this.propertiesUsedInProperty[property]||[]))
      if(delta[usedProperty] !== undefined)
        return true;
    return false;
  }

  getFaceCount() {
    return 1;
  }

  hideEnlarged() {
    if (!this.domElement.className.match(/selected/)) {
      $('#enlarged').classList.add('hidden');
      if($('#enlargeStyle'))
        removeFromDOM($('#enlargeStyle'));
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

  isDescendantOf(widget) {
    if (this.get('parent') == widget.get('id')) {
      return true;
    }
    if (widgets.has(this.get('parent'))) {
      return widgets.get(this.get('parent')).isDescendantOf(widget);
    }
    return false;
  }

  isValidID(id, problems) {
    if(Array.isArray(id))
      return !id.map(i=>this.isValidID(i, problems)).filter(r=>r!==true).length;
    if(widgets.has(id))
      return true;
    problems.push(`Widget ID ${id} does not exist.`);
    return false;
  }

  isVisible() {
    // Ensure the element exists
    if (!this.domElement) return false;

    // Traverse the element and all parent elements to check visibility (display, visibility, opacity)
    let parent = this.domElement;
    while (parent) {
      const style = window.getComputedStyle(parent);
      if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) <= 0)
        return false;
      parent = parent.parentElement;
    }

    // Get the bounding rect of the element relative to the viewport
    const rect = this.domElement.getBoundingClientRect();

    // Get the bounding rect of the #room element
    const roomRect = $('#roomArea').getBoundingClientRect();

    // Check if the element is within the viewport of the room
    return (
      rect.top < roomRect.bottom &&
      rect.left < roomRect.right &&
      rect.bottom > roomRect.top &&
      rect.right > roomRect.left
    );
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
    delete this.lastMoveCoord;

    // Where the widget is, in the coordinates of the room, taken while its
    // parent is still the one x and y are measured against. Dropping that
    // parent below does not convert them, so from here until the first position
    // move() writes they are a holder's numbers read as the room's - and a
    // dragLimit walks the drag from where the widget is, so it would walk it
    // from the wrong end of the board once. Cleared again by that first move.
    this.dragLimitStartCoord = this.coordGlobalFromCoordParent({ x: +this.get('x') || 0, y: +this.get('y') || 0 });

    // Lines that take a widget dropped onto their path as a stop. Collected once
    // like the drop targets below, but not restricted to widgets that can be
    // dragged in play: a stop is usually placed in edit mode.
    this.stopDropLines = this.get('type') == 'line' ? [] : widgetFilter(w=>w.get('type') == 'line' && w.get('dropTarget') && w.isVisible());

    if(!this.get('fixedParent') && this.get('movable')) {
      this.dropTargets = this.validDropTargets();
      this.currentParent = widgets.get(this.get('_ancestor'));
      if(this.currentParent)
        await this.set('hoverParent', this.get('_ancestor'));
      this.hoverTarget = null;
      this.disablePileUpdateAfterParentChange = true;
      await this.set('parent', null);
      delete this.disablePileUpdateAfterParentChange;

      for(const t of this.dropTargets)
        t.domElement.classList.add('droppable');
    }
  }

  async move(coordGlobal, localAnchor) {
    let newCoord = this.dragLimitedCoord(this.dragCorner(coordGlobal, localAnchor));

    if(tracingEnabled)
      sendTraceEvent('move', { id: this.get('id'), coordGlobal, localAnchor, newX: newCoord.x, newY: newCoord.y });

    this.lastMoveCoord = coordGlobal;

    await this.setPosition(newCoord.x, newCoord.y, this.get('z'));
    // x and y are the drag's own numbers now, in whatever the widget is
    // parented to, so they say where it is again
    delete this.dragLimitStartCoord;
    await this.snapToGrid();

    if(!this.get('fixedParent') && this.get('movable')) {
      await this.checkParent();

      const lastHoverTarget = this.hoverTarget;
      // The hit test below asks the DOM where this widget is, but the delta that
      // carries the position set above only reaches the DOM when the batch around
      // the mouse event ends. Without the flush the drop target is computed for the
      // position of the *previous* mouse event - so a drag that moves further than
      // half a holder between two events resolves the drop against the square the
      // widget has already left, and the piece lands next to where it was dropped
      // (or the game rejects the move and sends it back).
      if(this.domElement.style.transform != this.cssTransform())
        flushDelta();
      const myCenter = center(this.domElement);
      const myMinDim = Math.min(this.get('width'), this.get('height')) * this.get('_absoluteScale');
      this.hoverTarget = null;
      let hitElements = document.elementsFromPoint(myCenter.x, myCenter.y);

      // First, check for elements under the midpoint in order in which they were hit.
      for (let i = 0; i < hitElements.length; i++) {
        let widget = widgets.get(unescapeID(hitElements[i].id.slice(2)));
        if (hitElements[i].classList.contains('droppable') && widget && widget.get('type') != 'line') {
          this.hoverTarget = widget;
          break;
        }
      }
      // Then, look for nearby elements if nothing found in the previous pass.
      if (!this.hoverTarget) {
        let targetDist = 99999;
        for(const t of this.dropTargets) {
          // a line takes a drop close to its path, not anywhere in its bounding
          // box, so it is hit tested by lineStopDropTarget() instead
          if(t.get('type') == 'line')
            continue;
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

        // When the hover target changes we may need to create or remove the shadow widget.
        // Only create a shadow widget if the holder is shared and doesn't already have one in it.
        // Multiple shadows being positioned in the same holder can lead to conflicting updates.
        if (!this.get('dropShadowWidget') && this.hoverTarget && this.hoverTarget.get('dropShadow') &&
            (this.hoverTarget.get('childrenPerOwner') ||
             this.hoverTarget.children().filter(c => c.get('dropShadowOwner') != null).length == 0)) {
          await this.createShadowWidget();
        } else if (!this.hoverTarget || !this.hoverTarget.get('dropShadow')) {
          await this.hideShadowWidget();
        }
      }

      // If we currently have a shadow widget, position it and place it in the holder.
      if (this.hoverTarget && this.get('dropShadowWidget') && widgets.has(this.get('dropShadowWidget'))) {
        const shadowWidget = widgets.get(this.get('dropShadowWidget'));

        const globalPoint = this.dragCorner(coordGlobal, localAnchor, this.hoverTarget);
        const shadowParentId = shadowWidget.get('parent');
        if (shadowParentId != this.hoverTarget.get('id')) {
          shadowWidget.currentParent = widgets.get(shadowParentId);
          await shadowWidget.set('parent', null);
          await shadowWidget.setPosition(globalPoint.x, globalPoint.y, globalPoint.z);
          await shadowWidget.checkParent(true);
          await shadowWidget.moveToHolder(this.hoverTarget);
        } else {
          await shadowWidget.setPosition(globalPoint.x, globalPoint.y, globalPoint.z);
          await this.hoverTarget.onChildAddAlign(shadowWidget);
        }
      }
    }

    this.highlightStopDropLine(this.lineStopDropTarget());
  }

  // The line this widget would attach to as a stop if it were dropped where it
  // is now, or null. A real drop target wins: a widget dropped into a holder
  // that happens to sit on a line goes into the holder.
  lineStopDropTarget() {
    if(this.hoverTarget || !this.stopDropLines || !this.stopDropLines.length)
      return null;
    const center = this.coordGlobalFromCoordLocal({ x: +this.get('width')/2, y: +this.get('height')/2 });
    let best = null;
    for(const line of this.stopDropLines) {
      const target = widgets.has(line.id) ? line.stopDropTarget(this, center) : null;
      if(target && (!best || target.distance < best.distance))
        best = target;
    }
    return best;
  }

  // make it visible during the drag which line a drop would attach this widget to
  highlightStopDropLine(target) {
    const line = target && target.line || null;
    if(this.stopDropHighlight == line)
      return;
    if(this.stopDropHighlight && this.stopDropHighlight.domElement)
      this.stopDropHighlight.domElement.classList.remove('lineDropTarget');
    this.stopDropHighlight = line;
    if(line)
      line.domElement.classList.add('lineDropTarget');
  }

  // The widget the drag took this one out of: dragging detaches it right away
  // and only remembers where it came from in currentParent.
  currentParentWidget() {
    return this.currentParent || (widgets.has(this.get('parent')) ? widgets.get(this.get('parent')) : null);
  }

  // Attach to (or detach from) a line that takes dropped widgets. Entering and
  // leaving one changes parentage just like a holder does, which applies the
  // line's onEnter/onLeave and triggers its enterRoutine/leaveRoutine. Lines
  // that take no drops keep their stop lists, so a game can rely on them.
  async applyLineStopDrop(target) {
    const line = target && target.line || null;
    const from = this.currentParentWidget();

    // a widget that only rides on a line - listed as a stop without being its
    // child - is taken off that list when it is dragged away
    for(const other of linesWithStop(this.id))
      if(other != line && other != from && other.get('dropTarget') && compareDropTarget(this, other))
        await other.removeStop(this.id);

    if(line) {
      await line.addStop(this.id, target.position);
      // a widget that cannot change parent just rides on the line instead
      if(!this.get('fixedParent'))
        await this.moveToHolder(line);
    } else if(from && from.get('type') == 'line' && !this.get('fixedParent')) {
      // dropping it off the line hands it back to the room, which lets the line
      // dispense it: onLeave is applied and the stop comes off the list
      this.currentParent = from;
      await this.checkParent(true);
    }
  }

  async moveEnd(coordGlobal, localAnchor) {
    if(tracingEnabled)
      sendTraceEvent('moveEnd', { id: this.get('id'), coordGlobal, localAnchor });

    // dropLimit constrains manual drops only, and every pile this widget can
    // still form from here on is one. Dropping into a holder reparents it,
    // which runs updatePiles() before the call at the end of this method, so
    // the marker has to cover the whole drop rather than just that call.
    this.pileUpdateFromDrag = true;

    // The drop belongs where the button was released, not where the last mousemove
    // reported: a fast drag can end with a mouseup at coordinates no mousemove ever
    // delivered, and everything below - the drop target, the line stop, the position -
    // would then be resolved for a spot the widget has already been dragged away from.
    // Applying the release coordinates first also makes the drop target match what the
    // player last saw highlighted, since move() recomputes it.
    const releasedElsewhere = coordGlobal && (!this.lastMoveCoord || this.lastMoveCoord.x != coordGlobal.x || this.lastMoveCoord.y != coordGlobal.y);
    if(releasedElsewhere)
      await this.move(coordGlobal, localAnchor);
    delete this.lastMoveCoord;
    // a click is a moveStart and a moveEnd with no move in between, so what it
    // took for that first move has to go whether one happened or not
    delete this.dragLimitStartCoord;

    await this.hideShadowWidget();
    await this.set('dragging', null);

    // read where the drag ended before the drop into a holder below moves the widget
    const stopDropTarget = this.lineStopDropTarget();
    this.highlightStopDropLine(null);
    delete this.stopDropLines;

    await this.set('hoverTarget', null);

    if(!this.get('fixedParent') && this.get('movable')) {
      for(const t of this.dropTargets)
        t.domElement.classList.remove('droppable');

      await this.checkParent();

      if(this.hoverTarget) {
        let coordNew = this.dragCorner(coordGlobal, localAnchor, this.hoverTarget);
        this.setPosition(coordNew.x, coordNew.y, this.get('z'));
        await this.snapToGrid();
        await this.moveToHolder(this.hoverTarget);
        this.hoverTarget.domElement.classList.remove('droptarget');
      }
    }

    await this.applyLineStopDrop(stopDropTarget);

    this.hideEnlarged();
    if(this.domElement.classList.contains('longtouch'))
      this.domElement.classList.remove('longtouch');

    await this.updatePiles();
    delete this.pileUpdateFromDrag;
  }

  async hideShadowWidget() {
    if (!this.get('dropShadowWidget'))
      return;
    if (widgets.has(this.get('dropShadowWidget'))) {
      const shadowWidget = widgets.get(this.get('dropShadowWidget'));
      const holder = widgets.get(shadowWidget.get('parent'));
      const preventRearrange = shadowWidget.get('parent') == this.get('hoverTarget');
      shadowWidget.currentParent = holder;
      if (preventRearrange)
        holder.preventRearrangeDuringPileDrop = true;

      await shadowWidget.set('parent', null);
      await shadowWidget.checkParent(true);
      await removeWidgetLocal(shadowWidget.get('id'));
      if (preventRearrange)
        delete holder.preventRearrangeDuringPileDrop;
    }
    await this.set('dropShadowWidget', null);
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
      // deleting a stop takes it off the lines that list it; a rename is a
      // remove + re-add of the same state, so it keeps its place instead
      if(this.isBeingRemoved && !this.isBeingRenamed)
        for(const line of linesWithStop(this.id))
          await line.removeStop(this.id);
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

    // x and y alone are written twice per mousemove of every drag, so bail out
    // before the inheritance walk for everything a line cannot react to - and
    // once more for the games (the vast majority) that contain no line at all
    if(!lineRelevantProperties.has(property))
      return;
    const lines = widgetFilter(w=>w.get('type') == 'line');
    if(!lines.length)
      return;

    for(const widget of this.widgetsInheritingProperty(property)) {
      await widget.updateConnectedLineEndpoints(lines);

      // a stop is listed in a line's stops property and does not have to be a
      // child of it, so ask every line that lists it to re-space
      if(stopLayoutProperties.has(property))
        for(const line of lines)
          if(lineListsStop(line, widget.id))
            await line.onStopPropertyChange(widget);
    }
  }

  // A source property can affect widgets that inherit it through more than one
  // level. Return each effective inheritor once, plus the source widget itself.
  widgetsInheritingProperty(property, result = new Set) {
    if(result.has(this))
      return result;
    result.add(this);
    for(const inheriting of StateManaged.inheritFromMapping[this.id] || []) {
      const definition = inheriting.inheritFrom()[this.id] || [];
      if(inheriting.state[property] === undefined && inheriting.inheritFromIsValid(definition, property))
        inheriting.widgetsInheritingProperty(property, result);
    }
    return result;
  }

  // Connections are expressed against a target's global transform. A change
  // to this widget can therefore move endpoints connected to it or any child.
  // Collecting the descendants is the expensive half, so only do it once it is
  // known that some line is connected to anything at all.
  async updateConnectedLineEndpoints(lines) {
    const connected = (lines || widgetFilter(w=>w.get('type') == 'line')).filter(line=>line.get('connectStart') || line.get('connectEnd'));
    if(!connected.length)
      return;
    const targetIDs = new Set([ this.id ]);
    let added = true;
    while(added) {
      added = false;
      for(const widget of widgets.values()) {
        if(!targetIDs.has(widget.id) && targetIDs.has(widget.get('parent'))) {
          targetIDs.add(widget.id);
          added = true;
        }
      }
    }
    for(const line of connected)
      if([ line.get('connectStart'), line.get('connectEnd') ].some(connection=>connection && targetIDs.has(connection.line)))
        await line.applyConnections();
  }

  readOnlyProperties() {
    return readOnlyProperties;
  }

  renderReadonlyCopyRaw(state, target, isChild=false) {
    delete state.id;
    // the copy is not part of the room state, so nothing it renders may be written back (editable card text)
    this.isReadonlyCopy = true;
    if(!isChild) {
      state.x = 0;
      state.y = 0;
      state.rotation = 0;
      state.scale = 1;
    }
    state.parent = null;
    state.owner = null;
    state.linkedToSeat = null;
    state.onlyVisibleForSeat = null;

    this.applyInitialDelta(state);
    target.appendChild(this.domElement);
    if(this instanceof Card)
      this.deck.removeCard(this);
    return this;
  }

  renderReadonlyCopy(propertyOverride, target, includeChildren=false, isChild=false) {
    const newID = generateUniqueWidgetID();
    const newWidget = new this.constructor(newID);
    newWidget.renderReadonlyCopyRaw(Object.assign({}, this.state, propertyOverride), target, isChild);
    if(includeChildren)
      for(const child of widgetFilter(w=>w.get('parent') == this.id))
        if(this.get('type') != 'holder' || !compareDropTarget(child, this) || includeChildren == 'all')
          child.renderReadonlyCopy({}, newWidget.domElement, includeChildren, true);
    return newWidget;
  }

  requiresHiddenCursor() {
    if(this.get('hidePlayerCursors'))
      return true;
    if(this.get('parent') && widgets.has(this.get('parent')))
      return widgets.get(this.get('parent')).requiresHiddenCursor();
    if(this.get('hoverParent') && widgets.has(this.get('hoverParent')))
      return widgets.get(this.get('hoverParent')).requiresHiddenCursor();
    return false;
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

  setLimbo(isLimbo) {
    if(this.isLimbo == isLimbo)
      return;
    if(isLimbo) {
      const topTransform = getElementTransformRelativeTo(this.domElement, $('#topSurface'));
      $('#topSurface').appendChild(this.domElement);
      if(topTransform)
        this.domElement.style.transform = topTransform;
    }
    this.domElement.classList.toggle('limbo', isLimbo);
    this.isLimbo = isLimbo;
  }

  async setText(text, mode, problems) {
    if (this.get('text') !== undefined) {
      if(mode == 'inc' || mode == 'dec') {
        let newText = (parseFloat(this.get('text')) || 0) + (mode == 'dec' ? -1 : 1) * text;
        const decimalPlacesOld = String(this.get('text')).match(/\..*$/);
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

  showEnlarged(event, delta) {
    if(this.get('enlarge')) {
      const id = this.get('id');
      const e = $('#enlarged');
      // If there is no delta passed in, we must update the enlarged widget. Otherwise,
      // we only need to update it if the delta results in a visual change.
      let needsContentUpdate = !delta;
      if (delta) {
        for (let prop in delta) {
          if (prop != 'x' && prop != 'y' && prop != 'z' && prop != 'dragging') {
            needsContentUpdate = true;
            break;
          }
        }
      }
      const boundBox = this.domElement.getBoundingClientRect();
      let cssText = this.domElement.style.cssText;
      cssText += `;--originalLeft:${boundBox.left}px`;
      cssText += `;--originalTop:${boundBox.top}px`;
      cssText += `;--originalRight:${boundBox.right}px`;
      cssText += `;--originalBottom:${boundBox.bottom}px`;
      // Only update the enlarged element if there is a non-position delta.
      if (needsContentUpdate)
        e.innerHTML = this.domElement.innerHTML;

      e.className = this.domElement.className;
      e.dataset.id = id;

      if(this.get('_ancestor') && widgets.has(this.get('_ancestor')) && widgets.get(this.get('_ancestor')).domElement.classList.contains('showCardBack'))
        e.classList.add('showCardBack');

      for(const clone of $a('canvas', e)) {
        const original = $(`canvas[data-id = '${clone.dataset.id}']`, this.domElement);
        const context = clone.getContext('2d');
        clone.width = original.width;
        clone.height = original.height;
        context.drawImage(original, 0, 0);
      }

      const originalTextareas = [...$a('textarea', this.domElement)];
      const clonedTextareas   = [...$a('textarea', e)];
      for(const i in originalTextareas)
        clonedTextareas[i].value = originalTextareas[i].value;

      e.style.cssText = cssText;
      e.style.display = this.domElement.style.display;
      e.style.transform = `scale(calc(${this.get('enlarge')} * var(--scale)))`;
      const cursor = clientPointer.getBoundingClientRect();
      if(cursor.left < window.innerWidth/2)
        e.classList.add('right');
      if(cursor.top < window.innerHeight/2)
        e.classList.add('bottom');

      const wStyle = $(`#STYLES_${this.cssScope}`);
      if(wStyle) {
        if($('#enlargeStyle'))
          removeFromDOM($('#enlargeStyle'));
        const eStyle = document.createElement('style');
        eStyle.id = "enlargeStyle";
        eStyle.appendChild(document.createTextNode(wStyle.textContent.split(`#w_${this.cssScope}`).join('#enlarged')));
        $('head').appendChild(eStyle);
      }
    }
    if(event)
      event.preventDefault();
  }

  async showInputOverlay(o, widgets, variables, collections, getCollection, problems, handle) {
    this.showInputOverlayWorkingState(false);

    $('#activeGameButton').dataset.overlay = 'buttonInputOverlay';
    $('#buttonInputCancel').style.visibility = "visible";
    return new Promise((resolve, reject) => {
      const maxRandomRotate = o.randomRotation || 0;
      const rotation = Math.floor(rand() * maxRandomRotate) - (maxRandomRotate / 2);
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
      if (o.cancelButtonText === null && o.cancelButtonIcon === null) {
        $('#buttonInputCancel').style.visibility = "hidden";
      } else if (!o.cancelButtonText && !o.cancelButtonIcon)
        cancelButtonText = "Cancel";

      $('#buttonInputGo label').textContent = o.confirmButtonText || confirmButtonText;
      $('#buttonInputCancel label').textContent = o.cancelButtonText || cancelButtonText;

      $('#buttonInputGo span').textContent = o.confirmButtonIcon || "";
      $('#buttonInputCancel span').textContent = o.cancelButtonIcon || "";

      for(const field of o.fields || []) {
        const dom = document.createElement('div');
        dom.style = field.css || "";
        dom.className = "input"+field.type;

        if(field.type == 'choose') {
          let collection;
          if(field.holder) {
            field.widgets = [].concat(...asArray(field.holder).map(w=>widgets.has(w)?widgets.get(w).children():[])).map(w=>w.id);
          } else if(collection = collections[getCollection(field.source || 'DEFAULT')]) {
            field.widgets = collection.map(w=>w.id);
          } else {
            field.widgets = [];
          }
        }

        formField(field, dom, 'INPUT_' + escapeID(this.get('id')) + ';' + field.variable);
        $('#buttonInputFields').appendChild(dom);
      }

      const goHandler = e=>{
        if(this.evaluateInputOverlay(o, resolve, reject, true)) {
          $('#buttonInputGo').removeEventListener('click', goHandler);
          $('#buttonInputCancel').removeEventListener('click', cancelHandler);
          delete $('#activeGameButton').dataset.overlay;
        }
      };
      const cancelHandler = e=>{
        if(this.evaluateInputOverlay(o, resolve, reject, false)) {
          $('#buttonInputGo').removeEventListener('click', goHandler);
          $('#buttonInputCancel').removeEventListener('click', cancelHandler);
          delete $('#activeGameButton').dataset.overlay;
        }
      };
      on('#buttonInputGo', 'click', goHandler);
      on('#buttonInputCancel', 'click', cancelHandler);
      // Allow the overlay to be closed remotely (e.g. the input was cancelled
      // for everyone via the block overlay, or the initiator disconnected).
      if(handle) {
        handle.abort = ()=>{
          $('#buttonInputGo').removeEventListener('click', goHandler);
          $('#buttonInputCancel').removeEventListener('click', cancelHandler);
          delete $('#activeGameButton').dataset.overlay;
          showOverlay(null);
          reject({ variables: {}, collections: {} });
        };
      }
      showOverlay('buttonInputOverlay');
      const inputs = $a('#buttonInputFields input, #buttonInputFields select');
      if(inputs.length) {
        inputs[0].focus();
        if(typeof inputs[0].select == 'function')
          inputs[0].select();
      }
      // press go button when enter is pressed
      for(const input of inputs) {
        input.addEventListener('keydown', e=>{
          if(e.key == 'Enter') {
            e.preventDefault();
            goHandler();
          }
        });
      }
    });
  }

  showInputOverlayWorkingState(isWorking) {
    for(const b of $a('#buttonInputOverlay button'))
      b.style.disabled = isWorking;

    if(isWorking) {
      $('#buttonInputGo label').textContent = 'Working...';
      $('#buttonInputCancel').style.visibility = 'hidden';
    }
  }

  async snapToGrid() {
    const gridArray = this.get('grid');
    if(Array.isArray(gridArray) && gridArray.length) {
      const x = this.get('x');
      const y = this.get('y');

      let closest = null;
      let closestDistance = 999999;

      for(const grid of gridArray) {
        if(!grid)
          continue;

        const alignX = (grid.alignX || 0) * this.get('width');
        const alignY = (grid.alignY || 0) * this.get('height');

        if(!this.gridAppliesAt(grid, { x, y }))
          continue;

        const snapped = this.gridSnapCoord(grid, { x, y }, { x: alignX, y: alignY });
        if(!snapped)
          continue;

        const distance = (snapped.x - x) ** 2 + (snapped.y - y) ** 2;
        if(distance < closestDistance) {
          closest = [ snapped.x - alignX, snapped.y - alignY, grid ];
          closestDistance = distance;
        }
      }

      if(closest) {
        await this.setPosition(closest[0], closest[1], this.get('z'));
        for(const p in closest[2])
          if([ 'x', 'y', 'minX', 'minY', 'maxX', 'maxY', 'offsetX', 'offsetY', 'alignX', 'alignY', 'condition' ].indexOf(p) == -1)
            await this.set(p, closest[2][p]);
      }
    }
  }

  // Which point of one grid's lattice a widget dropped at coord is snapped to,
  // as the point alignX/alignY aligns to it (the widget's corner is that minus
  // the alignment): the lattice point nearest the position it was dropped at,
  // moved on to the nearest one this grid applies at as well.
  // A grid limited to a rectangle and nothing else keeps snapping to the
  // nearest lattice point wherever that lies, which is what it has always done
  // and what games are built on. A condition can bound the grid to an area of
  // any shape, and there it is not enough that the position the widget was
  // dropped at is inside it: the lattice point nearest to that position is up
  // to half a cell away in each direction, and a boundary that runs wherever it
  // likes can easily be in between, so snapping there would drop the widget
  // just outside the very area the grid is limited to. The lattice is walked
  // outwards in square rings around that point instead, ranked by how far the
  // widget actually moves, until no ring further out can hold anything closer
  // than the best point already found.
  // null when no lattice point within reach is one this grid applies at - an
  // area narrower than the grid step need not contain one at all - and then
  // this grid does not apply here either, exactly as outside its rectangle.
  gridSnapCoord(grid, coord, align) {
    const nearest = (position, offset, step)=>position + step/2 - mod(position + step/2 - offset, step);
    const snap = {
      x: nearest(coord.x + align.x, grid.offsetX || 0, grid.x),
      y: nearest(coord.y + align.y, grid.offsetY || 0, grid.y)
    };
    if(!this.gridConditions(grid).length)
      return snap;

    const appliesAt = point=>this.gridAppliesAt(grid, { x: point.x - align.x, y: point.y - align.y });
    if(appliesAt(snap))
      return snap;

    const stepX = Math.abs(grid.x), stepY = Math.abs(grid.y);
    if(!(stepX > 0) || !(stepY > 0))
      return null;

    // far enough to step over a boundary that cuts between the widget and the
    // lattice point it would snap to, and short enough to stay a handful of
    // expressions rather than a search of the whole board
    const searchRings = 8;
    let best = null;
    let bestDistance = Infinity;
    for(let ring = 1; ring <= searchRings; ++ring) {
      // a lattice point `ring` cells away is at least `ring` minus the half
      // cell the widget itself sits off the lattice from it, so once a point is
      // found the rings that cannot come closer are not looked at at all
      if(best && ((ring - 0.5) * Math.min(stepX, stepY)) ** 2 >= bestDistance)
        break;
      for(let column = -ring; column <= ring; ++column)
        for(let row = -ring; row <= ring; ++row) {
          if(Math.max(Math.abs(column), Math.abs(row)) != ring)
            continue;
          const candidate = { x: snap.x + column * grid.x, y: snap.y + row * grid.y };
          const distance = (candidate.x - align.x - coord.x) ** 2 + (candidate.y - align.y - coord.y) ** 2;
          if(distance < bestDistance && appliesAt(candidate)) {
            best = candidate;
            bestDistance = distance;
          }
        }
    }
    return best;
  }

  // Whether one grid applies at a position at all: inside the rectangle its
  // four sides bound it to, and inside the area its conditions describe. This
  // is asked of the position a widget was dropped at - is this grid one of the
  // grids tried - and of every lattice point gridSnapCoord() weighs up snapping
  // it to, so a grid that only applies in part of the parent cannot put a
  // widget down outside that part either.
  gridAppliesAt(grid, coord) {
    return coord.x >= (grid.minX || -99999) && coord.x <= (grid.maxX || 99999)
      && coord.y >= (grid.minY || -99999) && coord.y <= (grid.maxY || 99999)
      && this.gridConditionsHold(grid, coord);
  }

  // The conditions one grid entry carries, as a list: none, one, or a list of
  // them with the empty ones dropped.
  gridConditions(grid) {
    if(!grid || grid.condition === undefined || grid.condition === null)
      return [];
    return asArray(grid.condition).filter(condition=>condition !== null && condition !== undefined);
  }

  // Where one grid applies, beyond the rectangle minX/maxX/minY/maxY bound it
  // to: a condition is an inequality in x and y - the position the widget would
  // be dropped at, the same coordinates the four sides are measured in - or a
  // list of them, all of which have to hold. It is written in the language a
  // dragLimit condition is written in (client/js/expression.js), so
  // "(x - 800)^2 + (y - 500)^2 < 300^2" is a round area and
  // "${PROPERTY width OF board}" reads the state while the game is played.
  // Outside the area this grid is simply not one of the grids tried, so the
  // widget snaps to whichever other grid covers the position - and to nothing
  // at all where none does - exactly as the rectangle already behaves. A
  // condition that cannot be read (a typo, a widget that is gone) holds, so a
  // mistyped grid keeps snapping rather than silently stopping.
  gridConditionsHold(grid, coord) {
    const resolve = this.positionResolver(coord);
    return this.gridConditions(grid).every(condition=>expressionCondition(condition, resolve));
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
    if(this.isBeingRemoved || this.get('dropShadowOwner') || thisParent && widgets.has(thisParent) && !widgets.get(thisParent).supportsPiles())
      return;

    const thisX = this.get('x');
    const thisY = this.get('y');
    const thisOwner = this.get('owner');
    const thisOnPileCreation = this.get('onPileCreation');
    const thisOnPileCreationJSON = JSON.stringify(thisOnPileCreation);

    // A pile that is already at its dropLimit takes no more cards - but only
    // when this update comes from a drag. Everything else that piles cards up
    // (a MOVE or CLONE in a routine, "Split the pile", the JSON editor) ignores
    // dropLimit elsewhere too, and games rely on that, so it stays ignored here.
    const isFull = (pile, count) => this.pileUpdateFromDrag && exceedsDropLimit(pile, count);
    for(const [ widgetID, widget ] of widgets) {
      if(widget == this)
        continue;
      const widgetType = widget.get('type');
      if(widgetType != 'card' && widgetType != 'pile')
        continue;

      // check if this widget is closer than the pileSnapRange from another widget in the same parent
      let pileSnapRange = this.get('pileSnapRange');
      if(thisType == 'card')
        pileSnapRange = thisOnPileCreation && thisOnPileCreation.pileSnapRange !== undefined ? thisOnPileCreation.pileSnapRange : defaultPileSnapRange;

      if(widget.get('parent') == thisParent && Math.abs(widget.get('x')-thisX) < pileSnapRange && Math.abs(widget.get('y')-thisY) < pileSnapRange) {
        if(widget.isBeingRemoved || widget.get('owner') !== thisOwner || widget.get('dropShadowOwner') || JSON.stringify(widget.get('onPileCreation')) !== thisOnPileCreationJSON)
          continue;

        // if a card gets dropped onto a card, they create a new pile and are added to it
        if(thisType == 'card' && widgetType == 'card') {
          // the pile that would be created is bound by the dropLimit it would
          // be created with, so a limit below 2 rules the pile out entirely
          const newPileDropLimit = thisOnPileCreation && thisOnPileCreation.dropLimit;
          if(this.pileUpdateFromDrag && newPileDropLimit > -1 && newPileDropLimit < 2)
            continue;
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
          if(isFull(widget, this.children().length))
            continue;
          for(const w of this.children().reverse()) {
            await w.set('parent', widget.get('id'));
            await w.bringToFront();
          }
          break;
        }

        // if a pile gets dropped onto a card, the card is added to the pile but the pile is moved to the original position of the card
        if(thisType == 'pile' && widgetType == 'card') {
          if(isFull(this, 1))
            continue;
          for(const w of this.children().reverse())
            await w.bringToFront();
          await this.set('x', widget.get('x'));
          await this.set('y', widget.get('y'));
          await widget.set('parent', this.get('id'));
          break;
        }

        // if a card gets dropped onto a pile, it simply gets added to the pile
        if(thisType == 'card' && widgetType == 'pile') {
          if(isFull(widget, 1))
            continue;
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
