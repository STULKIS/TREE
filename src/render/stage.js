/**
 * The live 3D stage: renderer, lights, gradient environment, soil + contact
 * shadow, wind, grow animation and orbit controls.
 */
import {
  ACESFilmicToneMapping, AmbientLight, BackSide, BufferAttribute, BufferGeometry, CircleGeometry, Color,
  DataTexture, DirectionalLight, DoubleSide, Group, HemisphereLight, LinearFilter, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, PerspectiveCamera, RGBAFormat, Scene, ShaderMaterial, SphereGeometry, SRGBColorSpace,
  Vector3, WebGLRenderer, Fog
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { WindUniforms, applyWind } from './wind.js';
import { easeOutCubic } from '../generator/vec.js';

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

export function pickPixelRatio(win = typeof window !== 'undefined' ? window : null) {
  if (!win) return 1;
  const dpr = win.devicePixelRatio || 1;
  const nav = win.navigator || {};
  const cores = nav.hardwareConcurrency || 8;
  const coarse = win.matchMedia ? win.matchMedia('(pointer: coarse)').matches : false;
  const mobile = /Android|iPhone|iPad|Mobile/i.test(nav.userAgent || '');
  const cap = cores <= 4 || coarse || mobile ? 1.6 : 2;
  return Math.min(cap, dpr);
}

function radialAlphaTexture(size, power, inner = 0) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5;
      const dy = (y + 0.5) / size - 0.5;
      const d = Math.min(1, Math.hypot(dx, dy) * 2);
      const a = d < inner ? 1 : Math.pow(1 - (d - inner) / (1 - inner), power);
      const o = (y * size + x) * 4;
      // alphaMap samples the green channel, so write the value to every channel.
      const v = Math.round(Math.max(0, Math.min(1, a)) * 255);
      data[o] = v;
      data[o + 1] = v;
      data[o + 2] = v;
      data[o + 3] = v;
    }
  }
  const tex = new DataTexture(data, size, size, RGBAFormat);
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function geometryFrom(geom) {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(geom.positions, 3));
  g.setAttribute('normal', new BufferAttribute(geom.normals, 3));
  g.setAttribute('uv', new BufferAttribute(geom.uvs, 2));
  const lin = new Float32Array(geom.colors.length);
  for (let i = 0; i < lin.length; i++) lin[i] = srgbToLinear(geom.colors[i]);
  g.setAttribute('color', new BufferAttribute(lin, 3));
  g.setIndex(new BufferAttribute(geom.indices, 1));
  g.computeBoundingSphere();
  return g;
}

