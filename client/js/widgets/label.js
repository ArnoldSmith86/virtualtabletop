import { Widget } from './widget.js';

export class Label extends Widget {
  constructor(id) {
    super(id);
  	this.divinput = document.createElement('div');
    this.divinput.className = "labeldiv"; 
  	this.domElement.appendChild(this.divinput);
  	this.divinput.addEventListener('keyup', e=>this.setText(e.target.value)); // may delete
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
     		this.divinput.style.height = `${this.get('height')}px`;
        this.divinput.style.paddingTop = 'unset';
      }
    }
	if(delta.html  !== undefined|| delta.text !== undefined) {
	  if(this.get('html') == true) {
        var HTMLtext = this.get('text')
        var HTMLtext = HTMLtext.toString()
        .replace(/&+#+/gim, '')
		    .replace(/\\+\\+u+/gim, '')
        .replace(/<[^>]+?cript(.*?)>/gim, '')
        .replace(/<[^>]+?\((.*?)\)(.*?)>/gim, '')
        .replace(/\*\*(.*?)\*\*/gim, '<b>$1</b>')
        .replace(/\*(.*?)\*/gim, '<i>$1</i>')
        .replace(/\-\-(.*?)\-\-/gim, '<sub>$1</sub>')
  	    .replace(/\^\^(.*?)\^\^/gim, '<sup>$1</sup>')
        .replace(/<[^A-Za-z0-9]*a +href(.*?)>/im, '<a href=https://github.com/ArnoldSmith86/virtualtabletop/wiki/Widget-Properties#label>')
  	    .replace(/<[^A-Za-z0-9]*iframe(.*?)>/im, '<iframe src=https://virtualtabletop.io/Tutorials> height="500" width="500"')
    		this.divinput.innerHTML = HTMLtext;   
  	    this.input.style.display = "none";
	    	this.divinput.style.display = "block";           
        } else {
	          this.input.style.display = "block";
		        this.divinput.style.display = "none";
              }	
	  }
    if(delta.editable !== undefined) {
      if(delta.editable) {
        this.input.removeAttribute("readonly");
   	    this.divinput.contentEditable = true;
      } else { 
        this.input.setAttribute("readonly", !delta.editable);
   	    this.divinput.contentEditable = false;
      }
    }
  }
}
