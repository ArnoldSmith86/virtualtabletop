import { $ } from '../domhelpers.js';
import { showOverlay } from '../main.js';
import { playerName, playerColor, activePlayers } from '../overlays/players.js';
import { batchStart, batchEnd, widgetFilter, widgets } from '../serverstate.js';
import { Widget } from './widget.js';

export class Button extends Widget {
  constructor(id) {
    super(id);

    this.addDefaults({
      width: 80,
      height: 80,

      typeClasses: 'widget button',
      layer: -1,
      movable: false,
      clickable: true,

      text: '',
      clickRoutine: [],
      debug: false
    });
  }

  applyDeltaToDOM(delta) {
    super.applyDeltaToDOM(delta);
    if(delta.text !== undefined)
      this.domElement.textContent = delta.text;
  }

  async click() {
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

    function isValidID(id) {
      if(Array.isArray(id))
        return !id.map(i=>isValidID(i, problems)).filter(r=>r!==true).length;
      if(widgets.has(id))
        return true;
      problems.push(`Widget ID ${id} does not exist.`);
    }
   
   if(!this.p('clickable')) return;
    
    batchStart();

    if(this.p('debug'))
      $('#debugButtonOutput').textContent = '';

    const variables = {
      playerName,
      playerColor,
      activePlayers,
      thisID : this.p('id')
    };

    const collections = {
      thisButton : [this]
    }

    for(const original of this.p('clickRoutine')) {
      const a = { ...original };
      var problems = [];

      if(this.p('debug')) console.log(`${this.id}: ${JSON.stringify(original)}`);
      if(a.applyVariables) {
        if(Array.isArray(a.applyVariables)) {
          for(const v of a.applyVariables) {
            if(v.parameter && v.variable) {
              a[v.parameter] = (v.index === undefined) ? variables[v.variable] : variables[v.variable][v.index];
            } else if(v.parameter && v.template) {
              a[v.parameter] = v.template.replace(/\{([^}]+)\}/g, function(i, key) {
                return (variables[key] === undefined) ? "" : variables[key];
              });
            } else if(v.parameter && v.property) {
              let w = isValidID(v.widget) ? widgets.get(v.widget) : this;
              a[v.parameter] = (w.p(v.property) === undefined) ? null : w.p(v.property);
            } else {
              problems.push('Entry in parameter applyVariables does not contain "parameter" together with "variable", "property", or "template".');
            }
          }
        } else {
          problems.push('Parameter applyVariables is not an array.');
        }
      }
      if(a.skip) {
        $('#debugButtonOutput').textContent += '\n\n\nOPERATION SKIPPED: \n' + JSON.stringify(a, null, '  ');
        continue;
      }

      if(a.func == 'CLICK') {
        setDefaults(a, { collection: 'DEFAULT', count: 1 });
        if(isValidCollection(a.collection))
          for(let i=0; i<a.count; ++i)
            for(const w of collections[a.collection])
              if(w.click)
                w.click();
      }

      if(a.func == 'COMPUTE') {
        setDefaults(a, { operation: '+', operand1: 1, operand2: 1, operand3: 1, variable: 'COMPUTE' });
        const toNum = s=>typeof s == 'string' && s.match(/^[-+]?[0-9]+(\.[0-9]+)?$/) ? +s : s;
        const x = toNum(a.operand1);
        const y = toNum(a.operand2);
        const z = toNum(a.operand3);
        const v = a.variable;

        try {
          switch(a.operation) {
          case '+':  variables[v] = x + y;  break;
          case '-':  variables[v] = x - y;  break;
          case '*':  variables[v] = x * y;  break;
          case '**': variables[v] = x ** y; break;
          case '/':  variables[v] = x / y;  break;
          case '%':  variables[v] = x % y;  break;
          case '<':  variables[v] = x < y;  break;
          case '<=': variables[v] = x <= y; break;
          case '==': variables[v] = x == y; break;
          case '!=': variables[v] = x != y; break;
          case '>=': variables[v] = x >= y; break;
          case '>':  variables[v] = x > y;  break;
          case '&&': variables[v] = x && y; break;
          case '||': variables[v] = x || y; break;
          case '!':  variables[v] = !x;     break;

          // Math operations
          case 'hypot':
          case 'max':
          case 'min':
          case 'pow':
            variables[v] = Math[a.operation](x, y);
            break;
          case 'sin':
          case 'cos':
          case 'tan':
            variables[v] = Math[a.operation](x * Math.PI/180);
            break;
          case 'abs':
          case 'cbrt':
          case 'ceil':
          case 'exp':
          case 'floor':
          case 'log':
          case 'log10':
          case 'log2':
          case 'round':
          case 'sign':
          case 'sqrt':
          case 'trunc':
            variables[v] = Math[a.operation](x);
            break;
          case 'E':
          case 'LN2':
          case 'LN10':
          case 'LOG2E':
          case 'LOG10E':
          case 'PI':
          case 'SQRT1_2':
          case 'SQRT2':
            variables[v] = Math[a.operation];
            break;

          // String operations
          case 'length':
            variables[v] = x.length;
            break;
          case 'toLowerCase':
          case 'toUpperCase':
          case 'trim':
          case 'trimStart':
          case 'trimEnd':
            variables[v] = x[a.operation]();
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
          case 'toLocaleLowerCase':
          case 'toLocaleUpperCase':
            variables[v] = x[a.operation](y);
            break;
          case 'replace':
          case 'replaceAll':
          case 'substr':
            variables[v] = x[a.operation](y, z);
            break;

          // Array operations
          // 'length' should work the same as for strings
          case 'getIndex':
            variables[v] = x[y];
            break;
          case 'setIndex':
            variables[v][x] = y;
            break;
          case 'from':
          case 'isArray':
            variables[v] = Array[a.operation](x);
            break;
          case 'concatArray':
            variables[v] = x.concat(y);
            break;
          case 'pop':
          case 'reverse':
          case 'shift':
          case 'sort':
            variables[v] = x[a.operation]();
            break;
          case 'findIndex':
          case 'includes':
          case 'indexOf':
          case 'join':
          case 'lastIndexOf':
            variables[v] = x[a.operation](y);
            break;
          case 'slice':
            variables[v] = x[a.operation](y, z);
            break;
          case 'push':
          case 'unshift':
            variables[v][a.operation](x);
            break;
          default:
            problems.push(`Operation ${a.operation} is unsupported.`);
          }
        } catch(e) {
          variables[v] = 0;
          problems.push(`Exception: ${e.toString()}`);
        }

        if(variables[v] === null || typeof variables[v] === 'number' && !isFinite(variables[v])) {
          variables[v] = 0;
          problems.push(`The operation evaluated to null, Infinity or NaN. Setting the variable to 0.`);
        }
      }

      if(a.func == 'COUNT') {
        setDefaults(a, { collection: 'DEFAULT', variable: 'COUNT' });
        if(isValidCollection(a.collection))
          variables[a.variable] = collections[a.collection].length;
      }

      if(a.func == 'FLIP') {
        setDefaults(a, { count: 0, face: null });
        if(isValidID(a.holder))
          this.w(a.holder, holder=>holder.children().slice(0, a.count || 999999).forEach(c=>c.flip&&c.flip(a.face)));
      }

      if(a.func == 'GET') {
        setDefaults(a, { variable: a.property || 'id', collection: 'DEFAULT', property: 'id', aggregation: 'first' });
        if(isValidCollection(a.collection)) {
          switch(a.aggregation) {
          case 'first':
            if(collections[a.collection].length)
              if(collections[a.collection][0].p(a.property) !== undefined) {
                // always get a deep copy and not object references
                variables[a.variable] = JSON.parse(JSON.stringify(collections[a.collection][0].p(a.property)));
              } else {
                variables[a.variable] = null;
                problems.push(`Property ${a.property} missing from first item of collection, setting ${a.variable} to null.`);
              }
            else
              problems.push(`Collection ${a.collection} is empty.`);
            break;
          case 'sum':
            variables[a.variable] = 0;
            for(const widget of collections[a.collection])
              variables[a.variable] += Number(widget.p(a.property) || 0);
            break;
          default:
            problems.push(`Aggregation ${a.aggregation} is unsupported.`);
          }
        }
      }

      if(a.func == 'INPUT') {
        try {
          Object.assign(variables, await this.showInputOverlay(a));
        } catch(e) {
          problems.push(`Exception: ${e.toString()}`);
          batchEnd();
          return;
        }
      }

      if(a.func == 'LABEL') {
        setDefaults(a, { value: 0, mode: 'set' });
        if([ 'set', 'dec', 'inc' ].indexOf(a.mode) == -1)
          problems.push(`Warning: Mode ${a.mode} will be interpreted as add.`);
        this.w(a.label, label=> {
          if (this.p('debug')) console.log(`changing ${a.label} ${a.mode} ${a.value}`)
          label.setText(a.value, a.mode)
        });
      }

      if(a.func == 'MOVE') {
        setDefaults(a, { count: 1, face: null });
        const count = a.count || 999999;

        if(isValidID(a.from) && isValidID(a.to)) {
          if(a.face === null && typeof a.from == 'string' && typeof a.to == 'string' && !widgets.get(a.to).children().length && widgets.get(a.from).children().length <= count) {
            // this is a hacky shortcut to avoid removing and creating card piles when moving all children to an empty holder
            Widget.prototype.children.call(widgets.get(a.from)).filter(
              w => w.p('type') != 'label' && w.p('type') != 'button' && w.p('type') != 'deck'
            ).forEach(c=>c.p('parent', a.to));
          } else {
            this.w(a.from, source=>this.w(a.to, target=>source.children().slice(0, count).reverse().forEach(c=> {
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
      }

      if(a.func == 'MOVEXY') {
        setDefaults(a, { count: 1, face: null, x: 0, y: 0 });
        if(isValidID(a.from)) {
          this.w(a.from, source=>source.children().slice(0, a.count || 999999).reverse().forEach(c=> {
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
        if(isValidID(a.holder)) {
          this.toA(a.holder).forEach(holder=>{
            const deck = widgetFilter(w=>w.p('type')=='deck'&&w.p('parent')==holder);
            if(deck.length) {
              let cards = widgetFilter(w=>w.p('deck')==deck[0].p('id'));
              if(!a.owned)
                cards = cards.filter(c=>!c.p('owner'));
              cards.forEach(c=>c.moveToHolder(widgets.get(holder)));
            } else {
              problems.push(`Holder ${holder} does not have a deck.`);
            }
          });
        }
      }

      if(a.func == 'ROTATE') {
        setDefaults(a, { count: 1, angle: 90, mode: 'add' });
        if(isValidID(a.holder)) {
          this.w(a.holder, holder=>holder.children().slice(0, a.count || 999999).forEach(c=>{
            c.rotate(a.angle, a.mode);
          }));
        }
      }

      if(a.func == 'SELECT') {
        setDefaults(a, { type: 'all', property: 'parent', relation: '==', value: null, max: 999999, collection: 'DEFAULT', mode: 'add', source: 'all' });
        if(a.source == 'all' || isValidCollection(a.source)) {
          if([ 'add', 'set' ].indexOf(a.mode) == -1)
            problems.push(`Warning: Mode ${a.mode} interpreted as set.`);
          let c = (a.source == 'all' ? Array.from(widgets.values()) : collections[a.source]).filter(function(w) {
            if(a.type != 'all' && w.p('type') != a.type)
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
          c.filter(w=>w.p('type')=='pile').forEach(w=>c.push(...w.children()));
          c = c.filter(w=>w.p('type')!='pile');
          collections[a.collection] = c;
        }
      }

      if(a.func == 'SET') {
        setDefaults(a, { collection: 'DEFAULT', property: 'parent', relation: '=', value: null });
        if((a.property == 'parent' || a.property == 'deck') && a.value !== null && !widgets.has(a.value)) {
          problems.push(`Tried setting ${a.property} to ${a.value} which doesn't exist.`);
        } else if(isValidCollection(a.collection)) {
          if([ '+', '-', '=' ].indexOf(a.relation) == -1)
            problems.push(`Warning: Relation ${a.relation} interpreted as =.`);
          for(const w of collections[a.collection]) {
            if(a.relation === '+')
              w.p(a.property, w.p(a.property) + a.value);
            else if(a.relation === '-')
              w.p(a.property, w.p(a.property) - a.value);
            else
              w.p(a.property, a.value);
          }
        }
      }

      if(a.func == 'SORT') {
        setDefaults(a, { key: 'value', reverse: false });
        if(isValidID(a.holder)) {
          this.w(a.holder, holder=>{
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
        if(isValidID(a.holder)) {
          this.w(a.holder, holder=>{
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
        $('#debugButtonOutput').textContent += msg
        console.log(msg);
      } else if(problems.length) {
        console.log(problems);
      }
    }

    if(this.p('debug'))
      showOverlay('debugButtonOverlay');

    batchEnd();
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

  async showInputOverlay(o) {
    return new Promise((resolve, reject) => {
      $('#buttonInputOverlay h1').textContent = o.header || "Button Input";
      $('#buttonInputFields').innerHTML = '';

      for(const field of o.fields) {

        const dom = document.createElement('div');

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

  toA(ids) {
    return typeof ids == 'string' ? [ ids ] : ids;
  }

  w(ids, callback) {
    return widgetFilter(w=>this.toA(ids).indexOf(w.p('id')) != -1).forEach(callback);
  }
}
