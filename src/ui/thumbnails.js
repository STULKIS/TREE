/**
 * Species rail thumbnails, rendered from our own generator via the CPU still
 * renderer (no decorative assets). Degrades to a glyph when Canvas2D is missing.
 */
import { generateTree } from '../generator/tree.js';
import { renderStill, blitStill } from '../render/still.js';

export const THUMB_SEED = 7;

export function renderThumbnailDataUrl(speciesId, doc, size = 112) {
  const canvas = doc.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext && canvas.getContext('2d');
  if (!ctx || typeof ctx.createImageData !== 'function') return null;
  const tree = generateTree({ species: speciesId, seed: THUMB_SEED, params: {} }, 'thumb');
  const still = renderStill(tree, {
    width: size,
    height: size,
    maxTriangles: 40000,
    zoom: 1.08,
    elevation: 0.12,
    azimuth: 0.5,
    background: [0.07, 0.095, 0.085],
    horizon: [0.14, 0.17, 0.15]
  });
  blitStill(ctx, still);
  try {
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

/**
 * Populate thumbnails lazily, one per idle slice, so boot stays snappy.
 * @param {Map<string, HTMLElement>} slots speciesId → container element
 */
export function scheduleThumbnails(slots, doc, win) {
  const ids = [...slots.keys()];
  const idle = win && typeof win.requestIdleCallback === 'function'
    ? (fn) => win.requestIdleCallback(fn, { timeout: 500 })
    : (fn) => setTimeout(fn, 30);
  let i = 0;
  const step = () => {
    if (i >= ids.length) return;
    const id = ids[i++];
    const slot = slots.get(id);
    try {
      const url = renderThumbnailDataUrl(id, doc);
      if (url && slot) {
        const img = doc.createElement('img');
        img.alt = '';
        img.decoding = 'async';
        img.src = url;
        slot.innerHTML = '';
        slot.appendChild(img);
      }
    } catch {
      /* keep the glyph fallback */
    }
    idle(step);
  };
  idle(step);
}
