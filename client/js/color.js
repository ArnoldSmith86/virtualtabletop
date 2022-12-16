export function toHex(inputColor) {
  const hexPattern = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
  if (hexPattern.test(inputColor)) {    
    return inputColor;
  }
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = inputColor;
  const hexColor = ctx.fillStyle;  
  canvas.remove();
  return hexColor;
}

export function toRGB(inputColor) {
  let hex = toHex(inputColor)
  hex = hex.slice(1);
  var rgb = hex.match(new RegExp('(.{' + hex.length/3 + '})', 'g')).map(function(l) {
    return parseInt(hex.length%2 ? l+l : l, 16);
  });
  return `rgb(${rgb.join(',')})`;    
}

export function calcLuminance(inputColor) {
  let color = toHex(inputColor);
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance
}

export function contrastAnyColor(inputColor, intensity, direction) {
  // Code created by https://chat.openai.com/chat
  let color = toHex(inputColor);
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  calcLuminance(inputColor)
  const luminance = calcLuminance(inputColor)
  let modifier;  
  if (direction === -1) {
    modifier = (luminance > 0.5) ? intensity : -intensity;
  } else {
    modifier = (luminance > 0.5) ? -intensity : intensity;
  }      
  const [adjustedR, adjustedG, adjustedB] = [r,g,b].map(c => Math.round(Math.max(0, Math.min(c+ modifier * 255, 255))));
  return (
    "#" +
    adjustedR.toString(16).padStart(2, '0') +
    adjustedG.toString(16).padStart(2, '0') +
    adjustedB.toString(16).padStart(2, '0')
  )
}
