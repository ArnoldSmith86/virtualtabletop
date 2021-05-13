class Canvas extends Widget {
  constructor(id) {
    super(id);
    this.canvas = document.createElement('canvas');
    this.canvas.width = 100;
    this.canvas.height = 100;
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.context = this.canvas.getContext('2d');

    const defaults = {
      width: 400,
      height: 400,
      typeClasses: 'widget canvas',

      activeColor: 1,
      colorMap: [ 'white', 'black', 'red', 'blue', 'green', 'yellow' ]
    };

    for(let x=0; x<10; ++x)
      for(let y=0; y<10; ++y)
        defaults[`c${x}${y}`] = '0'.repeat(100);

    this.addDefaults(defaults);

    this.passthroughMouse = true;
    this.domElement.appendChild(this.canvas);
  }

  applyDeltaToDOM(delta) {
    super.applyDeltaToDOM(delta);

    if(this.context) {
      for(let x=0; x<10; ++x) {
        for(let y=0; y<10; ++y) {
          if(delta[`c${x}${y}`] !== undefined || delta.colorMap !== undefined) {
            const colors = this.get('colorMap');
            const region = this.get(`c${x}${y}`);
            for(let px=0; px<10; ++px) {
              for(let py=0; py<10; ++py) {
                this.context.fillStyle = colors[region.charCodeAt(py*10+px)-48] || 'white';
                this.context.fillRect(x*10+px, y*10+py, 1, 1);
              }
            }
          }
        }
      }
    }
  }

  async mouseRaw(state, x, y) {
    let pixelX = Math.round((x-this.absoluteCoord('x'))/this.get('width')*100);
    let pixelY = Math.round((y-this.absoluteCoord('y'))/this.get('height')*100);

    if(pixelX < 0 || pixelX >= 100 || pixelY < 0 || pixelY >= 100)
      return;

    const regionX = Math.floor(pixelX/10);
    const regionY = Math.floor(pixelY/10);
    pixelX = pixelX%10;
    pixelY = pixelY%10;

    let currentState = this.get(`c${regionX}${regionY}`);
    currentState = currentState.substring(0,pixelY*10+pixelX) + String.fromCharCode(48+this.get('activeColor')) + currentState.substring(pixelY*10+pixelX+1);
    this.set(`c${regionX}${regionY}`, currentState);
  }
}
