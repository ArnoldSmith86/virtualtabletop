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

export function overlapScore(a, b) {
  const aR = a.getBoundingClientRect();
  const bR = b.getBoundingClientRect();
  const maxOverlap = Math.min(aR.width, bR.width) * Math.min(aR.height, bR.height);
  const area = Math.max(Math.min(aR.right, bR.right) - Math.max(aR.left, bR.left), 0) * Math.max(Math.min(aR.bottom, bR.bottom) - Math.max(aR.top, bR.top), 0);
  return maxOverlap ? area / maxOverlap : 0;
}

export function getOffset(origin, target) {
  return {x: target.x - origin.x, y: target.y - origin.y}
}

export function applyTransformedOffset(origin, offset, s, rotation) {
  if(rotation % 360 == 0) {
    return {x: origin.x + offset.x * s, y: origin.y + offset.y * s}
  } else {
    const dist = distance({x:0,y:0},offset) * s;
    const angle = Math.atan2(offset.y ,offset.x) + rotation * Math.PI / 180;
    return {x: origin.x + dist * Math.cos(angle), y: origin.y + dist * Math.sin(angle)};
  }
}
