import { defineConfig } from 'vite';

export default defineConfig({
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
