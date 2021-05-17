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
      changeRoutine: null,
      enterRoutine: null,
      leaveRoutine: null,
      debug: false
    });

    this.domElement.addEventListener('contextmenu', e => this.showEnlarged(e), false);
    this.domElement.addEventListener('mouseenter',  e => this.showEnlarged(e), false);
    this.domElement.addEventListener('mouseleave',  e => this.hideEnlarged(e), false);
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

    if($('#enlarged').dataset.id == this.get('id') && !$('#enlarged').className.match(/hidden/))
      this.showEnlarged();
  }

  applyRemove() {
    if(this.get('parent') && widgets.has(this.get('parent')))
      widgets.get(this.get('parent')).applyChildRemove(this);
    if(this.get('deck') && widgets.has(this.get('deck')))
      widgets.get(this.get('deck')).removeCard(this);
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
          field[v.parameter] = w.get(v.property);
        } else {
          problems.push('Entry in parameter applyVariables does not contain "parameter" together with "variable", "property", or "template".');
        }
      }
    } else {
      problems.push('Parameter applyVariables is not an array.');
    }
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
      }

      if(field.type == 'color' || field.type == 'number' || field.type == 'string') {
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

    batchStart();

    if(this.get('debug') && !depth)
      $('#debugButtonOutput').textContent = '';

    let variables = initialVariables;
    let collections = initialCollections
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
      const a = JSON.parse(JSON.stringify(original));
      var problems = [];

      if(this.get('debug')) console.log(`${this.id}: ${JSON.stringify(original)}`);

      if(a.applyVariables) this.applyVariables(a, variables, problems);

      if(a.skip) {
        $('#debugButtonOutput').textContent += '\n\n\nOPERATION SKIPPED: \n' + JSON.stringify(a, null, '  ');
        continue;
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
        setDefaults(a, { collection: 'DEFAULT', count: 1 , mode: 'respect' });
        if (['respect', 'ignoreClickable', 'ignoreClickRoutine', 'ignoreAll'].indexOf(a.mode) == -1) {
          problems.push(`Mode ${a.mode} is unsupported. Using 'respect' mode.`);
          a.mode = 'respect'
        };
        if(isValidCollection(a.collection))
          for(let i=0; i<a.count; ++i)
            for(const w of collections[a.collection])
              await w.click(a.mode);
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
              clone.clonedFrom = w.get('id');

              delete clone.id;
              delete clone.parent;
              addWidgetLocal(clone);
              const cWidget = widgets.get(clone.id);

              if(parent) {
                // use moveToHolder so that CLONE triggers onEnter and similar features
                cWidget.movedByButton = true;
                await cWidget.moveToHolder(widgets.get(parent));
                delete cWidget.movedByButton;
              }

              // moveToHolder causes the position to be wrong if the target holder does not have alignChildren
              if(!parent || !widgets.get(parent).get('alignChildren')) {
                await cWidget.set('x', (a.properties.x || w.get('x')) + a.xOffset * i);
                await cWidget.set('y', (a.properties.y || w.get('y')) + a.yOffset * i);
                await cWidget.updatePiles();
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
            await removeWidgetLocal(w.get('id'));
            for(const c in collections)
              collections[c] = collections[c].filter(x=>x!=w);
          }
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
        } else if(isValidCollection(a.collection)) {
          if(collections[a.collection].length) {
            for(const c of collections[a.collection].slice(0, a.count || 999999))
              c.flip && await c.flip(a.face,a.faceCycle);
          } else {
            problems.push(`Collection ${a.collection} is empty.`);
          }
        }
      }

      if(a.func == 'GET') {
        setDefaults(a, { variable: a.property || 'id', collection: 'DEFAULT', property: 'id', aggregation: 'first', skipMissing: false });
        if(isValidCollection(a.collection)) {
          let c = collections[a.collection];
          if (a.skipMissing)
            c = c.filter(w=>w.get(a.property) !== null && w.get(a.property) !== undefined);
          c = JSON.parse(JSON.stringify(c.map(w=>w.get(a.property))));
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
        setDefaults(a, { relation: '==' });
        if (['==', '!=', '<', '<=', '>=', '>'].indexOf(a.relation) < 0) {
          problems.push(`Relation ${a.relation} is unsupported. Using '==' relation.`);
          a.relation = '==';
        }
        if(a.condition !== undefined || a.operand1 !== undefined) {
          if (a.condition === undefined)
            a.condition = compute(a.relation, null, a.operand1, a.operand2);
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
            await w(a.label, async widget=>{
              await widget.setText(a.value, a.mode, this.get('debug'), problems)
            });
          }
        } else if(isValidCollection(a.collection)) {
          if(collections[a.collection].length) {
            for(const c of collections[a.collection])
              await c.setText(a.value, a.mode, this.get('debug'), problems);
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
                c.movedByButton = true;
                await c.moveToHolder(target);
                delete c.movedByButton;
              }
            }
          }));
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
        }
      }

      if(a.func == 'RANDOM') {
        setDefaults(a, { min: 1, max: 10, variable: 'RANDOM' });
        variables[a.variable] = Math.floor(a.min + Math.random() * (a.max - a.min + 1));
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
                for(const c of cards)
                  await c.moveToHolder(widgets.get(holder));
              }
            } else {
              problems.push(`Holder ${holder} does not have a deck.`);
            }
          };
        }
      }

      if(a.func == 'ROTATE') {
        setDefaults(a, { count: 1, angle: 90, mode: 'add', collection: 'DEFAULT' });
        if(a.holder !== undefined) {
          if(this.isValidID(a.holder, problems)) {
            await w(a.holder, async holder=>{
              for(const c of holder.children().slice(0, a.count || 999999))
                await c.rotate(a.angle, a.mode);
            });
          }
        } else if(isValidCollection(a.collection)) {
          if(collections[a.collection].length) {
            for(const c of collections[a.collection].slice(0, a.count || 999999))
              await c.rotate(a.angle, a.mode);
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
            await w.set(a.property, compute(a.relation, null, w.get(a.property), a.value));
          }
        }
      }

      if(a.func == 'SORT') {
        setDefaults(a, { key: 'value', reverse: false, collection: 'DEFAULT' });
        if(a.holder !== undefined) {
          if(this.isValidID(a.holder, problems)) {
            await w(a.holder, async holder=>{
              await this.sortWidgets(holder.children(), a.key, a.reverse, a.locales, a.options, true);
              await holder.updateAfterShuffle();
            });
          }
        } else if(isValidCollection(a.collection)) {
          if(collections[a.collection].length)
            await this.sortWidgets(collections[a.collection], a.key, a.reverse, a.locales, a.options, true);
          else
            problems.push(`Collection ${a.collection} is empty.`);
        }
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
          }
        } else if(isValidCollection(a.collection)) {
          if(collections[a.collection].length) {
            for(const c of collections[a.collection])
              await c.set('z', Math.floor(Math.random()*10000));
          } else {
            problems.push(`Collection ${a.collection} is empty.`);
          }
        }
      }

      if(this.get('debug')) {
        let msg = ''
        msg += '\n\n\nOPERATION: \n' + JSON.stringify(a, null, '  ');
        if(problems.length)
          msg += '\n\nPROBLEMS: \n' + problems.join('\n');
        msg += '\n\n\nVARIABLES: \n' + JSON.stringify(variables, null, '  ');
        msg += '\n\nCOLLECTIONS: \n';
        for(const name in collections) {
          msg += '  ' + name + ': ' + collections[name].map(w=>`${w.get('id')} (${w.get('type')})`).join(', ') + '\n';
        }
        $('#debugButtonOutput').textContent += msg.replace(/^/gm, '    '.repeat(depth));
        console.log(msg);
      } else if(problems.length) {
        console.log(problems);
      }
    }

    if(this.get('debug') && !depth)
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

  async moveToHolder(holder) {
    await this.bringToFront();
    if(this.get('parent') && !this.currentParent)
      this.currentParent = widgets.get(this.get('parent'));
    if(this.currentParent != holder)
      await this.checkParent(true);

    await this.set('owner',  null);
    await this.set('parent', holder.get('id'));
  }

  async moveStart() {
    await this.bringToFront();
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

  async move(x, y) {
    const newX = (jeZoomOut ? x : Math.max(0-this.get('width' )*0.25, Math.min(1600+this.get('width' )*0.25, x))) - this.get('width' )/2;
    const newY = (jeZoomOut ? y : Math.max(0-this.get('height')*0.25, Math.min(1000+this.get('height')*0.25, y))) - this.get('height')/2;

    await this.setPosition(newX, newY, this.get('z'));
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

  async moveEnd() {
    for(const t of this.dropTargets)
      t.domElement.classList.remove('droppable');

    await this.checkParent();

    if(this.hoverTarget) {
      await this.moveToHolder(this.hoverTarget);
      this.hoverTarget.domElement.classList.remove('droptarget');
    }

    this.hideEnlarged();
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

        if(field.applyVariables) this.applyVariables(field, variables, problems);

        if(field.type == 'checkbox') {
          const input = document.createElement('input');
          const label = document.createElement('label');
          input.type = 'checkbox';
          input.checked = field.value || false;
          label.textContent = field.label;
          dom.appendChild(input);
          dom.appendChild(label);
          label.htmlFor = input.id = this.get('id') + ';' + field.variable;
        }

        if(field.type == 'color') {
          const input = document.createElement('input');
          const label = document.createElement('label');
          input.type = 'color';
          input.value = field.value || '#ff0000';
          label.textContent = field.label;
          dom.appendChild(label);
          dom.appendChild(input);
          label.htmlFor = input.id = this.get('id') + ';' + field.variable;
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
          label.htmlFor = input.id = this.get('id') + ';' + field.variable;
        }

        if(field.type == 'string') {
          const input = document.createElement('input');
          const label = document.createElement('label');
          input.value = field.value || "";
          label.textContent = field.label;
          dom.appendChild(label);
          dom.appendChild(input);
          label.htmlFor = input.id = this.get('id') + ';' + field.variable;
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
