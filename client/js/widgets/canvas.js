class Canvas extends Widget {
  constructor(id) {
    super(id);
    this.canvas = document.createElement('canvas');
    this.canvas.dataset.id = id;
    this.context = this.canvas.getContext('2d');

    const defaults = {
      width: 400,
      height: 400,
      typeClasses: 'widget canvas',
      artist: null,

      resolution: 100,
      activeColor: 1,
      lineWidth: 1,
      colorMap: Canvas.defaultColors
    };

    for(let x=0; x<10; ++x)
      for(let y=0; y<10; ++y)
        defaults[`c${x}${y}`] = "0";

    this.addDefaults(defaults);

    this.passthroughMouse = true;
    this.domElement.appendChild(this.canvas);

    this.cursor = document.createElement('div');
    this.cursor.className = 'canvasCursor';
    this.domElement.appendChild(this.cursor);

    this.canvas.addEventListener('mousemove', (e) => {
      const coordLocal = this.coordLocalFromCoordClient({ x: e.clientX, y: e.clientY });
      const lineWidth = this.get('lineWidth');
      const resolution = this.getResolution();
      const scaleX = this.get('width') / resolution;
      const scaleY = this.get('height') / resolution;
      this.cursor.style.left = `${coordLocal.x - lineWidth * scaleX}px`;
      this.cursor.style.top = `${coordLocal.y - lineWidth * scaleY}px`;
    });

    this.canvas.addEventListener('mouseenter', () => {
      this.cursor.classList.add('visible');
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.cursor.classList.remove('visible');
    });
  }

  applyDeltaToDOM(delta) {
    super.applyDeltaToDOM(delta);

    if (delta.lineWidth !== undefined || delta.width !== undefined || delta.height !== undefined || delta.resolution !== undefined) {
      const lineWidth = this.get('lineWidth');
      const resolution = this.getResolution();
      const scaleX = this.get('width') / resolution;
      const scaleY = this.get('height') / resolution;
      this.cursor.style.width = `${2 * lineWidth * scaleX}px`;
      this.cursor.style.height = `${2 * lineWidth * scaleY}px`;
    }

    if (delta.activeColor !== undefined || delta.colorMap !== undefined) {
      const colors = this.getColorMap();
      const color = colors[this.get('activeColor')] || 'white';
      this.cursor.style.backgroundColor = color;
    }

    if(this.context) {
      if(delta.resolution !== undefined) {
        this.canvas.width = this.getResolution();
        this.canvas.height = this.getResolution();
      }

      const colors = this.getColorMap();
      const regionRes = Math.floor(this.getResolution()/10);

      for(let x=0; x<10; ++x) {
        for(let y=0; y<10; ++y) {
          if(delta[`c${x}${y}`] !== undefined || delta.colorMap !== undefined || delta.resolution !== undefined) {
            let region = this.decompress(this.get(`c${x}${y}`));
            for(let px=0; px<regionRes; ++px) {
              for(let py=0; py<regionRes; ++py) {
                this.context.fillStyle = colors[region.charCodeAt(py*regionRes+px)-48] || 'white';
                if(colors[region.charCodeAt(py*regionRes+px)-48] != 'transparent')
                  this.context.fillRect(x*regionRes+px, y*regionRes+py, 1, 1);
                else
                  this.context.clearRect(x*regionRes+px, y*regionRes+py, 1, 1);
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

  getColorMap() {
    if(Array.isArray(this.get('colorMap')))
      return this.get('colorMap');
    else
      return Canvas.defaultColors;
  }

  getResolution() {
    return Math.max(Math.min(Math.round(parseInt(this.get('resolution'))/10)*10, 500), 10);
  }

  async mouseRaw(state, coord) {
    if(!this.get('clickable'))
      return;

    if(this.get('artist') && asArray(this.get('artist')).indexOf(playerName) == -1)
      return;

    const resolution = this.getResolution();
    const regionRes = Math.floor(resolution/10);
    const coordLocal = this.coordLocalFromCoordClient({x: coord.clientX, y: coord.clientY});

    let pixelX = coordLocal.x/this.get('width')*resolution;
    let pixelY = coordLocal.y/this.get('height')*resolution;

    if(pixelX < 0 || pixelX >= resolution || pixelY < 0 || pixelY >= resolution)
      return;

    if(this.lastPixelX !== undefined && state != 'down') {
      const steps = Math.max(Math.abs(pixelX-this.lastPixelX), Math.abs(pixelY-this.lastPixelY))*2;
      for(let i=0; i<steps; ++i)
        this.setPixel(this.lastPixelX + (pixelX-this.lastPixelX)/steps*i, this.lastPixelY + (pixelY-this.lastPixelY)/steps*i, undefined, undefined, false);
    } else {
      this.setPixel(pixelX, pixelY, undefined, undefined, false);
    }

    if (state == 'down') {
      const resolution = this.getResolution();
      const minInterval = 10;
      const maxInterval = 100;
      const minRes = 100;
      const maxRes = 500;
      const interval = minInterval + (maxInterval - minInterval) * (resolution - minRes) / (maxRes - minRes);
      const clampedInterval = Math.max(minInterval, Math.min(maxInterval, interval));

      this.updateInterval = setInterval(async () => {
        if (this.regionCache) {
          for (const key in this.regionCache) {
            await this.set(key, this.compress(this.regionCache[key]));
          }
          this.regionCache = {};
        }
      }, clampedInterval);
    }

    if (state == 'up') {
      clearInterval(this.updateInterval);
      if (this.regionCache) {
        for (const key in this.regionCache) {
          await this.set(key, this.compress(this.regionCache[key]));
        }
        this.regionCache = null;
      }
    }

    this.lastPixelX = pixelX;
    this.lastPixelY = pixelY;
  }

  async reset() {
    const colors = this.getColorMap();
    this.context.fillStyle = colors[0] || 'white';
    this.context.fillRect(0, 0, this.canvas.width, this.canvas.height);
    for(let x=0; x<10; ++x)
      for(let y=0; y<10; ++y)
        await this.set(`c${x}${y}`, null);
  }

  async setPixel(x, y, colorIndex, regionRes, flush=true) {
    const lineWidth = this.get('lineWidth');
    if (lineWidth < 1) {
      this.set('lineWidth', 1);
    }
    for (let i = -lineWidth; i < lineWidth; ++i) {
      for (let j = -lineWidth; j < lineWidth; ++j) {
        if (Math.sqrt(i * i + j * j) < lineWidth) {
          this.setSinglePixel(x + i, y + j, colorIndex, regionRes);
        }
      }
    }

    if(flush)
      await this._flushPixelCache();
  }

  setSinglePixel(x, y, colorIndex, regionRes) {
    if (!this.regionCache) {
      this.regionCache = {};
    }

    if (!regionRes) {
      regionRes = Math.floor(this.getResolution() / 10);
    }

    const resolution = this.getResolution();
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || x >= resolution || y < 0 || y >= resolution) {
      return;
    }

    const regionX = Math.floor(x / regionRes);
    const regionY = Math.floor(y / regionRes);

    const pX = Math.floor(x%regionRes);
    const pY = Math.floor(y%regionRes);

    const finalColorIndex = colorIndex !== undefined ? colorIndex : this.get('activeColor');
    const color = String.fromCharCode(48 + finalColorIndex);

    const key = `c${regionX}${regionY}`;
    if (!this.regionCache[key]) {
      const data = this.get(key);
      if (data == null) return;
      this.regionCache[key] = this.decompress(data);
    }

    this.regionCache[key] = this.regionCache[key].substring(0, pY * regionRes + pX) + color + this.regionCache[key].substring(pY * regionRes + pX + 1);

    const colors = this.getColorMap();
    this.context.fillStyle = colors[finalColorIndex] || 'white';
    if (colors[finalColorIndex] !== 'transparent') {
      this.context.fillRect(x, y, 1, 1);
    } else {
      this.context.clearRect(x, y, 1, 1);
    }

  }

  async _flushPixelCache() {
    if (this.regionCache) {
      for (const key in this.regionCache) {
        await this.set(key, this.compress(this.regionCache[key]));
      }
      this.regionCache = {};
    }
  }
}

Canvas.defaultColors = ["#F0F0F0","#1F5CA6","#000000","#FF0000","#008000","#FFFF00","#FFA500","#FFC0CB","#800080","#A52A2A"];
