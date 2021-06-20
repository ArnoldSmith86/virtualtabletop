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
      var HTMLtext = this.get('text').toString()
	    .replace(/=/gim, '')
      .replace(/<img: +(.*?) height: +(.*?)>/gim, '<img src="$1" height="$2">')
      .replace(/<img: +(.*?) width: +(.*?)>/gim, '<img src="$1" width="$2">')
		  .replace(/<img: +(.*?)>/gim, '<img src="$1">')
		  .replace(/<c: +(.*?)>/gim, '<span style="color: $1">')
		  .replace(/<\/c>/gim, '</span>') 
      .replace(/\*\*(.*?)\*\*/gim, '<b>$1</b>')
      .replace(/\*(.*?)\*/gim, '<i>$1</i>')
      .replace(/\-\-(.*?)\-\-/gim, '<sub>$1</sub>')
  	  .replace(/\^\^(.*?)\^\^/gim, '<sup>$1</sup>')
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
