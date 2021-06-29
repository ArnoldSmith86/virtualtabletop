import { Widget } from './widget.js';

export class Label extends Widget {
  constructor(id) {
    super(id);
  	this.divinput = document.createElement('div');
    this.divinput.className = "labeldiv"; 
  	this.domElement.appendChild(this.divinput);

    this.input = document.createElement('textarea');
    this.addDefaults({
      height: 20,
      movable: false,
      layer: -2,
      typeClasses: 'widget label',

      text: '',
      editable: false,
      richtext: false,
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
     		this.divinput.style.height = `${this.get('height')}px`;
        this.divinput.style.paddingTop = 'unset';
      }
    }
	if(delta.richtext  !== undefined|| delta.text !== undefined) {
	  if(this.get('richtext') == true) {
      var HTMLtext = this.get('text').toString()
      .replace(/=/gimu, '')
      .replace(/</gimu,'')
      .replace(/>/gimu, '')
      .replace(/\[c: ([^\]]+)?\]/gim, '<span style="color: $1">')
      .replace(/\[center\]/gim, '<span style="margin:auto; display:table">')
      .replace(/\[size: ([^\]]+)?\]/gim, '<span style="font-size: $1">')
      .replace(/\[\/c\]|\[\/center\]|\[\/size\]/gim, '</span>')
      .replace(/\*\*(.*?)\*\*/gim, '<b>$1</b>')
      .replace(/\*(.*?)\*/gim, '<i>$1</i>')
      .replace(/\-\-(.*?)\-\-/gim, '<sub>$1</sub>')
      .replace(/\^\^(.*?)\^\^/gim, '<sup>$1</sup>')
      .replace(/\[list\]/gim, '<menu>')
      .replace(/\[\/list\]/gim, '</menu>')
      .replace(/\[li\]/gim, '<li>')
      .replace(/\[\/li\]/gim, '</li>')
      .replace(/_(.*?)_/gim, '<u>$1</u>')
      this.divinput.innerHTML = HTMLtext;
      this.input.style.display = "none";
      this.divinput.style.display = "inline-block";
    } else {
      this.input.style.display = "block";
      this.divinput.style.display = "none";
    }
  }
    if(delta.editable !== undefined) {
      if(delta.editable) {
        this.input.removeAttribute("readonly");
      } else { 
        this.input.setAttribute("readonly", !delta.editable);
      }
    }
  }
}
