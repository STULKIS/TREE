/**
 * CPU still renderer: projects the real mesh, painter-sorts triangles far→near,
 * flat-shades from baked vertex colours, tone-maps, and composites a backdrop,
 * soil disc, contact shadow and vignette. No WebGL, no DOM — writes into a
 * plain RGBA byte buffer so it also runs in Node for tests.
 *
 * Budget: `maxTriangles` (default 70k). When over budget, leaf cards are thinned
 * as whole fans (never per triangle) and sub-pixel slivers are culled.
 */

export const STILL_DEFAULTS = Object.freeze({
  width: 1280,
  height: 800,
  maxTriangles: 70000,
  azimuth: 0.6,
  elevation: 0.22,
  zoom: 1,
  fov: 38,
  background: [0.055, 0.07, 0.065],
  horizon: [0.16, 0.19, 0.17],
  soil: [0.11, 0.1, 0.085],
  keyLight: [-0.45, 0.8, 0.4],
  exposure: 1.05
});

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const linearToSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

function aces(x) {
  const a = 2.51;
  const b = 0.03;
  const c = 2.43;
  const d = 0.59;
  const e = 0.14;
  return Math.max(0, Math.min(1, (x * (a * x + b)) / (x * (c * x + d) + e)));
}

function toneMap(r, g, b, exposure) {
  return [
    linearToSrgb(aces(r * exposure)),
    linearToSrgb(aces(g * exposure)),
    linearToSrgb(aces(b * exposure))
  ];
}

/** Build a camera framing the given bounds. */
export function frameCamera(bounds, opts) {
  const cx = (bounds.min[0] + bounds.max[0]) / 2;
  const cy = (bounds.min[1] + bounds.max[1]) / 2;
  const cz = (bounds.min[2] + bounds.max[2]) / 2;
  const h = Math.max(0.5, bounds.max[1] - bounds.min[1]);
  const w = Math.max(0.5, bounds.max[0] - bounds.min[0], bounds.max[2] - bounds.min[2]);
  const radius = Math.max(h * 0.54, w * 0.46) * 1.06;
  const aspect = opts.width / opts.height;
  const fov = (opts.fov * Math.PI) / 180;
  const fitFov = aspect >= 1 ? fov : 2 * Math.atan(Math.tan(fov / 2) * aspect);
  const dist = (radius / Math.sin(fitFov / 2)) / opts.zoom;
  const az = opts.azimuth;
  const el = opts.elevation;
  const eye = [
    cx + Math.cos(el) * Math.sin(az) * dist,
    cy + Math.sin(el) * dist,
    cz + Math.cos(el) * Math.cos(az) * dist
  ];
  const target = [cx, cy * 0.96, cz];
  return buildView(eye, target, fov, aspect);
}

function buildView(eye, target, fov, aspect) {
  let f = [target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]];
  const fl = Math.hypot(f[0], f[1], f[2]) || 1;
  f = [f[0] / fl, f[1] / fl, f[2] / fl];
  const up = [0, 1, 0];
  let r = [f[1] * up[2] - f[2] * up[1], f[2] * up[0] - f[0] * up[2], f[0] * up[1] - f[1] * up[0]];
  const rl = Math.hypot(r[0], r[1], r[2]) || 1;
  r = [r[0] / rl, r[1] / rl, r[2] / rl];
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const focal = 1 / Math.tan(fov / 2);
  return { eye, forward: f, right: r, up: u, focal, aspect };
}

/** Project a world point to normalised device coords + depth. */
function project(cam, x, y, z, out) {
  const dx = x - cam.eye[0];
  const dy = y - cam.eye[1];
  const dz = z - cam.eye[2];
  const px = dx * cam.right[0] + dy * cam.right[1] + dz * cam.right[2];
  const py = dx * cam.up[0] + dy * cam.up[1] + dz * cam.up[2];
  const pz = dx * cam.forward[0] + dy * cam.forward[1] + dz * cam.forward[2];
  out[0] = (px * cam.focal) / (cam.aspect * Math.max(1e-4, pz));
  out[1] = (py * cam.focal) / Math.max(1e-4, pz);
  out[2] = pz;
}

