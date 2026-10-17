# Sapling

A standalone procedural tree and vegetation studio that runs entirely in the browser.
Pick a species, tune trunk, branching, foliage and palette, roll seeds, and export GLB, OBJ + MTL,
design JSON or PNG snapshots. No backend, no uploads.

## Commands

```sh
npm ci
npm run dev     # http://localhost:5173
npm run build   # static bundle in dist/
npm test        # node:test + jsdom (80 tests)
```

## Layout

- `src/generator/` — seeded PRNG, parameter schema + species presets + sanitiser, geometry builder
  (parallel-transport tubes, tiered leaf cards under a hard budget), worker, coalescing client.
- `src/render/` — three.js stage (ACES, gradient environment, GPU wind, growth), WebGL 2 probe with
  fallbacks, Canvas2D software still renderer, diagnostics.
- `src/ui/` — schema-driven panel, focus-trapped dialogs, share-link codec.
- `src/export/` — hand-written GLB 2.0, OBJ + MTL, design JSON, snapshot helpers.
- `src/app.js` — state, interactions, software-mode fallback, retry, context-loss handling.

## Notes

- One seed + one preset rebuilds an identical mesh. `Math.random()` is not used in shipped code.
- Exports always regenerate at studio quality from the cleaned-up parameters.
- Limits (triangles, leaf cards, software budget) live in `src/generator/params.js`.
