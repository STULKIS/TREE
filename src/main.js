import '@fontsource-variable/fraunces/full.css';
import '@fontsource-variable/fraunces/full-italic.css';
import '@fontsource-variable/manrope/index.css';
import './style.css';

import * as THREE from 'three';
import { Stage } from './render/stage.js';
import { generateTree } from './generator/tree.js';
import {
  SPECIES,
  SPECIES_BY_ID,
  clone,
  makeParams,
  presetParams,
  randomSeed,
  sanitizeParams,
} from './generator/params.js';
import { packGeometry, unpackGeometry } from './generator/transfer.js';
import { buildHash, parseHash } from './ui/permalink.js';
import { buildPanel } from './ui/panel.js';
import { exportAs, snapshot } from './export/exporters.js';

const QUALITY = {
  draft: { leaves: 0.42, trunkSides: 0.72, branchSides: 0.78, segments: 0.72, trunkSegments: 0.72 },
  studio: { leaves: 1, trunkSides: 1, branchSides: 1, segments: 1, trunkSegments: 1 },
  max: { leaves: 1.45, trunkSides: 1.3, branchSides: 1.25, segments: 1.15, trunkSegments: 1.2 },
};

const prefersLighterPreview = window.innerWidth < 900
  || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);

const state = {
  species: 'oak',
  params: makeParams('oak', 4815),
  preset: presetParams('oak'),
  quality: prefersLighterPreview ? 'draft' : 'studio',
  wind: !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  rotate: !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  format: 'glb',
  includeFoliage: true,
  tree: null,
  firstTree: true,
};

const $ = (id) => document.getElementById(id);

const dom = {
  boot: $('boot'),
  bootStatus: $('boot-status'),
  speciesName: $('species-name'),
  speciesLatin: $('species-latin'),
  speciesList: $('species-list'),
  panelBody: $('panel-body'),
  panel: $('panel'),
  panelToggle: $('btn-panel-toggle'),
  seedInput: $('seed-input'),
  dice: $('btn-dice'),
  surprise: $('btn-surprise'),
  wind: $('btn-wind'),
  rotate: $('btn-rotate'),
  help: $('btn-help'),
  helpModal: $('help-modal'),
  exportModal: $('export-modal'),
  exportBtn: $('btn-export'),
  shotBtn: $('btn-shot'),
  downloadBtn: $('btn-download'),
  downloadLabel: $('download-label'),
  formatList: $('format-list'),
  foliageRow: $('foliage-row'),
  exportFoliage: $('export-foliage'),
  exportSpecies: $('export-species'),
  exportStats: $('export-stats'),
  exportSeed: $('export-seed'),
  exportCopy: $('export-copy'),
  stats: {
    height: $('stat-height'),
    spread: $('stat-spread'),
    leaves: $('stat-leaves'),
    tris: $('stat-tris'),
  },
  detailChip: $('detail-chip'),
  modifiedDot: $('modified-dot'),
  toast: $('toast'),
  brand: $('brand'),
  shareBtn: $('btn-share'),
  loadBtn: $('btn-load'),
  loadInput: $('load-input'),
  shareRow: $('share-row'),
  shareInput: $('share-input'),
};

let stage = null;
try {
  stage = new Stage($('stage'));
} catch (error) {
  console.error('WebGL unavailable', error);
  dom.bootStatus.textContent = 'WebGL is unavailable in this browser';
  throw error;
}

/* ------------------------------------------------------------------ worker */

let worker = null;
let workerBroken = false;
let requestId = 0;
let inFlight = false;
let pendingParams = null;

