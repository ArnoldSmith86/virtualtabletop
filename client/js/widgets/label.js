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
    if(this.input && (delta.text !== undefined || delta.twoRowBottomAlign !== undefined || delta.height !== undefined || delta.width !== undefined || delta.css !== undefined)) {
      const fontSizeMatch = this.get('css').match(/font-size: *([0-9]+) *px/);
      const fontSize = fontSizeMatch ? +fontSizeMatch[1] : 16;
      this.input.style.lineHeight = `${Math.round(fontSize*1.2)}px`;

      this.input.value = this.get('text');
      this.input.style.height = '5px';
      this.input.style.paddingTop = '0';
      const contentHeight = this.input.scrollHeight;
      const offset = this.get('twoRowBottomAlign') && contentHeight < this.get('height') ? this.get('height')-contentHeight : 0;
      this.input.style.height = (this.get('height')-offset) + 'px';
      this.input.style.paddingTop = `${offset}px`;
      this.input.style.overflowY = contentHeight-this.get('height') < 5 ? 'hidden' : 'auto';
    }

    if(delta.editable !== undefined) {
      if(delta.editable)
        this.input.removeAttribute("readonly");
      else
        this.input.setAttribute("readonly", true);
    }
  }
}
