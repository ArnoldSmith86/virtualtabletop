import { Widget } from './widget.js';

export class Label extends Widget {
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
      html: false,
      twoRowBottomAlign: false
    });

    this.domElement.appendChild(this.input);
    this.input.addEventListener('keyup', e=>this.setText(e.target.value));
  }

  setFromDiv(e, toEnd){
    e.preventDefault();
    const t = e.target.innerHTML.trim()
    .replace(/&lt;/gimu,'<')
    .replace(/&gt;/gimu, '>')
    .replace(/<span style="color: ([^>]+)?">/gimu, '<c: $1>')
    .replace(/<span style="margin:auto; display:table">/gimu, '<center>')
    .replace(/<span style="font-size: ([^>]+)?">/gimu, '<size: $1>')
    this.setText(t + " ");
    if(toEnd) {
      document.execCommand('selectAll', false, null);
      document.getSelection().collapseToEnd();
    }
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
        this.divinput.style.height = `${this.get('height')}px`;
        this.divinput.style.paddingTop = 'unset';
      }
    }
    if(delta.html  !== undefined|| delta.text !== undefined) {
      if(this.get('html') == true) {
        var HTMLtext = this.get('text').toString()
        .replace(/=/gimu, '&#61')
        .replace(/<c: ([^>]+)?>/gim, '<span style="color: $1">')
        .replace(/<center>/gim, '<span style="margin:auto; display:table">')
        .replace(/<size: ([^>]+)?>/gim, '<span style="font-size: $1">')
        .replace(/<\/c>|<\/center>|<\/size>/gim, '</span>')
        .replace(/\*\*(.*?)\*\*/gim, '<b>$1</b>')
        .replace(/\*(.*?)\*/gim, '<i>$1</i>')
        .replace(/\-\-(.*?)\-\-/gim, '<sub>$1</sub>')
        .replace(/\^\^(.*?)\^\^/gim, '<sup>$1</sup>')
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
        this.divinput.contentEditable = true;
      } else {
        this.input.setAttribute("readonly", !delta.editable);
        this.divinput.contentEditable = false;
      }
    }
  }
}
