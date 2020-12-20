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
    batchStart();

    const variables = {};

    for(const original of this.p('clickRoutine')) {
      const a = { ...original };

      if(a.applyVariables)
        for(const v of a.applyVariables)
          a[v.parameter] = variables[v.variable];
      if(a.skip)
        continue;



      if(a.func == 'FLIP') {
        this.w(a.holder, holder=>holder.children().slice(0, a.count || 999999).forEach(c=>c.flip(a.face)));
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

      if(a.func == 'RECALL') {
        this.toA(a.holder).forEach(holder=>{
          const deck = this.wFilter(w=>w.p('type')=='deck'&&w.p('parent')==holder)[0];
          if(deck) {
            let cards = this.wFilter(w=>w.p('deck')==deck.p('id'));
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

        if(field.type == 'checkbox') {
          const checkbox = document.createElement('input');
          const label    = document.createElement('label');
          checkbox.type = 'checkbox';
          label.textContent = field.label;
          $('#buttonInputFields').appendChild(checkbox);
          $('#buttonInputFields').appendChild(label);
          label.htmlFor = checkbox.id = this.p('id') + ';' + field.variable;
        }

        if(field.type == 'text') {
          const p = document.createElement('p');
          p.textContent = field.text;
          $('#buttonInputFields').appendChild(p);
        }

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
    return this.wFilter(w=>this.toA(ids).indexOf(w.p('id')) != -1).forEach(callback);
  }

  wFilter(callback) {
    return Array.from(widgets.values()).filter(callback);
  }
}