try {
  worker = new Worker(new URL('./generator/worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (event) => {
    inFlight = false;
    const data = event.data;
    if (data.error) {
      workerBroken = true;
      console.warn('Generation worker failed, falling back to main thread:', data.error);
      buildOnMainThread();
      return;
    }
    applyTree(data);
    pump();
  };
  worker.onerror = (event) => {
    console.warn('Generation worker error, falling back:', event.message);
    workerBroken = true;
    inFlight = false;
    buildOnMainThread();
  };
} catch (error) {
  workerBroken = true;
  console.warn('Worker unavailable, generating on the main thread.', error);
}

function effectiveParams(params, quality = state.quality) {
  const q = QUALITY[quality] || QUALITY.studio;
  const next = clone(params);
  next.leaves.density = Math.max(0.05, next.leaves.density * q.leaves);
  next.trunk.sides = Math.max(5, Math.round(next.trunk.sides * q.trunkSides));
  next.trunk.segments = Math.max(8, Math.round(next.trunk.segments * q.trunkSegments));
  next.branches.sides = Math.max(4, Math.round(next.branches.sides * q.branchSides));
  next.branches.segments = Math.max(4, Math.round(next.branches.segments * q.segments));
  return next;
}

function requestBuild({ frame = false } = {}) {
  if (frame) state.reframe = true;
  pendingParams = effectiveParams(state.params);
  if (inFlight) return;
  pump();
}

function pump() {
  if (inFlight) return;
  if (!pendingParams) return;
  if (!worker || workerBroken) {
    pendingParams = null;
    buildOnMainThread();
    return;
  }
  const params = pendingParams;
  pendingParams = null;
  inFlight = true;
  worker.postMessage({ id: (requestId += 1), params, quality: state.quality });
  if (!document.body.classList.contains('is-growing')) {
    document.body.classList.add('is-growing');
  }
}

function buildOnMainThread() {
  const params = pendingParams || effectiveParams(state.params);
  pendingParams = null;
  const tree = generateTree(params);
  applyTree({
    bark: packGeometry(tree.barkGeometry),
    leaf: packGeometry(tree.leafGeometry),
    stats: tree.stats,
    bounds: [tree.bounds.min.x, tree.bounds.min.y, tree.bounds.min.z, tree.bounds.max.x, tree.bounds.max.y, tree.bounds.max.z],
    trunkHeight: tree.trunkHeight,
  });
}

function applyTree(data) {
  const [minX, minY, minZ, maxX, maxY, maxZ] = data.bounds;
  const bounds = new THREE.Box3(
    new THREE.Vector3(minX, minY, minZ),
    new THREE.Vector3(maxX, maxY, maxZ),
  );
  const barkGeometry = unpackGeometry(data.bark);
  const leafGeometry = unpackGeometry(data.leaf);
  state.tree = { barkGeometry, leafGeometry, bounds, stats: data.stats };

  const shouldFrame = state.reframe || state.firstTree;
  state.reframe = false;
  stage.setTree(state.tree, { instant: state.firstTree, frame: shouldFrame });
  stage.setBarkRoughness?.(state.params.bark.roughness);
  updateStats(data.stats);

  document.body.classList.remove('is-growing');
  if (state.firstTree) {
    state.firstTree = false;
    dom.bootStatus.textContent = 'opening leaves';
    setTimeout(() => {
      dom.boot.classList.add('is-done');
      if (state.tree?.stats) {
        toast(`${SPECIES_BY_ID[state.params.species]?.name || 'Tree'} grown — ${fmtCompact(state.tree.stats.triangles)} triangles`);
      }
    }, 380);
  }
  pump();
}

/* -------------------------------------------------------------------- UI */

function fmtInt(value) {
  return new Intl.NumberFormat('en-US').format(Math.round(value));
}

function fmtCompact(value) {
  if (value >= 10000) return `${(value / 1000).toFixed(value >= 100000 ? 0 : 1)}k`;
  return fmtInt(value);
}

function updateStats(stats) {
  dom.stats.height.textContent = `${stats.height.toFixed(1)} m`;
  dom.stats.spread.textContent = `${stats.spread.toFixed(1)} m`;
  dom.stats.leaves.textContent = fmtCompact(stats.leaves);
  dom.stats.tris.textContent = fmtCompact(stats.triangles);
}

function buildSpeciesRail() {
  dom.speciesList.innerHTML = '';
  SPECIES.forEach((species) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `species${species.id === state.species ? ' is-active' : ''}`;
    button.dataset.species = species.id;
    button.title = `${species.name} — ${species.latin}`;
    button.setAttribute('aria-pressed', String(species.id === state.species));
    button.setAttribute('aria-label', `${species.name} — ${species.latin}`);
    button.innerHTML = `
      <span class="species-thumb"><img src="${import.meta.env.BASE_URL}thumbs/${species.id}.png" alt="" loading="lazy" draggable="false" /></span>
      <span class="species-name">${species.name}</span>
    `;
    button.addEventListener('click', () => selectSpecies(species.id));
    dom.speciesList.append(button);
  });
}

