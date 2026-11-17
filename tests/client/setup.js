import { mockConnection } from '../../client/js/connection.js';

window.config = {}
mockConnection();

document.body.insertAdjacentHTML('beforeend', '<div id="roomArea"> <div id="room"> <div id="topSurface" class="surface"></div> </div></div> <div id="debugButtonOverlay"><pre id="debugButtonOutput"></pre></div> <div id="enlarged"></div>');

//Check & set envvar to ensure it's only registered once.
if (!process.env.UNHANDLED_REJECTION_INITIALIZED) {
  process.on('unhandledRejection', reason => {
    throw(reason);
  })
  process.env.UNHANDLED_REJECTION_INITIALIZED = true
}

// jsdom implements neither DOMPoint nor DOMMatrix, so client code computing element
// transforms cannot run in tests. Since jsdom has no layout, every transform is a 2D
// affine one and these stand-ins only need to cover that case.
if(typeof globalThis.DOMPoint == 'undefined') {
  globalThis.DOMPoint = class DOMPoint {
    constructor(x=0, y=0, z=0, w=1) {
      Object.assign(this, { x, y, z, w });
    }
  };
}

if(typeof globalThis.DOMMatrix == 'undefined') {
  globalThis.DOMMatrix = class DOMMatrix {
    constructor(init) {
      Object.assign(this, { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
      if(typeof init == 'string') {
        const match = init.match(/^\s*matrix\(([^)]*)\)\s*$/);
        if(match)
          [ this.a, this.b, this.c, this.d, this.e, this.f ] = match[1].split(',').map(v=>parseFloat(v));
      } else if(Array.isArray(init) && init.length == 6) {
        [ this.a, this.b, this.c, this.d, this.e, this.f ] = init;
      } else if(Array.isArray(init) && init.length == 16) {
        [ this.a, this.b, this.c, this.d, this.e, this.f ] = [ init[0], init[1], init[4], init[5], init[12], init[13] ];
      }
    }
    multiplySelf(m) {
      return Object.assign(this, {
        a: this.a*m.a + this.c*m.b,
        b: this.b*m.a + this.d*m.b,
        c: this.a*m.c + this.c*m.d,
        d: this.b*m.c + this.d*m.d,
        e: this.a*m.e + this.c*m.f + this.e,
        f: this.b*m.e + this.d*m.f + this.f
      });
    }
    preMultiplySelf(m) {
      return this.multiplySelf.call(new DOMMatrix([ m.a, m.b, m.c, m.d, m.e, m.f ]), this).copyInto(this);
    }
    translateSelf(x=0, y=0) {
      return this.multiplySelf(new DOMMatrix([ 1, 0, 0, 1, x, y ]));
    }
    copyInto(target) {
      return Object.assign(target, { a: this.a, b: this.b, c: this.c, d: this.d, e: this.e, f: this.f });
    }
    inverse() {
      const det = this.a*this.d - this.b*this.c;
      if(!det)
        return new DOMMatrix([ NaN, NaN, NaN, NaN, NaN, NaN ]);
      return new DOMMatrix([ this.d/det, -this.b/det, -this.c/det, this.a/det, (this.c*this.f - this.d*this.e)/det, (this.b*this.e - this.a*this.f)/det ]);
    }
    transformPoint(p) {
      return new DOMPoint(this.a*p.x + this.c*p.y + this.e*p.w, this.b*p.x + this.d*p.y + this.f*p.w, p.z, p.w);
    }
    toString() {
      return `matrix(${this.a}, ${this.b}, ${this.c}, ${this.d}, ${this.e}, ${this.f})`;
    }
  };
}
