class Line extends Widget {
  constructor(id) {
    super(id);
    this.addDefaults({
      typeClasses: 'widget line',
      inheritFromNotifyAll: true,

      // line details
      strokeColor: '#1f5ca6',
      fillColor: 'none',
      strokeWidth: 5,
      borderFudge: 10,

      // spot # details
      autoSpots: 3,
      manualSpots: false,
      spotSize: 10,
      spotSize2: 10,
      spotType: "circle",
      spotStrokeColor: '#1f5ca6',
      spotFillColor: 'white',
      spotStrokeWidth: 5,
      spotRotate: 0,
      spotRotateOverride: false,
      spotLocations: {},

      // start spot details
      spotAtStart: false,
      startOffsetRadius: 0,
      startOffsetAngle: 0,

      // end spot details
      spotAtEnd: false,
      endOffsetRadius: 0,
      endOffsetAngle: 0,

      // controlpoint offsets
      cp1OffsetRadius: 0,
      cp1OffsetAngle: 0,

      cp2OffsetRadius: 0,
      cp2OffsetAngle: 0,
    });
  }

  async onPropertyChange(property, oldValue, newValue) {
    // we do not have access to a live SVG render from here
    const {spotLocations, bezierCoordinates} = this.getCurrentBezierCurvePoints()

    if (spotLocations){
      await this.set("spotLocations", spotLocations)
    }

    if (bezierCoordinates) {
      let borderFudge = this.get("borderFudge") ?? 10
      borderFudge = 0
      await this.set('x', bezierCoordinates.bounds.minX - borderFudge )
      await this.set('y', bezierCoordinates.bounds.minY - borderFudge )
      await this.set('width', bezierCoordinates.bounds.width + (borderFudge*2))
      await this.set('height',bezierCoordinates.bounds.height + (borderFudge*2))
    }
  }

  /*  Doesn't work? 
    applyRemove() {
    const id = this.get('id')
    if (this.get('type') == 'line') {
      console.log(widgets.get(`${id}_S`))
      widgets.get(`${id}_S`).applyRemove()
      widgets.get(`${id}_E`).applyRemove()
      widgets.get(`${id}_C1`).applyRemove()
      widgets.get(`${id}_C2`).applyRemove()
      console.log(`removing the 4 controlpoints witn ${id} line)`)
    }
    super.applyRemove();
  } */

  applyDeltaToDOM(delta) {
    super.applyDeltaToDOM(delta);
    this.createChildNodes();
  }
  
  createChildNodes() {
    const childNodes = [...this.domElement.childNodes];
    if (this.get('id') && this.get('type') == 'line' ){
      const svg = this.makeSVGBezierCurve()
      const svgid = "#svg_" + this.get('id') 
      const oldLine = this.domElement.querySelector(svgid);
      if (oldLine) {
        // If an SVG element exists, replace it with the new one
        this.domElement.replaceChild(svg, oldLine);
      } else {
        // If no SVG element exists, append the new SVG
        this.domElement.appendChild(svg);
      }
    }
  }