function syncSpeciesCopy() {
  const species = SPECIES_BY_ID[state.params.species];
  dom.speciesName.textContent = species.name;
  dom.speciesLatin.textContent = species.latin;
  dom.exportSpecies.textContent = species.name;
  dom.speciesList.querySelectorAll('.species').forEach((button) => {
    const active = button.dataset.species === state.params.species;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function isModified() {
  const { species, seed, ...rest } = state.params;
  const { species: ps, seed: pseed, ...presetRest } = state.preset;
  const normalize = (value) => JSON.stringify(value);
  return normalize(rest) !== normalize(presetRest);
}

function markModified() {
  dom.modifiedDot.classList.toggle('is-visible', isModified());
}

function selectSpecies(id) {
  if (state.species === id) {
    // clicking the active species restores its untouched preset
    if (isModified()) {
      const seed = state.params.seed;
      state.params = makeParams(id, seed);
      refreshPanel();
      syncSeed();
      markModified();
      requestBuild({ frame: true });
      updateWind();
      toast(`${SPECIES_BY_ID[id]?.name || 'Tree'} restored to preset`);
    }
    return;
  }
  state.species = id;
  state.params = makeParams(id, state.params.seed);
  state.preset = presetParams(id);
  syncSpeciesCopy();
  refreshPanel();
  markModified();
  syncSeed();
  syncHash();
  requestBuild({ frame: true });
  updateWind();
  if (window.innerWidth <= 900) document.body.classList.remove('panel-open');
}

function syncSeed() {
  dom.seedInput.value = String(state.params.seed);
  dom.exportSeed.textContent = String(state.params.seed);
}

function refreshPanel() {
  const controls = buildPanel({
    container: dom.panelBody,
    getParams: () => state.params,
    getPreset: () => state.preset,
    onChange: () => {
      markModified();
      requestBuild();
      updateWind();
      syncExportSummary();
    },
    onResetChange: () => {
      markModified();
      requestBuild();
      updateWind();
      if (state.controls) state.controls.applyPreset();
    },
    quality: state.quality,
    onQuality: (level) => setQuality(level),
  });
  state.controls = controls;
  controls.speciesNote.textContent = SPECIES_BY_ID[state.params.species]?.note || '';
}

function setSeed(seed, { announce = false } = {}) {
  const value = Math.max(1, Math.min(99999999, Math.round(seed) || 1));
  state.params.seed = value;
  syncSeed();
  syncHash();
  requestBuild();
  if (announce) toast(`Grew seed ${value}`);
}

function setQuality(level) {
  if (!QUALITY[level]) return;
  state.quality = level;
  dom.detailChip.querySelectorAll('button').forEach((button) => {
    const active = button.dataset.detail === level;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  if (state.controls?.quality) state.controls.quality.set(level);
  requestBuild();
}

function updateWind() {
  if (!stage) return;
  stage.setWind(state.wind ? state.params.leaves.wind : 0);
}

function randomSpecies() {
  const others = SPECIES.filter((species) => species.id !== state.species);
  return others[Math.floor(Math.random() * others.length)]?.id || state.species;
}

function shareLink() {
  const url = new URL(window.location.href);
  url.hash = buildHash(state.params.species, state.params.seed);
  return url.toString();
}

function syncHash({ replace = true } = {}) {
  const hash = buildHash(state.params.species, state.params.seed);
  if (window.location.hash === hash) return;
  const url = `${window.location.pathname}${window.location.search}${hash}`;
  if (replace) window.history.replaceState(null, '', url);
  else window.history.pushState(null, '', url);
}

function readHash() {
  return parseHash(window.location.hash);
}

async function copyShareLink() {
  const link = shareLink();
  let copied = false;
  try {
    await navigator.clipboard.writeText(link);
    copied = true;
  } catch (error) {
    // Clipboard access can be blocked inside embedded previews; fall back to a
    // selectable field instead of a prompt, which iframes often suppress too.
    dom.shareRow.hidden = false;
    dom.shareInput.value = link;
    dom.shareInput.focus();
    dom.shareInput.select();
    try {
      copied = document.execCommand('copy');
    } catch (execError) {
      copied = false;
    }
  }
  toast(copied ? 'Share link copied' : 'Share link ready — press Ctrl/Cmd+C');
}

function applyDesign(payload) {
  const incoming = payload?.params || payload;
  if (!incoming || typeof incoming !== 'object' || !incoming.trunk || !incoming.branches) {
    throw new Error('not a Sapling design');
  }
  const speciesId = SPECIES_BY_ID[incoming.species] ? incoming.species : state.species;
  const seed = Number(payload?.seed || incoming.seed || state.params.seed);
  const safeSeed = Number.isFinite(seed) && seed > 0 ? Math.round(seed) : state.params.seed;
  const preset = presetParams(speciesId);
  state.species = speciesId;
  state.preset = preset;
  state.params = sanitizeParams(incoming, preset);
  state.params.species = speciesId;
  state.params.seed = safeSeed;

  syncSpeciesCopy();
  refreshPanel();
  syncSeed();
  syncHash();
  markModified();
  requestBuild({ frame: true });
  updateWind();
}

let toastTimer = null;
function toast(message) {
  dom.toast.textContent = message;
  dom.toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => dom.toast.classList.remove('is-visible'), 2600);
}

/* ------------------------------------------------------------- interaction */

dom.wind.addEventListener('click', () => {
  state.wind = !state.wind;
  dom.wind.setAttribute('aria-pressed', String(state.wind));
  updateWind();
  toast(state.wind ? 'Breeze on' : 'Still air');
});

dom.rotate.addEventListener('click', () => {
  state.rotate = !state.rotate;
  dom.rotate.setAttribute('aria-pressed', String(state.rotate));
  stage.setAutoRotate(state.rotate);
});

stage.onUserInteract = () => {
  if (!state.rotate) return;
  state.rotate = false;
  dom.rotate.setAttribute('aria-pressed', 'false');
  stage.setAutoRotate(false);
};

dom.dice.addEventListener('click', () => setSeed(randomSeed(), { announce: true }));
dom.surprise.addEventListener('click', () => {
  const species = randomSpecies();
  const seed = randomSeed();
  state.species = species;
  state.params = makeParams(species, seed);
  state.preset = presetParams(species);
  syncSpeciesCopy();
  refreshPanel();
  syncSeed();
  syncHash();
  markModified();
  requestBuild({ frame: true });
  updateWind();
  toast(`Surprise — ${SPECIES_BY_ID[species].name} from seed ${seed}`);
});

dom.seedInput.addEventListener('change', () => {
  const parsed = Number.parseInt(dom.seedInput.value.replace(/[^\d]/g, ''), 10);
  if (!Number.isFinite(parsed)) {
    syncSeed();
    return;
  }
  setSeed(parsed);
});
dom.seedInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') dom.seedInput.blur();
});

dom.brand.addEventListener('click', (event) => {
  event.preventDefault();
  stage.resetView();
});

/* panel behaviour */

function togglePanel() {
  if (window.innerWidth <= 900) {
    const open = document.body.classList.toggle('panel-open');
    dom.panelToggle.setAttribute('aria-expanded', String(open));
    return;
  }
  const collapsed = document.body.classList.toggle('panel-collapsed');
  dom.panelToggle.setAttribute('aria-expanded', String(!collapsed));
}

dom.panelToggle.addEventListener('click', (event) => {
  event.stopPropagation();
  togglePanel();
});

dom.panel.querySelector('.panel-head').addEventListener('click', (event) => {
  if (window.innerWidth > 900) return;
  if (event.target.closest('button')) return;
  togglePanel();
});

/* quality chips */

dom.detailChip.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-detail]');
  if (!button) return;
  setQuality(button.dataset.detail);
  toast(`Preview: ${button.textContent.trim()} detail`);
});

