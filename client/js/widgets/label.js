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
      clickable: false,
      spellCheck: false,
      tabIndex: null,
      placeholderText: '',

      text: '',
      editable: false,
      twoRowBottomAlign: false,
      regex: null,
      regexHint: null
    });

    this.domElement.appendChild(this.input);
    this.input.addEventListener('input', e => {
      if (!this.get('editable')) return;
      
      const newValue = e.target.value;
      const regex = this.get('regex');
      
      if (regex && newValue) {
        try {
          const isValid = this.createRegexPattern(regex).test(newValue);
          this.input.classList.toggle('invalid', !isValid);
          this.toggleValidationError(!isValid, 
            !isValid ? (this.get('regexHint') || `Invalid input`) : ''
          );
        } catch(e) {
        }
      } else {
        this.input.classList.remove('invalid');
        this.toggleValidationError(false);
      }
      if (newValue !== this.get('text')) {
        this.setText(newValue);
      }
    });
  }

  createRegexPattern(regex) {
    if (!regex.startsWith('/')) return new RegExp(regex);
    
    const lastSlash = regex.lastIndexOf('/');
    if (lastSlash <= 0) return new RegExp(regex);
    
    const pattern = regex.slice(1, lastSlash);
    const flags = regex.slice(lastSlash + 1);
    return new RegExp(pattern, flags);
  }

    toggleValidationError(show, message = '') {
    const existing = this.domElement.querySelector('.validation-error');
    if (existing) existing.remove();
    
    if (show) {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'validation-error';
      errorDiv.textContent = message;
      this.domElement.style.position = 'relative';
      this.domElement.appendChild(errorDiv);
    }
  }

  applyDeltaToDOM(delta) {
    super.applyDeltaToDOM(delta);
    if(this.input && (delta.text !== undefined || delta.twoRowBottomAlign !== undefined || delta.height !== undefined || delta.width !== undefined || delta.css !== undefined)) {
      const css = JSON.stringify(this.get('css'));
      const fontSizeMatch = css.match(/font-size"?:"? *([0-9]+) *px/);
      const fontSize = fontSizeMatch ? +fontSizeMatch[1] : 16;
      if(css.match(/line-height/))
        this.input.style.removeProperty('line-height');
      else
        this.input.style.lineHeight = `${Math.round(fontSize*1.2)}px`;

      this.input.value = this.get('text');
      this.input.style.height = '5px';
      this.input.style.paddingTop = '0';
      const contentHeight = this.input.scrollHeight;
      const offset = this.get('twoRowBottomAlign') && contentHeight < this.get('height') ? this.get('height')-contentHeight : 0;
      this.input.style.height = (this.get('height')-offset) + 'px';
      this.input.style.paddingTop = `${offset}px`;
      this.input.style.overflowY = contentHeight-this.get('height') < 5 ? 'hidden' : 'scroll';
    }

    if(delta.placeholderText !== undefined)
      this.input.setAttribute('placeholder', this.get('placeholderText'));

    if(delta.editable !== undefined || delta.tabIndex !== undefined) {
      if(this.get('editable')) {
        this.input.removeAttribute('readonly');
        if(this.get('tabIndex') !== null)
          this.input.setAttribute('tabindex', this.get('tabIndex'));
        else
          this.input.removeAttribute('tabindex');
      } else {
        this.input.setAttribute('readonly', true);
        this.input.setAttribute('tabindex', -1);
      }
    }

    if(delta.spellCheck !== undefined)
      this.input.setAttribute('spellcheck', this.get('spellCheck') === true);

  }
}
