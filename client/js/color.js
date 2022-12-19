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
  // Function created by https://chat.openai.com/chat
  let hex = toHex(inputColor);
  let rgbString = toRGB(hex);
  let [r, g, b] = rgbString.match(/\d+/g).map(str => parseInt(str, 10));
  let RsRGB = r / 255;
  let GsRGB = g / 255;
  let BsRGB = b / 255;
  let R, G, B;
  function applyGammaCorrection(value) {
    if (value <= 0.04045) {
      return value / 12.92;
    } else {
      return Math.pow((value + 0.055) / 1.055, 2.4);
    }
  }
  R = applyGammaCorrection(RsRGB);
  G = applyGammaCorrection(GsRGB);
  B = applyGammaCorrection(BsRGB);
  const luminance = (0.2126 * R) + (0.7152 * G) + (0.0722 * B);
  return luminance;
}

export function calcContrast(color1, color2) {
  let lum1 = calcLuminance(color1);
  let lum2 = calcLuminance(color2);
  return (Math.max(lum1,lum2)+0.05) / (Math.min(lum1,lum2)+0.05);  
}

export function contrastAnyColor(inputColor, intensity) {
  // Function created by https://chat.openai.com/chat
  let color = toHex(inputColor);
  if (intensity == 1)
    return calcContrast(color, '#000000') >= calcContrast(color, '#ffffff') ? '#000000' : '#ffffff'
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  const luminance = calcLuminance(color)
  if (luminance > 0.5) intensity = -intensity;
  const adjustColor = (r, g, b, intensity) => [r, g, b].map(c => Math.round(Math.max(0, Math.min(c + intensity * 255, 255))));
  const toHexString = (r, g, b) => '#' + r.toString(16).padStart(2, '0') + g.toString(16).padStart(2, '0') + b.toString(16).padStart(2, '0');
  return toHexString(...adjustColor(r, g, b, intensity));
}

export function calcHue(startingColors) {
  let hue = 0;
  const hues = [];
  for(const player in startingColors) {
    const hex = startingColors[player];
    const r = parseInt(hex.slice(1,3), 16) / 255;
    const g = parseInt(hex.slice(3,5), 16) / 255;
    const b = parseInt(hex.slice(5,7), 16) / 255;
    const max = Math.max(r,g,b);
    const d = max - Math.min(r,g,b);
    if(d < .25) continue;
    switch(max) {
      case r: hues.push((360 + (g - b) * 60 / d) % 360); break;
      case g: hues.push(120 + (b - r) * 60 / d); break;
      case b: hues.push(240 + (r - g) * 60 / d); break;
    }
  }
  if(hues.length == 0) {
    hue = Math.random() * 360;
  } else {
    const gaps = hues.sort((a,b)=>a-b).map((h, i, a) => (i != (a.length - 1)) ? a[i + 1 ] - h : a[0] + 360 - h);
    const gap = Math.max(...gaps);
    hue = (Math.random() * gap / 3 + hues[gaps.indexOf(gap)] + gap / 3) % 360;
  }
  const v = [240, 220, 120, 200, 240, 240];
  const value = v[Math.floor(hue/60)] * (60 - hue%60) / 60 + v[Math.ceil(hue/60) % 6] * (hue%60) / 60;
  const f = n => {
    const k = (n + hue / 30) % 12;
    const c = .5 - .5 * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(value * c).toString(16).padStart(2, '0');
  }
  return `#${f(0)}${f(8)}${f(4)}`;
}