// Functions in color.js are called from both server and client files

export function toHex(inputColor) {
  const hexPattern = /^#([A-Fa-f0-9]{6})$/;
  if (hexPattern.test(inputColor)) {    
    return inputColor;
  }
  // server doesn't have document
  if (document == undefined) {
    return '#000000';
  }
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = inputColor;
  const hexColor = ctx.fillStyle;  
  canvas.remove();
  return hexPattern.test(hexColor) ? hexColor : '#000000';
}

export function toRGBArray(inputColor) {
  let hex = toHex(inputColor);
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16)
  ];
}

export function toRGBString(inputColor) {
  let rgbArray = toRGBArray(inputColor);
  return `rgb(${rgbArray[0]},${rgbArray[1]},${rgbArray[2]})`;  
}

export function calcLuminance(inputColor) {
  // Function partially written by https://chat.openai.com/chat
  let [r, g, b] = toRGBArray(inputColor);
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
  // Function partially written by https://chat.openai.com/chat
  let hex = toHex(inputColor);
  let [r, g, b] = toRGBArray(hex);
  const luminance = calcLuminance(hex);
  if (luminance > 0.1791) intensity = -intensity;
  if (intensity == 1)
    return '#ffffff';
  else if (intensity == -1)
    return '#000000';
  const adjustColor = (r, g, b, intensity) => [r, g, b].map(c => Math.round(Math.max(0, Math.min(c + intensity * 255, 255))));
  const toHexString = (r, g, b) => '#' + r.toString(16).padStart(2, '0') + g.toString(16).padStart(2, '0') + b.toString(16).padStart(2, '0');
  return toHexString(...adjustColor(r, g, b, intensity));
}

export function randomHue(startingColors) {
  let hue = 0;
  const hues = [];
  if (startingColors == 1) {
    startingColors = activeColors;
  }
  for(const player in startingColors) {
    const hex = toHex(startingColors[player]);
    let [r, g, b] = toRGBArray(hex).map(x => x / 255);
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
