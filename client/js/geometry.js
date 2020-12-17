function center(e) {
  const rect = e.getBoundingClientRect();
  return [ rect.left + rect.width/2, rect.top + rect.height/2 ];
}

function distance(a, b) {
  return Math.abs(a[0]-b[0]) + Math.abs(a[1]-b[1]);
}

function overlap(a, b) {
  const aR = a.getBoundingClientRect();
  const bR = b.getBoundingClientRect();

  return !(aR.top+aR.height <= bR.top || aR.top >= bR.top+bR.height || aR.left+aR.width <= bR.left || aR.left >= bR.left+bR.width);
}