/* ------------------------------------------------------------------ modals */

let lastFocused = null;

function focusableIn(node) {
  return [...node.querySelectorAll('button, input, [href], select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter((element) => !element.disabled && element.offsetParent !== null);
}

function openModal(node) {
  lastFocused = document.activeElement;
  node.hidden = false;
  document.body.style.overflow = 'hidden';
  const focusable = focusableIn(node)[0] || node;
  focusable.focus({ preventScroll: true });
}

function closeModal(node) {
  node.hidden = true;
  document.body.style.overflow = '';
  if (node === dom.exportModal) dom.shareRow.hidden = true;
  if (lastFocused && document.contains(lastFocused)) {
    lastFocused.focus({ preventScroll: true });
  }
  lastFocused = null;
}

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Tab') return;
  const modal = [dom.exportModal, dom.helpModal].find((node) => !node.hidden);
  if (!modal) return;
  const focusable = focusableIn(modal);
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

[dom.exportModal, dom.helpModal].forEach((modal) => {
  modal.addEventListener('click', (event) => {
    if (event.target.closest('[data-close]')) closeModal(modal);
  });
});

dom.help.addEventListener('click', () => openModal(dom.helpModal));

dom.exportBtn.addEventListener('click', () => {
  syncExportSummary();
  openModal(dom.exportModal);
});

function syncExportSummary() {
  if (!state.tree) return;
  dom.exportStats.textContent = `${fmtInt(state.tree.stats.triangles)} tris (preview)`;
  dom.exportSeed.textContent = String(state.params.seed);
  dom.exportSpecies.textContent = SPECIES_BY_ID[state.params.species]?.name || 'Tree';
  dom.foliageRow.classList.toggle('is-disabled', state.format === 'json');
  dom.downloadLabel.textContent = state.format === 'glb'
    ? 'Download .glb'
    : state.format === 'obj'
      ? 'Download .zip (OBJ + MTL)'
      : 'Download seed .json';
  dom.exportCopy.textContent = state.format === 'glb'
    ? 'Game-ready glTF binary with baked vertex colours, metres, origin at the trunk base. Foliage is double-sided, so it drops straight into Blender, Unity, Unreal or Godot.'
    : state.format === 'obj'
      ? 'Universal Wavefront geometry, zipped with a matching .mtl and a short readme. Vertex colours are approximated per material because OBJ cannot carry them.'
      : 'A tiny JSON file holding the seed, species and every parameter. Load it back here to regrow the exact same tree.';
}

dom.formatList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-format]');
  if (!button) return;
  state.format = button.dataset.format;
  dom.formatList.querySelectorAll('.format').forEach((node) => {
    node.classList.toggle('is-active', node === button);
  });
  syncExportSummary();
});

