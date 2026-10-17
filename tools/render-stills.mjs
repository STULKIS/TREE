/**
 * QA helper: render every species to PNG via the CPU still renderer.
 *   node tools/render-stills.mjs [outDir] [seed]
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { generateTree } from '../src/generator/tree.js';
import { SPECIES_IDS } from '../src/generator/params.js';
import { renderStill } from '../src/render/still.js';
import { encodePng } from './png.js';

const out = process.argv[2] || '/tmp/stills';
const seed = Number(process.argv[3] || 1);
const quality = process.argv[4] || 'studio';
mkdirSync(out, { recursive: true });
for (const sp of SPECIES_IDS) {
  const tree = generateTree({ species: sp, seed, params: {} }, quality);
  const still = renderStill(tree, { width: 900, height: 700, maxTriangles: 400000 });
  writeFileSync(`${out}/${sp}-${seed}.png`, encodePng(still.data, still.width, still.height));
  console.log(sp, tree.stats.triangles, 'tris', still.triangles, 'drawn', Math.round(still.ms) + 'ms');
}