  makeSVGBezierCurve(){
    const ns = "http://www.w3.org/2000/svg"
    let svg = document.createElementNS(ns, 'svg');
    const svgid = "svg_" + this.get('id')
    svg.setAttribute("id", svgid);

    const strokeColor = this.get("strokeColor") ?? '#1f5ca6'
    const fillColor = this.get("fillColor") ?? 'none'
    const strokeWidth = this.get("strokeWidth") ?? 10
    const borderFudge = this.get("borderFudge") ?? 10

    const bezierCoordinates = this.lineCoordinates()
    
    let edgeadjustment = 0 //borderFudge + strokeWidth

    svg.setAttribute("style", `position: absolute; top: -${edgeadjustment}px; left: -${edgeadjustment}px;`);
    svg.setAttribute("width", bezierCoordinates.bounds.width);
    svg.setAttribute("height", bezierCoordinates.bounds.height);
    svg.setAttribute("viewBox", `${bezierCoordinates.bounds.minX - edgeadjustment} ${bezierCoordinates.bounds.minY - edgeadjustment } ${bezierCoordinates.bounds.width + edgeadjustment*2 } ${bezierCoordinates.bounds.height + edgeadjustment*2}`);

    // Create a path element for the bezier curve
    let path = document.createElementNS(ns, "path");
    let pathstring = `M${bezierCoordinates.start.x},${bezierCoordinates.start.y} `
    pathstring += `C${bezierCoordinates.control1.x},${bezierCoordinates.control1.y},`
    pathstring += `${bezierCoordinates.control2.x},${bezierCoordinates.control2.y},`
    pathstring += `${bezierCoordinates.end.x},${bezierCoordinates.end.y}`
    path.setAttribute("d", pathstring);
    path.setAttribute("stroke", strokeColor);
    path.setAttribute("fill", fillColor);
    path.setAttribute("stroke-width", strokeWidth);
    svg.appendChild(path)

    const pathLength = path.getTotalLength()

    // drawing spots settings
    const spotType = this.get("spotType") ?? 'circle'
    const spotStrokeColor = this.get("spotStrokeColor") ?? '#1f5ca6'
    let spotSize = this.get("spotSize") ?? 10
    let spotSize2 = this.get("spotSize2") ?? 10
    const spotStrokeWidth = this.get("spotStrokeWidth") ?? 5
    const spotFillColor = this.get("spotFillColor") ?? 'white'
    const spotRotate = this.get("spotRotate") ?? 0
    const spotRotateOverride = this.get("spotRotateOverride") ?? false
    
    // get spots
    const spotPositions = this.getSpotPositions()
    let index = 0
    if (spotPositions[0] == 0) {
      index = -1
    }
    
    spotPositions.forEach(spot => {
      index++
      // angle/rotation calculations
      let dx = 0
      let dy = 0
      const point = path.getPointAtLength(spot * pathLength);
      if (spot == 1) {
        // handle the end of the line, look back instead
        const nextPointBackward = path.getPointAtLength((spot - .01) * pathLength);
        dx = point.x - nextPointBackward.x;
        dy = point.y - nextPointBackward.y;
      } else {
        const nextPointForward = path.getPointAtLength((spot + .01) * pathLength);
        dx = nextPointForward.x - point.x;
        dy = nextPointForward.y - point.y;
      }
      // Calculate the angle
      let angle = Math.round(Math.atan2(dy, dx) * (180 / Math.PI));
      const pointx = Math.round(point.x)
      const pointy = Math.round(point.y)

      if (spotType == "rectangle" || spotType == "square"){
        let rect = document.createElementNS(ns, 'rect');
        if (spotType == "square"){
          spotSize2 = spotSize
        }
        const rectx = pointx - (spotSize/2)
        const recty = pointy - (spotSize2/2)
        rect.setAttribute('x', rectx);
        rect.setAttribute('y', recty);
        rect.setAttribute('width', spotSize);
        rect.setAttribute('height', spotSize2);
        if (spotRotateOverride){
          angle = spotRotate
        } else {
          angle = angle + spotRotate
        }
        rect.setAttribute("transform", `rotate(${angle} ${pointx} ${pointy})`);
        rect.setAttribute("stroke", spotStrokeColor);
        rect.setAttribute("fill", spotFillColor);
        rect.setAttribute("stroke-width", spotStrokeWidth);
        // Add the rect to the SVG
        svg.appendChild(rect)
      } else if (spotType == "circle") {
        // Create a circle element for the point
        let circle = document.createElementNS(ns, 'circle');
        circle.setAttribute('cx', pointx);
        circle.setAttribute('cy', pointy);
        circle.setAttribute('r', (spotSize/2)); // Radius of the circle
        circle.setAttribute("stroke", spotStrokeColor);
        circle.setAttribute("fill", spotFillColor);
        circle.setAttribute("stroke-width", spotStrokeWidth);
        // Add the circle to the SVG
        svg.appendChild(circle)
      }
    })
    return svg
  }
 
