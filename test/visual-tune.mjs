/**
 * Ad-hoc tuning tool: renders contact sheets of the presets.
 * node test/visual-tune.mjs
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { PNG } from 'pngjs';

const species = ['oak', 'maple', 'birch', 'willow', 'pine', 'blossom'];
const tiles = [];
for (const id of species) {
  execFileSync(process.execPath, ['tools/render-preview.mjs', id, `/tmp/tune-${id}.png`, '4815'], {
    env: { ...process.env, W: '300', H: '380', ZOOM: '0.92' },
  });
  tiles.push(PNG.sync.read(fs.readFileSync(`/tmp/tune-${id}.png`)));
}
const cols = 3;
const rows = 2;
const width = 300 * cols;
const height = 380 * rows;
const sheet = new PNG({ width, height });
for (let i = 0; i < tiles.length; i += 1) {
  const tile = tiles[i];
  const ox = (i % cols) * 300;
  const oy = Math.floor(i / cols) * 380;
  for (let y = 0; y < 380; y += 1) {
    for (let x = 0; x < 300; x += 1) {
      const src = (y * 300 + x) * 4;
      const dst = ((oy + y) * width + ox + x) * 4;
      sheet.data[dst] = tile.data[src];
      sheet.data[dst + 1] = tile.data[src + 1];
      sheet.data[dst + 2] = tile.data[src + 2];
      sheet.data[dst + 3] = 255;
    }
  }
}
fs.writeFileSync('/tmp/tuning-sheet.png', PNG.sync.write(sheet));
console.log('wrote /tmp/tuning-sheet.png');
