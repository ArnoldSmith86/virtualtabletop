class Label extends Widget {
  constructor(id) {
    super(id);
    this.input = document.createElement('textarea');

    this.addDefaults({
      height: 20,
      movable: false,
      layer: -2,
      classes: 'widget label',

      text: '',
      editable: false,
      twoRowBottomAlign: false
    });

    this.domElement.appendChild(this.input);
    this.input.addEventListener('keyup', e=>this.setText(e.target.value));
  }

  applyDeltaToDOM(delta) {
    super.applyDeltaToDOM(delta);
    if(delta.text !== undefined) {
      this.input.value = delta.text;
      if(this.p('twoRowBottomAlign')) {
        this.input.style.height = '20px';
        this.input.style.paddingTop = '';
        if(this.input.scrollHeight == 20) // this.p('height'))
          this.input.style.paddingTop = '20px';
        else
          this.input.style.height = '40px';
      }
    }
    if(delta.editable !== undefined) {
      if(delta.editable)
        this.input.removeAttribute("readonly");
      else
        this.input.setAttribute("readonly", !delta.editable);
    }
  }

  setText(text, mode) {
    if(!mode || mode == 'set')
      this.p('text', typeof text != 'string' || text.match(/^[-+]?[0-9.]+$/) ? +text : text);
    else
      this.p('text', this.p('text') + (mode == 'dec' ? -1 : 1) * text);
  }
}