  getCurrentBezierCurvePoints() {
    // this is the non-svg method
    const bezierCoordinates = this.lineCoordinates()
    const spotPositions = this.getSpotPositions()
    let spotLocations = {}
    let index = 0

    if (spotPositions[0] == 0) {
      index = -1
    }

    spotPositions.forEach(spot => {
      index++

      // angle/rotation calculations
      let dx = 0
      let dy = 0
      const point = this.deCasteljau(bezierCoordinates, spot)

      if (spot == 1) {
        // handle the end of the line, look back instead
        const nextPointBackward = this.deCasteljau(bezierCoordinates, spot - .01)
        dx = point.x - nextPointBackward.x;
        dy = point.y - nextPointBackward.y;
      } else {
        const nextPointForward = this.deCasteljau(bezierCoordinates, spot + .01)
        dx = nextPointForward.x - point.x;
        dy = nextPointForward.y - point.y;
      }

      // Calculate the angle
      let angle = Math.round(Math.atan2(dy, dx) * (180 / Math.PI));
      const pointx = Math.round(point.x)
      const pointy = Math.round(point.y)

      spotLocations[`spot_${index}`] = {
        "x": pointx, 
        "y": pointy, 
        "parentalx": Math.round(point.x - bezierCoordinates.bounds.minX), // need borderFudge subtracted?
        "parentaly": Math.round(point.y - bezierCoordinates.bounds.minY), // same ?
        "orientation": angle
      }
    })
    return {spotLocations, bezierCoordinates}
  }

  getSpotPositions(){
    const manualspots = this.get("manualSpots")
    if (manualspots) {
      return manualspots
    }

    const spotcount = this.get("autoSpots") ?? 3
    let spotPositions = Array.from({ length: spotcount }, (_, i) => (i + 1) / (spotcount + 1));
    // add start/end points
    if (this.get("spotAtStart")) {
      spotPositions.unshift(0);
    }
    if (this.get("spotAtEnd")) {
      spotPositions.push(1);
    }
    return spotPositions
  }

  lineCoordinates(){
    // ensure we always have valid sane defaults
    let bezierCoordinates = {}
    let bezierData = {}

    const startgiven = {x: this.get('startx') ?? 100, y: this.get('starty') ?? 100}
    const startoffset = {x: (this.get('startWidth') ?? 10)/2, y: (this.get('startHeight') ?? 10)/2 }
    bezierData.start = {
      "point": startgiven, 
      "offsetpoint": startoffset, 
      "connection": {
        "radius": this.get('startOffsetRadius') ?? 0, 
        "angle": this.get('startOffsetAngle') ?? 0
      }
    }
    bezierCoordinates.start = this.calculateOffsetPoint(startgiven, startoffset, bezierData.start.connection.radius, bezierData.start.connection.angle)

    const endgiven = {x: this.get('endx') ?? 300, y: this.get('endy') ?? 300}
    const endoffset = {x: (this.get('endWidth') ?? 10)/2, y: (this.get('endHeight') ?? 10)/2}
    bezierData.end = {
      "point": endgiven, 
      "offsetpoint": endoffset, 
      "connection": {
        "radius": this.get('endOffsetRadius') ?? 0, 
        "angle": this.get('endOffsetAngle') ?? 0
      }
    }
    bezierCoordinates.end = this.calculateOffsetPoint(endgiven, endoffset, bezierData.end.connection.radius, bezierData.end.connection.angle)

    const cp1given = {x: this.get('cp1x') ?? 100, y: this.get('cp1y') ?? 300}
    const cp1offset = {x: (this.get('cp1Width') ?? 10)/2, y: (this.get('cp1Height') ?? 10)/2}
    bezierData.control1 = {
      "point": cp1given, 
      "offsetpoint": cp1offset, 
      "connection": {
        "radius": this.get('cp1OffsetRadius') ?? 0, 
        "angle": this.get('cp1OffsetAngle') ?? 0
      }
    }
    bezierCoordinates.control1 = this.calculateOffsetPoint(cp1given, cp1offset, bezierData.control1.connection.radius, bezierData.control1.connection.angle)

    const cp2given = {x: this.get('cp2x') ?? 300, y: this.get('cp2y') ?? 100}
    const cp2offset = {x: (this.get('cp2Width') ?? 10)/2, y: (this.get('cp2Height') ?? 10)/2}
    bezierData.control2 = {
      "point": cp2given, 
      "offsetpoint": cp2offset, 
      "connection": {
        "radius": this.get('cp2OffsetRadius') ?? 0, 
        "angle": this.get('cp2OffsetAngle') ?? 0
      }
    }
    bezierCoordinates.control2 = this.calculateOffsetPoint(cp2given, cp2offset, bezierData.control2.connection.radius, bezierData.control2.connection.angle)

    const checkpoints = 25
    const tValues = Array.from({ length: checkpoints }, (_, i) => (i + 1) / (checkpoints + 1));
    const samplePoints = tValues.map(t => this.deCasteljau(bezierCoordinates, t));    
    const endPoints = [bezierCoordinates.start, bezierCoordinates.end];    
    const boundsPoints = [...samplePoints, ...endPoints];

    // Use reduce to calculate bounds
    let bounds = boundsPoints.reduce(
      (bounds, { x, y }) => ({
        minX: Math.round(Math.min(bounds.minX, x)),
        minY: Math.round(Math.min(bounds.minY, y)),
        maxX: Math.round(Math.max(bounds.maxX, x)),
        maxY: Math.round(Math.max(bounds.maxY, y)),
      }),
      {
        minX: Infinity,
        minY: Infinity,
        maxX: -Infinity,
        maxY: -Infinity,
      }
    );

    bounds.width = Math.round(bounds.maxX - bounds.minX)
    bounds.height = Math.round(bounds.maxY - bounds.minY)

    // Add bounds and data to bezierCoordinates
    bezierCoordinates.bounds = bounds;
    bezierCoordinates.data = bezierData
    bezierCoordinates.id = this.get('id')

    return bezierCoordinates;
  }

