/**
 * Dev-only software rasterizer used to sanity-check tree silhouettes without
 * a GPU. Not part of the app bundle.
 * usage: node tools/render-preview.mjs oak out.png [seed]
 */
import fs from 'node:fs';
import { PNG } from 'pngjs';
import * as THREE from 'three';
import { makeParams, SPECIES_BY_ID } from '../src/generator/params.js';
import { generateTree } from '../src/generator/tree.js';

const species = process.argv[2] || 'oak';
const out = process.argv[3] || `preview-${species}.png`;
const seed = Number(process.argv[4] || 4815);
const W = Number(process.env.W || 720);
const H = Number(process.env.H || 900);

const tree = generateTree(makeParams(species, seed));
const bounds = tree.bounds;
const center = bounds.getCenter(new THREE.Vector3());
const treeHeight = bounds.getSize(new THREE.Vector3()).y;

// Camera
const target = new THREE.Vector3(center.x, bounds.min.y + treeHeight * (Number(process.env.TY || 0.48)), center.z);
const fov = 34 * Math.PI / 180;
const zoom = Number(process.env.ZOOM || 1);
const dist = (treeHeight * 1.12 * 0.5) / Math.tan(fov / 2) / zoom;
const az = -0.5;
const el = 0.10;
const eye = new THREE.Vector3(
  target.x + Math.sin(az) * Math.cos(el) * dist,
  target.y + Math.sin(el) * dist,
  target.z + Math.cos(az) * Math.cos(el) * dist,
);
const view = new THREE.Matrix4().lookAt(eye, target, new THREE.Vector3(0, 1, 0));
const cameraMatrix = new THREE.Matrix4().multiplyMatrices(
  new THREE.Matrix4().makePerspective(-1, 1, 1, -1, 0.01, 1000),
  view.clone().invert(),
);
// manual projection instead
const viewInv = view.clone().invert();
const aspect = W / H;
const tanHalf = Math.tan(fov / 2);

const color = new Float32Array(W * H * 3);
const depth = new Float32Array(W * H).fill(Infinity);
// sky gradient
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const t = y / H;
    const vignette = Math.max(0, 1 - Math.pow((x - W / 2) / (W * 0.75), 2) - Math.pow((y - H * 0.55) / (H * 0.8), 2) * 0.4);
    const glow = Math.max(0, 1 - Math.hypot((x - W * 0.62) / W, (y - H * 0.38) / H) * 2.4);
    const horizon = Math.pow(1 - t, 1.6);
    const base = [
      0.045 + 0.11 * horizon,
      0.075 + 0.16 * horizon,
      0.055 + 0.105 * horizon,
    ];
    const warm = [0.26, 0.20, 0.11];
    const idx = (y * W + x) * 3;
    for (let c = 0; c < 3; c++) color[idx + c] = base[c] + warm[c] * glow * 0.5 * vignette;
  }
}

// composite geometry
const geoms = [tree.barkGeometry, tree.leafGeometry].filter(Boolean);
const lightDir = new THREE.Vector3(0.5, 0.85, 0.45).normalize();
const fillDir = new THREE.Vector3(-0.7, 0.2, -0.4).normalize();
const rimDir = new THREE.Vector3(-0.3, 0.4, -0.9).normalize();

function project(p) {
  const v = p.clone().applyMatrix4(viewInv);
  // camera looks down -z; viewInv produced using lookAt: eye basis, so convert
  // world->view manually:
  return v;
}

const cameraBasis = new THREE.Matrix4().lookAt(eye, target, new THREE.Vector3(0, 1, 0));
const camWorld = cameraBasis.clone().invert();

function toView(p) {
  return p.clone().sub(eye).applyMatrix4(cameraBasis.clone().invert());
}

function srgb(x) {
  x = Math.max(0, Math.min(1, x));
  return x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}