/**
 * Collect shaded, projected triangles from a geometry.
 */
function collect(geom, cam, width, height, light, twoSided, cardTriangles, keepEveryCard, list) {
  const { positions, normals, colors, indices } = geom;
  const vcount = positions.length / 3;
  const sx = new Float32Array(vcount);
  const sy = new Float32Array(vcount);
  const sz = new Float32Array(vcount);
  const tmp = [0, 0, 0];
  for (let i = 0; i < vcount; i++) {
    project(cam, positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2], tmp);
    sx[i] = (tmp[0] * 0.5 + 0.5) * width;
    sy[i] = (0.5 - tmp[1] * 0.5) * height;
    sz[i] = tmp[2];
  }
  const triCount = indices.length / 3;
  const stride = cardTriangles > 0 ? cardTriangles : 1;
  let culled = 0;
  for (let t = 0; t < triCount; t++) {
    if (cardTriangles > 0 && keepEveryCard > 1) {
      const card = Math.floor(t / stride);
      if (card % keepEveryCard !== 0) continue;
    }
    const a = indices[t * 3];
    const b = indices[t * 3 + 1];
    const c = indices[t * 3 + 2];
    const za = sz[a];
    const zb = sz[b];
    const zc = sz[c];
    if (za <= 0.01 || zb <= 0.01 || zc <= 0.01) continue; // behind camera
    const ax = sx[a];
    const ay = sy[a];
    const bx = sx[b];
    const by = sy[b];
    const cx = sx[c];
    const cy = sy[c];
    const minX = Math.min(ax, bx, cx);
    const maxX = Math.max(ax, bx, cx);
    const minY = Math.min(ay, by, cy);
    const maxY = Math.max(ay, by, cy);
    if (maxX < 0 || maxY < 0 || minX >= width || minY >= height) continue;
    const area2 = Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay));
    if (area2 < 0.6 && maxX - minX < 1.2 && maxY - minY < 1.2) {
      culled++;
      continue; // sub-pixel sliver
    }
    // Shade: averaged vertex normal and colour
    let nx = (normals[a * 3] + normals[b * 3] + normals[c * 3]) / 3;
    let ny = (normals[a * 3 + 1] + normals[b * 3 + 1] + normals[c * 3 + 1]) / 3;
    let nz = (normals[a * 3 + 2] + normals[b * 3 + 2] + normals[c * 3 + 2]) / 3;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl;
    ny /= nl;
    nz /= nl;
    let ndl = nx * light[0] + ny * light[1] + nz * light[2];
    if (twoSided) ndl = Math.abs(ndl);
    else ndl = Math.max(0, ndl);
    const hemi = 0.5 + 0.5 * ny; // sky from above
    const shade = 0.22 + 0.2 * hemi + 0.85 * ndl;
    const cr = (colors[a * 3] + colors[b * 3] + colors[c * 3]) / 3;
    const cg = (colors[a * 3 + 1] + colors[b * 3 + 1] + colors[c * 3 + 1]) / 3;
    const cb = (colors[a * 3 + 2] + colors[b * 3 + 2] + colors[c * 3 + 2]) / 3;
    list.push({
      ax, ay, bx, by, cx, cy,
      z: (za + zb + zc) / 3,
      r: srgbToLinear(cr) * shade,
      g: srgbToLinear(cg) * shade,
      b: srgbToLinear(cb) * shade
    });
  }
  return culled;
}

