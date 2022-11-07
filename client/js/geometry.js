export function center(e) {
  const rect = e.getBoundingClientRect();
  return {x:rect.left + rect.width/2, y:rect.top + rect.height/2};
}

export function distance(a, b) {
  return Math.sqrt((a.x-b.x)**2 + (a.y-b.y)**2);
}

export function overlap(a, b) {
  const aR = a.getBoundingClientRect();
  const bR = b.getBoundingClientRect();

  return !(aR.top+aR.height <= bR.top || aR.top >= bR.top+bR.height || aR.left+aR.width <= bR.left || aR.left >= bR.left+bR.width);
}

export function getOffset(origin, target) {
  return {x: target.x - origin.x, y: target.y - origin.y}
}

export function getScreenSpaceTransform(e) {
  if (!e)
    return new DOMMatrix();
  let matrix = getScreenSpaceTransform(e.offsetParent);
  matrix.translateSelf(e.offsetLeft, e.offsetTop);
  matrix.multiplySelf(new DOMMatrix(getComputedStyle(e).transform));
  return matrix;
}

export function screenCoordFromLocalPoint(e, p) {
  let matrix = getScreenSpaceTransform(e);
  return matrix.transformPoint(new DOMPoint(p.x, p.y));
}

export function applyTransformedOffset(origin, offset, scale, rotation) {
  if(rotation % 360 == 0) {
    return {x: origin.x + offset.x * scale, y: origin.y + offset.y * scale}
  } else {
    const dist = distance({x:0,y:0},offset) * scale;
    const angle = Math.atan2(offset.y ,offset.x) + rotation * Math.PI / 180;
    return {x: origin.x + dist * Math.cos(angle), y: origin.y + dist * Math.sin(angle)};
  }
}