dom.exportFoliage.addEventListener('change', () => {
  state.includeFoliage = dom.exportFoliage.checked;
});

dom.shareBtn.addEventListener('click', copyShareLink);

dom.loadBtn.addEventListener('click', () => dom.loadInput.click());

dom.loadInput.addEventListener('change', async () => {
  const file = dom.loadInput.files?.[0];
  dom.loadInput.value = '';
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    applyDesign(payload);
    closeModal(dom.exportModal);
    toast(`Loaded ${file.name}`);
  } catch (error) {
    console.error(error);
    toast('That file is not a Sapling design');
  }
});

let exporting = false;
dom.downloadBtn.addEventListener('click', async () => {
  if (exporting || !state.tree) return;
  exporting = true;
  const label = dom.downloadLabel.textContent;
  dom.downloadBtn.disabled = true;
  dom.downloadLabel.textContent = 'Growing for export…';
  document.body.classList.add('is-growing');
  try {
    // Exports are regenerated from the parameters at full detail, independent
    // of the preview quality setting.
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 30)));
    const exportParams = clone(state.params);
    const tree = generateTree(exportParams);
    const filename = await exportAs(state.format, tree, exportParams, {
      includeFoliage: state.includeFoliage,
    });
    dom.downloadLabel.textContent = label;
    toast(`${filename} is in your downloads`);
    closeModal(dom.exportModal);
  } catch (error) {
    console.error(error);
    toast('Export failed — check the console');
    dom.downloadLabel.textContent = label;
  } finally {
    exporting = false;
    dom.downloadBtn.disabled = false;
    document.body.classList.remove('is-growing');
  }
});

