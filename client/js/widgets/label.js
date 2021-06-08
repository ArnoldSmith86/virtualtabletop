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
      this.input.value = this.get('text');
      if(this.get('twoRowBottomAlign')) {
        this.input.style.height = '20px';
        this.input.style.paddingTop = '';
        if(this.input.scrollHeight == 20)
          this.input.style.paddingTop = '20px';
        else
          this.input.style.height = '40px';
      } else {
        this.input.style.height = `${this.get('height')}px`;
        this.input.style.paddingTop = 'unset';
      }
    }
    if(delta.editable !== undefined) {
      if(this.get('editable'))
        this.input.removeAttribute("readonly");
      else
        this.input.setAttribute("readonly", !this.get('editable');
    }
  }
}
