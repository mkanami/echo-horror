import { defineConfig } from 'vite';

// relative base so the build works from any sub-path (GitHub Pages project site)
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1500 },
});
