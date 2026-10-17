/**
 * Renders transparent species thumbnails straight from the generator.
 * Run: node tools/render-thumbs.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import * as THREE from 'three';
import { makeParams, SPECIES } from '../src/generator/params.js';
import { generateTree } from '../src/generator/tree.js';

const W = 300;
const H = 340;
const outDir = path.join(process.cwd(), 'public', 'thumbs');
fs.mkdirSync(outDir, { recursive: true });

for (const species of SPECIES) {
  const tree = generateTree(makeParams(species.id, 4815));
  const size = tree.bounds.getSize(new THREE.Vector3());
  const center = tree.bounds.getCenter(new THREE.Vector3());
  const target = new THREE.Vector3(center.x, tree.bounds.min.y + size.y * 0.48, center.z);
  const fov = 32 * Math.PI / 180;
  const dist = (Math.max(size.y, Math.max(size.x, size.z) / (W / H)) * 1.04 * 0.5) / Math.tan(fov / 2);
  const az = -0.55;
  const el = 0.16;
  const eye = new THREE.Vector3(
    target.x + Math.sin(az) * Math.cos(el) * dist,
    target.y + Math.sin(el) * dist,
    target.z + Math.cos(az) * Math.cos(el) * dist,
  );
  const cameraBasis = new THREE.Matrix4().lookAt(eye, target, new THREE.Vector3(0, 1, 0));
  const view = cameraBasis.clone().invert();
  const tanHalf = Math.tan(fov / 2);
  const aspect = W / H;

  const color = new Float32Array(W * H * 3);
  const alpha = new Float32Array(W * H);
  const depth = new Float32Array(W * H).fill(Infinity);
  const lightDir = new THREE.Vector3(0.35, 0.9, 0.5).normalize();
  const fillDir = new THREE.Vector3(-0.8, 0.3, -0.3).normalize();
  const rimDir = new THREE.Vector3(-0.3, 0.5, -0.9).normalize();

  const toView = (p) => p.clone().sub(eye).applyMatrix4(view);
  const srgb = (x) => {
    x = Math.max(0, Math.min(1, x));
    return x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
  };

  for (const [gi, geom] of [tree.barkGeometry, tree.leafGeometry].filter(Boolean).entries()) {
    const pos = geom.getAttribute('position');
    const nor = geom.getAttribute('normal');
    const col = geom.getAttribute('color');
    const index = geom.getIndex().array;
    const isLeaf = gi === 1;
    for (let i = 0; i < index.length; i += 3) {
      const ids = [index[i], index[i + 1], index[i + 2]];
      const pts = ids.map((ii) => {
        const p = new THREE.Vector3().fromBufferAttribute(pos, ii);
        return {
          p,
          c: new THREE.Color().fromBufferAttribute(col, ii),
          n: new THREE.Vector3().fromBufferAttribute(nor, ii),
          v: toView(p),
        };
      });
      if (pts.some((q) => q.v.z > -0.05)) continue;
      const screen = pts.map((q) => ({
        x: ((q.v.x / -q.v.z) / (tanHalf * aspect) * 0.5 + 0.5) * W,
        y: (1 - ((q.v.y / -q.v.z) / tanHalf * 0.5 + 0.5)) * H,
        z: -q.v.z,
      }));
      const minX = Math.max(0, Math.floor(Math.min(screen[0].x, screen[1].x, screen[2].x)));
      const maxX = Math.min(W - 1, Math.ceil(Math.max(screen[0].x, screen[1].x, screen[2].x)));
      const minY = Math.max(0, Math.floor(Math.min(screen[0].y, screen[1].y, screen[2].y)));
      const maxY = Math.min(H - 1, Math.ceil(Math.max(screen[0].y, screen[1].y, screen[2].y)));
      if (minX > maxX || minY > maxY) continue;
      const [a, b, c] = screen;
      const area = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      if (Math.abs(area) < 1e-8) continue;
      const faceNormal = new THREE.Vector3()
        .subVectors(pts[1].p, pts[0].p)
        .cross(new THREE.Vector3().subVectors(pts[2].p, pts[0].p))
        .normalize();
      let shade = 0.42;
      shade += Math.max(0, faceNormal.dot(lightDir)) * 0.72;
      shade += Math.max(0, faceNormal.dot(fillDir)) * 0.22;
      shade += Math.pow(Math.max(0, faceNormal.dot(rimDir)), 2) * 0.3;
      if (isLeaf) shade = shade * 1.06 + 0.03;
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const px = x + 0.5;
          const py = y + 0.5;
          const w0 = ((b.x - px) * (c.y - py) - (b.y - py) * (c.x - px)) / area;
          const w1 = ((c.x - px) * (a.y - py) - (c.y - py) * (a.x - px)) / area;
          const w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          const z = w0 * screen[0].z + w1 * screen[1].z + w2 * screen[2].z;
          const pi = y * W + x;
          if (z >= depth[pi]) continue;
          depth[pi] = z;
          alpha[pi] = 1;
          for (let ch = 0; ch < 3; ch++) {
            const cc = w0 * [pts[0].c.r, pts[0].c.g, pts[0].c.b][ch]
              + w1 * [pts[1].c.r, pts[1].c.g, pts[1].c.b][ch]
              + w2 * [pts[2].c.r, pts[2].c.g, pts[2].c.b][ch];
            const v = (cc * shade) / (cc * shade + 0.78) * 1.15;
            color[pi * 3 + ch] = srgb(v);
          }
        }
      }
    }
  }

  const png = new PNG({ width: W, height: H });
  for (let i = 0; i < W * H; i++) {
    png.data[i * 4] = Math.round(Math.min(1, color[i * 3]) * 255);
    png.data[i * 4 + 1] = Math.round(Math.min(1, color[i * 3 + 1]) * 255);
    png.data[i * 4 + 2] = Math.round(Math.min(1, color[i * 3 + 2]) * 255);
    png.data[i * 4 + 3] = Math.round(Math.min(1, alpha[i]) * 255);
  }
  const out = path.join(outDir, `${species.id}.png`);
  fs.writeFileSync(out, PNG.sync.write(png, { colorType: 6 }));
  console.log(out, `${(fs.statSync(out).size / 1024).toFixed(1)}kb`);
}
