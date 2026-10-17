// Software still renderer on Canvas2D. Projects the real mesh, sorts triangles far→near,
// flat-shades from baked vertex colours, tone-maps, and draws a backdrop with vignette.
// Over budget, leaf cards are thinned as whole fans, never per triangle.

const FOV = (35 * Math.PI) / 180;
const LIGHT = (() => {
  const v = [0.45, 0.85, 0.35];
  const l = Math.hypot(...v);
  return v.map((c) => c / l);
})();

const aces = (x) => Math.min(1, Math.max(0, (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14)));
const toSRGB = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const channel = (c) => Math.round(255 * toSRGB(aces(c)));

function drawBackdrop(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#1b2419');
  g.addColorStop(0.7, '#0e130d');
  g.addColorStop(1, '#080a07');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
  // Soil disc as a flat ellipse at the base.
  ctx.fillStyle = 'rgba(38,33,24,0.9)';
  ctx.beginPath();
  ctx.ellipse(w / 2, h * 0.9, w * 0.34, h * 0.035, 0, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} result  output of buildTree (bark, foliage, bounds)
 * @param {{width:number,height:number,azimuth?:number,elevation?:number,budget?:number,now?:()=>number}} opts
 */
export function renderStill(ctx, result, opts) {
  const { width: w, height: h, azimuth = 0.6, elevation = 0.18, budget = 70000 } = opts;
  const now = opts.now || (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  const t0 = now();
  drawBackdrop(ctx, w, h);

  const { bounds, bark, foliage } = result;
  const { min, max } = bounds;
  const center = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const diag = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  const radius = Math.max(0.5, diag / 2);
  const dist = (radius / Math.sin(FOV / 2)) * 1.08;
  const eye = [
    center[0] + dist * Math.sin(azimuth) * Math.cos(elevation),
    center[1] + dist * Math.sin(elevation),
    center[2] + dist * Math.cos(azimuth) * Math.cos(elevation),
  ];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  };
  const f = norm(sub(center, eye));
  const r = norm(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  const focal = (Math.min(w, h) / 2) / Math.tan(FOV / 2);
  const cx = w / 2;
  const cy = h / 2;

  // Project every vertex once: screen x/y and view depth. Index space is bark then foliage.
  const project = (group) => {
    const n = group.positions.length / 3;
    const sx = new Float32Array(n);
    const sy = new Float32Array(n);
    const sz = new Float32Array(n);
    const P = group.positions;
    for (let i = 0; i < n; i++) {
      const d0 = P[i * 3] - eye[0];
      const d1 = P[i * 3 + 1] - eye[1];
      const d2 = P[i * 3 + 2] - eye[2];
      const z = d0 * f[0] + d1 * f[1] + d2 * f[2];
      const zc = Math.max(1e-3, z);
      sx[i] = cx + ((d0 * r[0] + d1 * r[1] + d2 * r[2]) / zc) * focal;
      sy[i] = cy - ((d0 * u[0] + d1 * u[1] + d2 * u[2]) / zc) * focal;
      sz[i] = z;
    }
    return { sx, sy, sz };
  };
  const pb = project(bark);
  const pf = project(foliage);
  const nb = bark.indices.length / 3;
  const nf = foliage.indices.length / 3;
  const total = nb + nf;
  const cardStarts = foliage.cardStarts || new Uint32Array([0, nf]);
  const cardCount = Math.max(0, cardStarts.length - 1);

  // Bark triangles are culled individually when sub-pixel. Foliage is culled per whole card:
  // a card either reads as a fan or disappears, never as scattered slivers.
  const SLIVER_PX2 = 0.25;
  const triMeta = (t) => {
    if (t < nb) return { idx: bark.indices, base: t * 3, p: pb, grp: bark };
    return { idx: foliage.indices, base: (t - nb) * 3, p: pf, grp: foliage };
  };
  const keep = new Uint8Array(total);
  const depth = new Float32Array(total);
  const area = new Float32Array(total);
  let keptBark = 0;
  for (let t = 0; t < total; t++) {
    const m = triMeta(t);
    const a = m.idx[m.base];
    const b = m.idx[m.base + 1];
    const c = m.idx[m.base + 2];
    area[t] = Math.abs((m.p.sx[b] - m.p.sx[a]) * (m.p.sy[c] - m.p.sy[a]) - (m.p.sx[c] - m.p.sx[a]) * (m.p.sy[b] - m.p.sy[a])) / 2;
    depth[t] = (m.p.sz[a] + m.p.sz[b] + m.p.sz[c]) / 3;
  }
  for (let t = 0; t < nb; t++) {
    if (area[t] >= SLIVER_PX2) { keep[t] = 1; keptBark++; }
  }
  for (let c = 0; c < cardCount; c++) {
    const s = cardStarts[c];
    const e = cardStarts[c + 1];
    let cardArea = 0;
    for (let t = nb + s; t < nb + e; t++) cardArea += area[t];
    if (cardArea >= SLIVER_PX2) for (let t = nb + s; t < nb + e; t++) keep[t] = 1;
  }
  let kept = 0;
  for (let t = 0; t < total; t++) if (keep[t]) kept++;
  const keptBeforeThinning = kept;

  // Thin foliage by whole cards when over budget. Crown-top cards are always kept, and the
  // smallest stride that fits the budget is chosen so the crown stays as full as possible.
  let thinnedCards = 0;
  if (kept > budget && cardCount > 0) {
    const topY = max[1] * 0.7;
    const cardKept = new Uint32Array(cardCount);
    const cardTop = new Uint8Array(cardCount);
    for (let c = 0; c < cardCount; c++) {
      const s = cardStarts[c];
      const e = cardStarts[c + 1];
      let n = 0;
      for (let t = nb + s; t < nb + e; t++) if (keep[t] === 1) n++;
      cardKept[c] = n;
      cardTop[c] = foliage.positions[foliage.indices[s * 3] * 3 + 1] >= topY ? 1 : 0;
    }
    const countFor = (stride) => {
      let n = keptBark;
      for (let c = 0; c < cardCount; c++) if (cardTop[c] || c % stride === 0) n += cardKept[c];
      return n;
    };
    let stride = 1;
    while (stride < 4096 && countFor(stride) > budget) stride++;
    for (let c = 0; c < cardCount; c++) {
      if (cardTop[c] || c % stride === 0) continue;
      const s = cardStarts[c];
      const e = cardStarts[c + 1];
      for (let t = nb + s; t < nb + e; t++) {
        if (keep[t] === 1) { keep[t] = 2; thinnedCards++; }
      }
    }
    kept = countFor(stride);
  }

  const order = [];
  for (let t = 0; t < total; t++) if (keep[t] === 1) order.push(t);
  order.sort((a, b) => depth[b] - depth[a]); // far → near

  let drawn = 0;
  let lastFill = '';
  const colorOf = (t) => {
    const m = triMeta(t);
    const { idx, base, grp } = m;
    const a = idx[base];
    const b = idx[base + 1];
    const c = idx[base + 2];
    const P = grp.positions;
    const e1 = sub([P[b * 3], P[b * 3 + 1], P[b * 3 + 2]], [P[a * 3], P[a * 3 + 1], P[a * 3 + 2]]);
    const e2 = sub([P[c * 3], P[c * 3 + 1], P[c * 3 + 2]], [P[a * 3], P[a * 3 + 1], P[a * 3 + 2]]);
    let nrm = norm(cross(e1, e2));
    const toEye = sub(eye, [P[a * 3], P[a * 3 + 1], P[a * 3 + 2]]);
    if (nrm[0] * toEye[0] + nrm[1] * toEye[1] + nrm[2] * toEye[2] < 0) nrm = [-nrm[0], -nrm[1], -nrm[2]];
    const lambert = Math.max(0, nrm[0] * LIGHT[0] + nrm[1] * LIGHT[1] + nrm[2] * LIGHT[2]);
    const shade = 0.42 + 0.58 * lambert;
    const C = grp.colors;
    const cr = ((C[a * 3] + C[b * 3] + C[c * 3]) / 3) * shade;
    const cg = ((C[a * 3 + 1] + C[b * 3 + 1] + C[c * 3 + 1]) / 3) * shade;
    const cb = ((C[a * 3 + 2] + C[b * 3 + 2] + C[c * 3 + 2]) / 3) * shade;
    return `rgb(${channel(cr)},${channel(cg)},${channel(cb)})`;
  };

  for (const t of order) {
    const m = triMeta(t);
    const { idx, base, p } = m;
    const a = idx[base];
    const b = idx[base + 1];
    const c = idx[base + 2];
    const fill = colorOf(t);
    if (fill !== lastFill) { ctx.fillStyle = fill; lastFill = fill; }
    ctx.beginPath();
    ctx.moveTo(p.sx[a], p.sy[a]);
    ctx.lineTo(p.sx[b], p.sy[b]);
    ctx.lineTo(p.sx[c], p.sy[c]);
    ctx.closePath();
    ctx.fill();
    drawn++;
  }

  return {
    drawn,
    culled: total - keptBeforeThinning,
    thinnedCards,
    triangles: total,
    kept,
    ms: now() - t0,
  };
}
