import { Widget } from './widget.js';

export class Label extends Widget {
  constructor(id) {
    super(id);
    this.input = document.createElement('textarea');

    this.addDefaults({
      height: 20,
      movable: false,
      layer: -2,
      typeClasses: 'widget label',

      text: '',
      editable: false,
      twoRowBottomAlign: false
    });

    this.domElement.appendChild(this.input);
    this.input.addEventListener('keyup', e=>this.setText(e.target.value));
  }

  applyDeltaToDOM(delta) {
    super.applyDeltaToDOM(delta);
    if(delta.text !== undefined || delta.twoRowBottomAlign !== undefined) {
      this.input.value = delta.text;
      this.input.style.height = '10px';
      const contentHeight = this.input.scrollHeight;
      this.input.style.height = `${contentHeight}px`
      if(this.get('twoRowBottomAlign') && contentHeight < this.get('height')) {
        this.input.style.paddingTop = `${this.get('height')-contentHeight}px`;
        this.input.style.minHeight = `${contentHeight}px`;
      } else {
        this.input.style.paddingTop = '0';
        this.input.style.minHeight = '100%';
      }
    }
    if(delta.editable !== undefined) {
      if(delta.editable)
        this.input.removeAttribute("readonly");
      else
        this.input.setAttribute("readonly", !delta.editable);
    }
  }
}