dom.shotBtn.addEventListener('click', () => {
  const dataUrl = stage.screenshot();
  snapshot(`sapling-${state.params.species}-${state.params.seed}.png`, dataUrl);
  toast('Snapshot saved');
});

/* ---------------------------------------------------------------- hotkeys */

window.addEventListener('keydown', (event) => {
  const typing = /^(INPUT|TEXTAREA)$/.test(event.target.tagName) || event.target.isContentEditable;
  if (event.key === 'Escape') {
    if (!dom.exportModal.hidden) closeModal(dom.exportModal);
    if (!dom.helpModal.hidden) closeModal(dom.helpModal);
    return;
  }
  if (typing) return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;

  const key = event.key.toLowerCase();
  if (key === 'r') {
    event.preventDefault();
    if (event.shiftKey) {
      selectSpecies(randomSpecies());
      setSeed(randomSeed(), { announce: true });
    } else {
      setSeed(randomSeed(), { announce: true });
    }
  } else if (key === 't') {
    dom.rotate.click();
  } else if (key === 'e') {
    dom.exportBtn.click();
  } else if (key === 'h' || key === '?') {
    openModal(dom.helpModal);
  } else if (event.code === 'Space' && !event.target.closest?.('button, a, [role="button"]')) {
    event.preventDefault();
    dom.wind.click();
  }
});

window.addEventListener('popstate', () => {
  const next = readHash();
  if (!next) return;
  const speciesChanged = next.species !== state.params.species;
  if (speciesChanged) selectSpecies(next.species);
  if (next.seed !== state.params.seed) setSeed(next.seed);
});

window.addEventListener('resize', () => {
  if (window.innerWidth > 900) document.body.classList.remove('panel-open');
});

/* --------------------------------------------------------------------- boot */

if (window.innerWidth <= 900) {
  dom.panelToggle.setAttribute('aria-expanded', 'false');
}

const initial = readHash();
if (initial) {
  state.species = initial.species;
  state.params = makeParams(initial.species, initial.seed);
  state.preset = presetParams(initial.species);
  syncSpeciesCopy();
}

buildSpeciesRail();
syncSpeciesCopy();
syncSeed();
syncHash();
refreshPanel();
setQuality(state.quality);
updateWind();
stage.setAutoRotate(state.rotate);
dom.rotate.setAttribute('aria-pressed', String(state.rotate));
dom.wind.setAttribute('aria-pressed', String(state.wind));
requestBuild({ frame: true });
