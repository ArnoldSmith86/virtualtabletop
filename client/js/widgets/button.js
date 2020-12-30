class Button extends Widget {
  constructor(id) {
    super(id);

    this.addDefaults({
      width: 80,
      height: 80,

      typeClasses: 'widget button',
      layer: -1,
      movable: false,

      text: '',
      clickRoutine: []
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

    batchStart();

    const variables = {
      playerName,
      playerColor
    };
    const collections = {};

    for(const original of this.p('clickRoutine')) {
      const a = { ...original };

      if(a.applyVariables)
        for(const v of a.applyVariables)
          a[v.parameter] = variables[v.variable];
      if(a.skip)
        continue;



      if(a.func == 'CLICK') {
        for(const w of collections[a.collection || 'DEFAULT'])
          w.click();
      }

      if(a.func == 'COUNT') {
        try {
          variables[a.variable || 'COUNT'] = collections[a.collection || 'DEFAULT'].length;
        } catch(e) {
          variables[a.variable || 'COUNT'] = 'ERROR';
        }
      }

      if(a.func == 'FLIP') {
        this.w(a.holder, holder=>holder.children().slice(0, a.count || 999999).forEach(c=>c.flip(a.face)));
      }

      if(a.func == 'GET') {
        setDefaults(a, { variable: a.property || 'id', collection: 'DEFAULT', property: 'id', aggregation: 'first' });
        try {
          switch(a.aggregation) {
          case 'first':
            variables[a.variable] = collections[a.collection][0].p(a.property);
            break;
          case 'sum':
            variables[a.variable] = 0;
            for(const widget of collections[a.collection]) {
              variables[a.variable] += Number(widget.p(a.property) || 0);
            }
            break;
          default:
            variables[a.variable] = `ERROR: unsupported aggregation '${a.aggregation}'`;
          }
        } catch(e) {
          variables[a.variable] = `ERROR: '${e}'`;
        }
      }

      if(a.func == 'INPUT') {
        try {
          Object.assign(variables, await this.showInputOverlay(a));
        } catch(e) {
          batchEnd();
          return;
        }
      }

      if(a.func == 'LABEL') {
        this.w(a.label, label=>label.setText(a.value !== undefined ? a.value : 0, a.mode || 'set'));
      }

      if(a.func == 'MOVE') {
        const count = (a.count !== undefined ? a.count : 1) || 999999;

        if(a.face === undefined && typeof a.from == 'string' && typeof a.to == 'string' && !widgets.get(a.to).children().length && widgets.get(a.from).children().length <= count) {
          // this is a hacky shortcut to avoid removing and creating card piles when moving all children to an empty holder
          Widget.prototype.children.call(widgets.get(a.from)).filter(
            w => w.p('type') != 'label' && w.p('type') != 'button' && w.p('type') != 'deck'
          ).forEach(c=>c.p('parent', a.to));
        } else {
          this.w(a.from, source=>this.w(a.to, target=>source.children().slice(0, count).reverse().forEach(c=> {
            if(a.face !== undefined && a.face !== null && c.flip)
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
        this.w(a.from, source=>source.children().slice(0, (a.count !== undefined ? a.count : 1) || 999999).reverse().forEach(c=> {
          if(a.face !== undefined && a.face !== null)
            c.flip(a.face);
          c.p('parent', null);
          c.bringToFront();
          c.setPosition(a.x || 0, a.y || 0, a.z || c.p('z'));
          c.updatePiles();
        }));
      }

      if(a.func == 'RANDOM') {
        setDefaults(a, { min: 1, max: 10, variable: 'RANDOM' });
        variables[a.variable] = Math.floor(a.min + Math.random() * (a.max - a.min + 1));
      }

      if(a.func == 'RECALL') {
        this.toA(a.holder).forEach(holder=>{
          const deck = widgetFilter(w=>w.p('type')=='deck'&&w.p('parent')==holder)[0];
          if(deck) {
            let cards = widgetFilter(w=>w.p('deck')==deck.p('id'));
            if(a.owned === false)
              cards = cards.filter(c=>!c.p('owner'));
            cards.forEach(c=>c.moveToHolder(widgets.get(holder)));
          }
        });
      }

      if(a.func == 'ROTATE') {
        this.w(a.holder, holder=>holder.children().slice(0, (a.count !== undefined ? a.count : 1) || 999999).forEach(c=>{
          c.rotate(a.angle !== undefined ? a.angle : 90);
        }));
      }

      if(a.func == 'SELECT') {
        setDefaults(a, { property: 'parent', relation: '==', value: null, max: 999999, collection: 'DEFAULT', mode: 'add', source: 'all' });
        collections[a.collection] = (a.source == 'all' ? Array.from(widgets.values()) : collections[a.source]).filter(function(w) {
          if(a.relation === '<')
            return w.p(a.property) < a.value;
          if(a.relation === '<=')
            return w.p(a.property) <= a.value;
          if(a.relation === '==')
            return w.p(a.property) === a.value;
          if(a.relation === '!=')
            return w.p(a.property) != a.value;
          if(a.relation === '>=')
            return w.p(a.property) >= a.value;
          if(a.relation === '>')
            return w.p(a.property) > a.value;
        }).slice(0, a.max).concat(a.mode == 'add' ? collections[a.collection] || [] : []);
      }

      if(a.func == 'SET') {
        setDefaults(a, { collection: 'DEFAULT', property: 'parent', relation: '=', value: null });
        for(const w of collections[a.collection]) {
          if(a.relation === '=')
            w.p(a.property, a.value);
          if(a.relation === '+')
            w.p(a.property, w.p(a.property) + a.value);
          if(a.relation === '-')
            w.p(a.property, w.p(a.property) - a.value);
        }
      }

      if(a.func == 'SORT') {
        this.w(a.holder, holder=>{
          let z = 1;
          let children = holder.children().sort((w1,w2)=>{
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

      if(a.func == 'SHUFFLE') {
        this.w(a.holder, holder=>{
          holder.children().forEach(c=>c.p('z', Math.floor(Math.random()*10000)));
          holder.updateAfterShuffle();
        });
      }
    }

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
