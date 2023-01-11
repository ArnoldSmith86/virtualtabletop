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

export function getScreenTransform(elem) {
  let transform = new DOMMatrix();
  let t = new DOMPoint(10, 10);
  while (elem) {
    transform.preMultiplySelf(getElementTransform(elem));
    elem = elem.offsetParent;
  }
  return transform;
}

function parseLengths(str) {
  return str.split(' ').map(s => parseFloat(s))
}

export function dehomogenize(point) {
  return new DOMPoint(point.x / point.w, point.y / point.w, point.z / point.w);
}

export function getPointOnPlane(transform, x, y) {
  const inv = transform.inverse();
  const p0 = dehomogenize(inv.transformPoint(new DOMPoint(x, y, 0)));
  // Get transformed direction vector of ray in (0, 0, 1) direction.
  let dir = dehomogenize(inv.transformPoint(new DOMPoint(x, y, 1)));
  dir.x -= p0.x;
  dir.y -= p0.y;
  dir.z -= p0.z;
  // If the projected line is parallel with the plane, no intersection point can be determined.
  if (dir.z == 0)
    return null;
  // Find point of intersection with plane.
  const t = -p0.z / dir.z;
  return new DOMPoint(p0.x + dir.x * t, p0.y + dir.y * t, p0.z + dir.z * t);
}

export function getElementTransform(elem) {
  let transform = new DOMMatrix();
  const computedPerspective = getComputedStyle(elem).perspective;
  if (computedPerspective != 'none' && computedPerspective != '0px') {
    const perspective = parseFloat(computedPerspective);
    const perspectiveOrigin = parseLengths(getComputedStyle(elem).perspectiveOrigin);
    // From https://w3c.github.io/csswg-drafts/css-transforms-2/#PerspectiveDefined
    transform.translateSelf(perspectiveOrigin[0], perspectiveOrigin[1]);
    transform.multiplySelf(new DOMMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, -1/perspective, 0, 0, 0, 1]));
    transform.translateSelf(-perspectiveOrigin[0], -perspectiveOrigin[1]);
  }
  const computedTransform = getComputedStyle(elem).transform;
  if (computedTransform !='none') {
    const transformOrigin = parseLengths(getComputedStyle(elem).transformOrigin);
    transform.translateSelf(transformOrigin[0], transformOrigin[1]);
    transform.multiplySelf(new DOMMatrix(getComputedStyle(elem).transform));
    transform.translateSelf(-transformOrigin[0], -transformOrigin[1]);
  }
  transform.translateSelf(elem.offsetLeft, elem.offsetTop);
  return transform;
}

function closestAncestor(a, b) {
  let ancestors = new Set();
  while (a) {
    ancestors.add(a);
    a = a.offsetParent;
  }
  ancestors.add(null);
  while (!ancestors.has(b)) {
    b = b.offsetParent;
  }
  return b;
}

export function getElementTransformRelativeTo(elem, parent) {
  if (!elem.offsetParent)
    return null;
  let ancestor = closestAncestor(elem, parent);
  let transform = getElementTransform(elem);
  while (elem.offsetParent != ancestor) {
    elem = elem.offsetParent;
    transform.preMultiplySelf(getElementTransform(elem));
  }
  let destTransform = new DOMMatrix();
  while (parent != ancestor) {
    destTransform.preMultiplySelf(getElementTransform(parent));
    parent = parent.offsetParent;
  }
  return transform.preMultiplySelf(destTransform.inverse());
}
