export function toHex(inputColor) {
  const hexPattern = /^#([A-Fa-f0-9]{6})$/;
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
  let r = parseInt(hex.slice(1, 3), 16);
  let g = parseInt(hex.slice(3, 5), 16);
  let b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${r},${g},${b})`; 
}

export function calcLuminance(inputColor) {
  let hex = toHex(inputColor);
  let rgbString = toRGB(hex);
  let [r, g, b] = rgbString.match(/\d+/g).map(str => parseInt(str, 10));
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance
}

export function calcContrast(color1, color2) {
  return (Math.max(calcLuminance(color1),calcLuminance(color2))+0.05) / (Math.min(calcLuminance(color1),calcLuminance(color2))+0.05);  
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
