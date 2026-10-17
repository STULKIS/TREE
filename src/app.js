// Application controller. Owns state, wires the DOM, decides between the live 3D stage and the
// software still renderer, and runs exports. Dependencies are injected so tests can boot the
// whole app in jsdom with a stubbed stage and a probe that fails on demand.
import {
  SPECIES, SPECIES_ORDER, DEFAULT_SEED, DEFAULT_SPECIES, PARAM_LIST, HARD_LIMITS,
  presetParams, sanitizeDesign, sanitizeSeed, randomDesignFromRng,
} from './generator/params.js';
import { createRng } from './generator/rng.js';
import { probeWebGL, describeSupport } from './render/webgl-probe.js';
import { renderStill } from './render/cpu-renderer.js';
import { collectDiagnostics } from './render/diagnostics.js';
import { createPanel } from './ui/panel.js';
import { createDialog } from './ui/dialog.js';
import { encodeHash, decodeHash } from './ui/permalink.js';
import { buildGLB } from './export/glb.js';
import { buildOBJ } from './export/obj.js';
import { designToJSON, designFromJSON } from './export/design.js';
import { fileStem, triggerDownload, dataURLToBlob } from './export/snapshot.js';

const REQUIRED_IDS = [
  'viewport', 'still', 'fallback-banner', 'fallback-text', 'retry-3d', 'details-open', 'banner-dismiss',
  'species-list', 'panel', 'panel-body', 'panel-toggle', 'surprise', 'snapshot', 'export-open', 'help-open',
  'wind-toggle', 'turntable-toggle', 'status', 'toast', 'hud-triangles', 'hud-leaves', 'hud-height', 'hud-time',
  'specimen-name', 'mode-label', 'build-state', 'dlg-export', 'dlg-help', 'dlg-details', 'diag-text', 'diag-copy',
  'export-glb', 'export-obj', 'export-json', 'export-png', 'import-json', 'import-file',
];

const MAX_HISTORY = 100;
const SOFTWARE_TRIANGLES = HARD_LIMITS.softwareTriangles;
const STILL_MAX_PIXELS = 1.7e6;

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clone = (d) => JSON.parse(JSON.stringify(d));

