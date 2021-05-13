import { $, removeFromDOM } from '../domhelpers.js';
import { StateManaged } from '../statemanaged.js';
import { playerName, playerColor, activePlayers } from '../overlays/players.js';
import { batchStart, batchEnd, widgetFilter, widgets } from '../serverstate.js';
import { showOverlay } from '../main.js';

export class Widget extends StateManaged {
  constructor(id) {
    const div = document.createElement('div');
    div.id = id;
    super();
    this.id = id;
    this.domElement = div;
    this.childArray = [];

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
      owner: null,
      dropOffsetX: 0,
      dropOffsetY: 0,
      inheritChildZ: false,

      clickRoutine: null,
      debug: false
    });

    this.domElement.addEventListener('contextmenu', e => this.showEnlarged(e), false);
    this.domElement.addEventListener('mouseenter',  e => this.showEnlarged(e), false);
    this.domElement.addEventListener('mouseleave',  e => this.hideEnlarged(e), false);
  }

  absoluteCoord(coord) {
    return this.p(coord) + (this.p('parent') ? widgets.get(this.p('parent')).absoluteCoord(coord) : 0);
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

    if($('#enlarged').dataset.id == this.p('id') && !$('#enlarged').className.match(/hidden/))
      this.showEnlarged();
  }

  applyRemove() {
    if(this.p('parent') && widgets.has(this.p('parent')))
      widgets.get(this.p('parent')).applyChildRemove(this);
    if(this.p('deck') && widgets.has(this.p('deck')))
      widgets.get(this.p('deck')).removeCard(this);
    removeFromDOM(this.domElement);
  }

  applyVariables(field, variables, problems) {
    if(Array.isArray(field.applyVariables)) {
      for(const v of field.applyVariables) {
        if(v.parameter && v.variable) {
          field[v.parameter] = (v.index === undefined) ? variables[v.variable] : variables[v.variable][v.index];
        } else if(v.parameter && v.template) {
          field[v.parameter] = v.template.replace(/\{([^}]+)\}/g, function(i, key) {
            return (variables[key] === undefined) ? "" : variables[key];
          });
        } else if(v.parameter && v.property) {
          let w = this;
          if (v.widget)
            w = this.isValidID(v.widget, problems) ? widgets.get(v.widget) : this;
          field[v.parameter] = (w.p(v.property) === undefined) ? null : w.p(v.property);
        } else {
          problems.push('Entry in parameter applyVariables does not contain "parameter" together with "variable", "property", or "template".');
        }
      }
    } else {
      problems.push('Parameter applyVariables is not an array.');
    }
  }

  applyZ(force) {
    if(this.p('inheritChildZ') || force) {
      this.domElement.style.zIndex = this.calculateZ();
      if(this.p('parent') && this.p('inheritChildZ'))
        widgets.get(this.p('parent')).applyZ();
    }
  }

  bringToFront() {
    this.p('z', getMaxZ(this.p('layer')) + 1);
  }

  calculateZ() {
    let z = ((this.p('layer') + 10) * 100000) + this.p('z');
    if(this.p('inheritChildZ'))
      for(const child of this.childrenOwned())
        z = Math.max(z, child.calculateZ());
    return z;
  }

  children() {
    return this.childArray.sort((a,b)=>b.p('z')-a.p('z'));
  }

  childrenOwned() {
    return this.children().filter(c=>!c.p('owner') || c.p('owner')==playerName);
  }

  checkParent(forceDetach) {
    if(this.currentParent && (forceDetach || !overlap(this.domElement, this.currentParent.domElement))) {
      this.p('parent', null);
      this.p('owner',  null);
      if(this.currentParent.dispenseCard)
        this.currentParent.dispenseCard(this);
      delete this.currentParent;
    }
  }

  classes() {
    let className = this.p('typeClasses') + ' ' + this.p('classes');

    if(Array.isArray(this.p('owner')) && this.p('owner').indexOf(playerName) == -1)
      className += ' foreign';
    if(typeof this.p('owner') == 'string' && this.p('owner') != playerName)
      className += ' foreign';

    return className;
  }

  classesProperties() {
    return [ 'classes', 'owner', 'typeClasses' ];
  }

  async click() {
    if(!this.p('clickable'))
      return true;

    if(Array.isArray(this.p('clickRoutine'))) {
      await this.evaluateRoutine('clickRoutine', {}, {});
      return true;
    } else {
      return false;
    }
  }

  css() {
    let css = this.p('css');

    css += '; width:'  + this.p('width')  + 'px';
    css += '; height:' + this.p('height') + 'px';
    css += '; z-index:' + this.calculateZ();
    css += '; transform:' + this.cssTransform();

    return css;
  }

  cssProperties() {
    return [ 'css', 'height', 'inheritChildZ', 'layer', 'width' ];
  }

  cssTransform() {
    let transform = `translate(${this.p('x')}px, ${this.p('y')}px)`;

    if(this.p('rotation'))
      transform += ` rotate(${this.p('rotation')}deg)`;
    if(this.p('scale') != 1)
      transform += ` scale(${this.p('scale')})`;

    return transform;
  }

  cssTransformProperties() {
    return [ 'rotation', 'scale', 'x', 'y' ];
  }

  evaluateInputOverlay(o, resolve, reject, go) {
    const result = {};
    for(const field of o.fields) {

      if(field.type == 'checkbox') {
        result[field.variable] = document.getElementById(this.p('id') + ';' + field.variable).checked;
      }

      if(field.type == 'color' || field.type == 'number' || field.type == 'string') {
        result[field.variable] = document.getElementById(this.p('id') + ';' + field.variable).value;
      }

    }

    showOverlay(null);
    if(go)
      resolve(result);
    else
      reject(result);
  }

  async evaluateRoutine(property, initialVariables, initialCollections, depth, byReference) {
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

    function w(ids, callback) {
      return widgetFilter(w=>toA(ids).indexOf(w.p('id')) != -1).forEach(callback);
    }

    batchStart();

    if(this.p('debug') && !depth)
      $('#debugButtonOutput').textContent = '';

    let variables = initialVariables;
    let collections = initialCollections
    if(!byReference) {
      variables = Object.assign({}, initialVariables, {
        playerName,
        playerColor,
        activePlayers,
        thisID : this.p('id')
      });
      collections = Object.assign({}, initialCollections, {
        thisButton : [this]
      });
    }

    const routine = this.p(property) !== undefined ? this.p(property) : property;

    for(const original of routine) {
      const a = JSON.parse(JSON.stringify(original));
      var problems = [];

      if(this.p('debug')) console.log(`${this.id}: ${JSON.stringify(original)}`);

      if(a.applyVariables) this.applyVariables(a, variables, problems);

      if(a.skip) {
        $('#debugButtonOutput').textContent += '\n\n\nOPERATION SKIPPED: \n' + JSON.stringify(a, null, '  ');
        continue;
      }

      if(a.func == 'CALL') {
        setDefaults(a, { widget: this.p('id'), routine: 'clickRoutine', 'return': true, arguments: {}, variable: 'result', collection: 'result' });
        if(!a.routine.match(/Routine$/)) {
          problems.push('Routine parameters have to end with "Routine".');
        } else if(this.isValidID(a.widget)) {
          if(!Array.isArray(widgets.get(a.widget).p(a.routine))) {
            problems.push(`Widget ${a.widget} does not contain ${a.routine} (or it is no array).`);
          } else {
            // make sure everything is passed in a way that the variables and collections of this routine won't be changed
            const inheritVariables = Object.assign(JSON.parse(JSON.stringify(variables)), a.arguments);
            const inheritCollections = {};
            for(const c in collections)
              inheritCollections[c] = [ ...collections[c] ];
            inheritCollections['caller'] = [ this ];
            $('#debugButtonOutput').textContent += `\n\n\nCALLing: ${a.widget}.${a.routine}\n`;
            const result = await widgets.get(a.widget).evaluateRoutine(a.routine, inheritVariables, inheritCollections, (depth || 0) + 1);
            variables[a.variable] = result.variable;
            collections[a.collection] = result.collection;
          }
        }
        if(!a.return) {
          $('#debugButtonOutput').textContent += '\n\n\nCALL without return. Ending evaluation.\n';
          break;
        }
      }

      if(a.func == 'CLICK') {
        setDefaults(a, { collection: 'DEFAULT', count: 1 });
        if(isValidCollection(a.collection))
          for(let i=0; i<a.count; ++i)
            for(const w of collections[a.collection])
              await w.click();
      }

      if(a.func == 'CLONE') {
        setDefaults(a, { source: 'DEFAULT', count: 1, xOffset: 0, yOffset: 0, properties: {}, collection: 'DEFAULT' });
        if(a.properties.applyVariables) {
          this.applyVariables(a.properties, variables, problems);
          delete a.properties["applyVariables"];
        };
        if(isValidCollection(a.source)) {
          var c=[];
          for(const w of collections[a.source]) {
            for(let i=1; i<=a.count; ++i) {
              const clone = Object.assign(JSON.parse(JSON.stringify(w.state)), a.properties);
              const parent = clone.parent;
              clone.clonedFrom = w.p('id');

              delete clone.id;
              delete clone.parent;
              addWidgetLocal(clone);
              const cWidget = widgets.get(clone.id);

              if(parent) {
                // use moveToHolder so that CLONE triggers onEnter and similar features
                cWidget.movedByButton = true;
                cWidget.moveToHolder(widgets.get(parent));
                delete cWidget.movedByButton;
              }

              // moveToHolder causes the position to be wrong if the target holder does not have alignChildren
              if(!parent || !widgets.get(parent).p('alignChildren')) {
                cWidget.p('x', (a.properties.x || w.p('x')) + a.xOffset * i);
                cWidget.p('y', (a.properties.y || w.p('y')) + a.yOffset * i);
                cWidget.updatePiles();
              }

              c.push(cWidget);
            }
          }
          collections[a.collection]=c;
        }
      }

      function compute(o, v, x, y, z) {
        try {
          switch(o) {
          case '=':  v = y;      break;
          case '+':  v = x + y;  break;
          case '-':  v = x - y;  break;
          case '*':  v = x * y;  break;
          case '**': v = x ** y; break;
          case '/':  v = x / y;  break;
          case '%':  v = x % y;  break;
          case '<':  v = x < y;  break;
          case '<=': v = x <= y; break;
          case '==': v = x == y; break;
          case '!=': v = x != y; break;
          case '>=': v = x >= y; break;
          case '>':  v = x > y;  break;
          case '&&': v = x && y; break;
          case '||': v = x || y; break;
          case '!':  v = !x;     break;

          // Math operations
          case 'hypot':
          case 'max':
          case 'min':
          case 'pow':
            v = Math[o](x, y);
            break;
          case 'sin':
          case 'cos':
          case 'tan':
            v = Math[o](x * Math.PI/180);
            break;
          case 'abs':
          case 'cbrt':
          case 'ceil':
          case 'exp':
          case 'floor':
          case 'log':
          case 'log10':
          case 'log2':
          case 'random':
          case 'round':
          case 'sign':
          case 'sqrt':
          case 'trunc':
            v = Math[o](x);
            break;
          case 'E':
          case 'LN2':
          case 'LN10':
          case 'LOG2E':
          case 'LOG10E':
          case 'PI':
          case 'SQRT1_2':
          case 'SQRT2':
            v = Math[o];
            break;

          // String operations
          case 'length':
            v = x.length;
            break;
          case 'parseFloat':
            v = parseFloat(x);
            break;
          case 'toLowerCase':
          case 'toUpperCase':
          case 'trim':
          case 'trimStart':
          case 'trimEnd':
            v = x[o]();
            break;
          case 'charAt':
          case 'charCodeAt':
          case 'codePointAt':
          case 'concat':
          case 'includes':
          case 'endsWith':
          case 'indexOf':
          case 'lastIndexOf':
          case 'localeCompare':
          case 'match':
          case 'padEnd':
          case 'padStart':
          case 'repeat':
          case 'search':
          case 'split':
          case 'startsWith':
          case 'toFixed':
          case 'toLocaleLowerCase':
          case 'toLocaleUpperCase':
            v = x[o](y);
            break;
          case 'replace':
          case 'replaceAll':
          case 'substr':
            v = x[o](y, z);
            break;

          // Array operations
          // 'length' should work the same as for strings
          case 'getIndex':
            v = x[y];
            break;
          case 'setIndex':
            v[x] = y;
            break;
          case 'from':
          case 'isArray':
            v = Array[o](x);
            break;
          case 'concatArray':
            v = x.concat(y);
            break;
          case 'pop':
          case 'reverse':
          case 'shift':
          case 'sort':
            v = x[o]();
            break;
          case 'findIndex':
          case 'includes':
          case 'indexOf':
          case 'join':
          case 'lastIndexOf':
            v = x[o](y);
            break;
          case 'slice':
            v = x[o](y, z);
            break;
          case 'push':
          case 'unshift':
            v[o](x);
            break;

          // random values
          case 'randInt':
            v = Math.floor((Math.random() * (y - x + 1)) + x);
            break;
          case 'randRange':
            v = Math.round(Math.floor((Math.random() * (y - x) / (z || 1))) * (z || 1) + x);
            break;
          default:
            problems.push(`Operation ${o} is unsupported.`);
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

      if(a.func == 'COMPUTE') {
        setDefaults(a, { operation: '+', operand1: 1, operand2: 1, operand3: 1, variable: 'COMPUTE' });
        const toNum = s=>typeof s == 'string' && s.match(/^[-+]?[0-9]+(\.[0-9]+)?$/) ? +s : s;
        const v = a.variable;
        variables[v] = compute(a.operation, variables[v], toNum(a.operand1), toNum(a.operand2), toNum(a.operand3));
      }

      if(a.func == 'COUNT') {
        setDefaults(a, { collection: 'DEFAULT', variable: 'COUNT' });
        if(a.holder !== undefined) {
          if(this.isValidID(a.holder,problems))
            variables[a.variable] = widgets.get(a.holder).children().length;
        } else if(isValidCollection(a.collection)) {
          variables[a.variable] = collections[a.collection].length;
        }
      }

      if(a.func == 'DELETE') {
        setDefaults(a, { collection: 'DEFAULT' });
        if(isValidCollection(a.collection)) {
          for(const w of collections[a.collection]) {
            removeWidgetLocal(w.p('id'));
            for(const c in collections)
              collections[c] = collections[c].filter(x=>x!=w);
          }
        }
      }

      if(a.func == 'FLIP') {
        setDefaults(a, { count: 0, face: null, faceCyle: null, collection: 'DEFAULT' });
        if(a.holder !== undefined) {
          if(this.isValidID(a.holder,problems))
            w(a.holder, holder=>holder.children().slice(0, a.count || 999999).forEach(c=>c.flip&&c.flip(a.face,a.faceCycle)));
        } else if(isValidCollection(a.collection)) {
          if(collections[a.collection].length)
            collections[a.collection].slice(0, a.count || 999999).forEach(c=>c.flip&&c.flip(a.face,a.faceCycle));
          else
            problems.push(`Collection ${a.collection} is empty.`);
        }
      }

      if(a.func == 'GET') {
        setDefaults(a, { variable: a.property || 'id', collection: 'DEFAULT', property: 'id', aggregation: 'first', skipMissing: false });
        if(isValidCollection(a.collection)) {
          let c = collections[a.collection];
          if (a.skipMissing)
            c = c.filter(w=>w.p(a.property) !== null && w.p(a.property) !== undefined);
          c = JSON.parse(JSON.stringify(c.map(w=>w.p(a.property))));
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
        }
      }

      if(a.func == 'IF') {
        setDefaults(a, { condition: variables['condition'], relation: '==' });
        if(a.condition !== undefined || a.operand1 !== undefined) {
          if (a.condition === undefined) {
            if (['==', '!=', '<', '<=', '>=', '>'].indexOf(a.relation) < 0) {
              problems.push(`Relation ${a.relation} is unsupported. Using '==' relation.`);
              a.relation = '==';
            }
            a.condition = compute(a.relation, null, a.operand1, a.operand2);
          }
          const branch = a.condition ? 'thenRoutine' : 'elseRoutine';
          if (Array.isArray(a[branch])) {
            $('#debugButtonOutput').textContent += `\n\n\nIF ${branch}\n`;
            await this.evaluateRoutine(a[branch], variables, collections, (depth || 0) + 1, true);
          }
        } else
          problems.push(`IF operation is missing the 'condition' or 'operand1' parameter.`);
      }

      if(a.func == 'INPUT') {
        try {
          Object.assign(variables, await this.showInputOverlay(a, widgets, variables, problems));
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
            w(a.label, widget=> {
              widget.setText(a.value, a.mode, this.p('debug'), problems)
            });
          }
        } else if(isValidCollection(a.collection)) {
          if(collections[a.collection].length)
            collections[a.collection].forEach(c=>c.setText(a.value, a.mode, this.p('debug'), problems));
          else
            problems.push(`Collection ${a.collection} is empty.`);
        }
      }

      if(a.func == 'MOVE') {
        setDefaults(a, { count: 1, face: null });
        const count = a.count || 999999;

        if(this.isValidID(a.from, problems) && this.isValidID(a.to, problems)) {
          w(a.from, source=>w(a.to, target=>source.children().slice(0, count).reverse().forEach(c=> {
            if(a.face !== null && c.flip)
              c.flip(a.face);
            if(source == target) {
              c.bringToFront();
            } else {
              c.movedByButton = true;
              c.moveToHolder(target);
              delete c.movedByButton;
            }
          })));
        }
      }

      if(a.func == 'MOVEXY') {
        setDefaults(a, { count: 1, face: null, x: 0, y: 0 });
        if(this.isValidID(a.from, problems)) {
          w(a.from, source=>source.children().slice(0, a.count || 999999).reverse().forEach(c=> {
            if(a.face !== null && c.flip)
              c.flip(a.face);
            c.p('parent', null);
            c.bringToFront();
            c.setPosition(a.x, a.y, a.z || c.p('z'));
            c.updatePiles();
          }));
        }
      }

      if(a.func == 'RANDOM') {
        setDefaults(a, { min: 1, max: 10, variable: 'RANDOM' });
        variables[a.variable] = Math.floor(a.min + Math.random() * (a.max - a.min + 1));
      }

      if(a.func == 'RECALL') {
        setDefaults(a, { owned: true });
        if(this.isValidID(a.holder, problems)) {
          toA(a.holder).forEach(holder=>{
            const decks = widgetFilter(w=>w.p('type')=='deck'&&w.p('parent')==holder);
            if(decks.length) {
              for(const deck of decks) {
                let cards = widgetFilter(w=>w.p('deck')==deck.p('id'));
                if(!a.owned)
                  cards = cards.filter(c=>!c.p('owner'));
                cards.forEach(c=>c.moveToHolder(widgets.get(holder)));
              }
            } else {
              problems.push(`Holder ${holder} does not have a deck.`);
            }
          });
        }
      }

      if(a.func == 'ROTATE') {
        setDefaults(a, { count: 1, angle: 90, mode: 'add' });
        if(this.isValidID(a.holder, problems)) {
          w(a.holder, holder=>holder.children().slice(0, a.count || 999999).forEach(c=>{
            c.rotate(a.angle, a.mode);
          }));
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
            if(a.type != 'all' && (w.p('type') != a.type && (a.type != 'card' || w.p('type') != 'pile')))
              return false;
            if(a.relation === '<')
              return w.p(a.property) < a.value;
            else if(a.relation === '<=')
              return w.p(a.property) <= a.value;
            else if(a.relation === '!=')
              return w.p(a.property) != a.value;
            else if(a.relation === '>=')
              return w.p(a.property) >= a.value;
            else if(a.relation === '>')
              return w.p(a.property) > a.value;
            else if(a.relation === 'in' && Array.isArray(a.value))
              return a.value.indexOf(w.p(a.property)) != -1;
            if(a.relation != '==')
              problems.push(`Warning: Relation ${a.relation} interpreted as ==.`);
            return w.p(a.property) === a.value;
          }).slice(0, a.max).concat(a.mode == 'add' ? collections[a.collection] || [] : []);

          // resolve piles
          if(a.type != 'pile') {
            c.filter(w=>w.p('type')=='pile').forEach(w=>c.push(...w.children()));
            c = c.filter(w=>w.p('type')!='pile');
          }
          collections[a.collection] = [...new Set(c)];
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
        } else if(isValidCollection(a.collection)) {
          for(const w of collections[a.collection]) {
            w.p(a.property, compute(a.relation, null, w.p(a.property), a.value));
          }
        }
      }

      if(a.func == 'SORT') {
        setDefaults(a, { key: 'value', reverse: false });
        if(this.isValidID(a.holder, problems)) {
          w(a.holder, holder=>{
            let z = 1;
            let children = holder.children().reverse().sort((w1,w2)=>{
              if(typeof w1.p(a.key) == 'number')
                return w1.p(a.key) - w2.p(a.key);
              else
                return w1.p(a.key).localeCompare(w2.p(a.key));
            });
            if(a.reverse)
              children = children.reverse();
            children.forEach(c=>c.p('z', ++z));
            holder.updateAfterShuffle();
          });
        }
      }

      if(a.func == 'SHUFFLE') {
        if(this.isValidID(a.holder, problems)) {
          w(a.holder, holder=>{
            holder.children().forEach(c=>c.p('z', Math.floor(Math.random()*10000)));
            holder.updateAfterShuffle();
          });
        }
      }

      if(this.p('debug')) {
        let msg = ''
        msg += '\n\n\nOPERATION: \n' + JSON.stringify(a, null, '  ');
        if(problems.length)
          msg += '\n\nPROBLEMS: \n' + problems.join('\n');
        msg += '\n\n\nVARIABLES: \n' + JSON.stringify(variables, null, '  ');
        msg += '\n\nCOLLECTIONS: \n';
        for(const name in collections) {
          msg += '  ' + name + ': ' + collections[name].map(w=>`${w.p('id')} (${w.p('type')})`).join(', ') + '\n';
        }
        $('#debugButtonOutput').textContent += msg.replace(/^/gm, '    '.repeat(depth));
        console.log(msg);
      } else if(problems.length) {
        console.log(problems);
      }
    }

    if(this.p('debug') && !depth)
      showOverlay('debugButtonOverlay');

    batchEnd();
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

  moveToHolder(holder) {
    this.bringToFront();
    if(this.p('parent') && !this.currentParent)
      this.currentParent = widgets.get(this.p('parent'));
    if(this.currentParent != holder)
      this.checkParent(true);

    this.p('owner',  null);
    this.p('parent', holder.p('id'));
  }

  moveStart() {
    this.bringToFront();
    this.dropTargets = this.validDropTargets();
    this.currentParent = widgets.get(this.p('parent'));
    this.hoverTargetDistance = 99999;
    this.hoverTarget = null;

    this.p('parent', null);

    for(const t of this.dropTargets)
      t.domElement.classList.add('droppable');
  }

  move(x, y) {
    const newX = (jeZoomOut ? x : Math.max(0-this.p('width' )*0.25, Math.min(1600+this.p('width' )*0.25, x))) - this.p('width' )/2;
    const newY = (jeZoomOut ? y : Math.max(0-this.p('height')*0.25, Math.min(1000+this.p('height')*0.25, y))) - this.p('height')/2;

    this.setPosition(newX, newY, this.p('z'));
    const myCenter = center(this.domElement);

    this.checkParent();

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

  moveEnd() {
    for(const t of this.dropTargets)
      t.domElement.classList.remove('droppable');

    this.checkParent();

    if(this.hoverTarget) {
      this.moveToHolder(this.hoverTarget);
      this.hoverTarget.domElement.classList.remove('droptarget');
    }

    this.hideEnlarged();
    this.updatePiles();
  }

  onChildAdd(child, oldParentID) {
    this.childArray = this.childArray.filter(c=>c!=child);
    this.childArray.push(child);
    this.onChildAddAlign(child, oldParentID);
  }

  onChildAddAlign(child, oldParentID) {
    let childX = child.p('x');
    let childY = child.p('y');

    if(!oldParentID) {
      childX -= this.absoluteCoord('x');
      childY -= this.absoluteCoord('y');
    }

    if(this.p('alignChildren'))
      child.setPosition(this.p('dropOffsetX'), this.p('dropOffsetY'), child.p('z'));
    else
      child.setPosition(childX, childY, child.p('z'));
  }

  onChildRemove(child) {
    this.childArray = this.childArray.filter(c=>c!=child);
    this.applyZ();
  }

  onPropertyChange(property, oldValue, newValue) {
    if(property == 'parent') {
      if(oldValue)
        widgets.get(oldValue).onChildRemove(this);
      if(newValue)
        widgets.get(newValue).onChildAdd(this, oldValue);
      this.updatePiles();
    }
  }

  rotate(degrees, mode) {
    if(!mode || mode == 'add')
      this.p('rotation', (this.p('rotation') + degrees) % 360);
    else
      this.p('rotation', degrees);
  }

  setPosition(x, y, z) {
    if(this.p('grid').length && !this.p('parent')) {
      let closest = null;
      let closestDistance = 999999;

      for(const grid of this.p('grid')) {
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
            this.p(p, closest[p]);
      }

      this.snappingToGrid = false;
    }
    super.setPosition(x, y, z);
  }

  setText(text, mode, debug, problems) {
    if (this.p('text') !== undefined) {
      if(mode == 'inc' || mode == 'dec')
        this.p('text', (parseInt(this.p('text')) || 0) + (mode == 'dec' ? -1 : 1) * text);
      else if(mode == 'append')
        this.p('text', this.p('text') + text);
      else if(Array.isArray(text))
        this.p('text', text.join(', '));
      else if(typeof text == 'string' && text.match(/^[-+]?[0-9]+(\.[0-9]+)?$/))
        this.p('text', +text);
      else
        this.p('text', text);
    } else
      problems.push(`Tried setting text property which doesn't exist for ${this.id}.`);
  }

  showEnlarged(event) {
    if(this.p('enlarge')) {
      const e = $('#enlarged');
      e.innerHTML = this.domElement.innerHTML;
      e.className = this.domElement.className;
      e.dataset.id = this.p('id');
      e.style.cssText = this.domElement.style.cssText;
      e.style.display = this.domElement.style.display;
      e.style.transform = `scale(calc(${this.p('enlarge')} * var(--scale)))`;
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

        if(field.applyVariables) this.applyVariables(field, variables, problems);

        if(field.type == 'checkbox') {
          const input = document.createElement('input');
          const label = document.createElement('label');
          input.type = 'checkbox';
          input.checked = field.value || false;
          label.textContent = field.label;
          dom.appendChild(input);
          dom.appendChild(label);
          label.htmlFor = input.id = this.p('id') + ';' + field.variable;
        }

        if(field.type == 'color') {
          const input = document.createElement('input');
          const label = document.createElement('label');
          input.type = 'color';
          input.value = field.value || '#ff0000';
          label.textContent = field.label;
          dom.appendChild(label);
          dom.appendChild(input);
          label.htmlFor = input.id = this.p('id') + ';' + field.variable;
        }

        if(field.type == 'number') {
          const input = document.createElement('input');
          const label = document.createElement('label');
          input.type = 'number';
          input.value = field.value || 1;
          input.min = field.min || 1;
          input.max = field.max || 10;
          label.textContent = field.label;
          dom.appendChild(label);
          dom.appendChild(input);
          label.htmlFor = input.id = this.p('id') + ';' + field.variable;
        }

        if(field.type == 'string') {
          const input = document.createElement('input');
          const label = document.createElement('label');
          input.value = field.value || "";
          label.textContent = field.label;
          dom.appendChild(label);
          dom.appendChild(input);
          label.htmlFor = input.id = this.p('id') + ';' + field.variable;
        }

        if(field.type == 'text') {
          const p = document.createElement('p');
          p.textContent = field.text;
          dom.appendChild(p);
        }

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

  supportsPiles() {
    return true;
  }

  updateOwner() {
    this.domElement.className = this.classes();
  }

  updatePiles() {
    if(this.isBeingRemoved || this.p('parent') && !widgets.get(this.p('parent')).supportsPiles())
      return;

    for(const [ widgetID, widget ] of widgets) {
      // check if this widget is closer than 10px from another widget in the same parent
      if(widget != this && widget.p('parent') == this.p('parent') && Math.abs(widget.p('x')-this.p('x')) < 10 && Math.abs(widget.p('y')-this.p('y')) < 10) {
        if(widget.p('owner') !== this.p('owner') || widget.isBeingRemoved)
          continue;

        // if a card gets dropped onto a card, they create a new pile and are added to it
        if(widget.p('type') == 'card' && this.p('type') == 'card') {
          const pile = {
            type: 'pile',
            parent: this.p('parent'),
            x: widget.p('x'),
            y: widget.p('y'),
            width: this.p('width'),
            height: this.p('height')
          };
          addWidgetLocal(pile);
          this.p('parent', pile.id);
          widget.p('parent', pile.id);
          break;
        }

        // if a pile gets dropped onto a pile, all children of one pile are moved to the other (the empty one destroys itself)
        if(widget.p('type') == 'pile' && this.p('type') == 'pile') {
          this.children().reverse().forEach(w=>{w.p('parent', widget.p('id')); w.bringToFront()});
          break;
        }

        // if a pile gets dropped onto a card, the card is added to the pile but the pile is moved to the original position of the card
        if(widget.p('type') == 'card' && this.p('type') == 'pile') {
          this.children().reverse().forEach(w=>w.bringToFront());
          this.p('x', widget.p('x'));
          this.p('y', widget.p('y'));
          widget.p('parent', this.p('id'));
          break;
        }

        // if a card gets dropped onto a pile, it simply gets added to the pile
        if(widget.p('type') == 'pile' && this.p('type') == 'card') {
          this.bringToFront();
          this.p('parent', widget.p('id'));
          break;
        }
      }
    }
  }

  validDropTargets() {
    return getValidDropTargets(this);
  }
}
