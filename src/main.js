/**
 * Sapling — application shell: state, interactions, hotkeys, quality flow,
 * WebGL probing with software fallback, exports and share links.
 *
 * `createApp()` is exported so tests can boot the whole UI against jsdom with a
 * stubbed stage; the module auto-boots in the browser unless
 * `window.__SAPLING_NO_AUTOBOOT__` is set.
 */
import { zipSync, strToU8 } from 'fflate';
import {
  SPECIES, SPECIES_IDS, DEFAULT_SPECIES, QUALITY, presetParams, sanitizeDesign, sanitizeSeed, sanitizeValue,
  diffFromPreset
} from './generator/params.js';
import { randomSeed } from './generator/rng.js';
import { generateTree } from './generator/tree.js';
import { GeneratorClient, isSuperseded } from './generator/client.js';
import { probeWebGL2 } from './render/probe.js';
import { collectDiagnostics, formatDiagnostics } from './render/diagnostics.js';
import { renderStill, blitStill } from './render/still.js';
import { ParamPanel } from './ui/panel.js';
import { Modal } from './ui/modal.js';
import { Toaster } from './ui/toast.js';
import { encodeHash, decodeHash, shareUrl } from './ui/permalink.js';
import { scheduleThumbnails } from './ui/thumbnails.js';
import { buildGlb } from './export/glb.js';
import { buildObj } from './export/obj.js';
import { buildDesignJson, parseDesignJson } from './export/design.js';
import { canvasToPngBlob } from './export/png.js';
import { downloadBlob, downloadBuffer, downloadText, exportFilename } from './export/download.js';

const DEFAULT_SEED = 7;
const MAX_STILL_PIXELS = 1.7e6;

function fmtInt(n) {
  return Number(n).toLocaleString('en-US');
}

/**
 * Boot the studio.
 * @param {object} [options]
 * @param {Document} [options.doc]
 * @param {Window}   [options.win]
 * @param {Function} [options.createStage]  `(opts) => Stage` (defaults to lazy import of render/stage.js)
 * @param {Function} [options.probe]        `(createCanvas) => probeResult`
 * @param {boolean}  [options.useWorker]
 * @param {boolean}  [options.thumbnails=true]
 * @param {boolean}  [options.forceSoftware]
 */
