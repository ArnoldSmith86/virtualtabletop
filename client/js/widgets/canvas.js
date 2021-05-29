class Canvas extends Widget {
  constructor(id) {
    super(id);
    this.canvas = document.createElement('canvas');
    this.context = this.canvas.getContext('2d');

    const defaults = {
      width: 400,
      height: 400,
      typeClasses: 'widget canvas',

      resolution: 100,
      activeColor: 1,
      colorMap: Canvas.defaultColors
    };

    for(let x=0; x<10; ++x)
      for(let y=0; y<10; ++y)
        defaults[`c${x}${y}`] = "0";

    this.addDefaults(defaults);

    this.passthroughMouse = true;
    this.domElement.appendChild(this.canvas);
  }

  applyDeltaToDOM(delta) {
    super.applyDeltaToDOM(delta);

    if(this.context) {
      if(delta.resolution !== undefined) {
        this.canvas.width = this.getResolution();
        this.canvas.height = this.getResolution();
      }

      const colors = this.get('colorMap');
      const regionRes = Math.floor(this.getResolution()/10);

      for(let x=0; x<10; ++x) {
        for(let y=0; y<10; ++y) {
          if(delta[`c${x}${y}`] !== undefined || delta.colorMap !== undefined || delta.resolution !== undefined) {
            let region = this.decompress(this.get(`c${x}${y}`));
            for(let px=0; px<regionRes; ++px) {
              for(let py=0; py<regionRes; ++py) {
                this.context.fillStyle = colors[region.charCodeAt(py*regionRes+px)-48] || 'white';
                this.context.fillRect(x*regionRes+px, y*regionRes+py, 1, 1);
              }
            }
          }
        }
      }
    }
  }

  compress(str) {
    const startStr = str;
    str = str.replaceAll(/(.)\1+/g, (match, char, offset, str) => {
      if(match.length + offset == str.length) {
        return char;
      } else if(match.length == 2) {
        return match;
      } else {
        let n = match.length - 1;
        let code = char;
        while (n > 0) {
          code += String.fromCharCode(33 + n % 15);
          n = Math.floor(n / 15);
        }
        return code;
      }
    });
    return str;
  }

  decompress(str) {
    str = str.replaceAll(/[^\u0021-\u002F][\u0021-\u002F]+/g, match => {
      return match.split("").reduce((acc, char, index) => {
        return acc + acc.charAt(0).repeat((char.charCodeAt(0)-32)*15**(index-1));
      });
    });
    str = str.padEnd(this.getResolution()**2/100,str.slice(-1));
    return str;
  }

  getResolution() {
    return Math.max(Math.min(Math.round(parseInt(this.get('resolution'))/10)*10, 500), 10);
  }

  async mouseRaw(state, x, y) {
    const resolution = this.getResolution();
    const regionRes = Math.floor(resolution/10);

    let pixelX = (x-this.absoluteCoord('x'))/this.get('width')*resolution;
    let pixelY = (y-this.absoluteCoord('y'))/this.get('height')*resolution;

    if(pixelX < 0 || pixelX >= resolution || pixelY < 0 || pixelY >= resolution)
      return;

    if(this.lastPixelX !== undefined && state != 'down') {
      const steps = Math.max(Math.abs(pixelX-this.lastPixelX), Math.abs(pixelY-this.lastPixelY));
      for(let i=0; i<steps; ++i)
        this.setPixel(this.lastPixelX + (pixelX-this.lastPixelX)/steps*i, this.lastPixelY + (pixelY-this.lastPixelY)/steps*i);
    } else {
      this.setPixel(pixelX, pixelY);
    }

    this.lastPixelX = pixelX;
    this.lastPixelY = pixelY;
  }

  async reset() {
    for(let x=0; x<10; ++x)
      for(let y=0; y<10; ++y)
        await this.set(`c${x}${y}`, null);
  }

  async setPixel(x, y, colorIndex, regionRes) {
    if(!regionRes)
      regionRes = Math.floor(this.getResolution()/10);

    const regionX = Math.floor(x/regionRes);
    const regionY = Math.floor(y/regionRes);

    const pX = Math.floor(x%regionRes);
    const pY = Math.floor(y%regionRes);

    const color = String.fromCharCode(48+(colorIndex !== undefined ? colorIndex : this.get('activeColor')));

    let currentState = this.decompress(this.get(`c${regionX}${regionY}`));
    currentState = currentState.substring(0,pY*regionRes+pX) + color + currentState.substring(pY*regionRes+pX+1);
    this.set(`c${regionX}${regionY}`, this.compress(currentState));
  }
}

Canvas.defaultColors = ["#F0F0F0","#1F5CA6","#000000","#FF0000","#008000","#FFFF00","#FFA500","#FFC0CB","#800080","#A52A2A"];
