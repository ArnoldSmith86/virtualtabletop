import { Widget } from './widget.js';

export class Label extends Widget {
  
  	setFromDiv(e, toEnd){
		e.preventDefault();	
		const t = e.target.innerHTML.trim()
		.replace(/<b>(.*?)<\/b>/gim, '($1)b')
		.replace(/<i>(.*?)<\/i>/gim, '($1)i')
		.replace(/<span style="color: (.*?)">(.*?)<\/span>/gim, '($2)c$1') 
		.replace(/<span style="margin:auto; display:table">(.*?)<\/span>/gim, '($1)center')
		.replace(/<span style="font-size: (.*?)px">(.*?)<\/span>/gim, '($2)$1px')
		.replace(/<sub">(.*?)<\/sub>/gim, '($1)center')
		.replace(/<sup>(.*?)<\/sup>/gim, '($1)sup')
		.replace(/<sub>(.*?)<\/sub>/gim, '($1)sub')
		.replace(/<ol><li>([^>]+)?<\/li>/gim, '(ol)($1)li')
		.replace(/<ul><li>([^>]+)?<\/li>/gim, '(ul)($1)li')
		.replace(/<li>([^>]+)?<\/li><\/ol>/gim, '($1)li(/ol)')
		.replace(/<li>([^>]+)?<\/li><\/ul>/gim, '($1)li(/ul)')
		.replace(/<li>([^>]+)?<\/li>/gim, '($1)li')
		.replace(/&lt;/gim,'<') 
		.replace(/&gt;/gim, '>') 
		this.setText(t + " ");
		if(toEnd) {
			document.execCommand('selectAll', false, null); 
			document.getSelection().collapseToEnd();
			}
		}
  
  constructor(id) {
    super(id);
  	this.divinput = document.createElement('div');
    this.divinput.className = "labeldiv"; 
  	this.domElement.appendChild(this.divinput);
    this.divinput.addEventListener('focusout' , e => this.setFromDiv (e, false))
    this.divinput.addEventListener('keydown' , e => {
      if(e.shiftKey && e.keyCode == 13)
        this.setFromDiv (e, true);
    })

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
      .replace(/</gimu,'&lt;')
      .replace(/>/gimu, '&gt;')
      .replace(/\(([^)]+)\)b/gim, '<b>$1</b>')
      .replace(/\(([^)]+)\)i/gim, '<i>$1</i>')
      .replace(/\(([^)]+)\)sub/gim, '<sub>$1</sub>')
      .replace(/\(([^)]+)\)sup/gim, '<sup>$1</sup>')
      .replace(/\((.*?)\)center/gim, '<span style="margin:auto; display:table">$1</span>')
      .replace(/\((.*?)\)c([^\s]+)/gim, '<span style="color: $2">$1</span>')
      .replace(/\(ol\)\(([^)]+)\)li/gim, '<ol><li>$1</li>')
      .replace(/\(ul\)\(([^)]+)\)li/gim, '<ul><li>$1</li>')
      .replace(/\(([^)]+)\)li\(\/ol\)/gim, '<li>$1</li></ol>')
      .replace(/\(([^)]+)\)li\(\/ul\)/gim, '<li>$1</li></ul>')
      .replace(/\(([^)]+)\)li/gim, '<li>$1</li>')
      .replace(/\((.*?)\)([^d]+)px/gim, '<span style="font-size: $2px">$1</span>')
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
