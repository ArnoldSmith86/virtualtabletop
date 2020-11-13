function center(r) {
  return [ r.p('x')+r.p('width')/2, r.p('y')+r.p('height')/2 ];
}

function distance(a, b) {
  return Math.abs(a[0]-b[0]) + Math.abs(a[1]-b[1]);
}

function overlap(a, b) {
  return !(a.p('y')+a.p('height') <= b.p('y') || a.p('y') >= b.p('y')+b.p('height') || a.p('x')+a.p('width') <= b.p('x') || a.p('x') >= b.p('x')+b.p('width'));
}
