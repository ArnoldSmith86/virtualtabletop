export class Line extends Widget {
  constructor(id) {
    super(id);

    this.addDefaults({
      typeClasses: 'widget line',
      width: 400,
      height: 60,
      movable: false,
      clickable: false,
      layer: -3,

      lineStart: { x: 0, y: 30 },
      lineEnd: { x: 400, y: 30 },
      controlStart: null,
      controlEnd: null,
      lineWidth: 10,
      lineColor: '#666666',
      lineDash: null,

      attachedType: 'holder',
      connectStart: null,
      connectEnd: null
    });
  }

  applyDeltaToDOM(delta) {
    super.applyDeltaToDOM(delta);
    for(const property of [ 'lineStart', 'lineEnd', 'controlStart', 'controlEnd', 'lineWidth', 'lineColor', 'lineDash' ]) {
      if(delta[property] !== undefined) {
        this.updateLinePath();
        break;
      }
    }
  }

  isCurved() {
    return !!(this.get('controlStart') || this.get('controlEnd'));
  }

  pointProperty(property) {
    const p = this.get(property);
    return p && typeof p == 'object' ? { x: +p.x || 0, y: +p.y || 0 } : null;
  }

  // sampled points along the line with cumulative arc length so widgets can be spaced evenly
  linePoints(samples = 100) {
    const s = this.pointProperty('lineStart') || { x: 0, y: 0 };
    const e = this.pointProperty('lineEnd') || { x: 0, y: 0 };

    if(!this.isCurved())
      return [ { ...s, len: 0 }, { ...e, len: Math.hypot(e.x-s.x, e.y-s.y) } ];

    const c1 = this.pointProperty('controlStart') || s;
    const c2 = this.pointProperty('controlEnd') || e;
    const points = [];
    for(let i = 0; i <= samples; ++i) {
      const t = i/samples;
      const u = 1-t;
      const x = u*u*u*s.x + 3*u*u*t*c1.x + 3*u*t*t*c2.x + t*t*t*e.x;
      const y = u*u*u*s.y + 3*u*u*t*c1.y + 3*u*t*t*c2.y + t*t*t*e.y;
      points.push({ x, y, len: i ? points[i-1].len + Math.hypot(x-points[i-1].x, y-points[i-1].y) : 0 });
    }
    return points;
  }

  lineLength() {
    const points = this.linePoints();
    return points[points.length-1].len;
  }

  // position is the fraction 0..1 of the total arc length
  pointAtPosition(position) {
    const points = this.linePoints();
    const targetLength = Math.max(0, Math.min(1, +position || 0)) * points[points.length-1].len;
    for(let i = 1; i < points.length; ++i) {
      if(points[i].len >= targetLength) {
        const segment = points[i].len - points[i-1].len;
        const f = segment ? (targetLength - points[i-1].len) / segment : 0;
        return {
          x: points[i-1].x + (points[i].x - points[i-1].x) * f,
          y: points[i-1].y + (points[i].y - points[i-1].y) * f
        };
      }
    }
    return points[points.length-1];
  }

  attachedWidgets() {
    return this.childArray.filter(w=>w.get('lineIndex') !== null).sort((a,b)=>a.get('lineIndex')-b.get('lineIndex'));
  }

  async updateAttachedWidgets() {
    const attached = this.attachedWidgets();
    for(let i = 0; i < attached.length; ++i) {
      const p = this.pointAtPosition(attached.length > 1 ? i/(attached.length-1) : 0);
      await attached[i].set('x', Math.round(p.x - attached[i].get('width')/2));
      await attached[i].set('y', Math.round(p.y - attached[i].get('height')/2));
    }
  }

  connectedLines() {
    return widgetFilter(w=>w.get('type') == 'line' && w != this && [ w.get('connectStart'), w.get('connectEnd') ].some(c=>c && c.line == this.id));
  }

  async updateConnectedLines() {
    for(const line of this.connectedLines())
      await line.applyConnections();
  }

  // glue own end points to the lines they are connected to; guarded so connection cycles terminate
  async applyConnections() {
    if(Line.connectionUpdateInProgress.has(this.id))
      return;
    Line.connectionUpdateInProgress.add(this.id);
    try {
      for(const end of [ 'Start', 'End' ]) {
        const connection = this.get('connect' + end);
        if(!connection || typeof connection != 'object' || !widgets.has(connection.line))
          continue;
        const target = widgets.get(connection.line);
        if(target.get('type') != 'line' || target == this)
          continue;
        // connections assume both lines share their coordinate system (no rotated/scaled ancestors)
        const p = target.pointAtPosition(connection.position !== undefined ? connection.position : (end == 'Start' ? 0 : 1));
        await this.set('line' + end, {
          x: Math.round(target.get('x') + p.x - this.get('x')),
          y: Math.round(target.get('y') + p.y - this.get('y'))
        });
      }
    } finally {
      Line.connectionUpdateInProgress.delete(this.id);
    }
  }

  async onChildAdd(child, oldParentID) {
    await super.onChildAdd(child, oldParentID);
    if(child.get('lineIndex') !== null)
      await this.updateAttachedWidgets();
  }

  async onChildRemove(child) {
    await super.onChildRemove(child);
    if(child.get('lineIndex') !== null)
      await this.updateAttachedWidgets();
  }

  async onPropertyChange(property, oldValue, newValue) {
    await super.onPropertyChange(property, oldValue, newValue);

    if([ 'lineStart', 'lineEnd', 'controlStart', 'controlEnd' ].indexOf(property) != -1) {
      await this.updateAttachedWidgets();
      await this.updateConnectedLines();
    }

    if(property == 'x' || property == 'y') {
      await this.applyConnections();
      await this.updateConnectedLines();
    }

    if(property == 'connectStart' || property == 'connectEnd')
      await this.applyConnections();
  }

  updateLinePath() {
    if(!this.svgElement) {
      this.svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      this.svgElement.setAttribute('class', 'lineSVG');
      this.guideElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      this.guideElement.setAttribute('class', 'lineGuide');
      this.pathElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      this.pathElement.setAttribute('class', 'linePath');
      this.svgElement.appendChild(this.guideElement);
      this.svgElement.appendChild(this.pathElement);
      this.domElement.prepend(this.svgElement);
    }

    const s = this.pointProperty('lineStart') || { x: 0, y: 0 };
    const e = this.pointProperty('lineEnd') || { x: 0, y: 0 };
    const c1 = this.pointProperty('controlStart') || s;
    const c2 = this.pointProperty('controlEnd') || e;

    this.pathElement.setAttribute('d', this.isCurved()
      ? `M ${s.x} ${s.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${e.x} ${e.y}`
      : `M ${s.x} ${s.y} L ${e.x} ${e.y}`);
    this.pathElement.setAttribute('stroke', this.get('lineColor'));
    this.pathElement.setAttribute('stroke-width', this.get('lineWidth'));
    if(this.get('lineDash'))
      this.pathElement.setAttribute('stroke-dasharray', this.get('lineDash'));
    else
      this.pathElement.removeAttribute('stroke-dasharray');

    this.guideElement.setAttribute('d', this.isCurved()
      ? `M ${s.x} ${s.y} L ${c1.x} ${c1.y} M ${e.x} ${e.y} L ${c2.x} ${c2.y}`
      : '');

    this.updateHandles();
  }

  setHighlighted(isHighlighted) {
    super.setHighlighted(isHighlighted);
    this.updateHandles();
  }

  // when selected in edit mode, show draggable handles for the end points and the Bezier control points
  updateHandles() {
    if(!this.isHighlighted) {
      for(const handle of Object.values(this.handleElements || {}))
        handle.remove();
      delete this.handleElements;
      return;
    }

    if(!this.handleElements)
      this.handleElements = {};

    for(const [ property, className ] of Object.entries({ lineStart: 'end', lineEnd: 'end', controlStart: 'control', controlEnd: 'control' })) {
      const point = this.pointProperty(property);
      if(!point) {
        if(this.handleElements[property]) {
          this.handleElements[property].remove();
          delete this.handleElements[property];
        }
        continue;
      }
      if(!this.handleElements[property]) {
        const handle = document.createElement('div');
        handle.className = `lineHandle ${className}`;
        this.addHandleDragging(handle, property);
        this.domElement.appendChild(handle);
        this.handleElements[property] = handle;
      }
      this.handleElements[property].style.transform = `translate(${point.x}px, ${point.y}px)`;
    }
  }

  addHandleDragging(handle, property) {
    const startDragging = eDown => {
      eDown.preventDefault();
      eDown.stopPropagation();

      const moveHandler = async eMove => {
        eMove.preventDefault();
        eMove.stopImmediatePropagation();
        const coords = eMove.touches ? eMove.touches[0] : eMove;
        const local = this.coordLocalFromCoordClient({ x: coords.clientX, y: coords.clientY });
        batchStart();
        setDeltaCause(`${playerName} moved ${property} of ${this.id} in editor`);
        await this.set(property, { x: Math.round(local.x), y: Math.round(local.y) });
        batchEnd();
      };
      const upHandler = eUp => {
        eUp.stopImmediatePropagation();
        for(const [ event, handler ] of listeners)
          window.removeEventListener(event, handler, true);
      };
      const listeners = [
        [ 'mousemove', moveHandler ],
        [ 'touchmove', moveHandler ],
        [ 'mouseup', upHandler ],
        [ 'touchend', upHandler ],
        [ 'touchcancel', upHandler ]
      ];
      for(const [ event, handler ] of listeners)
        window.addEventListener(event, handler, true);
    };
    handle.addEventListener('mousedown', startDragging);
    handle.addEventListener('touchstart', startDragging);
  }
}

Line.connectionUpdateInProgress = new Set();
