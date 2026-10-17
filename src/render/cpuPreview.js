import * as THREE from 'three';

/**
 * A small Canvas2D rasteriser used when WebGL 2 is unavailable.
 *
 * It is not a replacement for the 3D stage: it draws a single painter-sorted
 * still of the current tree so the studio never goes blank. Triangles are
 * flat-shaded from the baked vertex colours, which keeps the character of the
 * WebGL render while staying fast enough for an occasional redraw.
 */

const DEG = Math.PI / 180;
const MAX_PIXELS = 1_700_000;

const KEY_DIR = new THREE.Vector3(0.42, 0.86, 0.5).normalize();
const FILL_DIR = new THREE.Vector3(-0.75, 0.35, -0.35).normalize();
const RIM_DIR = new THREE.Vector3(-0.25, 0.45, -0.9).normalize();

function toneMap(value) {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped / (clamped + 0.8) * 1.18;
}

function toSrgb(value) {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
}

function packColor(r, g, b) {
  const ri = Math.max(0, Math.min(31, Math.round(r * 31)));
  const gi = Math.max(0, Math.min(31, Math.round(g * 31)));
  const bi = Math.max(0, Math.min(31, Math.round(b * 31)));
  return (ri << 10) | (gi << 5) | bi;
}

function colorToCss(packed) {
  const r = Math.round(((packed >> 10) & 31) / 31 * 255);
  const g = Math.round(((packed >> 5) & 31) / 31 * 255);
  const b = Math.round((packed & 31) / 31 * 255);
  return `rgb(${r},${g},${b})`;
}

function paintBackdrop(ctx, width, height, bounds) {
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, '#1d3026');
  sky.addColorStop(0.45, '#15221a');
  sky.addColorStop(1, '#070d0a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  const glow = ctx.createRadialGradient(
    width * 0.66, height * 0.22, 0,
    width * 0.66, height * 0.22, Math.max(width, height) * 0.72,
  );
  glow.addColorStop(0, 'rgba(148, 176, 120, 0.24)');
  glow.addColorStop(0.55, 'rgba(96, 124, 92, 0.08)');
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  // soft contact shadow under the trunk
  const size = bounds.getSize(new THREE.Vector3());
  const centre = bounds.getCenter(new THREE.Vector3());
  const span = Math.max(size.x, size.z, 3);
  const shadowX = width * 0.5 + (centre.x / span) * width * 0.06;
  ctx.save();
  ctx.translate(shadowX, height * 0.915);
  ctx.scale(1, 0.18);
  const shadow = ctx.createRadialGradient(0, 0, 0, 0, 0, span * 42);
  shadow.addColorStop(0, 'rgba(0, 0, 0, 0.5)');
  shadow.addColorStop(0.55, 'rgba(0, 0, 0, 0.22)');
  shadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = shadow;
  ctx.beginPath();
  ctx.arc(0, 0, span * 42, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function paintVignette(ctx, width, height) {
  const vignette = ctx.createRadialGradient(
    width * 0.5, height * 0.46, Math.min(width, height) * 0.3,
    width * 0.5, height * 0.46, Math.max(width, height) * 0.78,
  );
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(2, 6, 4, 0.62)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ barkGeometry: THREE.BufferGeometry, leafGeometry: THREE.BufferGeometry|null, bounds: THREE.Box3 }} tree
 * @returns {{ ok: boolean, drawn?: number, total?: number, ms?: number, reason?: string }}
 */
