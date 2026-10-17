/** Colour helpers operating on linear-ish 0..1 RGB triplets. */

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function rgbToHex(rgb) {
  const c = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
  return `#${c(rgb[0])}${c(rgb[1])}${c(rgb[2])}`;
}

export function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function rgbToHsl([r, g, b]) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}

export function hslToRgb([h, s, l]) {
  if (s === 0) return [l, l, l];
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)];
}

/** Shift hue (fraction of a turn), saturation and lightness (additive) of an RGB colour. */
export function shiftHsl(rgb, dh = 0, ds = 0, dl = 0) {
  const hsl = rgbToHsl(rgb);
  hsl[0] = (((hsl[0] + dh) % 1) + 1) % 1;
  hsl[1] = Math.max(0, Math.min(1, hsl[1] + ds));
  hsl[2] = Math.max(0, Math.min(1, hsl[2] + dl));
  return hslToRgb(hsl);
}

/** Autumn blend: pushes greens toward amber/red depending on `t`. */
export function autumnize(rgb, t) {
  if (t <= 0) return rgb;
  const hsl = rgbToHsl(rgb);
  // Pull hue toward 0.07 (amber) and increase saturation.
  const targetHue = 0.06;
  let dh = targetHue - hsl[0];
  if (dh > 0.5) dh -= 1;
  if (dh < -0.5) dh += 1;
  hsl[0] = (((hsl[0] + dh * t) % 1) + 1) % 1;
  hsl[1] = Math.min(1, hsl[1] + 0.25 * t);
  hsl[2] = Math.min(1, hsl[2] + 0.05 * t);
  return hslToRgb(hsl);
}
