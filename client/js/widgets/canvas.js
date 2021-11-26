class Canvas extends Widget {
  constructor(id) {
    super(id);
    this.canvas = document.createElement('canvas');
    this.context = this.canvas.getContext('2d');

    const defaults = {
      width: 400,
      height: 400,
      typeClasses: 'widget canvas',
      clickable: true,
      artist: null,

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
    str = str.replace(/(.)\1+/g, (match, char, offset, str) => {
      if(match.length + offset == str.length) {
        return char;
      } else if(char == "0") {
        return this.encodeLength(48, match.length, 7);
      } else if(match.length == 2 && char.charCodeAt(0) < 128) {
        return match;
      } else {
        return char + this.encodeLength(41, match.length - 1, 7);
      }
    });
    return str;
  }

  decompress(str) {
    str = str.replace(/([\u002A-\u0030]+)|([^\u0023-\u0030])([\u0023-\u0029]+)/g, (match, backLength, color, colorLength) => {
      if (backLength != undefined) {
        return "0".repeat(this.decodeLength(backLength, 48, 7));
      } else {
        return color.repeat(this.decodeLength(colorLength, 41, 7) + 1);
      }
    });
    str = str.padEnd(this.getResolution()**2/100,str.slice(-1));
    return str;
  }

  decodeLength(str, baseCode, base) {
    return str.split("").reduce((length, char, index) => length + (baseCode - char.charCodeAt(0) + 1) * base**index , 0);
  }

  encodeLength(baseCode, length, base) {
    let n = length;
    let c = 0;
    let code = "";
    while(n > 0) {
      c = (n - 1) % base;
      code += String.fromCharCode(baseCode - c);
      n = Math.floor((n - c) / base);
    }
    return code;
  }

  getResolution() {
    return Math.max(Math.min(Math.round(parseInt(this.get('resolution'))/10)*10, 500), 10);
  }

  async mouseRaw(state, coordGlobal) {
    if(!this.get('clickable'))
      return;

    if(this.get('artist') && asArray(this.get('artist')).indexOf(playerName) == -1)
      return;

    const resolution = this.getResolution();
    const regionRes = Math.floor(resolution/10);
    let coordLocal = this.coordLocalFromCoordGlobal(coordGlobal);

    let pixelX = coordLocal.x/this.get('width')*resolution;
    let pixelY = coordLocal.y/this.get('height')*resolution;

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