export function renderStillPreview(canvas, tree, options = {}) {
  if (!canvas || typeof canvas.getContext !== 'function') return { ok: false, reason: 'no-canvas' };
  const ctx = canvas.getContext('2d');
  if (!ctx) return { ok: false, reason: 'no-2d-context' };
  if (!tree?.barkGeometry || !tree.bounds) return { ok: false, reason: 'no-tree' };

  const started = performance.now();
  const host = canvas.parentElement;
  const cssWidth = Math.max(240, host?.clientWidth || canvas.clientWidth || 720);
  const cssHeight = Math.max(240, host?.clientHeight || canvas.clientHeight || 900);
  let scale = Math.min(window.devicePixelRatio || 1, 1.5);
  if (cssWidth * cssHeight * scale * scale > MAX_PIXELS) {
    scale = Math.sqrt(MAX_PIXELS / (cssWidth * cssHeight));
  }
  const width = Math.round(cssWidth * scale);
  const height = Math.round(cssHeight * scale);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const bounds = tree.bounds;
  const size = bounds.getSize(new THREE.Vector3());
  const centre = bounds.getCenter(new THREE.Vector3());
  const fov = (options.fov || 34) * DEG;
  const aspect = width / Math.max(1, height);
  const tanHalf = Math.tan(fov / 2);

  const target = new THREE.Vector3(centre.x, bounds.min.y + size.y * (options.targetY ?? 0.5), centre.z);
  const distance = Math.max(
    (size.y * 0.62) / tanHalf,
    (Math.max(size.x, size.z) * 0.64) / (tanHalf * aspect),
    size.y * 0.9,
  ) * 1.04;

  const azimuth = options.azimuth ?? -0.55;
  const elevation = options.elevation ?? 0.16;
  const eye = new THREE.Vector3(
    target.x + Math.sin(azimuth) * Math.cos(elevation) * distance,
    target.y + Math.sin(elevation) * distance,
    target.z + Math.cos(azimuth) * Math.cos(elevation) * distance,
  );

  const forward = target.clone().sub(eye).normalize();
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, forward).normalize();

  const toView = (point) => {
    const rel = point.clone().sub(eye);
    return new THREE.Vector3(rel.dot(right), rel.dot(up), rel.dot(forward));
  };

  const project = (view) => ({
    x: ((view.x / (view.z * tanHalf * aspect)) * 0.5 + 0.5) * width,
    y: (1 - ((view.y / (view.z * tanHalf)) * 0.5 + 0.5)) * height,
  });

  paintBackdrop(ctx, width, height, bounds);

  const minArea = options.minArea ?? 0.85;
  const maxTriangles = options.maxTriangles ?? 70000;
  const triangles = [];
  const edgeA = new THREE.Vector3();
  const faceNormal = new THREE.Vector3();
  const world = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const colors = [new THREE.Color(), new THREE.Color(), new THREE.Color()];
  let total = 0;
  let skipped = 0;

  const collect = (geometry, isLeaf, budget) => {
    if (!geometry || budget <= 0) return;
    const position = geometry.getAttribute('position');
    const color = geometry.getAttribute('color');
    const index = geometry.getIndex();
    if (!position || !index) return;
    const indices = index.array;
    const count = Math.floor(indices.length / 3);
    // When a tree is over budget, thin uniformly instead of dropping the tail —
    // geometry is emitted per branch, so a tail cutoff would erase whole limbs.
    // Leaf cards are triangle fans sharing their first vertex, so they have to
    // be sampled as whole cards: halving a fan leaves paper-thin slivers.
    let step = Math.max(1, Math.ceil(count / budget));
    let keptCard = true;
    let lastBase = -1;
    let cardIndex = -1;
    if (isLeaf && step > 1) {
      let cards = 0;
      let previous = -1;
      for (let i = 0; i < indices.length; i += 3) {
        if (indices[i] !== previous) {
          cards += 1;
          previous = indices[i];
        }
      }
      const perCard = Math.max(1, count / Math.max(cards, 1));
      const cardStep = Math.max(1, Math.ceil(cards / Math.max(1, Math.floor(budget / perCard))));
      step = cardStep;
    }

    for (let i = 0; i < indices.length; i += 3) {
      if (isLeaf && step > 1) {
        if (indices[i] !== lastBase) {
          lastBase = indices[i];
          cardIndex += 1;
          keptCard = cardIndex % step === 0;
          if (!keptCard) skipped += 1;
        }
        if (!keptCard) continue;
      } else if (step > 1 && (i / 3) % step !== 0) {
        continue;
      }
      total += 1;
      const ia = indices[i];
      const ib = indices[i + 1];
      const ic = indices[i + 2];
      for (let k = 0; k < 3; k += 1) {
        const id = k === 0 ? ia : k === 1 ? ib : ic;
        world[k].fromBufferAttribute(position, id);
        if (color) colors[k].fromBufferAttribute(color, id);
      }

      const view = [toView(world[0]), toView(world[1]), toView(world[2])];
      if (view[0].z < 0.05 || view[1].z < 0.05 || view[2].z < 0.05) continue;

      const screen = view.map(project);
      const area = (screen[1].x - screen[0].x) * (screen[2].y - screen[0].y)
        - (screen[1].y - screen[0].y) * (screen[2].x - screen[0].x);
      const areaAbs = Math.abs(area) * 0.5;
      if (areaAbs < minArea) continue;
      // Edge-on needle or twig cards become sub-pixel slivers; drawn with the
      // usual corner padding they look like scratches across the image.
      const longest = Math.max(
        Math.hypot(screen[1].x - screen[0].x, screen[1].y - screen[0].y),
        Math.hypot(screen[2].x - screen[1].x, screen[2].y - screen[1].y),
        Math.hypot(screen[0].x - screen[2].x, screen[0].y - screen[2].y),
      );
      if (longest > 2 && (areaAbs * 2) / longest < 0.5) continue;
      if (screen[0].x < -width && screen[1].x < -width && screen[2].x < -width) continue;
      if (screen[0].x > width * 2 && screen[1].x > width * 2 && screen[2].x > width * 2) continue;

      faceNormal
        .subVectors(world[1], world[0])
        .cross(edgeA.subVectors(world[2], world[0]))
        .normalize();

      let shade = 0.36;
      shade += Math.max(0, faceNormal.dot(KEY_DIR)) * 0.82;
      shade += Math.max(0, faceNormal.dot(FILL_DIR)) * 0.24;
      shade += Math.pow(Math.max(0, faceNormal.dot(RIM_DIR)), 2) * 0.26;
      shade *= isLeaf ? 1.06 : 1;
      shade += isLeaf ? 0.02 : 0;

      let r = 0;
      let g = 0;
      let b = 0;
      for (let k = 0; k < 3; k += 1) {
        r += colors[k].r;
        g += colors[k].g;
        b += colors[k].b;
      }
      r = (r / 3) * shade;
      g = (g / 3) * shade;
      b = (b / 3) * shade;

      triangles.push({
        depth: (view[0].z + view[1].z + view[2].z) / 3,
        area: areaAbs,
        points: screen,
        color: packColor(toSrgb(toneMap(r)), toSrgb(toneMap(g)), toSrgb(toneMap(b))),
      });
    }
  };

  // Bark first, leaves second: branches are opaque, so their share of the
  // budget must not be stolen by foliage.
  const hasLeaves = Boolean(tree.leafGeometry);
  collect(tree.barkGeometry, false, hasLeaves ? Math.round(maxTriangles * 0.45) : maxTriangles);
  collect(tree.leafGeometry, true, hasLeaves ? maxTriangles - Math.round(maxTriangles * 0.45) : 0);

  triangles.sort((a, b) => b.depth - a.depth);

  const palette = new Map();
  let drawn = 0;
  for (let i = 0; i < triangles.length; i += 1) {
    const item = triangles[i];
    let css = palette.get(item.color);
    if (!css) {
      css = colorToCss(item.color);
      palette.set(item.color, css);
    }
    const [a, b, c] = item.points;
    const cx = (a.x + b.x + c.x) / 3;
    const cy = (a.y + b.y + c.y) / 3;
    // Nudge each corner outward to hide antialiasing cracks between neighbours.
    const pad = Math.min(0.45, 0.6 / Math.sqrt(Math.max(item.area, 0.6)));
    ctx.beginPath();
    for (let k = 0; k < 3; k += 1) {
      const p = item.points[k];
      const dx = p.x - cx;
      const dy = p.y - cy;
      const length = Math.hypot(dx, dy) || 1;
      const x = p.x + (dx / length) * pad;
      const y = p.y + (dy / length) * pad;
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = css;
    ctx.fill();
    drawn += 1;
  }

  paintVignette(ctx, width, height);

  return {
    ok: true,
    drawn,
    total,
    triangles: total,
    skipped,
    truncated: skipped > 0,
    width,
    height,
    ms: Math.round(performance.now() - started),
  };
}
