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

      // when enabled, landscape stops follow the direction of the line at
      // their position; portrait and square stops keep their own rotation
      rotateStops: true,
      autoSpaceStops: true,

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
    if(Array.isArray(p))
      return p.length >= 2 ? { x: +p[0] || 0, y: +p[1] || 0 } : null;
    return p && typeof p == 'object' ? { x: +p.x || 0, y: +p.y || 0 } : null;
  }

  // move x/y and resize width/height so the widget box always wraps the path,
  // keeping the path in place by shifting all points; otherwise the selection
  // and hit box drift away from the line when end points move far from the box
  async normalizeGeometry() {
    if(this.normalizingGeometry)
      return;
    this.normalizingGeometry = true;
    batchStart();
    try {
      const capturedPoints = {};
      for(const property of [ 'lineStart', 'lineEnd', 'controlStart', 'controlEnd' ])
        capturedPoints[property] = this.pointProperty(property);

      const points = this.linePoints(20);
      for(const property of [ 'controlStart', 'controlEnd' ])
        if(capturedPoints[property])
          points.push(capturedPoints[property]);

      const pad = Math.ceil((+this.get('lineWidth') || 0)/2) + 10;
      const minX = Math.round(Math.min(...points.map(p=>p.x)) - pad);
      const minY = Math.round(Math.min(...points.map(p=>p.y)) - pad);
      const maxX = Math.round(Math.max(...points.map(p=>p.x)) + pad);
      const maxY = Math.round(Math.max(...points.map(p=>p.y)) + pad);

      if(minX || minY) {
        await this.set('x', this.get('x') + minX);
        await this.set('y', this.get('y') + minY);
        for(const property of [ 'lineStart', 'lineEnd', 'controlStart', 'controlEnd' ])
          if(capturedPoints[property])
            await this.set(property, { x: Math.round(capturedPoints[property].x) - minX, y: Math.round(capturedPoints[property].y) - minY });
      }
      await this.set('width', maxX - minX);
      await this.set('height', maxY - minY);
    } finally {
      batchEnd();
      this.normalizingGeometry = false;
    }
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

  // any child with a numeric linePosition (0..1 fraction along the path) is a stop,
  // regardless of its widget type; ordered by that fraction
  attachedWidgets() {
    return this.childArray.filter(w=>w.get('linePosition') !== null).sort((a,b)=>a.get('linePosition')-b.get('linePosition'));
  }

  // place each stop at its own stored linePosition so manual positions survive
  // curve/move/length changes instead of being re-centered on every geometry change
  async updateAttachedWidgets() {
    if(this.updatingAttachedWidgets)
      return;
    this.updatingAttachedWidgets = true;
    try {
      await this.positionAttachedWidgets();
    } finally {
      this.updatingAttachedWidgets = false;
    }
  }

  async positionAttachedWidgets() {
    for(const stop of this.attachedWidgets()) {
      const p = this.pointAtPosition(+stop.get('linePosition') || 0);
      await stop.set('x', Math.round(p.x - stop.get('width')/2));
      await stop.set('y', Math.round(p.y - stop.get('height')/2));

      const landscape = +stop.get('width') > +stop.get('height');
      if(this.shouldRotateStops() && landscape) {
        if(stop.get('lineOriginalRotation') === null)
          await stop.set('lineOriginalRotation', { value: stop.get('rotation'), explicit: stop.state.rotation !== undefined });
        await stop.set('rotation', this.tangentAngleAtPosition(+stop.get('linePosition') || 0));
      } else
        await this.restoreStopRotation(stop);
    }
  }

  async restoreStopRotation(stop) {
    const original = stop.get('lineOriginalRotation');
    if(original === null)
      return;
    if(original && typeof original == 'object')
      await stop.set('rotation', original.explicit ? original.value : null);
    else
      await stop.set('rotation', original);
    await stop.set('lineOriginalRotation', null);
  }

  // Move stops so the gaps between their edges are equal. The stops array is
  // captured once in line order and is used for every update, so distributing
  // never changes which widget occupies which stop.
  async distributeAttachedWidgetsEvenly() {
    if(this.updatingAttachedWidgets)
      return;
    this.updatingAttachedWidgets = true;
    try {
      await this.distributeAttachedWidgetsEvenlyInternal();
    } finally {
      this.updatingAttachedWidgets = false;
    }
  }

  async distributeAttachedWidgetsEvenlyInternal() {
    const stops = this.attachedWidgets();
    if(stops.length < 2) {
      await this.positionAttachedWidgets();
      return;
    }

    const length = this.lineLength();
    if(!length) {
      for(const stop of stops)
        await stop.set('linePosition', 0);
      await this.positionAttachedWidgets();
      return;
    }
    let positions = stops.map(stop=>+stop.get('linePosition') || 0);
    for(let iteration = 0; iteration < 3; ++iteration) {
      const sizes = stops.map((stop, i)=>this.widgetLengthOnLine(stop, positions[i]));
      const requestedGap = (length - sizes.reduce((sum, size)=>sum+size, 0) + sizes[0]/2 + sizes[sizes.length-1]/2)/(stops.length-1);
      // If the widgets do not fit, allow overlap but never enough to reverse
      // two neighboring centers. This preserves the original stop order.
      const minimumGap = -Math.min(...sizes.slice(0, -1).map((size, i)=>(size+sizes[i+1])/2));
      const gap = Math.max(requestedGap, minimumGap);
      let distance = 0;
      const targetDistances = stops.map((stop, i)=>{
        if(i == 0)
          return 0;
        distance += sizes[i-1]/2 + gap + sizes[i]/2;
        return distance;
      });
      const totalDistance = targetDistances[targetDistances.length-1] || length;
      positions = targetDistances.map((distance, i)=>i == 0 ? 0 : i == stops.length-1 ? 1 : distance/totalDistance);
      for(let i = 0; i < stops.length; ++i)
        await stops[i].set('linePosition', positions[i]);
      await this.positionAttachedWidgets();
    }

    let previousPosition = 0;
    for(let i = 0; i < stops.length; ++i) {
      const position = i == 0 ? 0 : i == stops.length-1 ? 1 : Math.max(previousPosition, Math.min(1, Math.round(positions[i]*1000)/1000));
      await stops[i].set('linePosition', position);
      previousPosition = position;
    }
    await this.positionAttachedWidgets();
  }

  widgetLengthOnLine(widget, position) {
    const scale = Math.max(0, +widget.get('scale') || 0);
    const width = Math.max(0, +widget.get('width') || 0) * scale;
    const height = Math.max(0, +widget.get('height') || 0) * scale;
    let rotation = +widget.get('rotation') || 0;
    if(this.shouldRotateStops() && width > height)
      rotation = this.tangentAngleAtPosition(position);
    const relativeRotation = (rotation - this.tangentAngleAtPosition(position))*Math.PI/180;
    return Math.abs(width*Math.cos(relativeRotation)) + Math.abs(height*Math.sin(relativeRotation));
  }

  // The angle of the path's tangent in degrees at an arc-length position.
  // Sampling either side also works for both straight and cubic paths without
  // needing to convert an arc-length position back to a Bezier parameter.
  tangentAngleAtPosition(position) {
    const p = Math.max(0, Math.min(1, +position || 0));
    const delta = 0.001;
    const before = this.pointAtPosition(Math.max(0, p-delta));
    const after = this.pointAtPosition(Math.min(1, p+delta));
    return Math.atan2(after.y-before.y, after.x-before.x) * 180 / Math.PI;
  }

  // Keep existing line definitions working while the property name changes.
  shouldRotateStops() {
    const legacyValue = this.get('rotateAttachedWidgets');
    return legacyValue === null ? !!this.get('rotateStops') : !!legacyValue;
  }

  // the midpoint of the largest empty span along the line, so "Add stop" drops the
  // new one into open space without disturbing the others. The start (0) and end (1)
  // of the line count as boundaries so the gaps before the first / after the last
  // stop are considered too, not just the gaps between stops.
  nextStopPosition() {
    const positions = this.attachedWidgets().map(w=>+w.get('linePosition') || 0);
    if(positions.length == 0)
      return 0;
    const bounds = [ 0, ...positions, 1 ];
    let bestGap = -1, bestPos = 0.5;
    for(let i = 1; i < bounds.length; ++i) {
      const gap = bounds[i] - bounds[i-1];
      if(gap > bestGap) {
        bestGap = gap;
        bestPos = (bounds[i] + bounds[i-1])/2;
      }
    }
    return Math.round(bestPos*1000)/1000;
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
      const connectionPoint = end=>{
        const connection = this.get('connect' + end);
        if(!connection || typeof connection != 'object' || !widgets.has(connection.line))
          return null;
        const target = widgets.get(connection.line);
        if(target == this)
          return null;
        const position = connection.position !== undefined ? connection.position : (end == 'Start' ? 0 : 1);
        const targetIsLine = target.get('type') == 'line';
        // Line targets use their path. Other widgets use a horizontal path
        // through their midpoint: 0% is the left edge, 50% the center, and
        // 100% the right edge.
        const p = targetIsLine ? target.pointAtPosition(position) : {
          x: target.get('width') * position,
          y: target.get('height') / 2
        };
        return { end, connection, target, targetIsLine, position, p, global: target.coordGlobalFromCoordLocal(p) };
      };

      const points = [ connectionPoint('Start'), connectionPoint('End') ];
      const route = points[0] && points[1] ? {
        x: points[1].global.x - points[0].global.x,
        y: points[1].global.y - points[0].global.y
      } : null;
      const routeTangent = route && Math.hypot(route.x, route.y) ? Math.atan2(route.y, route.x) : null;

      for(const point of points) {
        if(!point)
          continue;
        let tangent;
        if(routeTangent !== null) {
          // A two-ended connection is a route. Use its overall direction for
          // every target type so matching offsets make parallel routes.
          tangent = routeTangent;
        } else if(point.targetIsLine) {
          const delta = 0.001;
          const before = point.target.coordGlobalFromCoordLocal(point.target.pointAtPosition(Math.max(0, point.position-delta)));
          const after = point.target.coordGlobalFromCoordLocal(point.target.pointAtPosition(Math.min(1, point.position+delta)));
          tangent = Math.atan2(after.y-before.y, after.x-before.x);
        } else {
          const before = point.target.coordGlobalFromCoordLocal({ x: 0, y: point.target.get('height')/2 });
          const after = point.target.coordGlobalFromCoordLocal({ x: point.target.get('width'), y: point.target.get('height')/2 });
          tangent = Math.atan2(after.y-before.y, after.x-before.x);
        }
        const offset = +point.connection.offset || 0;
        const oldPoint = this.pointProperty('line' + point.end) || { x: 0, y: 0 };
        const targetPoint = {
          x: point.global.x - Math.sin(tangent)*offset,
          y: point.global.y + Math.cos(tangent)*offset
        };
        // Convert through global coordinates. Target widgets may be nested in
        // a board/holder, so their local x/y cannot be combined directly with
        // this line's local coordinates.
        const localPoint = this.coordLocalFromCoordGlobal(targetPoint);
        const newPoint = { x: Math.round(localPoint.x), y: Math.round(localPoint.y) };
        // move this end's Bezier control point by the same delta, so a curved
        // connected line keeps its shape (its middle doesn't stay behind) as the
        // end point follows the target instead of just stretching from a fixed control
        const control = this.pointProperty('control' + point.end);
        if(control)
          await this.set('control' + point.end, { x: control.x + newPoint.x - oldPoint.x, y: control.y + newPoint.y - oldPoint.y });
        await this.set('line' + point.end, newPoint);
      }
      await this.normalizeGeometry();
    } finally {
      Line.connectionUpdateInProgress.delete(this.id);
    }
  }

  // while the whole line is being dragged, translate it rigidly and defer the
  // connection re-glue + box re-fit to the end of the drag; doing them on every
  // mousemove mutated x/y/width/height mid-drag, which corrupted the drag's
  // reference frame and made a connected line's move wildly over-sensitive
  async moveStart() {
    this.isBeingMoved = true;
    await super.moveStart();
  }

  async moveEnd(coordGlobal, localAnchor) {
    await super.moveEnd(coordGlobal, localAnchor);
    this.isBeingMoved = false;
    await this.applyConnections();
    await this.updateConnectedLines();
  }

  async onChildAdd(child, oldParentID) {
    await super.onChildAdd(child, oldParentID);
    // a rename re-adds the same stop under a new id; it carries no positioning
    // change, so skip the layout pass a real add/remove would trigger
    if(child.isBeingRenamed)
      return;
    if(child.get('linePosition') !== null) {
      if(this.get('autoSpaceStops'))
        await this.distributeAttachedWidgetsEvenly();
      else
        await this.updateAttachedWidgets();
    }
  }

  async onChildRemove(child) {
    if(child.isBeingRenamed)
      return await super.onChildRemove(child);
    await this.restoreStopRotation(child);
    await super.onChildRemove(child);
    if(child.get('linePosition') !== null) {
      if(this.get('autoSpaceStops'))
        await this.distributeAttachedWidgetsEvenly();
      else
        await this.updateAttachedWidgets();
    }
  }

  async onStopPropertyChange() {
    if(this.updatingAttachedWidgets)
      return;
    if(this.get('autoSpaceStops'))
      await this.distributeAttachedWidgetsEvenly();
    else
      await this.updateAttachedWidgets();
  }

  async onPropertyChange(property, oldValue, newValue) {
    await super.onPropertyChange(property, oldValue, newValue);

    if([ 'lineStart', 'lineEnd', 'controlStart', 'controlEnd' ].indexOf(property) != -1) {
      if(this.get('autoSpaceStops'))
        await this.distributeAttachedWidgetsEvenly();
      else
        await this.updateAttachedWidgets();
      await this.updateConnectedLines();
    }

    if(property == 'autoSpaceStops') {
      if(this.get('autoSpaceStops'))
        await this.distributeAttachedWidgetsEvenly();
      else
        await this.updateAttachedWidgets();
    }

    if(property == 'rotateStops' || property == 'rotateAttachedWidgets')
      await this.updateAttachedWidgets();

    if((property == 'x' || property == 'y') && !this.normalizingGeometry) {
      // lines attached to this one follow live even during an interactive drag —
      // they don't affect this line's own drag frame. Only this line's own
      // connection re-glue + box re-fit (which do mutate its geometry) are
      // deferred to moveEnd while it is being dragged, to avoid drag jitter.
      if(!this.isBeingMoved)
        await this.applyConnections();
      // Widget.onPropertyChange already updates endpoints connected to this
      // line and its descendants for transform changes.
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
      // a wider, invisible copy of the path gives a comfortable click/select target
      // without changing how thin the visible stroke looks
      this.hitPathElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      this.hitPathElement.setAttribute('class', 'lineHitPath');
      this.pathElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      this.pathElement.setAttribute('class', 'linePath');
      this.svgElement.appendChild(this.guideElement);
      this.svgElement.appendChild(this.hitPathElement);
      this.svgElement.appendChild(this.pathElement);
      this.domElement.prepend(this.svgElement);
    }

    const s = this.pointProperty('lineStart') || { x: 0, y: 0 };
    const e = this.pointProperty('lineEnd') || { x: 0, y: 0 };
    const c1 = this.pointProperty('controlStart') || s;
    const c2 = this.pointProperty('controlEnd') || e;

    const d = this.isCurved()
      ? `M ${s.x} ${s.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${e.x} ${e.y}`
      : `M ${s.x} ${s.y} L ${e.x} ${e.y}`;

    this.pathElement.setAttribute('d', d);
    this.pathElement.setAttribute('stroke', this.get('lineColor'));
    this.pathElement.setAttribute('stroke-width', this.get('lineWidth'));
    if(this.get('lineDash'))
      this.pathElement.setAttribute('stroke-dasharray', this.get('lineDash'));
    else
      this.pathElement.removeAttribute('stroke-dasharray');

    this.hitPathElement.setAttribute('d', d);
    this.hitPathElement.setAttribute('stroke-width', Math.max(this.get('lineWidth'), 24));

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
      const upHandler = async eUp => {
        eUp.stopImmediatePropagation();
        for(const [ event, handler ] of listeners)
          window.removeEventListener(event, handler, true);

        // only wrap the hit box tightly around the path once the drag ends, instead of on
        // every move - resizing/repositioning it mid-drag caused a visible stretching effect
        batchStart();
        setDeltaCause(`${playerName} moved ${property} of ${this.id} in editor`);
        await this.normalizeGeometry();
        batchEnd();
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
