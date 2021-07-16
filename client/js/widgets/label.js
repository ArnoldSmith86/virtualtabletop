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
    this.input.addEventListener('keyup', e=>{
      if(this.get('editable') && e.target.value !== this.get('text'))
        this.setText(e.target.value)
    });
  }

  applyDeltaToDOM(delta) {
    super.applyDeltaToDOM(delta);
    if(delta.text !== undefined || delta.twoRowBottomAlign !== undefined) {
      this.input.value = delta.text;
      if(this.get('twoRowBottomAlign')) {
        this.input.style.height = '20px';
        this.input.style.minHeight = 'unset';
        this.input.style.paddingTop = '0';
        const contentHeight = this.input.scrollHeight;
        if(contentHeight < this.get('height')) {
          this.input.style.paddingTop = `${this.get('height')-contentHeight}px`;
          this.input.style.height = 'auto';
          this.input.style.minHeight = `${contentHeight}px`;
        } else {
          this.input.style.minHeight = '100%';
        }
      } else {
        this.input.style.minHeight = '100%';
        this.input.style.paddingTop = 'unset';
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
