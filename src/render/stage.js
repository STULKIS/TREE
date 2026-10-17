// three.js viewport: ACES tone mapping, gradient environment, soil disc + contact shadow,
// orbit controls with damping, GPU wind via vertex shader, growth animation, ResizeObserver,
// and a pause when the document is hidden.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const WIND = { uTime: { value: 0 }, uStrength: { value: 0 }, uHeight: { value: 12 } };

function gradientTexture(doc) {
  const c = doc.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#2a3a2c');
  grad.addColorStop(0.55, '#101711');
  grad.addColorStop(1, '#070a07');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function contactTexture(doc) {
  const c = doc.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0,0,0,0.75)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function windMaterial({ amp, side, roughness, name }) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness, metalness: 0, side, name });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = WIND.uTime;
    shader.uniforms.uStrength = WIND.uStrength;
    shader.uniforms.uHeight = WIND.uHeight;
    shader.uniforms.uAmp = { value: amp };
    shader.vertexShader = [
      'uniform float uTime;',
      'uniform float uStrength;',
      'uniform float uHeight;',
      'uniform float uAmp;',
      shader.vertexShader,
    ].join('\n').replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        float h = clamp(position.y / uHeight, 0.0, 1.0);
        float bend = h * h * uStrength * uAmp;
        float ph = dot(position, vec3(0.71, 0.43, 0.91));
        float g1 = sin(uTime * 1.6 + ph) * 0.6 + sin(uTime * 3.7 + ph * 2.3) * 0.25;
        transformed.x += g1 * bend * 0.35;
        transformed.z += cos(uTime * 1.3 + ph * 1.7) * bend * 0.25;
      }`);
  };
  mat.customProgramCacheKey = () => `sapling-wind-${name}`;
  return mat;
}

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

/**
 * @param {object} opts
 * @param {HTMLCanvasElement} opts.canvas   canvas whose context `gl` was probed
 * @param {WebGL2RenderingContext} opts.gl
 * @param {HTMLElement} opts.container
 * @param {Document} opts.doc
 * @param {Window} opts.win
 */
export function createStage({ canvas, gl, container, doc, win, reducedMotion = false, lowCore = false, onContextLost = () => {} }) {
  const renderer = new THREE.WebGLRenderer({ canvas, context: gl, alpha: true, powerPreference: 'high-performance' });
  const maxDpr = lowCore ? 1.6 : 2;
  renderer.setPixelRatio(Math.min(win.devicePixelRatio || 1, maxDpr));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 800);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = gradientTexture(doc);
  const envRT = pmrem.fromEquirectangular(envTex);
  scene.environment = envRT.texture;
  envTex.dispose();

  scene.add(new THREE.HemisphereLight(0xdfeedd, 0x2a3320, 0.9));
  const key = new THREE.DirectionalLight(0xfff1dc, 2.2);
  key.position.set(6, 12, 8);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x9fb7c9, 0.6);
  fill.position.set(-8, 6, -4);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xbfe0a0, 1.2);
  rim.position.set(0, 8, -10);
  scene.add(rim);

  const soilMat = new THREE.MeshStandardMaterial({ color: 0x2b261d, roughness: 1, metalness: 0 });
  const soil = new THREE.Mesh(new THREE.CircleGeometry(6, 96), soilMat);
  soil.rotation.x = -Math.PI / 2;
  scene.add(soil);
  const shadowTex = contactTexture(doc);
  const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.003;
  scene.add(shadow);

  const barkMat = windMaterial({ amp: 0.12, side: THREE.FrontSide, roughness: 0.92, name: 'Bark' });
  const foliageMat = windMaterial({ amp: 1.0, side: THREE.DoubleSide, roughness: 0.7, name: 'Foliage' });

  const treeGroup = new THREE.Group();
  scene.add(treeGroup);
  let meshes = [];

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.autoRotateSpeed = 1.2;
  controls.minDistance = 1;
  controls.maxDistance = 200;
  controls.target.set(0, 4, 0);
  controls.listenToKeyEvents?.(canvas);

  let windOn = !reducedMotion;
  WIND.uStrength.value = windOn ? 1 : 0;
  let growStart = -1;
  let running = false;
  let raf = 0;
  let disposed = false;
  let size = { w: 1, h: 1 };

  const setSize = (w, h) => {
    if (disposed || w < 1 || h < 1) return;
    size = { w, h };
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const initialW = container.clientWidth || 800;
  const initialH = container.clientHeight || 600;
  setSize(initialW, initialH);

  const frame = (now) => {
    if (!running) return;
    raf = win.requestAnimationFrame(frame);
    WIND.uTime.value = now / 1000;
    if (growStart >= 0) {
      const t = Math.min(1, (now - growStart) / 900);
      treeGroup.scale.setScalar(Math.max(0.001, easeOutCubic(t)));
      if (t >= 1) growStart = -1;
    }
    controls.update();
    renderer.render(scene, camera);
  };
  const start = () => {
    if (running || disposed) return;
    running = true;
    raf = win.requestAnimationFrame(frame);
  };
  const stop = () => {
    running = false;
    win.cancelAnimationFrame(raf);
  };

  const onVisibility = () => (doc.hidden ? stop() : start());
  doc.addEventListener('visibilitychange', onVisibility);

  const onLost = (event) => {
    event.preventDefault();
    stop();
    onContextLost();
  };
  canvas.addEventListener('webglcontextlost', onLost);

  let resizeObserver = null;
  if (win.ResizeObserver) {
    resizeObserver = new win.ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setSize(Math.round(rect.width), Math.round(rect.height));
    });
    resizeObserver.observe(container);
  }

  function setMesh(result, { grow = false } = {}) {
    for (const m of meshes) {
      treeGroup.remove(m);
      m.geometry.dispose();
    }
    meshes = [];
    const build = (group, material) => {
      if (!group.indices.length) return;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(group.positions, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(group.normals, 3));
      g.setAttribute('color', new THREE.BufferAttribute(group.colors, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(group.uvs, 2));
      g.setIndex(new THREE.BufferAttribute(group.indices, 1));
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, material);
      treeGroup.add(mesh);
      meshes.push(mesh);
    };
    build(result.bark, barkMat);
    build(result.foliage, foliageMat);

    const { min, max } = result.bounds;
    const center = new THREE.Vector3((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
    const radius = Math.max(1, Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2);
    const scale = radius * 1.4;
    shadow.scale.set(scale, scale, 1);
    controls.target.set(center.x, Math.max(1, center.y), center.z);
    const dist = (radius / Math.sin((camera.fov * Math.PI) / 360)) * 0.9;
    camera.position.set(center.x + dist * 0.55, center.y + dist * 0.25, center.z + dist * 0.85);
    controls.update();
    if (grow && !reducedMotion) {
      treeGroup.scale.setScalar(0.001);
      growStart = win.performance.now();
    } else {
      treeGroup.scale.setScalar(1);
      growStart = -1;
    }
    start();
  }

  return {
    get size() { return size; },
    setMesh,
    setWind(on) {
      windOn = Boolean(on) && !reducedMotion;
      WIND.uStrength.value = windOn ? 1 : 0;
    },
    get wind() { return windOn; },
    setTurntable(on) { controls.autoRotate = Boolean(on) && !reducedMotion; },
    resize(w, h) { setSize(w, h); },
    snapshot() {
      renderer.render(scene, camera);
      return canvas.toDataURL('image/png');
    },
    start,
    stop,
    dispose() {
      if (disposed) return;
      stop();
      disposed = true;
      doc.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('webglcontextlost', onLost);
      resizeObserver?.disconnect();
      controls.dispose();
      for (const m of meshes) m.geometry.dispose();
      meshes = [];
      barkMat.dispose();
      foliageMat.dispose();
      soil.geometry.dispose();
      soilMat.dispose();
      shadow.geometry.dispose();
      shadowMat.dispose();
      shadowTex.dispose();
      envRT.dispose();
      pmrem.dispose();
      renderer.dispose();
      try { renderer.forceContextLoss(); } catch { /* already lost */ }
    },
  };
}
