import { widgets } from "../serverstate";

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
    const bezierCoordinates = this.lineCoordinates()
    if (bezierCoordinates) {
      const spotPositions = this.getSpotPositions()
      const spotLocations = this.getCurrentBezierCurvePoints(bezierCoordinates, spotPositions)
      if (spotLocations){
        await this.set("spotLocations", spotLocations)
      }
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
      const svgid = "svg_" + this.get('id') 
      const oldLine = this.domElement.querySelector(`#${svgid}`);
      if (oldLine) {
        // If an SVG element exists, replace it with the new one
        this.domElement.replaceChild(svg, oldLine);
        
        /* enable for green boundary box debugging
         const allGroupElements = this.domElement.querySelectorAll('g');
        const allRectElements = this.domElement.querySelectorAll('rect');
        allGroupElements.forEach((groupElement, index) => {
            try {
                const bbox = groupElement.getBBox();
                allRectElements[0].setAttribute("x", bbox.x);
                allRectElements[0].setAttribute("y", bbox.y);
                allRectElements[0].setAttribute("width", bbox.width);
                allRectElements[0].setAttribute("height", bbox.height);
            } catch (e) {
                console.error(`getBBox() failed for <svg> #${index + 1}:`, e);
            }
        });
        */      
      } else {
        // If no SVG element exists, append the new SVG
        this.domElement.appendChild(svg);
      }
    }
  }

  makeSVGBezierCurve(){
    const ns = "http://www.w3.org/2000/svg"
    let svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const svgid = "svg_" + this.get('id')
    svg.setAttribute("id", svgid);
    svg.setAttribute("xmlns", ns); // explicitly needed

    /* enable for bbox debugging
    const rect1 = document.createElementNS("http://www.w3.org/2000/svg", 'rect');
    rect1.setAttribute("id", `${svgid}_bounds`);
    rect1.setAttribute("stroke", "#00ff00");
    rect1.setAttribute("stroke-width", 5);
    rect1.setAttribute("fill", "none");
    svg.appendChild(rect1)
    */

    let g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("id", `${svgid}_group`);
    const strokeColor = this.get("strokeColor") ?? '#1f5ca6'
    const fillColor = this.get("fillColor") ?? 'none'
    const strokeWidth = this.get("strokeWidth") ?? 10
    const borderFudge = this.get("borderFudge") ?? 10

    const bezierCoordinates = this.lineCoordinates()

    // Create a path element for the bezier curve
    let path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    let pathstring = `M${bezierCoordinates.start.x},${bezierCoordinates.start.y} `
    pathstring += `C${bezierCoordinates.control1.x},${bezierCoordinates.control1.y},`
    pathstring += `${bezierCoordinates.control2.x},${bezierCoordinates.control2.y},`
    pathstring += `${bezierCoordinates.end.x},${bezierCoordinates.end.y}`
    path.setAttribute("d", pathstring);
    path.setAttribute("stroke", strokeColor);
    path.setAttribute("fill", fillColor);
    path.setAttribute("stroke-width", strokeWidth);
    g.appendChild(path)

    let c1path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    let c1pathstring = `M${bezierCoordinates.start.x},${bezierCoordinates.start.y} `
    c1pathstring += `L${bezierCoordinates.control1.x},${bezierCoordinates.control1.y},`
    c1path.setAttribute("d", c1pathstring);
    c1path.setAttribute("class", "controlPointLine");
    c1path.setAttribute("stroke", "#333");
    c1path.setAttribute("stroke-width", 1);
    g.appendChild(c1path)

    let c2path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    let c2pathstring = `M${bezierCoordinates.end.x},${bezierCoordinates.end.y} `
    c2pathstring += `L${bezierCoordinates.control2.x},${bezierCoordinates.control2.y},`
    c2path.setAttribute("d", c2pathstring);
    c2path.setAttribute("class", "controlPointLine");
    c2path.setAttribute("stroke", "#333");
    c2path.setAttribute("stroke-width", 1);
    g.appendChild(c2path)

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

    // Not enabled, will allow Autosizing Spots size to fix space
    // if (spotSize == "auto"){
    //   let spotCount = spotPositions.length
    //   if (this.get("manualSpots") || spotCount<3 ){
    //     spotSize = 10;
    //     console.log("ManualSpots or not enough spots. AutoSizing disabled.  Using 10 for size")
    //   } else {
    //     // let distance = 0
    //     let maximumsize = 1000
    //     for (let i = 1; i < spotCount; i++) {
    //       let pointA = path.getPointAtLength(spotPositions[i] * pathLength);
    //       let pointB = path.getPointAtLength(spotPositions[i-1] * pathLength);
    //       let spacing = Math.hypot(pointA.x - pointB.x, pointA.y - pointB.y);
    //       // distance += spacing
    //       if (maximumsize > spacing - (spotSize2/2)){
    //         maximumsize = Math.floor(spacing - (spotSize2/2))
    //       }
    //     }
    //     spotSize = Math.max(maximumsize, 10)
    //   }
    // }

    // Disabled code because SVG results don't match my non-SVG calcs, so I use that 
    // spotLocation.forEach(spot => {
    //   index++
    //   // angle/rotation calculations
    //   let dx = 0
    //   let dy = 0
    //   const point = path.getPointAtLength(spot * pathLength);
    //   if (spot == 1) {
    //     // handle the end of the line, look back instead
    //     const nextPointBackward = path.getPointAtLength((spot - .01) * pathLength);
    //     dx = point.x - nextPointBackward.x;
    //     dy = point.y - nextPointBackward.y;
    //   } else {
    //     const nextPointForward = path.getPointAtLength((spot + .01) * pathLength);
    //     dx = nextPointForward.x - point.x;
    //     dy = nextPointForward.y - point.y;
    //   }
    //   // Calculate the angle
    //   let angle = Math.round(Math.atan2(dy, dx) * (180 / Math.PI));
    //   const pointx = Math.round(point.x)
    //   const pointy = Math.round(point.y)
  
    const spotLocations = this.getCurrentBezierCurvePoints(bezierCoordinates, spotPositions)
    for (const key in spotLocations){
      let spotlocation = spotLocations[key]
      if (spotType == "rectangle" || spotType == "square"){
        let rect = document.createElementNS("http://www.w3.org/2000/svg", 'rect');
        if (spotType == "square"){
          spotSize2 = spotSize
        }
        const rectx = spotlocation.x - (spotSize/2)
        const recty = spotlocation.y - (spotSize2/2)
        rect.setAttribute('x', rectx);
        rect.setAttribute('y', recty);
        rect.setAttribute('width', spotSize);
        rect.setAttribute('height', spotSize2);
        let angle = 0
        if (spotRotateOverride){
          angle = spotRotate
        } else {
          angle = spotlocation.orientation + spotRotate
        }
        rect.setAttribute("transform", `rotate(${angle} ${spotlocation.x} ${spotlocation.y})`);
        rect.setAttribute("stroke", spotStrokeColor);
        rect.setAttribute("fill", spotFillColor);
        rect.setAttribute("stroke-width", spotStrokeWidth);
        // Add the rect to the SVG
        g.appendChild(rect)
      } else if (spotType == "circle") {
        // Create a circle element for the point
        let circle = document.createElementNS("http://www.w3.org/2000/svg", 'circle');
        circle.setAttribute('cx', spotlocation.x);
        circle.setAttribute('cy', spotlocation.y);
        circle.setAttribute('r', (spotSize/2)); // Radius of the circle
        circle.setAttribute("stroke", spotStrokeColor);
        circle.setAttribute("fill", spotFillColor);
        circle.setAttribute("stroke-width", spotStrokeWidth);
        // Add the circle to the SVG
        g.appendChild(circle)
      }
    }
    svg.appendChild(g)

    svg.setAttribute("style", `overflow: visible; position: relative; top: ${bezierCoordinates.bounds.minY}px; left: ${bezierCoordinates.bounds.minX}px;`);
    // svg.setAttribute("style", `position: absolute; top: 0px; left: 0px;`);
    // svg.setAttribute("style", `position: absolute; top: -${edgeadjustment}px; left: -${edgeadjustment}px;`);
    svg.setAttribute("width", bezierCoordinates.bounds.width);
    svg.setAttribute("height", bezierCoordinates.bounds.height);
    svg.setAttribute("viewBox", `${bezierCoordinates.bounds.minX} ${bezierCoordinates.bounds.minY} ${bezierCoordinates.bounds.width} ${bezierCoordinates.bounds.height}`);

    return svg
  }
 
  getCurrentBezierCurvePoints(bezierCoordinates, spotPositions) {
    // this is the non-svg method
    let spotLocations = {}
    let index = 0
    if (spotPositions[0] == 0) {
      index = -1
    }

    const lineid = this.get("id")
    let inheriting = false
    const inheritcheck = StateManaged.inheritFromMapping[lineid]
    if (inheritcheck){
      inheriting = this.notifyInheritance(lineid, "spotLocations", inheritcheck)
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
      let pointx = Math.round(point.x)
      let pointy = Math.round(point.y)
      let centeredx = pointx
      let centeredy = pointy

      if (inheriting){
        const spotsearch = `spotLocations.spot_${index}`
        const xspot = spotsearch + ".centeredx"
        const yspot = spotsearch + ".centeredy"
        const xsearch = this.findHeirsForProperty(inheriting, lineid, xspot)
        const ysearch = this.findHeirsForProperty(inheriting, lineid, yspot)
        if (xsearch.length){
          if (xsearch.length > 1){
            // you have multiple things inheriting the same spotc TBD
            console.log("Not implemented yet")
          } else {
            if (widgets.has(xsearch[0].destination)){
              centeredx -= (widgets.get(xsearch[0].destination).get('width') ?? 0)/2
            }
          }
        }
        if (ysearch.length){
          if (ysearch.length > 1){
            // you have multiple things inheriting the same spotc TBD
            console.log("Not implemented yet")
          } else {
            if (widgets.has(ysearch[0].destination)){
              centeredy -= (widgets.get(ysearch[0].destination).get('height') ?? 0)/2
            }
          }
        }
      }

      spotLocations[`spot_${index}`] = {
        "x": pointx, 
        "y": pointy,
        "centeredx": centeredx, 
        "centeredy": centeredy,
        "spot": spot,
        "orientation": angle
      }
    })
    return spotLocations
  }

  getSpotPositions(){
    const manualspots = this.get("manualSpots")
    if (manualspots) {
      return manualspots
    }

    const spotcount = this.get("autoSpots") ?? 3
    let spotPositions = Array.from({ length: spotcount }, (_, i) => Number(((i + 1) / (spotcount + 1)).toFixed(3)));

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
    
    // parented coordinate points are all relative to the line's origin X,Y
    // add better sanity checks here
    const startgiven = {x: this.get('startx') ?? 0, y: this.get('starty') ?? 0}
    const startoffset = {x: (this.get('startWidth') ?? 30)/2, y: (this.get('startHeight') ?? 30)/2}
    bezierData.start = {
      "point": startgiven,
      "offsetpoint": startoffset, 
      "connection": {
        "radius": this.get('startOffsetRadius') ?? 0, 
        "angle": this.get('startOffsetAngle') ?? 0
      }
    }
    bezierCoordinates.start = this.calculateOffsetPoint(startgiven, startoffset, bezierData.start.connection.radius, bezierData.start.connection.angle)

    const endgiven = {x: this.get('endx') ?? 200, y: this.get('endy') ?? 200}
    const endoffset = {x: (this.get('endWidth') ?? 30)/2, y: (this.get('endHeight') ?? 30)/2}
    bezierData.end = {
      "point": endgiven, 
      "offsetpoint": endoffset, 
      "connection": {
        "radius": this.get('endOffsetRadius') ?? 0, 
        "angle": this.get('endOffsetAngle') ?? 0
      }
    }
    bezierCoordinates.end = this.calculateOffsetPoint(endgiven, endoffset, bezierData.end.connection.radius, bezierData.end.connection.angle)

    const cp1given = {x: this.get('cp1x') ?? 0, y: this.get('cp1y') ?? 200}
    const cp1offset = {x: (this.get('cp1Width') ?? 30)/2, y: (this.get('cp1Height') ?? 30)/2}
    bezierData.control1 = {
      "point": cp1given, 
      "offsetpoint": cp1offset, 
      "connection": {
        "radius": this.get('cp1OffsetRadius') ?? 0, 
        "angle": this.get('cp1OffsetAngle') ?? 0
      }
    }
    bezierCoordinates.control1 = this.calculateOffsetPoint(cp1given, cp1offset, bezierData.control1.connection.radius, bezierData.control1.connection.angle)

    const cp2given = {x: this.get('cp2x') ?? 200, y: this.get('cp2y') ?? 0}
    const cp2offset = {x: (this.get('cp2Width') ?? 30)/2, y: (this.get('cp2Height') ?? 30)/2}
    bezierData.control2 = {
      "point": cp2given, 
      "offsetpoint": cp2offset, 
      "connection": {
        "radius": this.get('cp2OffsetRadius') ?? 0, 
        "angle": this.get('cp2OffsetAngle') ?? 0
      }
    }
    bezierCoordinates.control2 = this.calculateOffsetPoint(cp2given, cp2offset, bezierData.control2.connection.radius, bezierData.control2.connection.angle)

    bezierCoordinates.center = this.deCasteljau(bezierCoordinates, .5)

    const checkpoints = 25
    const tValues = Array.from({ length: checkpoints }, (_, i) => (i + 1) / (checkpoints + 1));
    const samplePoints = tValues.map(t => this.deCasteljau(bezierCoordinates, t));    
    const endPoints = [bezierCoordinates.start, bezierCoordinates.end ];    
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

  calculateOffsetPoint(initialPoint, localoffset, radius, angleDegrees) {
    // Convert angle from degrees to radians
    const angleRadians = angleDegrees * (Math.PI / 180);
    // Calculate the new coordinates
    const newX = Math.round(initialPoint.x + localoffset.x + (radius * Math.cos(angleRadians)));
    const newY = Math.round(initialPoint.y + localoffset.y + (radius * Math.sin(angleRadians)));
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
