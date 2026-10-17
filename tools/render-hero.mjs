/** Render the README hero from the generator (no decorative assets). */
import { writeFileSync, mkdirSync } from 'node:fs';
import { generateTree } from '../src/generator/tree.js';
import { renderStill } from '../src/render/still.js';
import { encodePng } from './png.js';

mkdirSync('docs', { recursive: true });
const tree = generateTree({ species: 'oak', seed: 7, params: {} }, 'studio');
const still = renderStill(tree, { width: 1400, height: 800, maxTriangles: 400000, azimuth: 0.7, elevation: 0.18 });
writeFileSync('docs/hero.png', encodePng(still.data, still.width, still.height));
console.log('docs/hero.png', tree.stats.triangles, 'triangles', Math.round(still.ms) + 'ms');
