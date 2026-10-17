# Sapling — procedural tree studio

A SpeedTree/TreeIt-class vegetation studio that runs **entirely in the browser**. Pick a species,
tweak ~40 trunk / branch / leaf / palette parameters, roll seeds, orbit the live tree, and export
clean **GLB**, **OBJ+MTL**, design **JSON** and **PNG** files. No backend, no uploads.

![Oak, seed 7 — rendered by Sapling's own CPU still renderer](docs/hero.png)

```
npm ci          # install
npm run dev     # studio at http://localhost:5173
npm run build   # production bundle in dist/
npm test        # node:test + jsdom, 66 tests
```

## Highlights

- **Reproducible.** One seed + one preset rebuilds a byte-identical mesh. All randomness flows through a
  seeded PRNG (`src/generator/rng.js`); `Math.random()` is never used in `src/`.
- **Real limbs.** Tapered tubes swept along **parallel-transport frames** (no twisting), recursive branching
  with depth, children, angle/spread, length/radius ratios, start/end offsets, curve, droop, gnarl,
  gravitropism and phototropism; hangers fold back above the soil; a lobed root flare on the trunk.
- **Foliage cards.** Triangle fans around a single base vertex (broad, slender, droop and needle outlines),
  baked base→tip vertex colours, per-leaf hue/lightness variance and an autumn blend. Density is tiered by
  distance from the twig tip; a hard card budget thins interior tiers first, then strides uniformly so the
  crown top is never bare.
- **Budgeted.** Side and segment counts fall off with depth, and one `sanitizeParams` / `LIMITS` source of
  truth is shared by the worker, the UI and share-link / JSON import. Studio quality stays ≤ 250k triangles
  and ≤ 32k leaf cards even with every slider pinned to its extreme.
- **Worker + coalescing.** Generation runs in a Web Worker with transferred typed arrays, falling back to
  the main thread if `Worker` is missing or dies. Slider drags are debounced, previews are built at a
  lighter tier, and at most one build is ever in flight; a studio-quality rebuild follows every preview.
- **The app never dies.** WebGL 2 is probed with four attribute sets (each on a fresh canvas). If every
  attempt fails, or the renderer throws, or the context is lost, Sapling enters **software mode**: a CPU
  painter's renderer draws the real mesh on Canvas2D (≤ 70k triangles, cards thinned as whole fans), a
  banner explains why with **Retry 3D** and **Details** (copyable diagnostics), and seeds, sliders, share
  links, snapshots and exports keep working. Append `?nogl` to the URL to try it.
- **Exports are full fidelity.** Whatever the preview tier, exports are regenerated at studio quality.

## Interface

Dark botanical studio: Fraunces for display, Manrope for UI, moss/lime accent. Species rail with
generated thumbnails on the left, schema-driven parameter panel on the right (groups, live values, seed
dice, reset), bottom action bar (surprise, snapshot, export, share, help) and a triangle / leaf / height HUD.

| Key | Action |
| --- | --- |
| `Space` | Wind on/off |
| `T` | Turntable |
| `R` | Reset parameters & camera |
| `D` | Roll a new seed |
| `E` | Export dialog |
| `S` | PNG snapshot |
| `⌘/Ctrl + Z` | Undo |
| `?` | Help · `Esc` closes dialogs |

Share links encode species, seed and only the parameters that differ from the preset in the URL hash
(`#s=willow&seed=424242&height=17.3…`) and survive reloads. Design JSON import goes through the same
sanitiser. On narrow screens the panel collapses into a sheet and orbit-only controls hide.

## Architecture

```
src/generator/   rng · params (schema, LIMITS, presets, sanitiser) · vec (parallel transport)
                 growth (skeleton) · tubes (bark) · leaves (cards) · tree · worker · client
src/render/      probe (WebGL 2 attempts) · stage (three.js) · wind (vertex shader) · still (CPU) · diagnostics
src/ui/          panel (schema-driven) · permalink · modal (focus trap) · toast · thumbnails
src/export/      glb (hand-written binary glTF 2.0) · obj (+MTL) · design (JSON) · png · download
src/main.js      state, interactions, hotkeys, quality flow, software-mode fallback
test/            rng · params · generator · transfer · glb · obj · permalink · still · panel · markup
                 app-boot · software-boot · a11y (axe-core)
tools/           render-stills.mjs / render-hero.mjs (QA renders via the CPU renderer, Node only)
```

Runtime dependencies: `three`, `fflate` (zipping OBJ+MTL) and two `@fontsource-variable` packages.

## Parameters (per species)

Every species carries the full set; the table lists the preset values that define its silhouette.

| Parameter | Oak | Maple | Birch | Willow | Pine | Blossom |
| --- | --- | --- | --- | --- | --- | --- |
| **Trunk** height / radius / taper / flare | 13 / 0.50 / 0.55 / 0.9 | 14 / 0.36 / 0.65 / 0.5 | 15 / 0.20 / 0.80 / 0.3 | 11 / 0.45 / 0.60 / 0.8 | 18 / 0.32 / 0.85 / 0.4 | 7 / 0.28 / 0.50 / 0.6 |
| trunkBend / trunkWobble / trunkSegments / trunkSides | 0.15 / 0.30 / 16 / 18 | 0.08 / 0.15 / 16 / 16 | 0.20 / 0.15 / 20 / 14 | 0.20 / 0.30 / 14 / 16 | 0.04 / 0.08 / 22 / 14 | 0.25 / 0.35 / 12 / 14 |
| **Branches** depth / children / childrenFalloff | 5 / 4 / 0.10 | 5 / 4 / 0.15 | 5 / 3.5 / 0.10 | 5 / 4 / 0.05 | 4 / 5 / 0.05 | 5 / 3.5 / 0.10 |
| angle / spread / lengthRatio / lengthVariance | 52° / 0.45 / 0.62 / 0.35 | 38° / 0.35 / 0.66 / 0.30 | 32° / 0.30 / 0.58 / 0.35 | 55° / 0.40 / 0.70 / 0.30 | 78° / 0.20 / 0.45 / 0.25 | 60° / 0.50 / 0.70 / 0.35 |
| radiusRatio / startOffset / endOffset | 0.70 / 0.30 / 0.92 | 0.68 / 0.35 / 0.95 | 0.60 / 0.40 / 0.97 | 0.62 / 0.30 / 0.95 | 0.45 / 0.30 / 0.98 | 0.66 / 0.25 / 0.90 |
| curve / droop / gnarl | 0.35 / 0.05 / 0.45 | 0.25 / 0 / 0.20 | 0.30 / 0.35 / 0.20 | 0.40 / 0.85 / 0.30 | 0.15 / 0.30 / 0.10 | 0.40 / 0.15 / 0.50 |
| gravitropism / phototropism | 0.15 / 0.35 | 0.35 / 0.40 | −0.10 / 0.30 | −0.70 / 0.15 | 0.30 / 0.25 | 0.05 / 0.50 |
| branchSegments / twigs / crown | 7 / 0.5 / 0.80 | 7 / 0.5 / 0.75 | 8 / 0.6 / 0.65 | 10 / 0.7 / 0.60 | 6 / 1.0 / 0.05 | 7 / 0.6 / 0.85 |
| **Leaves** leafStyle / leafDensity / leafSize | broad / 0.62 / 0.26 | broad / 0.65 / 0.24 | slender / 0.50 / 0.16 | droop / 0.70 / 0.18 | needle / 1.0 / 0.30 | broad / 0.75 / 0.15 |
| leafSizeVariance / leafReach / leafDroop | 0.35 / 0.35 / 0.25 | 0.30 / 0.30 / 0.20 | 0.30 / 0.30 / 0.50 | 0.30 / 0.60 / 0.90 | 0.25 / 0.85 / 0.30 | 0.40 / 0.40 / 0.20 |
| leafStartDepth / leafBudget | 2 / 18 000 | 2 / 18 000 | 2 / 16 000 | 2 / 22 000 | 2 / 18 000 | 2 / 20 000 |
| **Palette** barkColor / barkTint | #4e3b2c / #7c6752 | #5a4a41 / #8e7b6c | #d9d6cc / #6c665c | #5c5342 / #8a8064 | #5a3d2b / #a3684a | #3f3029 / #6e5a4d |
| leafColor / leafTipColor | #2f6a28 / #8fbf3f | #c7471d / #f2a63b | #5f9a35 / #c9e067 | #55863a / #b9d36a | #1f4a2c / #4f8a4a | #e58aa5 / #fbe3ea |
| leafVariance / autumn | 0.35 / 0 | 0.45 / 0.8 | 0.30 / 0 | 0.30 / 0 | 0.25 / 0 | 0.30 / 0 |

41 exposed parameters in four groups (Trunk 8 · Branches 18 · Leaves 8 · Palette 6 + seed).
Ranges and steps live in `src/generator/params.js` (`SCHEMA`).

## Measured output (studio quality, seeds 1 · 7 · 42 · 777 · 31337)

| Species | Triangles | Leaf cards | Limbs | Height | Generate (Node, warm) |
| --- | --- | --- | --- | --- | --- |
| oak | 113,789–142,236 | 15,658–18,000 | 2,222–3,089 | 13.1–13.4 m | 127–224 ms |
| maple | 90,395–115,507 | 14,727–17,999 | 1,391–1,945 | 14.2–15.0 m | 71–119 ms |
| birch | 67,840–102,199 | 10,356–15,656 | 1,159–1,795 | 15.1–15.2 m | 70–111 ms |
| willow | 206,997–227,677 | 21,999–22,000 | 4,904–5,758 | 9.0–11.0 m | 211–335 ms |
| pine | 145,811–169,660 | 17,999–18,000 | 4,181–5,548 | 15.9–16.8 m | 176–253 ms |
| blossom | 89,671–112,283 | 14,810–19,099 | 1,419–1,659 | 7.1–7.5 m | 78–122 ms |

Quality tiers (`QUALITY` in params.js): **studio** ≤ 250k tris (exports, idle view), **preview** ≤ 120k
(slider drags), **software** ≤ 60k (no WebGL), **thumb** ≤ 24k (rail thumbnails). A 1600×1062 software
still of an oak renders in roughly 300–500 ms in Node.

## Exports

- **GLB** — binary glTF 2.0 written by hand: one mesh with one primitive per material (`Bark`, `Foliage`),
  indexed geometry (16- or 32-bit), `POSITION` (with min/max), `NORMAL`, `TEXCOORD_0`, `COLOR_0`, PBR
  materials (foliage `doubleSided`), 4-byte aligned chunks, and the full design in `extras.sapling`.
- **OBJ + MTL** — `v`/`vt`/`vn` + faces, one `usemtl` per group, zipped together.
- **Design JSON** — species, seed, every parameter and the stats; re-import through *Export → Load*.
- **PNG** — the live viewport, or the software still.

Filenames are `sapling-<species>-<seed>.<ext>`.

## Testing

`npm test` runs 66 tests across 13 files under `node:test` with jsdom: seeded determinism, hostile-input
sanitisation, geometry validity and budgets, the `leafStyle: 'none'` case, worker transfer round-trip
(the real worker module runs inside a `worker_threads` shim), GLB structure read back through accessors,
OBJ `usemtl` uniqueness, share-link round-trip / trimming / bad hashes, panel write-back, the markup
contract, a full app boot with a stubbed stage, a software-mode boot (no WebGL → populated UI, working
dice and exports, successful retry), context-loss handling, and an axe-core pass in both modes.

## Known limitations

- Leaf cards are opaque, flat fans — no alpha-cut textures, no LODs or billboards.
- Vertex colours stand in for textures; bark UVs are provided but no texture maps are generated.
- `COLOR_0` is exported as linear RGB per the glTF spec; engines that expect sRGB vertex colours will
  show a slightly darker tint. Unity/Unreal need a two-sided shader for the foliage material.
- Branch junctions are embedded tubes, not blended; very low `trunkSides` show the seam.
- Software mode has no antialiasing or shadows, and orbiting re-renders the still (drag horizontally).
- Undo history is in-memory only (50 steps).
