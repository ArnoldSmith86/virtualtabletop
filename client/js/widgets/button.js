import { $ } from '../domhelpers.js';
import { showOverlay } from '../main.js';
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

      image: '',
      color: 'black',
      svgReplaces: {},

      text: ''
    });
  }

  isValidID(id, problems) {
    if(Array.isArray(id))
      return !id.map(i=>this.isValidID(i, problems)).filter(r=>r!==true).length;
    if(widgets.has(id))
      return true;
    problems.push(`Widget ID ${id} does not exist.`);
  }

  applyDeltaToDOM(delta) {
    super.applyDeltaToDOM(delta);
    if(delta.text !== undefined)
      this.domElement.textContent = delta.text;
  }

  css() {
    let css = super.css();

    if(this.p('color'))
      css += '; --color:' + this.p('color');
    if(this.p('image'))
      css += '; background-image: url("' + this.getImage() + '")';

    return css;
  }

  cssProperties() {
    const p = super.cssProperties();
    p.push('image', 'color', 'svgReplaces');
    return p;
  }

  getImage() {
    if(!Object.keys(this.p('svgReplaces')).length)
      return this.p('image');

    const replaces = {};
    for(const key in this.p('svgReplaces'))
      replaces[key] = this.p(this.p('svgReplaces')[key]);
    return getSVG(this.p('image'), replaces, _=>this.domElement.style.cssText = this.css());
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
}

