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

      // 'line' draws a straight/curved path between the two points, 'ellipse'
      // reads them as opposite corners of a bounding box and draws the closed
      // circle/oval inscribed in it
      lineShape: 'line',
      lineStart: { x: 0, y: 30 },
      lineEnd: { x: 400, y: 30 },
      controlStart: null,
      controlEnd: null,
      lineWidth: 10,
      lineColor: '#666666',
      lineDash: null,

      // the widgets riding on this line, in chain order:
      // [ { widget: <id>, position: <0..1 along the path> }, ... ]
      stops: [],

      // when enabled, landscape stops follow the direction of the line at
      // their position; portrait and square stops keep their own rotation
      rotateStops: true,
      autoSpaceStops: true,

      // A line takes widgets in like a holder: what dropTarget matches becomes
      // a stop when it is dropped onto the path - during play as well as in
      // edit mode - and comes off the list again when it is dragged away. The
      // default takes the plain widgets stops usually are, an empty list none.
      dropTarget: { type: null },

      // properties applied to a widget when it enters / leaves the line
      onEnter: {},
      onLeave: {},

      connectStart: null,
      connectEnd: null
    });
  }

  applyDeltaToDOM(delta) {
    super.applyDeltaToDOM(delta);
    for(const property of [ 'lineShape', 'lineStart', 'lineEnd', 'controlStart', 'controlEnd', 'lineWidth', 'lineColor', 'lineDash' ]) {
      if(delta[property] !== undefined) {
        this.updateLinePath();
        break;
      }
    }
  }

  isEllipse() {
    return this.get('lineShape') == 'ellipse';
  }

  // a closed shape has no start or end: positions wrap around instead of clamping
  isClosed() {
    return this.isEllipse();
  }

  isCurved() {
    return !this.isEllipse() && !!(this.get('controlStart') || this.get('controlEnd'));
  }

  // the two points are opposite corners of the ellipse's bounding box, so an
  // ellipse needs nothing stored beyond what a line already has
  ellipseBox() {
    const s = this.pointProperty('lineStart') || { x: 0, y: 0 };
    const e = this.pointProperty('lineEnd') || { x: 0, y: 0 };
    return {
      cx: (s.x+e.x)/2,
      cy: (s.y+e.y)/2,
      rx: Math.abs(e.x-s.x)/2,
      ry: Math.abs(e.y-s.y)/2
    };
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

    // the perimeter, starting at 12 o'clock and running clockwise, so a stop at
    // 25% sits a quarter of the way round; everything downstream of linePoints
    // (pointAtPosition, lineLength, tangents, spacing) then works unchanged
    if(this.isEllipse()) {
      const { cx, cy, rx, ry } = this.ellipseBox();
      const points = [];
      for(let i = 0; i <= samples; ++i) {
        const angle = -Math.PI/2 + 2*Math.PI*i/samples;
        const x = cx + rx*Math.cos(angle);
        const y = cy + ry*Math.sin(angle);
        points.push({ x, y, len: i ? points[i-1].len + Math.hypot(x-points[i-1].x, y-points[i-1].y) : 0 });
      }
      return points;
    }

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

  // out of range positions clamp on an open path and wrap around a closed one
  normalizePosition(position) {
    const p = +position || 0;
    return this.isClosed() ? (p%1+1)%1 : Math.max(0, Math.min(1, p));
  }

  // position is the fraction 0..1 of the total arc length
  pointAtPosition(position) {
    const points = this.linePoints();
    const targetLength = this.normalizePosition(position) * points[points.length-1].len;
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

  // The stops property is the single source of truth: an ordered list of
  // { widget, position } entries. Entries pointing at a widget that no longer
  // exists are silently dropped; extra keys on an entry are preserved.
  stopList() {
    const stops = this.get('stops');
    if(!Array.isArray(stops))
      return [];
    return stops
      .filter(entry=>entry && typeof entry == 'object' && widgets.has(entry.widget) && widgets.get(entry.widget) != this)
      .map(entry=>({ ...entry, widget: entry.widget, position: this.normalizePosition(entry.position) }));
  }

  // the stop widgets themselves, in chain order
  attachedWidgets() {
    return this.stopList().map(entry=>widgets.get(entry.widget));
  }

  stopPosition(widget) {
    const entry = this.stopList().find(entry=>entry.widget == (widget && widget.id || widget));
    return entry ? entry.position : 0;
  }

  // replace the positions of the current stops, keeping the chain order
  async setStopPositions(positions) {
    await this.set('stops', this.stopList().map((entry, i)=>({ ...entry, position: positions[i] })));
  }

  async setStopPosition(widgetID, position) {
    await this.set('stops', this.stopList().map(entry=>entry.widget == widgetID ? { ...entry, position: this.normalizePosition(position) } : entry));
  }

  // a widget only has to exist to become a stop - it does not have to be a
  // child of the line (see positionAttachedWidgets)
  async addStop(widgetID, position, index) {
    const stops = this.stopList().filter(entry=>entry.widget != widgetID);
    const p = this.normalizePosition(position);
    stops.splice(index === undefined ? stops.filter(entry=>entry.position <= p).length : index, 0, { widget: widgetID, position: p });
    await this.set('stops', stops);
  }

  async removeStop(widgetID) {
    const stops = this.stopList().filter(entry=>entry.widget != widgetID);
    if(stops.length != this.stopList().length)
      await this.set('stops', stops);
  }

  // keep the list pointing at a stop that was renamed (a rename is a remove +
  // re-add of the same state under a new id)
  async renameStop(oldID, newID) {
    const stops = this.get('stops');
    if(!Array.isArray(stops) || !stops.some(entry=>entry && entry.widget == oldID))
      return;
    // a rename carries no positioning change, so it must not re-space the line
    this.updatingAttachedWidgets = true;
    try {
      await this.set('stops', stops.map(entry=>entry && entry.widget == oldID ? { ...entry, widget: newID } : entry));
    } finally {
      this.updatingAttachedWidgets = false;
    }
  }

  // place each stop at its own stored position so manual positions survive
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
    for(const entry of this.stopList()) {
      const stop = widgets.get(entry.widget);
      const p = this.stopCoordInParentFrame(stop, this.pointAtPosition(entry.position));
      await stop.set('x', Math.round(p.x - stop.get('width')/2));
      await stop.set('y', Math.round(p.y - stop.get('height')/2));

      const landscape = +stop.get('width') > +stop.get('height');
      if(this.shouldRotateStops() && landscape) {
        if(stop.get('lineOriginalRotation') === null)
          await stop.set('lineOriginalRotation', { value: stop.get('rotation'), explicit: stop.state.rotation !== undefined });
        await stop.set('rotation', this.tangentAngleAtPosition(entry.position));
      } else
        await this.restoreStopRotation(stop);
    }
  }

  // A stop that is a child of the line already lives in the line's coordinate
  // frame. Any other widget is positioned by converting the path point through
  // global coordinates into the frame its own parent uses, the same way
  // applyConnections handles targets nested under transformed parents.
  stopCoordInParentFrame(stop, point) {
    const parentID = stop.get('parent');
    if(parentID == this.id)
      return point;
    const global = this.coordGlobalFromCoordLocal(point);
    return widgets.has(parentID) ? widgets.get(parentID).coordLocalFromCoordGlobal(global) : global;
  }

  hasExternalStops() {
    return this.stopList().some(entry=>widgets.get(entry.widget).get('parent') != this.id);
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
      // a lone stop on a closed shape has nothing to space against, so it keeps
      // its position; on an open path it belongs at the start
      if(stops.length && !this.isClosed())
        await this.setStopPositions([ 0 ]);
      await this.positionAttachedWidgets();
      return;
    }

    const length = this.lineLength();
    if(!length) {
      await this.setStopPositions(stops.map(_=>0));
      await this.positionAttachedWidgets();
      return;
    }
    // On a closed shape the first and last stop are neighbours like any other
    // pair, so all stops.length gaps are equal and none of them is pinned - the
    // open path instead pins the first stop at 0 and the last one at 1.
    const closed = this.isClosed();
    const gaps = closed ? stops.length : stops.length-1;
    let positions = this.stopList().map(entry=>entry.position);
    for(let iteration = 0; iteration < 3; ++iteration) {
      const sizes = stops.map((stop, i)=>this.widgetLengthOnLine(stop, positions[i]));
      const usedLength = sizes.reduce((sum, size)=>sum+size, 0) - (closed ? 0 : sizes[0]/2 + sizes[sizes.length-1]/2);
      const requestedGap = (length - usedLength)/gaps;
      // If the widgets do not fit, allow overlap but never enough to reverse
      // two neighboring centers. This preserves the original stop order.
      const neighbours = sizes.map((size, i)=>(size+sizes[(i+1)%sizes.length])/2).slice(0, gaps);
      const gap = Math.max(requestedGap, -Math.min(...neighbours));
      let distance = 0;
      const targetDistances = stops.map((stop, i)=>{
        if(i == 0)
          return 0;
        distance += sizes[i-1]/2 + gap + sizes[i]/2;
        return distance;
      });
      const totalDistance = (closed ? length : targetDistances[targetDistances.length-1]) || length;
      positions = targetDistances.map((distance, i)=>closed ? this.normalizePosition(distance/totalDistance) : i == 0 ? 0 : i == stops.length-1 ? 1 : distance/totalDistance);
      await this.setStopPositions(positions);
      await this.positionAttachedWidgets();
    }

    let previousPosition = 0;
    const rounded = [];
    for(let i = 0; i < stops.length; ++i) {
      if(closed)
        rounded.push(Math.round(positions[i]*1000)/1000);
      else {
        previousPosition = i == 0 ? 0 : i == stops.length-1 ? 1 : Math.max(previousPosition, Math.min(1, Math.round(positions[i]*1000)/1000));
        rounded.push(previousPosition);
      }
    }
    await this.setStopPositions(rounded);
    await this.positionAttachedWidgets();
  }

  // Swap a stop with its neighbour in the chain: the two widgets trade places
  // along the path while the positions themselves stay where they are.
  async swapStops(index, direction) {
    const stops = this.stopList();
    const otherIndex = index+direction;
    if(!stops[index] || !stops[otherIndex])
      return;
    const swapped = stops.map(entry=>({ ...entry }));
    swapped[index].widget = stops[otherIndex].widget;
    swapped[otherIndex].widget = stops[index].widget;
    await this.set('stops', swapped);
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
    const p = this.normalizePosition(position);
    const delta = 0.001;
    // a closed shape wraps, so the tangent at the 0/1 seam is the real tangent
    // there instead of the one-sided one an open path has to fall back to
    const before = this.pointAtPosition(this.isClosed() ? p-delta : Math.max(0, p-delta));
    const after = this.pointAtPosition(this.isClosed() ? p+delta : Math.min(1, p+delta));
    return Math.atan2(after.y-before.y, after.x-before.x) * 180 / Math.PI;
  }

  // The position along the path closest to a point in this line's own frame,
  // used when a widget is dropped onto the line to make it a stop. The point is
  // projected onto the segments between the samples rather than snapped to the
  // nearest one, so a straight line - which is sampled by its two ends only -
  // resolves to the actual position instead of to one of its ends.
  positionAtPoint(point) {
    const points = this.linePoints();
    const total = points[points.length-1].len;
    if(!total)
      return 0;
    let best = { len: 0, distance: Infinity };
    for(let i = 1; i < points.length; ++i) {
      const from = points[i-1], to = points[i];
      const dx = to.x-from.x, dy = to.y-from.y;
      const squared = dx*dx + dy*dy;
      const f = squared ? Math.max(0, Math.min(1, ((point.x-from.x)*dx + (point.y-from.y)*dy)/squared)) : 0;
      const distance = Math.hypot(from.x+dx*f-point.x, from.y+dy*f-point.y);
      if(distance < best.distance)
        best = { len: from.len + (to.len-from.len)*f, distance };
    }
    return Math.round(best.len/total*1000)/1000;
  }

  // Where a widget dropped at the given global point would attach, or null when
  // the line does not take dropped stops or the drop is not aimed at its path.
  // The range grows with the line and the dropped widget so a big token snaps on
  // as readily as a small one.
  stopDropTarget(widget, coordGlobal) {
    if(!this.get('dropTarget') || !compareDropTarget(widget, this) || widget == this || widget.get('type') == 'line' || this.isDescendantOf(widget))
      return null;
    const range = Math.max(25, (+this.get('lineWidth') || 0)/2 + 10, Math.min(+widget.get('width') || 0, +widget.get('height') || 0)/2);
    const point = this.coordLocalFromCoordGlobal(coordGlobal);
    // cheap box reject so a room full of lines doesn't sample every path on every mouse move
    if(point.x < -range || point.y < -range || point.x > +this.get('width')+range || point.y > +this.get('height')+range)
      return null;
    const position = this.positionAtPoint(point);
    const onPath = this.pointAtPosition(position);
    const distance = Math.hypot(onPath.x-point.x, onPath.y-point.y);
    return distance <= range ? { line: this, position, distance } : null;
  }

  // Keep existing line definitions working while the property name changes.
  shouldRotateStops() {
    const legacyValue = this.get('rotateAttachedWidgets');
    return legacyValue === null ? !!this.get('rotateStops') : !!legacyValue;
  }

  // where "Add stop" puts the new stop: right before the last one, so adding
  // several in a row extends the chain in order instead of dropping each one
  // into whatever gap happens to be widest at the time
  nextStopPosition() {
    const positions = this.stopList().map(entry=>entry.position);
    if(positions.length == 0)
      return 0;
    const last = positions[positions.length-1];
    // a closed shape has no free end, so the new stop goes into the gap that
    // wraps past the seam from the last stop back to the first one
    if(this.isClosed())
      return this.normalizePosition(Math.round((last+(positions[0]+1))/2*1000)/1000);
    const previous = positions.length > 1 ? positions[positions.length-2] : 0;
    // if the last stop sits at the very start of the line there is no room
    // before it, so the new stop goes after it instead
    return Math.round((last > previous ? (previous+last)/2 : (last+1)/2)*1000)/1000;
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
    // a closed shape has no start or end to glue anywhere - connecting *to* it
    // still works, its perimeter is a path like any other
    if(this.isEllipse())
      return;
    if(Line.connectionUpdateInProgress.has(this.id))
      return;
    Line.connectionUpdateInProgress.add(this.id);
    try {
      // Both ends are positioned by converting between local and global
      // coordinates, which reads the current CSS transforms. Inside a batch
      // (every mouse event is one) those still show the state of the previous
      // event, so the end points would be computed in a stale frame - and since
      // this line then moves itself, that error feeds back and grows with every
      // event until the line leaves the surface.
      if(this.get('connectStart') || this.get('connectEnd'))
        flushDelta();

      const connectionPoint = end=>{
        const connection = this.get('connect' + end);
        if(!connection || typeof connection != 'object' || !widgets.has(connection.line))
          return null;
        const target = widgets.get(connection.line);
        // A target that sits inside this line - a piece dropped into one of its
        // stops, say - moves along with it, so gluing an end point to it would
        // chase its own tail: the end point moves the line, the line moves the
        // target, and the line runs off the surface. Keep the end point where
        // it is until the target leaves the line again.
        if(target == this || target.isDescendantOf(this))
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

  // Entering the line works like entering a holder: the widget becomes a child
  // of the line, gets the onEnter properties applied and triggers enterRoutine
  // (which Widget.onPropertyChange does for every parent change).
  async onChildAdd(child, oldParentID) {
    const entering = this != child.currentParent;
    await super.onChildAdd(child, oldParentID);
    // a rename re-adds the same stop under a new id; it carries no positioning
    // change, so skip the layout pass a real add/remove would trigger
    if(child.isBeingRenamed)
      return;
    // whatever the line accepts becomes a stop where it landed on the path -
    // a widget it does not accept is just a child, like a holder's children()
    if(!this.stopList().some(entry=>entry.widget == child.id) && compareDropTarget(child, this))
      await this.addStop(child.id, this.positionAtPoint(this.childCenter(child)));
    if(this.stopList().some(entry=>entry.widget == child.id))
      await this.layoutStops();
    if(entering)
      await this.applyEnterLeave(child, 'onEnter');
  }

  // the middle of a child in the line's own coordinate frame
  childCenter(child) {
    return { x: +child.get('x') + (+child.get('width') || 0)/2, y: +child.get('y') + (+child.get('height') || 0)/2 };
  }

  // Leaving the line again is the mirror of that: checkParent calls this hook -
  // named after the holder method it stands in for - once a widget is really
  // out, so the stop comes off the list and onLeave is applied. leaveRoutine is
  // triggered by the parent change itself.
  async dispenseCard(child) {
    await this.removeStop(child.id);
    await this.applyEnterLeave(child, 'onLeave');
  }

  // onEnter / onLeave hold properties to apply to the widget that entered or
  // left, exactly like the ones a holder has
  async applyEnterLeave(widget, property) {
    if(property == 'onLeave' && widget.get('ignoreOnLeave'))
      return;
    const properties = this.get(property);
    for(const p in properties)
      await widget.set(p, properties[p]);
  }

  async onChildRemove(child) {
    if(child.isBeingRenamed)
      return await super.onChildRemove(child);
    const wasStop = this.stopList().some(entry=>entry.widget == child.id);
    await this.restoreStopRotation(child);
    await super.onChildRemove(child);
    if(wasStop)
      await this.layoutStops();
  }

  async onStopPropertyChange() {
    if(this.updatingAttachedWidgets)
      return;
    await this.layoutStops();
  }

  async layoutStops() {
    if(this.get('autoSpaceStops'))
      await this.distributeAttachedWidgetsEvenly();
    else
      await this.updateAttachedWidgets();
  }

  // switching between an open path and a closed shape reinterprets the two
  // points, so give the new shape geometry that is actually usable
  async convertGeometryForShape() {
    const s = this.pointProperty('lineStart') || { x: 0, y: 0 };
    const e = this.pointProperty('lineEnd') || { x: 0, y: 0 };
    if(this.isEllipse()) {
      // a straight line has no height to inscribe an ellipse in, so seed a
      // circle of the same size around the line's middle
      if(Math.abs(e.x-s.x) >= 8 && Math.abs(e.y-s.y) >= 8)
        return;
      const size = Math.max(40, Math.round(Math.hypot(e.x-s.x, e.y-s.y)));
      const { cx, cy } = this.ellipseBox();
      await this.set('lineStart', { x: Math.round(cx-size/2), y: Math.round(cy-size/2) });
      await this.set('lineEnd', { x: Math.round(cx+size/2), y: Math.round(cy+size/2) });
    } else {
      // back to an open path: run it across the middle of the former box rather
      // than leaving it as the box's diagonal
      await this.set('lineStart', { x: Math.min(s.x, e.x), y: Math.round((s.y+e.y)/2) });
      await this.set('lineEnd', { x: Math.max(s.x, e.x), y: Math.round((s.y+e.y)/2) });
    }
  }

  // Resizing the widget box - the Resize toolbar button, the Size inputs or a
  // routine - stretches the ellipse into the new box, which is the second way
  // (next to the edge handles) of resizing and elongating it.
  async fitEllipseToBox() {
    const pad = Math.ceil((+this.get('lineWidth') || 0)/2) + 10;
    const width = Math.max(2*pad+2, Math.round(+this.get('width') || 0));
    const height = Math.max(2*pad+2, Math.round(+this.get('height') || 0));
    await this.set('lineStart', { x: pad, y: pad });
    await this.set('lineEnd', { x: width-pad, y: height-pad });
  }

  async onPropertyChange(property, oldValue, newValue) {
    await super.onPropertyChange(property, oldValue, newValue);

    if([ 'lineStart', 'lineEnd', 'controlStart', 'controlEnd' ].indexOf(property) != -1) {
      await this.layoutStops();
      await this.updateConnectedLines();
    }

    if(property == 'stops' && !this.updatingAttachedWidgets)
      await this.layoutStops();

    if(property == 'lineShape') {
      await this.convertGeometryForShape();
      await this.normalizeGeometry();
      await this.layoutStops();
    }

    if((property == 'width' || property == 'height') && this.isEllipse() && !this.normalizingGeometry && !this.fittingEllipse) {
      this.fittingEllipse = true;
      try {
        await this.fitEllipseToBox();
      } finally {
        this.fittingEllipse = false;
      }
    }

    if(property == 'autoSpaceStops')
      await this.layoutStops();

    if(property == 'rotateStops' || property == 'rotateAttachedWidgets')
      await this.updateAttachedWidgets();

    if((property == 'x' || property == 'y') && !this.normalizingGeometry) {
      // lines attached to this one follow live even during an interactive drag —
      // they don't affect this line's own drag frame. Only this line's own
      // connection re-glue + box re-fit (which do mutate its geometry) are
      // deferred to moveEnd while it is being dragged, to avoid drag jitter.
      if(!this.isBeingMoved)
        await this.applyConnections();
      // Stops that are not children of the line do not move along with it, so
      // they have to be repositioned explicitly.
      if(this.hasExternalStops())
        await this.updateAttachedWidgets();
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

    const { cx, cy, rx, ry } = this.ellipseBox();
    const d = this.isEllipse()
      ? `M ${cx} ${cy-ry} A ${rx} ${ry} 0 0 1 ${cx} ${cy+ry} A ${rx} ${ry} 0 0 1 ${cx} ${cy-ry} Z`
      : this.isCurved()
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

  // The handles a shape offers: the end points plus the Bezier control points
  // on an open path, one handle per edge of the bounding box on an ellipse -
  // dragging an edge handle moves that edge only, so the ellipse is stretched
  // along one axis at a time.
  handleDefinitions() {
    if(this.isEllipse()) {
      const { cx, cy, rx, ry } = this.ellipseBox();
      const box = ()=>{
        const s = this.pointProperty('lineStart') || { x: 0, y: 0 };
        const e = this.pointProperty('lineEnd') || { x: 0, y: 0 };
        return { minX: Math.min(s.x, e.x), minY: Math.min(s.y, e.y), maxX: Math.max(s.x, e.x), maxY: Math.max(s.y, e.y) };
      };
      const setEdge = async (edge, local)=>{
        const b = box();
        if(edge == 'left')   b.minX = Math.min(Math.round(local.x), b.maxX-4);
        if(edge == 'right')  b.maxX = Math.max(Math.round(local.x), b.minX+4);
        if(edge == 'top')    b.minY = Math.min(Math.round(local.y), b.maxY-4);
        if(edge == 'bottom') b.maxY = Math.max(Math.round(local.y), b.minY+4);
        await this.set('lineStart', { x: b.minX, y: b.minY });
        await this.set('lineEnd', { x: b.maxX, y: b.maxY });
      };
      return [
        { key: 'edgeLeft',   className: 'edge', name: 'left edge',   point: { x: cx-rx, y: cy }, apply: local=>setEdge('left', local) },
        { key: 'edgeRight',  className: 'edge', name: 'right edge',  point: { x: cx+rx, y: cy }, apply: local=>setEdge('right', local) },
        { key: 'edgeTop',    className: 'edge', name: 'top edge',    point: { x: cx, y: cy-ry }, apply: local=>setEdge('top', local) },
        { key: 'edgeBottom', className: 'edge', name: 'bottom edge', point: { x: cx, y: cy+ry }, apply: local=>setEdge('bottom', local) }
      ];
    }

    const names = { lineStart: 'start point', lineEnd: 'end point', controlStart: 'start curve handle', controlEnd: 'end curve handle' };
    return Object.entries({ lineStart: 'end', lineEnd: 'end', controlStart: 'control', controlEnd: 'control' }).map(([ property, className ])=>({
      key: property,
      className,
      name: names[property],
      point: this.pointProperty(property),
      apply: local=>this.set(property, { x: Math.round(local.x), y: Math.round(local.y) })
    }));
  }

  // when selected in edit mode, show draggable handles for the shape's points
  updateHandles() {
    if(!this.isHighlighted) {
      for(const handle of Object.values(this.handleElements || {}))
        handle.remove();
      delete this.handleElements;
      return;
    }

    if(!this.handleElements)
      this.handleElements = {};

    const definitions = this.handleDefinitions();
    for(const key of Object.keys(this.handleElements))
      if(!definitions.some(definition=>definition.key == key && definition.point)) {
        this.handleElements[key].remove();
        delete this.handleElements[key];
      }

    for(const definition of definitions) {
      if(!definition.point)
        continue;
      if(!this.handleElements[definition.key]) {
        const handle = document.createElement('div');
        handle.className = `lineHandle ${definition.className}`;
        this.addHandleDragging(handle, definition);
        this.domElement.appendChild(handle);
        this.handleElements[definition.key] = handle;
      }
      this.handleElements[definition.key].style.transform = `translate(${definition.point.x}px, ${definition.point.y}px)`;
    }
  }

  // one readable history entry per drag: every move of the same handle shares
  // this cause, so the deltas merge into a single entry
  handleDragCause(name) {
    return `${playerName} moved the ${name} of line ${this.id} in editor`;
  }

  addHandleDragging(handle, definition) {
    const startDragging = eDown => {
      eDown.preventDefault();
      eDown.stopPropagation();

      const moveHandler = async eMove => {
        eMove.preventDefault();
        eMove.stopImmediatePropagation();
        const coords = eMove.touches ? eMove.touches[0] : eMove;
        const local = this.coordLocalFromCoordClient({ x: coords.clientX, y: coords.clientY });
        batchStart();
        setDeltaCause(this.handleDragCause(definition.name));
        await definition.apply(local);
        batchEnd();
      };
      const upHandler = async eUp => {
        eUp.stopImmediatePropagation();
        for(const [ event, handler ] of listeners)
          window.removeEventListener(event, handler, true);

        // only wrap the hit box tightly around the path once the drag ends, instead of on
        // every move - resizing/repositioning it mid-drag caused a visible stretching effect
        batchStart();
        setDeltaCause(this.handleDragCause(definition.name));
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
