import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the built studio can be dropped on any subpath
  // (GitHub Pages, itch.io, a CDN folder, ...).
  base: './',
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
    port: 5173,
  },
  preview: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
