export function hexRGB(inputColor) {
  let hex = inputColor.replace('#', '');
  var rgb = hex.match(new RegExp('(.{' + hex.length/3 + '})', 'g')).map(function(l) {
    return parseInt(hex.length%2 ? l+l : l, 16);
  });
  return `rgb(${rgb.join(',')})`;    
}

export function toHex(inputColor) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = inputColor;
  const hexColor = ctx.fillStyle;  
  return hexColor;
}
