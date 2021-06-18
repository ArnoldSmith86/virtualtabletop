import { Widget } from './widget.js';

export async function unsetHTML(w) {
  document.getElementById(w.id).innerHTML = null;
	w.input = document.createElement('textarea');
	 
	w.addDefaults({
    height: 20,
    movable: false,
    layer: -2,
    typeClasses: 'widget label',

    text: '',
    editable: false,
    twoRowBottomAlign: false
    });
  w.domElement.appendChild(w.input);
	w.input.value = w.get('text'); 
  w.input.addEventListener('keyup', e=>w.setText(e.target.value));  
  }
 
  export async function setHTML(w) {
    if(w.get('html') == true) {
      var HTMLtext = w.get('text')
	    var HTMLtext = HTMLtext.toString()
	    .replace(/<(.*?)script(.*?)>/gim, '')
	    .replace(/<(.*?)\((.*?)\)(.*?)>/gim, '')
	    .replace(/\*\*(.*?)\*\*/gim, '<b>$1</b>')
	    .replace(/\*(.*?)\*/gim, '<i>$1</i>')
      .replace(/\-\-(.*?)\-\-/gim, '<sub>$1</sub>')
   	  .replace(/\^\^(.*?)\^\^/gim, '<sup>$1</sup>')
      .replace(/<[^A-Za-z0-9]*a +href(.*?)>/im, '<a href=https://github.com/ArnoldSmith86/virtualtabletop/wiki/Widget-Properties#label>')
	    .replace(/<[^A-Za-z0-9]*iframe(.*?)>/im, '<iframe src=https://virtualtabletop.io/Tutorials> height="500" width="500"')
      document.getElementById(w.id).innerHTML = HTMLtext;}
    }

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
    if(delta.html !== undefined) {
      if(delta.html)
        setHTML(this);
      else
        unsetHTML(this);
    }
    if(delta.editable !== undefined) {
      if(delta.editable)
        this.input.removeAttribute("readonly");
      else
        this.input.setAttribute("readonly", !delta.editable);
    }
  }
}