let triCount = 0;
for (const [gi, geom] of geoms.entries()) {
  const pos = geom.getAttribute('position');
  const nor = geom.getAttribute('normal');
  const col = geom.getAttribute('color');
  const index = geom.getIndex().array;
  const isLeaf = gi === 1;
  const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  for (let i = 0; i < index.length; i += 3) {
    const ia = index[i], ib = index[i + 1], ic = index[i + 2];
    const pts = [ia, ib, ic].map((ii) => {
      const p = new THREE.Vector3().fromBufferAttribute(pos, ii);
      const n = new THREE.Vector3().fromBufferAttribute(nor, ii);
      const c = new THREE.Color().fromBufferAttribute(col, ii);
      return { p, n, c, v: toView(p) };
    });
    if (pts.some((q) => q.v.z > -0.05)) continue;
    const screen = pts.map((q) => {
      const x = (q.v.x / -q.v.z) / (tanHalf * aspect);
      const y = (q.v.y / -q.v.z) / tanHalf;
      return { x: (x * 0.5 + 0.5) * W, y: (1 - (y * 0.5 + 0.5)) * H, z: -q.v.z };
    });
    const minX = Math.max(0, Math.floor(Math.min(...screen.map((s) => s.x))));
    const maxX = Math.min(W - 1, Math.ceil(Math.max(...screen.map((s) => s.x))));
    const minY = Math.max(0, Math.floor(Math.min(...screen.map((s) => s.y))));
    const maxY = Math.min(H - 1, Math.ceil(Math.max(...screen.map((s) => s.y))));
    if (minX > maxX || minY > maxY) continue;
    const [a, b, c] = screen;
    const area = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    if (Math.abs(area) < 1e-8) continue;
    triCount++;
    // per-face normal in world
    const faceNormal = new THREE.Vector3()
      .subVectors(pts[1].p, pts[0].p)
      .cross(new THREE.Vector3().subVectors(pts[2].p, pts[0].p))
      .normalize();
    const avgP = new THREE.Vector3().add(pts[0].p).add(pts[1].p).add(pts[2].p).multiplyScalar(1 / 3);
    let shade = 0.34;
    const nDot = faceNormal.dot(lightDir);
    shade += Math.max(0, nDot) * 0.85;
    shade += Math.max(0, faceNormal.dot(fillDir)) * 0.26;
    shade += Math.pow(Math.max(0, faceNormal.dot(rimDir)), 2) * 0.22;
    if (nDot < 0) shade *= isLeaf ? 0.85 : 0.9;
    // leaf translucency boost
    if (isLeaf) shade = shade * 1.07 + 0.05;
    shade *= 0.92 + 0.16 * THREE.MathUtils.clamp((avgP.y - bounds.min.y) / treeHeight, 0, 1);
    const verts = pts.map((q) => ({ ...q, shade }));
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5, py = y + 0.5;
        const w0 = ((b.x - px) * (c.y - py) - (b.y - py) * (c.x - px)) / area;
        const w1 = ((c.x - px) * (a.y - py) - (c.y - py) * (a.x - px)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = w0 * screen[0].z + w1 * screen[1].z + w2 * screen[2].z;
        const pi = y * W + x;
        if (z >= depth[pi]) continue;
        depth[pi] = z;
        const rgb = [0, 0, 0];
        for (let ch = 0; ch < 3; ch++) {
          const cc = w0 * [pts[0].c.r, pts[0].c.g, pts[0].c.b][ch] + w1 * [pts[1].c.r, pts[1].c.g, pts[1].c.b][ch] + w2 * [pts[2].c.r, pts[2].c.g, pts[2].c.b][ch];
          rgb[ch] = cc * shade;
        }
        // fake tone map
        const idx = pi * 3;
        for (let ch = 0; ch < 3; ch++) {
          const v = rgb[ch] / (rgb[ch] + 0.75) * 1.2;
          color[idx + ch] = srgb(v);
        }
      }
    }
  }
}

// ground shadow blob
for (let y = Math.floor(H * 0.55); y < H; y++) {
  for (let x = 0; x < W; x++) {
    const dx = (x - W / 2) / (W * 0.33);
    const dy = (y - H * 0.78) / (H * 0.11);
    const d = Math.hypot(dx, dy);
    if (d < 1) {
      const idx = (y * W + x) * 3;
      const a = (1 - d) * 0.22;
      for (let ch = 0; ch < 3; ch++) color[idx + ch] *= 1 - a;
    }
  }
}

const png = new PNG({ width: W, height: H });
for (let i = 0; i < W * H; i++) {
  png.data[i * 4] = Math.round(color[i * 3] * 255);
  png.data[i * 4 + 1] = Math.round(color[i * 3 + 1] * 255);
  png.data[i * 4 + 2] = Math.round(color[i * 3 + 2] * 255);
  png.data[i * 4 + 3] = 255;
}
fs.writeFileSync(out, PNG.sync.write(png));
console.log(species, '->', out, `tris ${triCount}`, `height ${tree.stats.height.toFixed(2)}`, `leaves ${tree.stats.leaves}`);
