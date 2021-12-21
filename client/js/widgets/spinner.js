class Spinner extends Widget {
  constructor(id) {
    super(id);

    this.addDefaults({
      width: 110,
      height: 110,
      typeClasses: 'widget spinner',
      clickable: true,

      options: [ 1, 2, 3, 4, 5, 6 ],
      value: '🎲',
      angle: 0,

      backgroundCSS: '',
      spinnerCSS: '',
      valueCSS: '',
      textColor:'#000000',
      lineColor :'#d2d2d2',
      borderRadius: '50%'
    });
  }

  applyDeltaToDOM(delta) {
    super.applyDeltaToDOM(delta);

    if(delta.options !== undefined || delta.backgroundCSS !== undefined || delta.spinnerCSS !== undefined || delta.valueCSS !== undefined)
      this.createChildNodes();

    if(delta.angle !== undefined && this.spinner || delta.value !== undefined && this.value) {
      this.spinner.style.transform = `rotate(${this.get('angle')}deg)`;
      this.value.classList.add('hidden');
      if(this.timeout)
        clearTimeout(this.timeout);
      this.timeout = setTimeout(_=>{
        this.value.textContent = this.get('value');
        this.value.classList.remove('hidden')
      }, 1300);
    }
  }

  async click(mode='respect') {
    if(!await super.click(mode)) {
      const angle = this.get('angle') + Math.floor((2+Math.random())*360);
      const o = this.get('options');
      await this.set('angle', angle);
      await this.set('value', o[Math.floor(angle/(360/o.length))%o.length]);
    }
  }

  createChildNodes() {
    const childNodes = [...this.domElement.childNodes];
    const ns = 'http://www.w3.org/2000/svg'

    const bg = document.createElementNS(ns, 'svg');
    bg.setAttribute('class', 'background');
    bg.setAttribute('style', this.get('backgroundCSS'));
    bg.setAttribute('viewBox', '0 0 100 100');

    const options = this.get('options');
    for(const i in options) {
      const line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', 50);
      line.setAttribute('y1', 50);
      line.setAttribute('x2', 50 + Math.sin(0.5*Math.PI+2*Math.PI/options.length*i)*50);
      line.setAttribute('y2', 50 + Math.cos(0.5*Math.PI+2*Math.PI/options.length*i)*50);
      line.setAttribute('stroke', this.get('lineColor'));

      const text = document.createElementNS(ns, 'text');
      text.setAttribute('x', 50 + Math.sin(0.5*Math.PI-2*Math.PI/options.length*(+i+0.5))*38);
      text.setAttribute('y', 50 + Math.cos(0.5*Math.PI-2*Math.PI/options.length*(+i+0.5))*38);
      text.setAttribute('dominant-baseline', 'central');
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('font-size', 20-options.length/2);
      text.setAttribute('fill', this.get('textColor'));

      text.textContent = options[i];

      bg.appendChild(line);
      bg.appendChild(text);
    }
    this.domElement.innerHTML = '';
    this.domElement.appendChild(bg);

    this.spinner = document.createElement('div');
    this.spinner.setAttribute('class', 'spinningPart');
    this.spinner.setAttribute('style', this.get('spinnerCSS'));
    this.domElement.appendChild(this.spinner);

    this.value = document.createElement('div');
    this.value.setAttribute('class', 'value');
    this.value.setAttribute('style', this.get('valueCSS'));
    this.value.textContent = this.get('value');
    this.domElement.appendChild(this.value);

    for(const child of childNodes)
      if(String(child.className).match(/widget/))
        this.domElement.appendChild(child);
  }

  css() {
    let css = super.css();
    css += `; font-size:${Math.min(this.get('width'), this.get('height')) * 0.4}px`;
    return css;
  }
}
