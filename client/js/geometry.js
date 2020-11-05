function center(r) {
  return [ r.x+r.width/2, r.y+r.height/2 ];
}

function distance(a, b) {
  return Math.abs(a[0]-b[0]) + Math.abs(a[1]-b[1]);
}

function overlap(a, b) {
  return !(a.y+a.height <= b.y || a.y >= b.y+b.height || a.x+a.width <= b.x || a.x >= b.x+b.width);
}
