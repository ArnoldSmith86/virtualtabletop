import { $, removeFromDOM, asArray, escapeID, mapAssetURLs } from '../domhelpers.js';
import { StateManaged } from '../statemanaged.js';
import { playerName, playerColor, activePlayers, activeColors, mouseCoords } from '../overlays/players.js';
import { batchStart, batchEnd, widgetFilter, widgets } from '../serverstate.js';
import { showOverlay, shuffleWidgets, sortWidgets } from '../main.js';
import { tracingEnabled } from '../tracing.js';
import { toHex } from '../color.js';
import { center, distance, overlap, getOffset, getElementTransform, getScreenTransform, getPointOnPlane, dehomogenize, getElementTransformRelativeTo, getTransformOrigin } from '../geometry.js';

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

let lastExecutedOperation = null;

export class Widget extends StateManaged {
  constructor(id) {
    const div = document.createElement('div');
    div.id = 'w_' + escapeID(id);
    super();
    this.id = id;
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
      changeRoutine: null,
      enterRoutine: null,
      leaveRoutine: null,
      globalUpdateRoutine: null,
      gameStartRoutine: null,
      hotkey: null,

      animatePropertyChange: []
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
      newParent = delta.parent ? widgets.get(delta.parent).domElement : $('#topSurface');
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

      if(delta.parent !== null) {
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

    if(!this.get('display'))
      className += ' hidden';

    if(this.isHighlighted)
      className += ' selectedInEdit';

    if(includeTemporary)
      className += ' ' + Array.from(this.animateClasses.values()).join(' ');

    return className;
  }

  classesProperties() {
    return [ 'classes', 'display', 'dragging', 'dropShadowOwner', 'hoverTarget', 'linkedToSeat', 'onlyVisibleForSeat', 'owner', 'typeClasses', 'movable', 'enlarge', 'clickable' ];
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
        players: []
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
    if($(`#STYLES_${escapeID(this.id)}`))
      removeFromDOM($(`#STYLES_${escapeID(this.id)}`));
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
      let selector = key.replace(/\$\{THIS\}/g, m => {usesVariables = true; return `#w_${escapeID(this.id)}`});
      if(!nested) {
        if(key == 'inline')
          continue;
        if(key == 'default')
          selector = '';
        if(!usesVariables && selector.charAt(0) != '@')
          selector = `#w_${escapeID(this.id)}${selector}`;
      }
      styleString += `${selector} { ${mapAssetURLs(this.cssReplaceProperties(this.cssAsText(css[key], usedProperties, true), usedProperties))} }\n`;
    }

    if(nested)
      return styleString;

    const style = document.createElement('style');
    style.id = `STYLES_${escapeID(this.id)}`;
    style.appendChild(document.createTextNode(styleString));
    $('head').appendChild(style);

    return this.cssAsText(css.inline || '', usedProperties);
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
      div(dom.parentElement, 'inputError', error);
    };

