// Web Worker entry: sanitises the incoming design again (never trust the main thread),
// builds the tree and transfers every typed array back without copying.
import { buildTree, transferables } from './geometry.js';
import { sanitizeDesign } from './params.js';

const VALID_QUALITY = new Set(['studio', 'preview', 'software']);

self.onmessage = (event) => {
  const { id, design, quality } = event.data || {};
  try {
    const clean = sanitizeDesign(design);
    const q = VALID_QUALITY.has(quality) ? quality : 'studio';
    const result = buildTree(clean, q);
    self.postMessage({ id, ok: true, design: clean, result }, transferables(result));
  } catch (err) {
    self.postMessage({ id, ok: false, error: String((err && err.message) || err) });
  }
};