export function createApp(options = {}) {
  const doc = options.doc || document;
  const win = options.win || (doc.defaultView ?? window);
  const $ = (id) => doc.getElementById(id);

  const els = {
    app: $('app'),
    stage: $('stage'),
    viewport: $('viewport'),
    still: $('still-canvas'),
    busy: $('busy'),
    banner: $('banner'),
    bannerReason: $('banner-reason'),
    retry: $('retry-3d'),
    retryDialog: $('retry-3d-dialog'),
    details: $('details-3d'),
    bannerDismiss: $('banner-dismiss'),
    speciesList: $('species-list'),
    specimenName: $('specimen-name'),
    specimenLatin: $('specimen-latin'),
    specimenSeed: $('specimen-seed'),
    hudTriangles: $('hud-triangles'),
    hudLeaves: $('hud-leaves'),
    hudHeight: $('hud-height'),
    hudMode: $('hud-mode'),
    seed: $('seed'),
    dice: $('dice'),
    reset: $('reset'),
    params: $('params'),
    panel: $('panel'),
    panelToggle: $('panel-toggle'),
    panelClose: $('panel-close'),
    wind: $('wind'),
    turntable: $('turntable'),
    recenter: $('recenter'),
    surprise: $('surprise'),
    snapshot: $('snapshot'),
    export: $('export'),
    share: $('share'),
    help: $('help'),
    status: $('status'),
    toasts: $('toasts'),
    helpModal: $('help-modal'),
    exportModal: $('export-modal'),
    diagModal: $('diagnostics-modal'),
    diagText: $('diagnostics-text'),
    copyDiag: $('copy-diagnostics'),
    exportGlb: $('export-glb'),
    exportObj: $('export-obj'),
    exportJson: $('export-json'),
    exportPng: $('export-png'),
    importJson: $('import-json'),
    exportSummary: $('export-summary')
  };

  const reducedMotion = Boolean(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const toaster = new Toaster(els.toasts, els.status);
  const modals = {
    help: new Modal(els.helpModal),
    export: new Modal(els.exportModal),
    diag: new Modal(els.diagModal)
  };

  /* ── State ──────────────────────────────────────────────────────────── */
  const initial = parseInitialDesign(win);
  const state = {
    species: initial.species,
    seed: initial.seed,
    params: initial.params,
    mode: 'booting', // 'webgl' | 'software'
    tree: null,
    treeQuality: null,
    wind: !reducedMotion,
    turntable: false,
    history: [],
    probe: null,
    stage: null,
    stillView: { azimuth: 0.6, elevation: 0.22, zoom: 1 },
    generation: 0
  };
  const design = () => ({ species: state.species, seed: state.seed, params: { ...state.params } });

  /* ── Generator ──────────────────────────────────────────────────────── */
  const client = new GeneratorClient({ useWorker: options.useWorker, createWorker: options.createWorker });
  client.on((e) => {
    if (els.busy) els.busy.hidden = e.type !== 'busy';
  });

  /* ── Species rail ───────────────────────────────────────────────────── */
  const thumbSlots = new Map();
  const speciesButtons = new Map();
  for (const id of SPECIES_IDS) {
    const sp = SPECIES[id];
    const li = doc.createElement('li');
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'species';
    btn.dataset.species = id;
    btn.setAttribute('aria-pressed', String(id === state.species));
    btn.setAttribute('aria-label', `${sp.name} — ${sp.latin}`);
    btn.title = sp.blurb;
    const thumb = doc.createElement('span');
    thumb.className = 'species__thumb';
    thumb.setAttribute('aria-hidden', 'true');
    thumb.innerHTML = '<span class="species__thumb-fallback"></span>';
    const text = doc.createElement('span');
    text.className = 'species__text';
    text.innerHTML = `<span class="species__name">${sp.name}</span><span class="species__latin">${sp.latin}</span>`;
    btn.append(thumb, text);
    btn.addEventListener('click', () => setSpecies(id));
    li.appendChild(btn);
    els.speciesList.appendChild(li);
    thumbSlots.set(id, thumb);
    speciesButtons.set(id, btn);
  }

  /* ── Parameter panel ────────────────────────────────────────────────── */
  const panel = new ParamPanel(els.params, {
    onChange: (key, value, { commit }) => setParam(key, value, { commit })
  });
  panel.setParams(state.params);
  els.seed.value = String(state.seed);

  /* ── Rendering mode ─────────────────────────────────────────────────── */
  const createCanvas = () => doc.createElement('canvas');
  const probeFn = options.probe || probeWebGL2;
  const forceSoftware = Boolean(options.forceSoftware) || /[?&]nogl\b/.test(win.location ? win.location.search : '');

  async function tryEnter3D() {
    let probe;
    try {
      probe = forceSoftware
        ? { ok: false, reason: 'WebGL disabled by the ?nogl flag.', attempts: [{ label: 'forced', result: 'skipped (forced software mode)' }] }
        : probeFn(createCanvas);
    } catch (err) {
      probe = { ok: false, reason: `Probe threw: ${(err && err.message) || err}`, attempts: [{ label: 'probe', result: `threw: ${err}` }] };
    }
    state.probe = probe;
    if (!probe.ok) return false;
    try {
      const factory = options.createStage || (await defaultStageFactory());
      els.stage.innerHTML = '';
      els.stage.appendChild(probe.canvas);
      const stage = factory({
        container: els.stage,
        canvas: probe.canvas,
        context: probe.context,
        attrs: probe.attrs,
        reducedMotion,
        onContextLost: onContextLost
      });
      state.stage = stage;
      stage.setWind(state.wind);
      stage.setTurntable(state.turntable);
      return true;
    } catch (err) {
      state.probe = {
        ok: false,
        reason: `The 3D renderer failed to start (${(err && err.message) || err}).`,
        attempts: [...(probe.attempts || []), { label: 'renderer constructor', result: `threw: ${(err && err.message) || err}` }]
      };
      els.stage.innerHTML = '';
      return false;
    }
  }

  function enterSoftwareMode(reason, { toast = false } = {}) {
    if (state.stage) {
      try {
        state.stage.dispose();
      } catch {
        /* ignore */
      }
      state.stage = null;
    }
    els.stage.innerHTML = '';
    state.mode = 'software';
    els.app.dataset.mode = 'software';
    els.still.hidden = false;
    els.banner.hidden = false;
    els.bannerReason.textContent = reason || (state.probe && state.probe.reason) || 'WebGL 2 is unavailable.';
    els.hudMode.textContent = 'software';
    if (els.turntable) els.turntable.disabled = true;
    if (els.wind) els.wind.disabled = true;
    if (toast) toaster.show('3D view lost — switched to software preview. Your tree is safe.', { tone: 'warn', duration: 5000 });
    else toaster.announce('Software preview mode. 3D view unavailable.');
    if (state.tree) renderStillToCanvas();
  }

  function enterWebGLMode() {
    state.mode = 'webgl';
    els.app.dataset.mode = 'webgl';
    els.still.hidden = true;
    els.banner.hidden = true;
    els.hudMode.textContent = 'webgl 2';
    if (els.turntable) els.turntable.disabled = false;
    if (els.wind) els.wind.disabled = reducedMotion;
  }

  function onContextLost() {
    enterSoftwareMode('The WebGL context was lost (the GPU reset or ran out of memory).', { toast: true });
    scheduleBuild({ quality: 'software', commit: false, animate: false });
  }

  async function retry3D(opener) {
    toaster.announce('Retrying 3D…');
    // A failed canvas stays poisoned: the probe always uses fresh nodes.
    els.stage.innerHTML = '';
    const ok = await tryEnter3D();
    if (ok) {
      enterWebGLMode();
      modals.diag.hide();
      toaster.show('3D view restored.', { tone: 'ok' });
      if (state.tree) state.stage.setTree(state.tree, { animate: true, reframe: true });
      scheduleBuild({ quality: 'studio', commit: false, animate: false });
    } else {
      els.bannerReason.textContent = state.probe.reason;
      toaster.show('Still no WebGL 2. Staying in software preview.', { tone: 'warn' });
      if (opener && typeof opener.focus === 'function') opener.focus();
    }
    return ok;
  }

  /* ── Software still rendering ───────────────────────────────────────── */
  let stillTimer = null;
  function renderStillToCanvas() {
    if (state.mode !== 'software' || !state.tree) return null;
    const rect = { w: els.viewport.clientWidth || 960, h: els.viewport.clientHeight || 600 };
    const dpr = Math.min(win.devicePixelRatio || 1, 2);
    let w = Math.max(64, Math.round(rect.w * dpr));
    let h = Math.max(64, Math.round(rect.h * dpr));
    const px = w * h;
    if (px > MAX_STILL_PIXELS) {
      const s = Math.sqrt(MAX_STILL_PIXELS / px);
      w = Math.round(w * s);
      h = Math.round(h * s);
    }
    const still = renderStill(state.tree, { width: w, height: h, ...state.stillView });
    els.still.width = w;
    els.still.height = h;
    const ctx = els.still.getContext && els.still.getContext('2d');
    if (ctx && typeof ctx.createImageData === 'function') blitStill(ctx, still);
    els.still.dataset.triangles = String(still.triangles);
    return still;
  }
  function scheduleStill() {
    if (stillTimer) clearTimeout(stillTimer);
    stillTimer = setTimeout(() => {
      stillTimer = null;
      renderStillToCanvas();
    }, 120);
  }
  // Drag to orbit the still image
  let drag = null;
  els.still.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, az: state.stillView.azimuth, el: state.stillView.elevation };
    if (els.still.setPointerCapture) {
      try {
        els.still.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
  });
  els.still.addEventListener('pointermove', (e) => {
    if (!drag) return;
    state.stillView.azimuth = drag.az - (e.clientX - drag.x) * 0.008;
    state.stillView.elevation = Math.max(0.02, Math.min(1.2, drag.el + (e.clientY - drag.y) * 0.005));
    scheduleStill();
  });
  const endDrag = () => {
    drag = null;
  };
  els.still.addEventListener('pointerup', endDrag);
  els.still.addEventListener('pointercancel', endDrag);
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => {
      if (state.mode === 'software') scheduleStill();
    }).observe(els.viewport);
  }

  /* ── Build flow ─────────────────────────────────────────────────────── */
  let studioFollowUp = null;
  function currentQuality(requested) {
    if (state.mode === 'software') return 'software';
    return requested || 'studio';
  }

  /**
   * Request a (re)build.
   * @param {object} o `{ quality, commit, animate, reframe, debounce }`
   */
  function scheduleBuild(o = {}) {
    const quality = currentQuality(o.quality);
    const d = design();
    const gen = ++state.generation;
    const p = o.debounce ? client.requestDebounced(d, quality) : client.request(d, quality);
    const result = p.then(
      (tree) => {
        if (gen < state.generation && o.debounce) return null; // stale preview
        applyTree(tree, { animate: o.animate, reframe: o.reframe });
        if (o.commit !== false) syncHash();
        // Previews always get a full-quality follow-up once the user pauses.
        if (quality === 'preview') {
          if (studioFollowUp) clearTimeout(studioFollowUp);
          studioFollowUp = setTimeout(() => {
            studioFollowUp = null;
            scheduleBuild({ quality: 'studio', commit: true, animate: false });
          }, 260);
        }
        return tree;
      },
      (err) => {
        if (isSuperseded(err)) return null;
        toaster.show(`Generation failed: ${err.message || err}`, { tone: 'warn' });
        return null;
      }
    );
    state.lastBuild = result;
    return result;
  }

  function applyTree(tree, { animate = false, reframe = false } = {}) {
    state.tree = tree;
    state.treeQuality = tree.quality;
    const s = tree.stats;
    els.hudTriangles.textContent = fmtInt(s.triangles);
    els.hudLeaves.textContent = fmtInt(s.leaves);
    els.hudHeight.textContent = `${s.height.toFixed(1)} m`;
    if (state.mode === 'webgl' && state.stage) {
      state.stage.setTree(tree, { animate, reframe: reframe || !state.framed });
      state.framed = true;
    } else if (state.mode === 'software') {
      renderStillToCanvas();
    }
    els.app.dataset.ready = 'true';
    doc.dispatchEvent(new win.CustomEvent('sapling:tree', { detail: { stats: s, quality: tree.quality } }));
  }

  function syncHash() {
    const hash = encodeHash(design());
    if (win.history && typeof win.history.replaceState === 'function') {
      try {
        win.history.replaceState(null, '', hash);
        return;
      } catch {
        /* fall through */
      }
    }
    if (win.location) win.location.hash = hash;
  }

  function updateSpecimen() {
    const sp = SPECIES[state.species];
    els.specimenName.textContent = sp.name;
    els.specimenLatin.textContent = sp.latin;
    els.specimenSeed.textContent = `seed ${state.seed}`;
    els.seed.value = String(state.seed);
    for (const [id, btn] of speciesButtons) btn.setAttribute('aria-pressed', String(id === state.species));
    panel.markDirty(Object.keys(diffFromPreset(state.params, state.species)));
    doc.title = `Sapling — ${sp.name} · seed ${state.seed}`;
  }

  /* ── Mutations ──────────────────────────────────────────────────────── */
  function pushHistory() {
    state.history.push(design());
    if (state.history.length > 50) state.history.shift();
  }

  function setSpecies(id, { keepParams = false } = {}) {
    if (!SPECIES[id]) return;
    pushHistory();
    state.species = id;
    // Changing species keeps the seed; parameters jump to the species preset.
    if (!keepParams) state.params = presetParams(id);
    panel.setParams(state.params);
    updateSpecimen();
    toaster.announce(`${SPECIES[id].name} selected`);
    scheduleBuild({ quality: 'studio', commit: true, animate: true, reframe: true });
  }

  function setSeed(seed, { announce = true } = {}) {
    const clean = sanitizeSeed(seed, state.seed);
    pushHistory();
    state.seed = clean;
    updateSpecimen();
    if (announce) toaster.announce(`Seed ${clean}`);
    scheduleBuild({ quality: 'studio', commit: true, animate: true });
  }

  function rollSeed() {
    setSeed(randomSeed());
  }

  function setParam(key, value, { commit = true } = {}) {
    const v = sanitizeValue(key, value, state.params[key]);
    if (v === undefined) return;
    if (commit) pushHistory();
    state.params = { ...state.params, [key]: v };
    if (commit) {
      panel.setParams(state.params);
      updateSpecimen();
      scheduleBuild({ quality: 'studio', commit: true, animate: false });
    } else {
      scheduleBuild({ quality: 'preview', commit: false, animate: false, debounce: true });
    }
  }

  function resetParams() {
    pushHistory();
    state.params = presetParams(state.species);
    panel.setParams(state.params);
    updateSpecimen();
    if (state.stage) state.stage.resetCamera();
    state.stillView = { azimuth: 0.6, elevation: 0.22, zoom: 1 };
    toaster.announce('Parameters reset');
    scheduleBuild({ quality: 'studio', commit: true, animate: false, reframe: true });
  }

  function undo() {
    const prev = state.history.pop();
    if (!prev) {
      toaster.announce('Nothing to undo');
      return false;
    }
    state.species = prev.species;
    state.seed = prev.seed;
    state.params = prev.params;
    panel.setParams(state.params);
    updateSpecimen();
    toaster.announce('Undone');
    scheduleBuild({ quality: 'studio', commit: true, animate: false });
    return true;
  }

  function surprise() {
    pushHistory();
    const id = SPECIES_IDS[Math.floor((randomSeed() / 1000000) * SPECIES_IDS.length) % SPECIES_IDS.length];
    state.species = id;
    state.seed = randomSeed();
    // Nudge a few shape parameters around the preset for variety (seeded by the new seed)
    const base = presetParams(id);
    const jitter = (k, amt) => sanitizeValue(k, base[k] + (((state.seed * 9301 + k.length * 49297) % 233280) / 233280 - 0.5) * amt, base[k]);
    state.params = {
      ...base,
      height: jitter('height', base.height * 0.5),
      angle: jitter('angle', 24),
      gnarl: jitter('gnarl', 0.4),
      curve: jitter('curve', 0.4),
      leafSize: jitter('leafSize', base.leafSize * 0.6),
      autumn: jitter('autumn', 0.8)
    };
    panel.setParams(state.params);
    updateSpecimen();
    toaster.announce(`Surprise: ${SPECIES[id].name}, seed ${state.seed}`);
    scheduleBuild({ quality: 'studio', commit: true, animate: true, reframe: true });
  }

  function loadDesign(d, { announce = 'Design loaded' } = {}) {
    const clean = sanitizeDesign(d);
    pushHistory();
    state.species = clean.species;
    state.seed = clean.seed;
    state.params = clean.params;
    panel.setParams(state.params);
    updateSpecimen();
    if (announce) toaster.show(announce, { tone: 'ok' });
    scheduleBuild({ quality: 'studio', commit: true, animate: true, reframe: true });
  }

  /* ── Export ─────────────────────────────────────────────────────────── */
  function studioTree() {
    // Exports are always full fidelity: reuse the current tree only if it is already studio quality.
    const d = design();
    if (state.tree && state.treeQuality === 'studio' && sameDesign(state.tree, d)) return state.tree;
    return generateTree(d, 'studio');
  }

  function exportGlb() {
    const tree = studioTree();
    const buffer = buildGlb(tree);
    const name = exportFilename(state.species, state.seed, 'glb');
    downloadBuffer(buffer, name, 'model/gltf-binary');
    toaster.show(`Exported ${name} (${fmtInt(tree.stats.triangles)} triangles)`, { tone: 'ok' });
    return { name, buffer, tree };
  }

  function exportObj() {
    const tree = studioTree();
    const { obj, mtl, objName, mtlName } = buildObj(tree, { name: exportFilename(state.species, state.seed, '').replace(/\.$/, '') });
    const zip = zipSync({ [objName]: strToU8(obj), [mtlName]: strToU8(mtl) }, { level: 6 });
    const name = exportFilename(state.species, state.seed, 'obj.zip');
    downloadBlob(new Blob([zip], { type: 'application/zip' }), name);
    toaster.show(`Exported ${name}`, { tone: 'ok' });
    return { name, obj, mtl, tree };
  }

  function exportJson() {
    const tree = studioTree();
    const json = buildDesignJson(design(), tree.stats);
    const name = exportFilename(state.species, state.seed, 'json');
    downloadText(json, name, 'application/json');
    toaster.show(`Exported ${name}`, { tone: 'ok' });
    return { name, json };
  }

  async function snapshot() {
    let canvas = null;
    if (state.mode === 'webgl' && state.stage) canvas = state.stage.snapshot();
    else {
      renderStillToCanvas();
      canvas = els.still;
    }
    try {
      const blob = await canvasToPngBlob(canvas);
      const name = exportFilename(state.species, state.seed, 'png');
      downloadBlob(blob, name);
      toaster.show(`Saved ${name}`, { tone: 'ok' });
      return { name, blob };
    } catch (err) {
      toaster.show(`Snapshot failed: ${err.message || err}`, { tone: 'warn' });
      return null;
    }
  }

  async function share() {
    syncHash();
    const url = shareUrl(design(), win.location);
    try {
      if (win.navigator && win.navigator.clipboard && typeof win.navigator.clipboard.writeText === 'function') {
        await win.navigator.clipboard.writeText(url);
        toaster.show('Share link copied to clipboard', { tone: 'ok' });
      } else {
        toaster.show('Share link is in the address bar', { tone: 'info' });
      }
    } catch {
      toaster.show('Share link is in the address bar', { tone: 'info' });
    }
    return url;
  }

  function importJsonFile(file) {
    if (!file) return Promise.resolve(null);
    return file.text().then(
      (text) => {
        try {
          const d = parseDesignJson(text);
          loadDesign(d, { announce: `Loaded ${file.name}` });
          modals.export.hide();
          return d;
        } catch (err) {
          toaster.show(err.message || 'Could not import that design.', { tone: 'warn' });
          return null;
        }
      },
      () => {
        toaster.show('Could not read that file.', { tone: 'warn' });
        return null;
      }
    );
  }

  /* ── Diagnostics ────────────────────────────────────────────────────── */
  function showDiagnostics(opener) {
    const diag = collectDiagnostics({ probe: state.probe, win, createCanvas });
    els.diagText.textContent = formatDiagnostics(diag);
    modals.diag.show(opener);
    return diag;
  }

  async function copyDiagnostics() {
    const text = els.diagText.textContent;
    try {
      await win.navigator.clipboard.writeText(text);
      toaster.show('Diagnostics copied', { tone: 'ok' });
      return true;
    } catch {
      // Fallback: select the text so the user can copy manually
      try {
        const range = doc.createRange();
        range.selectNodeContents(els.diagText);
        const sel = win.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      } catch {
        /* ignore */
      }
      toaster.show('Select the text and copy it manually', { tone: 'info' });
      return false;
    }
  }

  /* ── Toggles ────────────────────────────────────────────────────────── */
  function setWind(on) {
    state.wind = Boolean(on) && !reducedMotion;
    els.wind.setAttribute('aria-pressed', String(state.wind));
    if (state.stage) state.stage.setWind(state.wind);
    toaster.announce(state.wind ? 'Wind on' : 'Wind off');
  }
  function setTurntable(on) {
    state.turntable = Boolean(on);
    els.turntable.setAttribute('aria-pressed', String(state.turntable));
    if (state.stage) state.stage.setTurntable(state.turntable);
    toaster.announce(state.turntable ? 'Turntable on' : 'Turntable off');
  }
  function togglePanel(open) {
    const next = open === undefined ? !els.app.classList.contains('panel-open') : Boolean(open);
    els.app.classList.toggle('panel-open', next);
    els.panelToggle.setAttribute('aria-expanded', String(next));
    if (next) panel.focusFirst();
    else els.panelToggle.focus();
  }

  /* ── Wire up ────────────────────────────────────────────────────────── */
  els.dice.addEventListener('click', rollSeed);
  els.reset.addEventListener('click', resetParams);
  els.seed.addEventListener('change', () => setSeed(els.seed.value));
  els.seed.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      setSeed(els.seed.value);
    }
  });
  els.wind.addEventListener('click', () => setWind(!state.wind));
  els.turntable.addEventListener('click', () => setTurntable(!state.turntable));
  els.recenter.addEventListener('click', () => {
    if (state.stage) state.stage.resetCamera();
    state.stillView = { azimuth: 0.6, elevation: 0.22, zoom: 1 };
    if (state.mode === 'software') renderStillToCanvas();
  });
  els.surprise.addEventListener('click', surprise);
  els.snapshot.addEventListener('click', () => snapshot());
  els.export.addEventListener('click', () => {
    els.exportSummary.textContent = `${SPECIES[state.species].name} · seed ${state.seed}. The mesh is regenerated at full studio quality before export.`;
    modals.export.show(els.export);
  });
  els.share.addEventListener('click', share);
  els.help.addEventListener('click', () => modals.help.show(els.help));
  els.retry.addEventListener('click', () => retry3D(els.retry));
  els.retryDialog.addEventListener('click', () => retry3D(els.retryDialog));
  els.details.addEventListener('click', () => showDiagnostics(els.details));
  els.bannerDismiss.addEventListener('click', () => {
    els.banner.hidden = true;
    toaster.announce('Notice dismissed. Software preview remains active.');
  });
  els.copyDiag.addEventListener('click', copyDiagnostics);
  els.exportGlb.addEventListener('click', exportGlb);
  els.exportObj.addEventListener('click', exportObj);
  els.exportJson.addEventListener('click', exportJson);
  els.exportPng.addEventListener('click', () => snapshot());
  els.importJson.addEventListener('change', () => importJsonFile(els.importJson.files && els.importJson.files[0]));
  els.panelToggle.addEventListener('click', () => togglePanel());
  els.panelClose.addEventListener('click', () => togglePanel(false));

  doc.addEventListener('keydown', (e) => {
    const target = e.target;
    const tag = target && target.tagName ? target.tagName.toLowerCase() : '';
    const typing = tag === 'input' || tag === 'select' || tag === 'textarea' || (target && target.isContentEditable);
    const anyModal = Object.values(modals).some((m) => m.open);
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !typing) {
      e.preventDefault();
      undo();
      return;
    }
    if (typing || anyModal || e.metaKey || e.ctrlKey || e.altKey) return;
    switch (e.key) {
      case ' ':
        e.preventDefault();
        setWind(!state.wind);
        break;
      case 't':
      case 'T':
        setTurntable(!state.turntable);
        break;
      case 'r':
      case 'R':
        resetParams();
        break;
      case 'e':
      case 'E':
        els.export.click();
        break;
      case 's':
      case 'S':
        snapshot();
        break;
      case 'd':
      case 'D':
        rollSeed();
        break;
      case '?':
        modals.help.toggle(els.help);
        break;
      default:
        break;
    }
  });

  win.addEventListener('hashchange', () => {
    const d = decodeHash(win.location.hash);
    if (!d) return;
    if (d.species === state.species && d.seed === state.seed && JSON.stringify(d.params) === JSON.stringify(state.params)) return;
    loadDesign(d, { announce: null });
  });

  els.wind.setAttribute('aria-pressed', String(state.wind));
  els.turntable.setAttribute('aria-pressed', 'false');
  if (reducedMotion) els.wind.disabled = true;
  updateSpecimen();

  /* ── Boot ───────────────────────────────────────────────────────────── */
  const ready = (async () => {
    const ok = await tryEnter3D();
    if (ok) enterWebGLMode();
    else enterSoftwareMode();
    const first = await scheduleBuild({ quality: 'studio', commit: true, animate: true, reframe: true });
    if (options.thumbnails !== false) scheduleThumbnails(thumbSlots, doc, win);
    return first;
  })();

  const app = {
    state,
    els,
    panel,
    client,
    modals,
    toaster,
    ready,
    design,
    setSpecies,
    setSeed,
    rollSeed,
    setParam,
    resetParams,
    undo,
    surprise,
    loadDesign,
    exportGlb,
    exportObj,
    exportJson,
    snapshot,
    share,
    retry3D,
    showDiagnostics,
    setWind,
    setTurntable,
    togglePanel,
    enterSoftwareMode,
    onContextLost,
    scheduleBuild,
    /** Wait until no build is pending (tests). */
    settle: async () => {
      let guard = 0;
      while (client.busy && guard++ < 200) await new Promise((r) => setTimeout(r, 10));
      if (state.lastBuild) await state.lastBuild;
      if (studioFollowUp) {
        await new Promise((r) => setTimeout(r, 300));
        if (state.lastBuild) await state.lastBuild;
      }
      return state.tree;
    },
    dispose() {
      client.dispose();
      toaster.dispose();
      if (state.stage) state.stage.dispose();
    }
  };
  win.__sapling = app;
  return app;
}

function sameDesign(tree, d) {
  return tree.species === d.species && String(tree.seed) === String(d.seed) && JSON.stringify(tree.params) === JSON.stringify(sanitizeDesign(d).params);
}

function parseInitialDesign(win) {
  const fromHash = win.location ? decodeHash(win.location.hash) : null;
  if (fromHash) return fromHash;
  return sanitizeDesign({ species: DEFAULT_SPECIES, seed: DEFAULT_SEED, params: presetParams(DEFAULT_SPECIES) });
}

async function defaultStageFactory() {
  const mod = await import('./render/stage.js');
  return (opts) => new mod.Stage(opts);
}

export { QUALITY };

if (typeof window !== 'undefined' && typeof document !== 'undefined' && !window.__SAPLING_NO_AUTOBOOT__) {
  const start = () => createApp();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}
