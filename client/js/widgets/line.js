export class Line extends Widget {

  constructor(id) {
    super(id);
    let riders = this.get('riders') || 3
    this.addDefaults({
      typeClasses: 'widget line',
      strokeWidth: 5,
      stroke: '#1f5ca6',
      fill: 'none',
      riders: 3,
      spotRadius: 4,
      spotStroke: '#1f5ca6',
      spotFill: '#a9c6e8',
      spotStrokeWidth: 2,
    });
  }
  
  applyDeltaToDOM(delta) {
    super.applyDeltaToDOM(delta);
    // we should filter this down, but still figuring out the right bits to do that
    // ala if(delta.endy !== undefined || delta.starty !== undefined, etc...
    this.createChildNodes();
  }
  
  createChildNodes() {
    const childNodes = [...this.domElement.childNodes];

    const bezierCoordinates = {
      start: { x: 10, y: 10 },
      control1: { x: 80, y: 50 },
      control2: { x: 120, y: 150 },
      end: { x: 190, y: 100 },
    };

    const updates = {
      start: { x: this.get('startx'), y: this.get('starty') },
      end: { x: this.get('endx'), y: this.get('endy') },
      control1: { x: this.get('cp1x'), y: this.get('cp1y') },
      control2: { x: this.get('cp2x'), y: this.get('cp2y') },
    };

    for (const key in updates) {
        for (const coord in updates[key]) {
            if (updates[key][coord]) {
                bezierCoordinates[key][coord] = updates[key][coord] + 15;
            }
        }
    }

    // so I was using t (time on curve) for figuring out the rider spots
    // but it turns out spot equidistant along the path is more game-design friendly

    let riders = this.get("riders");
    let stroke = this.get("stroke");
    let fill = this.get("fill");
    let strokeWidth = this.get("strokeWidth");
    let spotRadius = this.get("spotRadius");
    let spotStroke = this.get('spotStroke');
    let spotFill = this.get('spotFill');
    let spotStrokeWidth = this.get('spotStrokeWidth');

    const ns = 'http://www.w3.org/2000/svg'
    let svg = document.createElementNS(ns, 'svg');
    svg.setAttribute("style", `position: relative; top: 0 ; left: 0`);

    let spots = {}
    // Append the path to the SVG container
    svg, spots = this.makeBezierCurveonPath(ns, svg, bezierCoordinates, riders, stroke, fill, strokeWidth, spotRadius, spotStroke, spotFill, spotStrokeWidth)

    for (let i = 1; i <= riders; i++) {
      let spot_id_x = `spot_${i}_x`
      let spot_id_y = `spot_${i}_y`
      this.state[spot_id_x] = Math.round(spots[i].x)
      this.state[spot_id_y] = Math.round(spots[i].y)
    }

    // have to check size of curve roughly to set dimensions
    let bounding = this.getApproxBezierBoundingBox(bezierCoordinates, riders)
    let width = bounding.maxX
    let height = bounding.maxY
    this.state.width = width
    this.state.height = height
    svg.setAttribute("width", width);
    svg.setAttribute("height", height);

    this.domElement.innerHTML = '';
    this.domElement.appendChild(svg);

    // Get the bounding box of the path
    const path = svg.querySelector('path');
    const bbox = path.getBBox();

    for(const child of childNodes)
      if(String(child.className).match(/widget/))
        this.domElement.appendChild(child);

  }

  // need this to get bbox before we render it in browser to get appropriate sizing
  getApproxBezierBoundingBox(bezierCoordinates, checkpoints=3) {
    const tValues = Array.from({ length: checkpoints }, (_, i) => (i + 1) / (checkpoints + 1));
    const samplePoints = tValues.map(t => this.deCasteljau(bezierCoordinates, t));    
    const { start, control1, control2, end } = bezierCoordinates;
    const controlPoints = [start, control1, control2, end];
    // Combine sample points and control points
    const allPoints = [...samplePoints, ...controlPoints];
    
    // Use reduce to calculate bounds
    const { minX, minY, maxX, maxY } = allPoints.reduce(
      (bounds, { x, y }) => ({
        minX: Math.min(bounds.minX, x),
        minY: Math.min(bounds.minY, y),
        maxX: Math.max(bounds.maxX, x),
        maxY: Math.max(bounds.maxY, y),
      }),
      {
        minX: Infinity,
        minY: Infinity,
        maxX: -Infinity,
        maxY: -Infinity,
      }
    );
    
    return { minX, minY, maxX, maxY, samplePoints};
  }
 
  makeBezierCurveonPath(ns, svg, bezierCoordinates, riders, stroke, fill, strokeWidth, spotRadius, spotStroke, spotFill, spotStrokeWidth) {
    // Create a path element for the bezier curve
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", `M${bezierCoordinates.start.x},${bezierCoordinates.start.y} 
                            C${bezierCoordinates.control1.x},${bezierCoordinates.control1.y}, 
                            ${bezierCoordinates.control2.x},${bezierCoordinates.control2.y}, 
                            ${bezierCoordinates.end.x},${bezierCoordinates.end.y}`);
    path.setAttribute("stroke", stroke);
    path.setAttribute("fill", fill);
    path.setAttribute("stroke-width", strokeWidth);
    svg.appendChild(path)
    
    const pathLength = path.getTotalLength()
    const points = Array.from({ length: riders }, (_, i) => (i + 1) / (riders + 1));
    
    let equalspots = {}
    let index = 1

    points.forEach(spot => {
      const point = path.getPointAtLength(spot * pathLength);
      equalspots[index] = {"x": point.x, "y": point.y}
      index++
      // Create a circle element for the point
      const circle = document.createElementNS(ns, 'circle');
      circle.setAttribute('cx', point.x);
      circle.setAttribute('cy', point.y);
      circle.setAttribute('r', spotRadius); // Radius of the circle
      circle.setAttribute("stroke", spotStroke);
      circle.setAttribute("fill", spotFill);
      circle.setAttribute("stroke-width", spotStrokeWidth);
      // Add the circle to the SVG
      svg.appendChild(circle)
    })
    return svg, equalspots
  }


  //  Calculates a point on a cubic Bézier curve using De Casteljau’s algorithm.
  //  @param {Object} start - The start point {x, y}.
  //  @param {Object} control1 - The first control point {x, y}.
  //  @param {Object} control2 - The second control point {x, y}.
  //  @param {Object} end - The end point {x, y}.
  //  @param {number} t - The parameter (0 <= t <= 1).
  //  @returns {Object} The point on the curve at t {x, y}.

  deCasteljau(bezierCoordinates, t=.5) {
    const { start, control1, control2, end } = bezierCoordinates;
    if (t < 0 || t > 1) {
      throw new Error("t must be between 0 and 1.");
    }

    // Linear interpolation between two points
    const lerp = (a, b, t) => ({
      x: (1 - t) * a.x + t * b.x,
      y: (1 - t) * a.y + t * b.y
    });

    // First level of interpolation
    const q0 = lerp(start, control1, t);
    const q1 = lerp(control1, control2, t);
    const q2 = lerp(control2, end, t);

    // Second level of interpolation
    const r0 = lerp(q0, q1, t);
    const r1 = lerp(q1, q2, t);

    // Final interpolation to get the point on the curve
    return lerp(r0, r1, t);
  }

  // alternative code, simpler math but less clear what it is doing...
  // Compute Bézier point for a given t
  bezierPoint(bezierCoordinates, t=.5) {
    const { start, control1, control2, end } = bezierCoordinates;
    const mt = 1 - t;
    point = {
      x: mt * mt * mt * start.x +
        3 * mt * mt * t * control1.x +
        3 * mt * t * t * control2.x +
        t * t * t * end.x,
      y: mt * mt * mt * start.y +
        3 * mt * mt * t * control1.y +
        3 * mt * t * t * control2.y +
        t * t * t * end.y
    }
    return point
  }
}