/** Fill a flat-coloured triangle into an RGBA buffer (scanline). */
function fillTriangle(data, width, height, t, rgb) {
  let x0 = t.ax;
  let y0 = t.ay;
  let x1 = t.bx;
  let y1 = t.by;
  let x2 = t.cx;
  let y2 = t.cy;
  // sort by y
  if (y1 < y0) { [x0, x1] = [x1, x0]; [y0, y1] = [y1, y0]; }
  if (y2 < y0) { [x0, x2] = [x2, x0]; [y0, y2] = [y2, y0]; }
  if (y2 < y1) { [x1, x2] = [x2, x1]; [y1, y2] = [y2, y1]; }
  const yStart = Math.max(0, Math.ceil(y0 - 0.5));
  const yEnd = Math.min(height - 1, Math.floor(y2 - 0.5));
  if (yEnd < yStart) {
    // Thin horizontal sliver: still mark the centre pixel so distant leaves don't vanish
    const py = Math.round((y0 + y2) / 2);
    const px = Math.round((x0 + x1 + x2) / 3);
    if (px >= 0 && px < width && py >= 0 && py < height) putPixel(data, (py * width + px) * 4, rgb);
    return;
  }
  const R = rgb[0];
  const G = rgb[1];
  const B = rgb[2];
  for (let y = yStart; y <= yEnd; y++) {
    const yc = y + 0.5;
    let xa;
    let xb;
    // long edge 0→2
    const t02 = (yc - y0) / Math.max(1e-6, y2 - y0);
    xa = x0 + (x2 - x0) * t02;
    if (yc < y1) {
      const t01 = (yc - y0) / Math.max(1e-6, y1 - y0);
      xb = x0 + (x1 - x0) * t01;
    } else {
      const t12 = (yc - y1) / Math.max(1e-6, y2 - y1);
      xb = x1 + (x2 - x1) * t12;
    }
    if (xb < xa) { const tmp = xa; xa = xb; xb = tmp; }
    let xs = Math.max(0, Math.ceil(xa - 0.5));
    let xe = Math.min(width - 1, Math.floor(xb - 0.5));
    if (xe < xs) {
      // sub-pixel wide span: paint one pixel
      const px = Math.round((xa + xb) / 2);
      if (px >= 0 && px < width) {
        const o = (y * width + px) * 4;
        data[o] = R; data[o + 1] = G; data[o + 2] = B; data[o + 3] = 255;
      }
      continue;
    }
    let o = (y * width + xs) * 4;
    for (let x = xs; x <= xe; x++) {
      data[o] = R; data[o + 1] = G; data[o + 2] = B; data[o + 3] = 255;
      o += 4;
    }
  }
}

function putPixel(data, o, rgb) {
  data[o] = rgb[0];
  data[o + 1] = rgb[1];
  data[o + 2] = rgb[2];
  data[o + 3] = 255;
}

/** Paint the gradient backdrop, soil disc and contact shadow. */
function paintBackdrop(data, width, height, cam, bounds, opts) {
  const bg = opts.background;
  const hz = opts.horizon;
  const soil = opts.soil;
  // Project the soil disc: sample a ring in world space and fill as an ellipse via per-pixel inverse? Simpler:
  // project the ground plane per-pixel by ray casting against y=0 for the lower half.
  const cx = (bounds.min[0] + bounds.max[0]) / 2;
  const cz = (bounds.min[2] + bounds.max[2]) / 2;
  const spread = Math.max(bounds.max[0] - bounds.min[0], bounds.max[2] - bounds.min[2], 1);
  const discR = spread * 0.75;
  const shadowR = spread * 0.42;
  const exposure = opts.exposure;
  for (let y = 0; y < height; y++) {
    const v = y / (height - 1);
    const ndcY = 1 - v * 2;
    // vertical gradient: sky at top → horizon → floor
    const g = Math.pow(v, 1.4);
    let br = bg[0] + (hz[0] - bg[0]) * g;
    let bgc = bg[1] + (hz[1] - bg[1]) * g;
    let bb = bg[2] + (hz[2] - bg[2]) * g;
    for (let x = 0; x < width; x++) {
      const u = x / (width - 1);
      const ndcX = u * 2 - 1;
      let r = br;
      let gg = bgc;
      let b = bb;
      // ray through pixel
      const dx = (ndcX * cam.aspect) / cam.focal;
      const dy = ndcY / cam.focal;
      const rx = cam.forward[0] + cam.right[0] * dx + cam.up[0] * dy;
      const ry = cam.forward[1] + cam.right[1] * dx + cam.up[1] * dy;
      const rz = cam.forward[2] + cam.right[2] * dx + cam.up[2] * dy;
      if (ry < -1e-4) {
        const tHit = -cam.eye[1] / ry;
        const wx = cam.eye[0] + rx * tHit;
        const wz = cam.eye[2] + rz * tHit;
        const d = Math.hypot(wx - cx, wz - cz);
        if (d < discR) {
          const edge = Math.min(1, (discR - d) / (discR * 0.35));
          const sh = d < shadowR ? 1 - Math.pow(d / shadowR, 2) : 0;
          const k = 1 - 0.55 * sh;
          r += (soil[0] * k - r) * edge;
          gg += (soil[1] * k - gg) * edge;
          b += (soil[2] * k - b) * edge;
        }
      }
      // vignette
      const vx = ndcX;
      const vy = ndcY;
      const vig = 1 - 0.28 * Math.pow(Math.min(1, (vx * vx + vy * vy) / 1.6), 1.3);
      const tm = toneMap(r * vig, gg * vig, b * vig, exposure);
      const o = (y * width + x) * 4;
      data[o] = tm[0] * 255;
      data[o + 1] = tm[1] * 255;
      data[o + 2] = tm[2] * 255;
      data[o + 3] = 255;
    }
  }
}