export class Stage {
  /**
   * @param {object} opts
   * @param {HTMLElement} opts.container
   * @param {HTMLCanvasElement} opts.canvas  canvas that owns `context`
   * @param {WebGL2RenderingContext} opts.context
   * @param {object} [opts.attrs] context attributes used by the probe
   * @param {boolean} [opts.reducedMotion]
   * @param {(e:Event)=>void} [opts.onContextLost]
   */
  constructor(opts) {
    this.container = opts.container;
    this.canvas = opts.canvas;
    this.reducedMotion = Boolean(opts.reducedMotion);
    this.onContextLost = opts.onContextLost || null;
    this.disposed = false;
    this.dirty = true;
    this.windOn = false;
    this.turntable = false;
    this.paused = false;
    this.grow = null;
    this.frameHandle = 0;
    this.lastTime = 0;
    this.treeGroup = new Group();
    this.treeMeshes = [];
    this.treeHeight = 10;

    const attrs = opts.attrs || {};
    this.renderer = new WebGLRenderer({
      canvas: this.canvas,
      context: opts.context,
      antialias: attrs.antialias !== false,
      alpha: false,
      powerPreference: attrs.powerPreference || 'default'
    });
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.setPixelRatio(pickPixelRatio());
    this.renderer.setClearColor(new Color('#0e1412'), 1);

    this.scene = new Scene();
    this.scene.fog = new Fog(new Color('#1c2522'), 60, 220);
    this.camera = new PerspectiveCamera(38, 1, 0.05, 600);
    this.camera.position.set(14, 7, 20);

    this.wind = new WindUniforms();
    this.buildEnvironment();
    this.scene.add(this.treeGroup);

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.03;
    this.controls.minDistance = 1;
    this.controls.maxDistance = 220;
    this.controls.autoRotateSpeed = 0.9;
    this.controls.addEventListener('change', () => this.poke());
    this.controls.target.set(0, 5, 0);

    this.onLost = (e) => {
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      if (this.onContextLost) this.onContextLost(e);
    };
    this.canvas.addEventListener('webglcontextlost', this.onLost, false);

    this.resizeObserver = null;
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.container);
    }
    this.onVisibility = () => {
      this.paused = typeof document !== 'undefined' && document.hidden;
      if (!this.paused) {
        this.lastTime = 0;
        this.dirty = true;
        this.schedule();
      }
    };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVisibility);
    this.resize();
    this.schedule();
  }

  buildEnvironment() {
    // Gradient sky dome
    this.dome = new Mesh(
      new SphereGeometry(300, 24, 12),
      new ShaderMaterial({
        side: BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          top: { value: new Color('#0b1210') },
          horizon: { value: new Color('#2a3632') },
          bottom: { value: new Color('#0d1210') }
        },
        vertexShader: `varying vec3 vW; void main(){ vW = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; varying vec3 vW;
          void main(){ float h = normalize(vW).y; vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.55)) : mix(horizon, bottom, pow(-h, 0.6)); gl_FragColor = vec4(c, 1.0); }`
      })
    );
    this.dome.renderOrder = -10;
    this.scene.add(this.dome);

    // Lights: soft key / cool fill / warm rim + hemisphere + a little ambient
    this.hemi = new HemisphereLight(new Color('#c9d6cf'), new Color('#3b3326'), 0.75);
    this.key = new DirectionalLight(new Color('#fff2dc'), 2.3);
    this.key.position.set(-18, 28, 16);
    this.fill = new DirectionalLight(new Color('#a9c4d8'), 0.6);
    this.fill.position.set(22, 10, -8);
    this.rim = new DirectionalLight(new Color('#ffe7b8'), 0.9);
    this.rim.position.set(6, 14, -26);
    this.ambient = new AmbientLight(new Color('#223028'), 0.5);
    this.scene.add(this.hemi, this.key, this.fill, this.rim, this.ambient);

    // Soil disc + contact shadow
    this.soilTexture = radialAlphaTexture(128, 1.6, 0.35);
    this.shadowTexture = radialAlphaTexture(128, 2.2, 0.0);
    this.soil = new Mesh(
      new CircleGeometry(1, 64),
      new MeshStandardMaterial({ color: new Color('#2a241b'), roughness: 1, metalness: 0, transparent: true, alphaMap: this.soilTexture, depthWrite: false })
    );
    this.soil.rotation.x = -Math.PI / 2;
    this.soil.position.y = 0.002;
    this.soil.renderOrder = -2;
    this.shadow = new Mesh(
      new CircleGeometry(1, 48),
      new MeshBasicMaterial({ color: new Color('#000000'), transparent: true, opacity: 0.55, alphaMap: this.shadowTexture, depthWrite: false })
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.004;
    this.shadow.renderOrder = -1;
    this.scene.add(this.soil, this.shadow);
  }

  resize() {
    if (this.disposed) return;
    const w = Math.max(1, this.container.clientWidth || 1);
    const h = Math.max(1, this.container.clientHeight || 1);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.poke();
  }

  /** Replace the displayed tree. */
  setTree(tree, { animate = true, reframe = false } = {}) {
    this.clearTree();
    const bark = new MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
    applyWind(bark, this.wind, { amp: 0.6, flutter: 0 });
    const barkMesh = new Mesh(geometryFrom(tree.bark), bark);
    barkMesh.name = 'bark';
    this.treeGroup.add(barkMesh);
    this.treeMeshes.push(barkMesh);
    if (tree.foliage && tree.foliage.indices.length) {
      const leaf = new MeshStandardMaterial({ vertexColors: true, roughness: 0.68, metalness: 0, side: DoubleSide });
      applyWind(leaf, this.wind, { amp: 1.0, flutter: 1 });
      const leafMesh = new Mesh(geometryFrom(tree.foliage), leaf);
      leafMesh.name = 'foliage';
      this.treeGroup.add(leafMesh);
      this.treeMeshes.push(leafMesh);
    }
    const b = tree.bounds;
    this.lastBounds = b;
    this.treeHeight = Math.max(1, b.max[1]);
    this.wind.setHeight(this.treeHeight);
    const spread = Math.max(2, b.max[0] - b.min[0], b.max[2] - b.min[2]);
    this.soil.scale.setScalar(spread * 0.9);
    this.shadow.scale.setScalar(spread * 0.42);
    this.scene.fog.near = Math.max(40, spread * 4);
    this.scene.fog.far = this.scene.fog.near + 180;
    if (reframe) this.frame(b);
    if (animate && !this.reducedMotion) {
      this.grow = { start: 0, duration: 950 };
      this.treeGroup.scale.setScalar(0.001);
    } else {
      this.grow = null;
      this.treeGroup.scale.setScalar(1);
    }
    this.dirty = true;
    this.schedule();
  }

  clearTree() {
    for (const m of this.treeMeshes) {
      this.treeGroup.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    }
    this.treeMeshes = [];
  }

  /** Frame the camera on bounds. */
  frame(bounds) {
    const h = Math.max(1, bounds.max[1] - bounds.min[1]);
    const w = Math.max(1, bounds.max[0] - bounds.min[0], bounds.max[2] - bounds.min[2]);
    const radius = Math.max(h * 0.55, w * 0.5) * 1.1;
    const fov = (this.camera.fov * Math.PI) / 180;
    const fitFov = this.camera.aspect >= 1 ? fov : 2 * Math.atan(Math.tan(fov / 2) * this.camera.aspect);
    const dist = radius / Math.sin(fitFov / 2);
    const cy = (bounds.min[1] + bounds.max[1]) / 2;
    this.controls.target.set(0, cy * 0.95, 0);
    const dir = new Vector3(0.62, 0.3, 0.72).normalize();
    this.camera.position.copy(this.controls.target).addScaledVector(dir, dist);
    this.controls.minDistance = Math.max(0.5, dist * 0.1);
    this.controls.maxDistance = dist * 4;
    this.controls.update();
    this.dirty = true;
  }

  resetCamera() {
    if (this.lastBounds) this.frame(this.lastBounds);
  }

  setWind(on) {
    this.windOn = Boolean(on) && !this.reducedMotion;
    this.wind.uWindStrength.value = this.windOn ? 1 : 0;
    this.dirty = true;
    this.schedule();
  }

  setTurntable(on) {
    this.turntable = Boolean(on);
    this.controls.autoRotate = this.turntable;
    this.schedule();
  }

  schedule() {
    if (this.disposed || this.frameHandle || this.paused) return;
    if (typeof requestAnimationFrame !== 'function') return;
    this.frameHandle = requestAnimationFrame((t) => this.tick(t));
  }

  tick(time) {
    this.frameHandle = 0;
    if (this.disposed || this.paused) return;
    if (!this.lastTime) this.lastTime = time;
    const dt = Math.min(0.1, (time - this.lastTime) / 1000);
    this.lastTime = time;
    let needs = this.dirty;
    if (this.windOn) {
      this.wind.uTime.value += dt;
      needs = true;
    }
    if (this.grow) {
      if (!this.grow.start) this.grow.start = time;
      const k = easeOutCubic((time - this.grow.start) / this.grow.duration);
      this.treeGroup.scale.setScalar(Math.max(0.001, k));
      if (k >= 1) this.grow = null;
      needs = true;
    }
    const moved = this.controls.update(dt);
    if (moved || this.turntable) needs = true;
    if (needs) {
      this.renderer.render(this.scene, this.camera);
      this.dirty = false;
    }
    // Keep ticking while something animates; otherwise sleep until poked.
    if (this.windOn || this.grow || this.turntable || moved) this.schedule();
  }

  poke() {
    this.dirty = true;
    this.schedule();
  }

  /** Render synchronously and return the canvas (for PNG snapshots). */
  snapshot() {
    this.renderer.render(this.scene, this.camera);
    return this.canvas;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.frameHandle && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.frameHandle);
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    if (this.resizeObserver) this.resizeObserver.disconnect();
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisibility);
    this.controls.dispose();
    this.clearTree();
    this.dome.geometry.dispose();
    this.dome.material.dispose();
    this.soil.geometry.dispose();
    this.soil.material.dispose();
    this.shadow.geometry.dispose();
    this.shadow.material.dispose();
    this.soilTexture.dispose();
    this.shadowTexture.dispose();
    try {
      this.renderer.dispose();
    } catch {
      /* ignore */
    }
  }
}