export function createApp({
  doc,
  win,
  generator,
  createStage = null,
  probe = probeWebGL,
  describe = describeSupport,
  download = (blob, name) => triggerDownload(doc, win, blob, name),
  random = () => {
    const a = new Uint32Array(1);
    (win.crypto || globalThis.crypto).getRandomValues(a);
    return a[0];
  },
  now = () => win.performance.now(),
  lowCore = (win.navigator?.hardwareConcurrency || 8) <= 4,
}) {
  const $ = (id) => {
    const el = doc.getElementById(id);
    if (!el) throw new Error(`Sapling markup is missing #${id}`);
    return el;
  };
  const els = Object.fromEntries(REQUIRED_IDS.map((id) => [id, $(id)]));
  const reducedMotion = Boolean(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const timers = new Set();
  const later = (fn, ms) => {
    const t = win.setTimeout(() => { timers.delete(t); fn(); }, ms);
    timers.add(t);
    return t;
  };

  const initial = decodeHash(win.location?.hash) || sanitizeDesign({ species: DEFAULT_SPECIES, seed: DEFAULT_SEED, params: presetParams(DEFAULT_SPECIES) });
  const state = {
    design: clone(initial),
    mode: 'webgl',
    wind: !reducedMotion,
    turntable: false,
    result: null,
    displayed: null,
    history: [],
    future: [],
    editBase: null,
    azimuth: 0.6,
    reason: '',
    probe: null,
    support: null,
    buildCount: 0,
    lastBuildMs: 0,
    destroyed: false,
  };
  let stage = null;
  let buildTimer = null;
  let pendingGrow = false;
  let busy = 0;
  let redrawQueued = false;
  let speciesButtons = new Map();

  // ---------- announcements ----------
  function announce(message) {
    els.status.textContent = '';
    later(() => { els.status.textContent = message; }, 10);
  }
  function toast(message) {
    els.toast.textContent = message;
    els.toast.hidden = false;
    announce(message);
    later(() => { els.toast.hidden = true; }, 3800);
  }

  // ---------- dialogs ----------
  const exportDialog = createDialog({ doc, el: els['dlg-export'] });
  const helpDialog = createDialog({ doc, el: els['dlg-help'] });
  const detailsDialog = createDialog({ doc, el: els['dlg-details'] });

  // ---------- panel ----------
  const panel = createPanel({
    doc,
    root: els['panel-body'],
    onInput: (key, value) => {
      beginEdit();
      state.design.params[key] = value;
      scheduleBuild({ quality: 'preview' });
    },
    onCommit: (key, value) => {
      state.design.params[key] = value;
      commitEdit('studio');
    },
    onSeedInput: (raw) => {
      if (String(raw).trim() === '') return;
      beginEdit();
      state.design.seed = sanitizeSeed(raw, state.design.seed);
      scheduleBuild({ quality: 'preview' });
    },
    onSeedCommit: (raw) => {
      if (String(raw).trim() === '') {
        panel.setValues({}, state.design.seed);
        return;
      }
      state.design.seed = sanitizeSeed(raw, state.design.seed);
      commitEdit('studio', { grow: true });
    },
    onRollSeed: () => rollSeed(),
    onReset: () => resetParams(),
  });

  // ---------- history ----------
  function beginEdit() {
    if (!state.editBase) state.editBase = clone(state.design);
  }
  function commitEdit(quality, opts = {}) {
    if (state.editBase && !same(state.editBase, state.design)) {
      state.history.push(state.editBase);
      if (state.history.length > MAX_HISTORY) state.history.shift();
      state.future = [];
    }
    state.editBase = null;
    writeHash();
    scheduleBuild({ quality, grow: opts.grow });
  }

  /** Discrete design change (species, seed roll, surprise, reset, undo) with optional history. */
  function applyDesign(next, { record = true, grow = false, quality = 'studio' } = {}) {
    const clean = sanitizeDesign(next);
    if (record && !same(clean, state.design)) {
      state.history.push(clone(state.design));
      if (state.history.length > MAX_HISTORY) state.history.shift();
      state.future = [];
    }
    state.design = clone(clean);
    state.editBase = null;
    panel.setValues(state.design.params, state.design.seed);
    syncSpecies();
    syncHeader();
    writeHash();
    scheduleBuild({ quality, grow });
  }

  function writeHash() {
    try {
      if (win.history?.replaceState) win.history.replaceState(null, '', encodeHash(state.design));
    } catch { /* sandboxed frames may forbid history writes */ }
  }

  // ---------- species rail & header ----------
  function buildSpeciesRail() {
    els['species-list'].replaceChildren();
    speciesButtons = new Map();
    for (const id of SPECIES_ORDER) {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'species';
      b.dataset.species = id;
      b.setAttribute('aria-pressed', 'false');
      const thumb = doc.createElement('span');
      thumb.className = 'thumb';
      const img = doc.createElement('img');
      img.alt = '';
      img.width = 72;
      img.height = 72;
      thumb.append(img);
      const name = doc.createElement('span');
      name.className = 'name';
      name.textContent = SPECIES[id].label;
      const blurb = doc.createElement('span');
      blurb.className = 'blurb';
      blurb.textContent = SPECIES[id].blurb;
      b.append(thumb, name, blurb);
      b.addEventListener('click', () => {
        if (state.design.species === id) return;
        applyDesign({ species: id, seed: state.design.seed, params: presetParams(id) }, { grow: true });
        announce(`${SPECIES[id].label} selected. Seed ${state.design.seed} kept.`);
      });
      els['species-list'].append(b);
      speciesButtons.set(id, { button: b, img });
    }
  }
  function syncSpecies() {
    for (const [id, { button }] of speciesButtons) {
      button.setAttribute('aria-pressed', String(id === state.design.species));
    }
  }
  function syncHeader() {
    const label = SPECIES[state.design.species].label;
    els['specimen-name'].textContent = `${label} · seed ${state.design.seed}`;
    els['mode-label'].textContent = state.mode === 'webgl' ? 'Live 3D' : 'Software still';
    els['wind-toggle'].setAttribute('aria-pressed', String(state.wind && state.mode === 'webgl'));
    els['turntable-toggle'].setAttribute('aria-pressed', String(state.turntable));
  }

  // ---------- builds ----------
  function displayQuality(q) {
    return state.mode === 'software' ? 'software' : q;
  }

  function scheduleBuild({ quality = 'studio', grow = false } = {}) {
    pendingGrow = pendingGrow || grow;
    if (buildTimer) win.clearTimeout(buildTimer);
    const delay = quality === 'preview' ? 30 : 0;
    els['build-state'].textContent = 'Growing…';
    buildTimer = later(() => {
      buildTimer = null;
      void runBuild(quality);
    }, delay);
  }

  async function runBuild(quality) {
    const design = clone(state.design);
    const grow = pendingGrow;
    pendingGrow = false;
    const q = displayQuality(quality);
    busy++;
    const t0 = now();
    let out;
    try {
      out = await generator.request(design, q);
    } catch (err) {
      busy--;
      toast(`Generation failed: ${err.message}`);
      return;
    }
    busy--;
    if (state.destroyed) return;
    if (!out) return; // superseded by a newer request
    state.lastBuildMs = now() - t0;
    state.buildCount++;
    display(out.result, out.design, { grow });
    els['build-state'].textContent = busy ? 'Growing…' : 'Ready';
  }

  function display(result, design, { grow = false } = {}) {
    state.result = result;
    state.displayed = design;
    const s = result.stats;
    els['hud-triangles'].textContent = s.triangles.toLocaleString('en-US');
    els['hud-leaves'].textContent = s.leaves.toLocaleString('en-US');
    els['hud-height'].textContent = `${s.height.toFixed(1)} m`;
    els['hud-time'].textContent = `${Math.round(state.lastBuildMs)} ms`;
    syncHeader();
    if (state.mode === 'webgl' && stage) {
      try {
        stage.setMesh(result, { grow });
      } catch (err) {
        enterSoftware(`The 3D view failed while drawing: ${err.message}`);
      }
    } else {
      drawStill();
    }
  }

  // ---------- software still ----------
  function stillSize() {
    const cw = els.viewport.clientWidth || 800;
    const ch = els.viewport.clientHeight || 600;
    const dpr = Math.min(win.devicePixelRatio || 1, 2);
    let w = Math.max(64, Math.round(cw * dpr));
    let h = Math.max(64, Math.round(ch * dpr));
    const px = w * h;
    if (px > STILL_MAX_PIXELS) {
      const k = Math.sqrt(STILL_MAX_PIXELS / px);
      w = Math.round(w * k);
      h = Math.round(h * k);
    }
    return { w, h };
  }

  function drawStill() {
    if (!state.result) return;
    const canvas = els.still;
    const { w, h } = stillSize();
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      announce('This browser cannot draw the still preview.');
      return;
    }
    const stats = renderStill(ctx, state.result, { width: w, height: h, azimuth: state.azimuth, budget: SOFTWARE_TRIANGLES });
    state.lastStill = stats;
    canvas.setAttribute('aria-label', `Software render of ${SPECIES[state.design.species].label}, seed ${state.design.seed}. ${stats.drawn.toLocaleString('en-US')} triangles drawn. Arrow keys orbit.`);
  }

  function queueRedraw() {
    if (redrawQueued) return;
    redrawQueued = true;
    win.requestAnimationFrame(() => {
      redrawQueued = false;
      if (state.mode === 'software') drawStill();
    });
  }

  // ---------- WebGL lifecycle ----------
  function removeWebGLCanvases() {
    for (const c of els.viewport.querySelectorAll('canvas.webgl-canvas')) c.remove();
  }

  function showBanner(text) {
    els['fallback-text'].textContent = text;
    els['fallback-banner'].hidden = false;
  }
  function hideBanner() {
    els['fallback-banner'].hidden = true;
  }

  function enterSoftware(reason) {
    if (stage) {
      try { stage.dispose(); } catch { /* best effort */ }
      stage = null;
    }
    removeWebGLCanvases();
    state.mode = 'software';
    state.reason = reason;
    els.still.hidden = false;
    els.viewport.dataset.mode = 'software';
    showBanner(`${reason} The studio keeps working: generation, sliders, share links and exports are unchanged.`);
    syncHeader();
    scheduleBuild({ quality: 'software' });
  }

  function mountWebGL(res) {
    const canvas = res.canvas;
    canvas.classList.add('webgl-canvas');
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Live 3D view of the specimen. Drag to orbit; arrow keys orbit when focused.');
    els.viewport.insertBefore(canvas, els.still);
    try {
      if (!createStage) throw new Error('no 3D renderer is available');
      stage = createStage({
        canvas,
        gl: res.gl,
        container: els.viewport,
        doc,
        win,
        reducedMotion,
        lowCore,
        onContextLost: handleContextLost,
      });
    } catch (err) {
      canvas.remove();
      stage = null;
      if (res.attempts) res.attempts.push({ label: 'renderer constructor', ok: false, error: err.message });
      state.probe = res;
      enterSoftware(`The 3D renderer could not start (${err.message}).`);
      return false;
    }
    state.mode = 'webgl';
    state.probe = res;
    els.still.hidden = true;
    els.viewport.dataset.mode = 'webgl';
    stage.setWind(state.wind);
    stage.setTurntable(state.turntable);
    hideBanner();
    syncHeader();
    if (state.result) stage.setMesh(state.result);
    return true;
  }

  function handleContextLost() {
    if (state.destroyed) return;
    toast('The GPU context was lost. Switched to the still renderer; your tree is intact.');
    enterSoftware('The GPU context was lost.');
  }

  function probeAndMount() {
    const res = probe({ createCanvas: () => doc.createElement('canvas') });
    if (res.ok) {
      mountWebGL(res);
      return res.ok;
    }
    state.probe = res;
    const last = res.attempts[res.attempts.length - 1];
    const why = last ? `WebGL 2 is unavailable (${last.error}).` : 'WebGL 2 is unavailable.';
    enterSoftware(why);
    return false;
  }

  function retry3D() {
    // A failed canvas stays poisoned: drop every WebGL node and probe again with fresh ones.
    removeWebGLCanvases();
    const ok = probeAndMount();
    if (ok) {
      toast('3D view restored.');
      scheduleBuild({ quality: 'studio' });
    } else {
      toast('3D is still unavailable. The still renderer remains active.');
    }
  }

  function openDetails() {
    if (!state.support) {
      try {
        state.support = describe({ createCanvas: () => doc.createElement('canvas') });
      } catch (err) {
        state.support = { webgl2: false, webgl1: false, errors: [err.message] };
      }
    }
    els['diag-text'].textContent = collectDiagnostics({
      win,
      nav: win.navigator,
      screen: win.screen,
      probe: state.probe,
      support: state.support,
      reason: state.reason,
    });
    detailsDialog.open(els['diag-copy']);
  }

  // ---------- thumbnails (generated, never decorative) ----------
  async function renderThumbnails() {
    const probeCanvas = doc.createElement('canvas');
    if (!probeCanvas.getContext || !probeCanvas.getContext('2d')) return;
    for (const id of SPECIES_ORDER) {
      if (state.destroyed) return;
      try {
        const { result } = await generator.build({ species: id, seed: DEFAULT_SEED, params: presetParams(id) }, 'software');
        const c = doc.createElement('canvas');
        c.width = 144;
        c.height = 144;
        const ctx = c.getContext('2d');
        renderStill(ctx, result, { width: 144, height: 144, azimuth: 0.7, elevation: 0.1, budget: 9000 });
        speciesButtons.get(id).img.src = c.toDataURL('image/png');
      } catch { /* a missing thumbnail is cosmetic */ }
    }
  }

  // ---------- actions ----------
  function rollSeed() {
    applyDesign({ ...state.design, seed: random() }, { grow: true });
    announce(`Seed rolled to ${state.design.seed}.`);
  }

  function resetParams() {
    applyDesign({ species: state.design.species, seed: state.design.seed, params: presetParams(state.design.species) });
    announce(`${SPECIES[state.design.species].label} parameters reset. Seed ${state.design.seed} kept.`);
  }

  function surprise() {
    const next = randomDesignFromRng(createRng(random()));
    applyDesign(next, { grow: true });
    announce(`Surprise: ${SPECIES[next.species].label}, seed ${next.seed}.`);
  }

  function undo() {
    const prev = state.history.pop();
    if (!prev) return announce('Nothing to undo.');
    state.future.push(clone(state.design));
    applyDesign(prev, { record: false, grow: prev.species !== state.design.species || prev.seed !== state.design.seed });
    announce('Undone.');
  }

  function redo() {
    const next = state.future.pop();
    if (!next) return announce('Nothing to redo.');
    state.history.push(clone(state.design));
    applyDesign(next, { record: false, grow: next.species !== state.design.species || next.seed !== state.design.seed });
    announce('Redone.');
  }

  function setWind(on) {
    state.wind = Boolean(on);
    if (state.mode === 'webgl' && stage) stage.setWind(state.wind && !reducedMotion);
    syncHeader();
    announce(state.mode === 'webgl' ? `Wind ${state.wind ? 'on' : 'off'}.` : 'Wind needs the live 3D view.');
  }

  function setTurntable(on) {
    state.turntable = Boolean(on);
    if (state.mode === 'webgl' && stage) stage.setTurntable(state.turntable);
    syncHeader();
    announce(state.mode === 'webgl' ? `Turntable ${state.turntable ? 'on' : 'off'}.` : 'Turntable needs the live 3D view. Use arrow keys on the still.');
  }

  function snapshotBlob() {
    if (state.mode === 'webgl' && stage) {
      return dataURLToBlob(stage.snapshot(), 'image/png');
    }
    const canvas = els.still;
    if (!state.result) throw new Error('Nothing to capture yet');
    drawStill();
    return dataURLToBlob(canvas.toDataURL('image/png'), 'image/png');
  }

  function snapshot() {
    try {
      const blob = snapshotBlob();
      download(blob, `${fileStem(state.design, 'snapshot')}.png`);
      announce('Snapshot saved.');
    } catch (err) {
      toast(`Snapshot failed: ${err.message}`);
    }
  }

  /** Exports always regenerate at studio quality from the cleaned-up design. */
  async function exportAs(kind) {
    if (kind === 'png') return snapshot();
    const design = clone(state.design);
    let out;
    try {
      out = await generator.build(design, 'studio');
    } catch (err) {
      return toast(`Export failed: ${err.message}`);
    }
    const { result } = out;
    const clean = out.design;
    const stem = fileStem(clean);
    if (kind === 'glb') {
      const bytes = buildGLB(result, { name: `${SPECIES[clean.species].label} ${clean.seed}`, extras: { sapling: { species: clean.species, seed: clean.seed, params: clean.params, stats: result.stats } } });
      download(new Blob([bytes], { type: 'model/gltf-binary' }), `${stem}.glb`);
      return announce(`GLB exported (${result.stats.triangles.toLocaleString('en-US')} triangles).`);
    }
    if (kind === 'obj') {
      const { obj, mtl } = buildOBJ(result, { baseName: stem, species: clean.species, seed: clean.seed });
      download(new Blob([obj], { type: 'model/obj' }), `${stem}.obj`);
      download(new Blob([mtl], { type: 'model/mtl' }), `${stem}.mtl`);
      return announce('OBJ and MTL exported.');
    }
    if (kind === 'json') {
      download(new Blob([designToJSON(clean, result.stats)], { type: 'application/json' }), `${stem}.design.json`);
      return announce('Design JSON exported.');
    }
    return undefined;
  }

  function importText(text) {
    try {
      const design = designFromJSON(text);
      applyDesign(design, { grow: true });
      exportDialog.close();
      announce(`Design imported: ${SPECIES[design.species].label}, seed ${design.seed}.`);
      return design;
    } catch (err) {
      toast(`Import failed: ${err.message}`);
      return null;
    }
  }

  // ---------- events ----------
  function bindEvents() {
    els['surprise'].addEventListener('click', surprise);
    els.snapshot.addEventListener('click', snapshot);
    els['export-open'].addEventListener('click', () => exportDialog.open());
    els['help-open'].addEventListener('click', () => helpDialog.open());
    els['retry-3d'].addEventListener('click', retry3D);
    els['details-open'].addEventListener('click', openDetails);
    els['banner-dismiss'].addEventListener('click', () => hideBanner());
    els['wind-toggle'].addEventListener('click', () => setWind(!state.wind));
    els['turntable-toggle'].addEventListener('click', () => setTurntable(!state.turntable));
    els['panel-toggle'].addEventListener('click', () => {
      const open = !els.panel.classList.contains('open');
      els.panel.classList.toggle('open', open);
      els['panel-toggle'].setAttribute('aria-expanded', String(open));
    });
    els['export-glb'].addEventListener('click', () => exportAs('glb'));
    els['export-obj'].addEventListener('click', () => exportAs('obj'));
    els['export-json'].addEventListener('click', () => exportAs('json'));
    els['export-png'].addEventListener('click', () => exportAs('png'));
    els['import-json'].addEventListener('click', () => els['import-file'].click());
    els['import-file'].addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      importText(await file.text());
    });
    els['diag-copy'].addEventListener('click', async () => {
      const text = els['diag-text'].textContent;
      try {
        await win.navigator.clipboard.writeText(text);
        toast('Diagnostics copied.');
      } catch {
        const range = doc.createRange();
        range.selectNodeContents(els['diag-text']);
        win.getSelection()?.removeAllRanges();
        win.getSelection()?.addRange(range);
        toast('Select-all done; copy with Ctrl/Cmd+C.');
      }
    });
    for (const dlg of [exportDialog, helpDialog, detailsDialog]) {
      dlg.el.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => dlg.close()));
    }

    doc.addEventListener('keydown', onKeydown);
    win.addEventListener('hashchange', onHashChange);

    // Software still: drag and arrow keys orbit the preview.
    let drag = null;
    els.still.addEventListener('pointerdown', (e) => {
      drag = { x: e.clientX };
      els.still.setPointerCapture?.(e.pointerId);
    });
    els.still.addEventListener('pointermove', (e) => {
      if (!drag) return;
      state.azimuth += (e.clientX - drag.x) * 0.01;
      drag.x = e.clientX;
      queueRedraw();
    });
    const endDrag = () => { drag = null; };
    els.still.addEventListener('pointerup', endDrag);
    els.still.addEventListener('pointercancel', endDrag);
    els.still.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        state.azimuth += (e.key === 'ArrowLeft' ? -1 : 1) * 0.15;
        queueRedraw();
      }
    });

    if (win.ResizeObserver) {
      const ro = new win.ResizeObserver(() => queueRedraw());
      ro.observe(els.viewport);
      bindEvents.ro = ro;
    }
    doc.addEventListener('visibilitychange', () => {
      if (!doc.hidden && state.mode === 'software') queueRedraw();
    });

    // Species rail: keyboard users reach each species as a button; arrows move between them.
    els['species-list'].addEventListener('keydown', (e) => {
      if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      const buttons = [...els['species-list'].querySelectorAll('button')];
      const i = buttons.indexOf(doc.activeElement);
      if (i < 0) return;
      e.preventDefault();
      const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1;
      buttons[(i + step + buttons.length) % buttons.length].focus();
    });
  }

  function isTextTarget(t) {
    if (!t) return false;
    if (t.isContentEditable) return true;
    if (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return true;
    if (t.tagName === 'INPUT') return !['range', 'radio', 'checkbox', 'color', 'button', 'submit'].includes(t.type);
    return false;
  }

  function onKeydown(event) {
    if (state.destroyed) return;
    if (exportDialog.isOpen || helpDialog.isOpen || detailsDialog.isOpen) return;
    const t = event.target;
    const mod = event.ctrlKey || event.metaKey;
    if (mod && !event.altKey && event.key.toLowerCase() === 'z' && !isTextTarget(t)) {
      event.preventDefault();
      if (event.shiftKey) redo(); else undo();
      return;
    }
    if (mod || event.altKey || isTextTarget(t)) return;
    const interactive = t && (t.tagName === 'BUTTON' || t.tagName === 'A' || t.tagName === 'INPUT' || t.tagName === 'SUMMARY');
    switch (event.key) {
      case ' ':
        if (interactive) return;
        event.preventDefault();
        setWind(!state.wind);
        break;
      case 't': case 'T':
        setTurntable(!state.turntable);
        break;
      case 'r': case 'R':
        resetParams();
        break;
      case 'e': case 'E':
        exportDialog.open();
        break;
      case 'd': case 'D':
        rollSeed();
        break;
      case '?':
        helpDialog.open();
        break;
      default:
    }
  }

  function onHashChange() {
    const decoded = decodeHash(win.location.hash);
    if (!decoded) return;
    if (same(decoded, state.design)) return;
    applyDesign(decoded, { grow: true });
  }

  // ---------- boot ----------
  buildSpeciesRail();
  panel.setValues(state.design.params, state.design.seed);
  syncSpecies();
  syncHeader();
  bindEvents();
  probeAndMount();
  scheduleBuild({ quality: state.mode === 'webgl' ? 'studio' : 'software', grow: false });
  const ready = (async () => {
    await idle();
    later(() => { void renderThumbnails(); }, 0);
  })();

  /** Resolves once no build is running and nothing is scheduled. */
  async function idle(limitMs = 20000) {
    const start = now();
    while (!state.destroyed && (busy > 0 || buildTimer)) {
      await new Promise((r) => win.setTimeout(r, 5));
      if (now() - start > limitMs) break;
    }
    await new Promise((r) => win.setTimeout(r, 0));
  }

  return {
    ready,
    idle,
    get state() { return state; },
    get panel() { return panel; },
    get stage() { return stage; },
    actions: {
      applyDesign, setWind, setTurntable, rollSeed, resetParams, surprise, undo, redo,
      snapshot, exportAs, importText, retry3D, openDetails,
    },
    dialogs: { export: exportDialog, help: helpDialog, details: detailsDialog },
    destroy() {
      state.destroyed = true;
      for (const t of timers) win.clearTimeout(t);
      timers.clear();
      if (buildTimer) win.clearTimeout(buildTimer);
      doc.removeEventListener('keydown', onKeydown);
      win.removeEventListener('hashchange', onHashChange);
      bindEvents.ro?.disconnect();
      if (stage) stage.dispose();
      stage = null;
    },
  };
}

export { HARD_LIMITS, PARAM_LIST };
