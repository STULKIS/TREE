// Entry point: wires the real three.js stage and the module worker into the app controller.
import '@fontsource-variable/fraunces';
import '@fontsource-variable/manrope';
import './styles.css';
import { createApp } from './app.js';
import { createGenerator } from './generator/client.js';
import { createStage } from './render/stage.js';

const workerSupported = typeof Worker === 'function';

const generator = createGenerator({
  createWorker: workerSupported
    ? () => new Worker(new URL('./generator/worker.js', import.meta.url), { type: 'module' })
    : null,
});

const app = createApp({
  doc: document,
  win: window,
  generator,
  createStage,
});

window.sapling = app; // inspection handle for the console and end-to-end checks
