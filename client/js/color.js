export function hexRGB(inputColor) {
  let hex = inputColor.replace('#', '');
  var rgb = hex.match(new RegExp('(.{' + hex.length/3 + '})', 'g')).map(function(l) {
    return parseInt(hex.length%2 ? l+l : l, 16);
  });
  return `rgb(${rgb.join(',')})`;    
}