  calculateOffsetPoint(initialPoint, offset, radius, angleDegrees) {
    // Convert angle from degrees to radians
    const angleRadians = angleDegrees * (Math.PI / 180);
    // Calculate the new coordinates
    const newX = Math.round(initialPoint.x + offset.x + radius * Math.cos(angleRadians));
    const newY = Math.round(initialPoint.y + offset.y + radius * Math.sin(angleRadians));
    return { x: newX, y: newY };
  }

  deCasteljau(bezierCoordinates, t=.5, split=false) {
    //  Calculates a point on a cubic Bézier curve using De Casteljau’s algorithm.
    //  @param {Object} start - The start point {x, y}.
    //  @param {Object} control1 - The first control point {x, y}.
    //  @param {Object} control2 - The second control point {x, y}.
    //  @param {Object} end - The end point {x, y}.
    //  @param {number} t - The parameter (0 <= t <= 1).
    //  @param (logic) split - if false: return the point, 
    //      or if true: returns 2 sets of coordinates for the 2 lines at split
    //  @returns {Object} The point on the curve at t {x, y} OR the 2 curves's coordinates as split at t { {curve1}, {curve2} }
    const { start, end, control1, control2 } = bezierCoordinates;
    if (t < 0 || t > 1) {
      throw new Error("t must be between 0 and 1");
    }

    // Linear interpolation between two points
    const lerp = (a, b, t) => ({
      x: (1 - t) * a.x + t * b.x,
      y: (1 - t) * a.y + t * b.y
    });

    // First level of interpolation
    const q0 = lerp(start, control1, t);  // control1 of newline1
    const q1 = lerp(control1, control2, t); // unused directly in split
    const q2 = lerp(control2, end, t); // control2 of newline2

    // Second level of interpolation
    const r0 = lerp(q0, q1, t); // control2 of newline1
    const r1 = lerp(q1, q2, t); // control1 of newline2

    // Final interpolation to get the point on the curve
    const splitpoint = lerp(r0, r1, t); // end of newline1 and start of newline2
    if (split){
      return {
        curve1: {start, q0, r0, splitpoint},
        curve2: {splitpoint, r1, q2, end}
      }
    }
    return splitpoint
  }

  // bezierPoint(bezierCoordinates, t=.5) {
  //   // alternative code, simpler math but way less clear what it is doing...
  //   // also doesn't provide the splitting info easily
  //   // Compute Bézier point for a given t
  //   const { start, control1, control2, end } = bezierCoordinates;
  //   const mt = 1 - t;
  //   point = {
  //     x: (mt**3) * start.x +
  //       3 * (mt*mt) * t * control1.x +
  //       3 * mt * (t*t) * control2.x +
  //       (t**3) * end.x,
  //     y: (mt**3) * start.y +
  //       3 * (mt*mt) * t * control1.y +
  //       3 * mt * (t*t) * control2.y +
  //       (t**3) * end.y
  //   }
  //   return point
  // }

}