/**
 * Render a tree result to an RGBA buffer.
 * @param {{bark:object, foliage:object, bounds:object}} tree
 * @param {Partial<typeof STILL_DEFAULTS>} [options]
 * @returns {{data:Uint8ClampedArray,width:number,height:number,triangles:number,culled:number,ms:number}}
 */
export function renderStill(tree, options = {}) {
  const opts = { ...STILL_DEFAULTS, ...options };
  const width = Math.max(8, Math.floor(opts.width));
  const height = Math.max(8, Math.floor(opts.height));
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const data = new Uint8ClampedArray(width * height * 4);
  const bounds = tree.bounds || { min: [-1, 0, -1], max: [1, 2, 1] };
  const cam = frameCamera(bounds, { ...opts, width, height });
  paintBackdrop(data, width, height, cam, bounds, opts);

  const light = normalizeLight(opts.keyLight);
  const list = [];
  let culled = 0;
  const barkTris = tree.bark ? tree.bark.indices.length / 3 : 0;
  const foliage = tree.foliage;
  const cardTris = foliage && foliage.cardTriangles ? foliage.cardTriangles : 0;
  const leafTris = foliage ? foliage.indices.length / 3 : 0;
  // Budget: thin leaves as whole cards when over
  let keepEvery = 1;
  // Foliage always keeps at least 40% of the budget; bark beyond its share is cut far-first below.
  const available = leafTris > 0 ? Math.max(Math.floor(opts.maxTriangles * 0.4), opts.maxTriangles - barkTris) : 0;
  if (leafTris > available && cardTris > 0 && available > 0) {
    keepEvery = Math.ceil(leafTris / available);
  }
  if (tree.bark) culled += collect(tree.bark, cam, width, height, light, false, 0, 1, list);
  if (foliage && leafTris > 0 && available > 0) {
    culled += collect(foliage, cam, width, height, light, true, cardTris, keepEvery, list);
  }
  // Hard cap for safety (bark alone over budget): drop the farthest triangles first
  list.sort((a, b) => b.z - a.z);
  let start = 0;
  if (list.length > opts.maxTriangles) start = list.length - opts.maxTriangles;
  const rgb = [0, 0, 0];
  for (let i = start; i < list.length; i++) {
    const t = list[i];
    const tm = toneMap(t.r, t.g, t.b, opts.exposure);
    rgb[0] = tm[0] * 255;
    rgb[1] = tm[1] * 255;
    rgb[2] = tm[2] * 255;
    fillTriangle(data, width, height, t, rgb);
  }
  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return { data, width, height, triangles: list.length - start, culled, keepEvery, ms: t1 - t0 };
}

function normalizeLight(l) {
  const n = Math.hypot(l[0], l[1], l[2]) || 1;
  return [l[0] / n, l[1] / n, l[2] / n];
}

/** Blit a rendered still onto a Canvas2D context (browser only). */
export function blitStill(ctx, still) {
  const img = ctx.createImageData(still.width, still.height);
  img.data.set(still.data);
  ctx.putImageData(img, 0, 0);
}
