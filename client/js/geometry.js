function center(e) {
  const rect = e.getBoundingClientRect();
  return {x:rect.left + rect.width/2, y:rect.top + rect.height/2};
}

function distance(a, b) {
  return Math.sqrt((a.x-b.x)**2 + (a.y-b.y)**2);
}

function overlap(a, b) {
  const aR = a.getBoundingClientRect();
  const bR = b.getBoundingClientRect();

  return !(aR.top+aR.height <= bR.top || aR.top >= bR.top+bR.height || aR.left+aR.width <= bR.left || aR.left >= bR.left+bR.width);
}

function overlapScore(a, b) {
  const aR = a.getBoundingClientRect();
  const bR = b.getBoundingClientRect();
  const minDim = Math.min(aR.width, aR.height, bR.width, bR.height);
  const area = Math.max(Math.min(aR.right, bR.right) - Math.max(aR.left, bR.left), 0) * Math.max(Math.min(aR.bottom, bR.bottom) - Math.max(aR.top, bR.top), 0);
  return minDim ? Math.min(area / minDim**2, 1) : 0;
}

function getOffset(origin, target) {
  return {x: target.x - origin.x, y: target.y - origin.y}
}

function applyTransformedOffset(origin, offset, scale, rotation) {
  if(rotation % 360 == 0) {
    return {x: origin.x + offset.x * scale, y: origin.y + offset.y * scale}
  } else {
    const dist = distance({x:0,y:0},offset) * scale;
    const angle = Math.atan2(offset.y ,offset.x) + rotation * Math.PI / 180;
    return {x: origin.x + dist * Math.cos(angle), y: origin.y + dist * Math.sin(angle)};
  }
}