    for(const field of o.fields || []) {
      if(field.type == 'choose' && asArray(variables[field.variable]).length < field.min)
        isValid = displayError(field, `Please select at least ${field.min}.`);
      if(field.type == 'choose' && asArray(variables[field.variable]).length > (field.max || 1))
        isValid = displayError(field, `Please select at most ${field.min}.`);
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
    if(jeRoutineLogging)
      jeLoggingRoutineStart(this, property, initialVariables, initialCollections, byReference);

    let variables = initialVariables;
    let collections = initialCollections;
    if(!byReference) {
      const playerSeats = widgetFilter(w=>w.get('type')=='seat'&&w.get('player')==playerName);
      variables = Object.assign({
        activeColors,
        mouseCoords,
        seatIndex: playerSeats.length ? playerSeats[0].get('index') : null,
        seatID: playerSeats.length ? playerSeats[0].get('id') : null
      }, initialVariables, {
        playerName,
        playerColor,
        activePlayers,
        thisID : this.get('id')
      });
      collections = Object.assign({
        playerSeats
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
          const getValue = async function(input) {
            const toNum = s=>typeof s == 'string' && s.match(/^[-+]?[0-9]+(\.[0-9]+)?$/) ? +s : s;
            if(match[14] && match[9] !== undefined)
              return await compute(match[13] ? variables[match[14]] : match[14], input, toNum(getParam(9, 1)), toNum(getParam(15, 1)), toNum(getParam(19, 1)));
            else if(match[14])
              return await compute(match[13] ? variables[match[14]] : match[14], input, toNum(getParam(15, 1)), toNum(getParam(19, 1)), toNum(getParam(23, 1)));
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
          if(jeRoutineLogging) jeLoggingRoutineOperationSummary(a.substr(4), JSON.stringify(variables[variable]));
        } else {
          const comment = a.match(new RegExp('^(?://(.*))?\x24'));
          if (comment) {
            // ignore (but log) blank and comment only lines
            if(jeRoutineLogging) jeLoggingRoutineOperationSummary(comment[1]||'');
          } else {
            const withoutVars = evaluateVariables(a).replace(/false|null/g, 0).replace(/true/g, 1);
            const mathExpression = withoutVars.match(new RegExp(`^${left} += +([() 0-9.&|!*/+-]+)(?: +//.*)?`+'\x24'));
            if(mathExpression) {
              let result = null;
              try {
                result = +eval(mathExpression[5]);
              } catch(e) {
                problems.push(`The expression "${mathExpression[5]}" threw an exception: ${e}.`);
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
              if(jeRoutineLogging) jeLoggingRoutineOperationSummary(a.substr(4) + ' => ' + mathExpression[5], JSON.stringify(result));
            } else {
              problems.push(`String '${a}' could not be interpreted as a valid expression. Please check your syntax and note that many characters have to be escaped.`);
            }
          }
        }
      }

      if(a.func == 'AUDIO') {
        setDefaults(a, { source: '', maxVolume: 1.0, length: null, player: null });
        const validPlayers = a.player ? asArray(a.player) : [];
        toServer('audio', {
          audioSource: a.source,
          maxVolume: a.maxVolume,
          length: a.length,
          players: validPlayers
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
          const cm = widget.getColorMap();
          if(widget.get('type') == 'canvas') {
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
              const index = ((a.value || 1) % cm.length) || 0;
              cm[index] = a.color || '#1f5ca6' ;
              await widget.set('colorMap', cm);
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
          if(jeRoutineLogging) {
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
          if(jeRoutineLogging)
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
          if(jeRoutineLogging)
            jeLoggingRoutineOperationSummary(`holder '${a.holder}'`);
        } else if(collection = getCollection(a.collection)) {
          if(collections[collection].length) {
            for(const c of collections[collection].slice(0, a.count))
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
          if(jeRoutineLogging)
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
          const result = await this.showInputOverlay(a, widgets, variables, collections, getCollection, problems);
          Object.assign(variables, result.variables);
          Object.assign(collections, result.collections);
          if(jeRoutineLogging) {
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
              await target.updateAfterShuffle();
            });
          }
          if(jeRoutineLogging) {
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
          if(jeRoutineLogging) {
            const count = a.count==1 ? '1 widget' : `${a.count} widgets`;
            jeLoggingRoutineOperationSummary(`${count} from '${a.from}' to (${a.x}, ${a.y})`)
          }
        }
      }

      if(a.func == 'RECALL') {
        setDefaults(a, { owned: true, inHolder: true, excludeCollection: null });

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
          if(jeRoutineLogging) {
            jeLoggingRoutineOperationSummary(`'${a.holder}' ${a.owned ? ' (including hands)' : ''}`);
          }
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
            if(jeRoutineLogging) {
              jeLoggingRoutineOperationSummary(`${a.count == 999999 ? '' : a.count} ${a.count==1 ? 'widget' : 'widgets'} in '${a.holder}' ${mode} ${a.angle}`);
            }
          }
        } else if(collection = getCollection(a.collection)) {
          if(collections[collection].length) {
            for(const c of collections[collection].slice(0, a.count))
              await c.rotate(a.angle, a.mode);
            if(jeRoutineLogging)
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

        if(jeRoutineLogging) {
          const phrase = round===null ? 'new round' : `round ${a.round}`;
          const seatIds = seats.map(w => w.get('id'));
          if(a.mode == 'inc' || a.mode == 'dec')
            jeLoggingRoutineOperationSummary(`${a.mode} ${phrase} in seats ${JSON.stringify(seatIds)} by ${a.value}`)
          else
            jeLoggingRoutineOperationSummary(`set ${phrase} in seats ${JSON.stringify(seatIds)} to ${a.value}`)
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
        if(jeRoutineLogging)
          jeLoggingRoutineOperationSummary(`'${a.property}' ${a.relation} ${JSON.stringify(a.value)} for widgets in '${a.collection}'`);
      }

      if(a.func == 'SHUFFLE') {
        setDefaults(a, { collection: 'DEFAULT' });
        let collection;
        if(a.holder !== undefined) {
          if(this.isValidID(a.holder, problems)) {
            await w(a.holder, async holder=>{
              await shuffleWidgets(holder.children());
              if(typeof holder.updateAfterShuffle == 'function')
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
              if(typeof holder.updateAfterShuffle == 'function')
                await holder.updateAfterShuffle();
            });
          }
          if(jeRoutineLogging)
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
          if(jeRoutineLogging)
            jeLoggingRoutineOperationSummary(`widgets in '${a.collection}' by ${key}${reverse}`);
        }
      }

      if(a.func == 'SWAPHANDS') {
        setDefaults(a, { interval: 1, direction: 'forward', source: 'all' });
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
                    collect.unshift(w.get('id'));
                  }
                  return collect
                },
                []
              );
              moves.push({
                func: "MOVE",
                collection: contents,
                to: target.get('id'),
              });
            }
          }
          if(jeRoutineLogging) {
            jeLoggingRoutineOperationStart("Moves", "Moves");
          }
          await this.evaluateRoutine(moves, variables, collections, (depth || 0) + 1, true);
          if(jeRoutineLogging) {
          jeLoggingRoutineOperationEnd([], variables, collections, false);
          }
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
        if([ 'forward', 'backward', 'random', 'position', 'seat' ].indexOf(a.turnCycle) == -1) {
          problems.push(`Warning: turnCycle ${a.turnCycle} interpreted as forward.`);
          a.turnCycle = 'forward'
        }
        
        let allSeats = Array.from(widgets.values()).filter(w=>w.get('type')=='seat');
        let c = (a.source=='all' ? allSeats : collections[getCollection(a.source)].filter(w=>w.get('type')=='seat')).filter(w=>w.get('player'));

        if (c.length == 0) {
          if(jeRoutineLogging)
            jeLoggingRoutineOperationSummary(`no active seats found in collection ${a.source}`);
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

          if (a.turnCycle != 'position' && a.turnCycle != 'seat') {
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

          if(jeRoutineLogging) {
            const indexList = c.map(w=>w.get('index'));
            const turn = target.get('index');
            jeLoggingRoutineOperationSummary(`changed turn of seats to ${turn} - active seats: ${JSON.stringify(indexList)}`);
          }
        }
      }

      if(a.func == 'VAR') {
        setDefaults(a, { variables: {} });
        for(const [ key, value ] of Object.entries(a.variables||{}))
          variables[key] = value;

        if(jeRoutineLogging) {
          jeLoggingRoutineOperationSummary(`${Object.entries(a.variables||{}).map(e=>`${e[0]}=${JSON.stringify(e[1])}`).join(', ')}`);
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

  getWithPropertyReplacements(property) {
    const properties = new Set();
    let result = this.cssReplaceProperties(this.get(property), properties);
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
    let newCoord = this.dragCorner(coordGlobal, localAnchor);

    //Keeps widget's top left corner within coordinates set by dragLimit object
    const limit = this.get('dragLimit');

    if (limit.minX !== undefined) {
      newCoord.x = Math.max(limit.minX, newCoord.x);
    }
    if (limit.maxX !== undefined) {
      newCoord.x = Math.min(limit.maxX, newCoord.x);
    }
    if (limit.minY !== undefined) {
      newCoord.y = Math.max(limit.minY, newCoord.y);
    }
    if (limit.maxY !== undefined) {
      newCoord.y = Math.min(limit.maxY, newCoord.y);
    }

    if(tracingEnabled)
      sendTraceEvent('move', { id: this.get('id'), coordGlobal, localAnchor, newX: newCoord.x, newY: newCoord.y });

    await this.setPosition(newCoord.x, newCoord.y, this.get('z'));
    await this.snapToGrid();

    if(!this.get('fixedParent') && this.get('movable')) {
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
  }

  async moveEnd(coordGlobal, localAnchor) {
    if(tracingEnabled)
      sendTraceEvent('moveEnd', { id: this.get('id'), coordGlobal, localAnchor });

    await this.hideShadowWidget();
    await this.set('dragging', null);
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

    this.hideEnlarged();
    if(this.domElement.classList.contains('longtouch'))
      this.domElement.classList.remove('longtouch');

    await this.updatePiles();
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

  readOnlyProperties() {
    return readOnlyProperties;
  }

  renderReadonlyCopyRaw(state, target, isChild=false) {
    delete state.id;
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

  async showInputOverlay(o, widgets, variables, collections, getCollection, problems) {
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

        if(x < (grid.minX || -99999) || x > (grid.maxX || 99999))
          continue;
        if(y < (grid.minY || -99999) || y > (grid.maxY || 99999))
          continue;

        const snapX = x + alignX + grid.x/2 - mod(x + alignX + grid.x/2 - (grid.offsetX || 0), grid.x);
        const snapY = y + alignY + grid.y/2 - mod(y + alignY + grid.y/2 - (grid.offsetY || 0), grid.y);

        const distance = (snapX - x) ** 2 + (snapY - y) ** 2;
        if(distance < closestDistance) {
          closest = [ snapX - alignX, snapY - alignY, grid ];
          closestDistance = distance;
        }
      }

      if(closest) {
        await this.setPosition(closest[0], closest[1], this.get('z'));
        for(const p in closest[2])
          if([ 'x', 'y', 'minX', 'minY', 'maxX', 'maxY', 'offsetX', 'offsetY', 'alignX', 'alignY' ].indexOf(p) == -1)
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
    if(this.isBeingRemoved || this.get('dropShadowOwner') || thisParent && widgets.has(thisParent) && !widgets.get(thisParent).supportsPiles())
      return;

    const thisX = this.get('x');
    const thisY = this.get('y');
    const thisOwner = this.get('owner');
    const thisOnPileCreation = this.get('onPileCreation');
    const thisOnPileCreationJSON = JSON.stringify(thisOnPileCreation);
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
